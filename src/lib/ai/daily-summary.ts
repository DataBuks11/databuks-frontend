import { gatherOwnerSnapshot } from "./owner-assistant";
import { resolveUserJid, sendViaBaileys } from "@/lib/whatsapp/jid-utils";

/**
 * DAILY WHATSAPP BUSINESS SUMMARY
 *
 * Every evening (7 PM IST cron) each user gets their business day on WhatsApp:
 *   - new leads today (names + scores)
 *   - interested/hot leads
 *   - meetings booked/upcoming
 *   - content published/drafts/scheduled
 *   - pending approvals
 * Everything is grounded in REAL Supabase data — never fabricated.
 */

export interface DailySummaryResult {
  userId: string;
  phoneJid: string;
  ok: boolean;
  error?: string;
}

function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Short human name — strip company suffixes and extra whitespace */
function shortName(name: string): string {
  return String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 28) || "?";
}

interface LeadRow {
  name: string;
  lead_score: number;
  funnel_stage: string;
}

async function fetchNewToday(supabase: any, userId: string, limit = 3): Promise<LeadRow[]> {
  // Union of promoted leads + discovered leads arriving today (Google Maps
  // backfill writes to discovered_leads, not leads).
  const [promoted, discovered] = await Promise.all([
    supabase
      .from("leads")
      .select("name, lead_score, funnel_stage")
      .eq("user_id", userId)
      .gte("created_at", startOfTodayISO())
      .order("lead_score", { ascending: false })
      .limit(limit),
    supabase
      .from("discovered_leads")
      .select("author_name, lead_score, conversation_stage")
      .eq("user_id", userId)
      .gte("created_at", startOfTodayISO())
      .gte("lead_score", 40)
      .order("lead_score", { ascending: false })
      .limit(limit),
  ]);
  const rows: LeadRow[] = [
    ...(promoted.data ?? []).map((r: any) => ({ name: r.name, lead_score: r.lead_score ?? 0, funnel_stage: r.funnel_stage ?? "" })),
    ...(discovered.data ?? []).map((r: any) => ({ name: r.author_name, lead_score: r.lead_score ?? 0, funnel_stage: r.conversation_stage ?? "discovered" })),
  ];
  return rows.slice(0, limit);
}

async function fetchHotLeads(supabase: any, userId: string, limit = 3): Promise<LeadRow[]> {
  const { data } = await supabase
    .from("leads")
    .select("name, lead_score, funnel_stage")
    .eq("user_id", userId)
    .or("lead_score.gte.70,funnel_stage.in.(INTERESTED,QUALIFIED,PROPOSAL_SENT)")
    .order("lead_score", { ascending: false })
    .limit(limit);
  return data ?? [];
}

interface OutreachStats {
  sentToday: number;
  byChannel: { whatsapp: number; instagram: number; facebook: number; linkedin: number; email: number };
  conversationsActive: number;
  meetingsBooked: number;
  repliesToday: number;
  followUpsToday: number;
  /** Today's funnel/lead counts (real DB values) */
  enrichedToday: number;
  qualifiedToday: number;
  interestedToday: number;
  inProgressToday: number;
  rejectedToday: number;
  /** Channel connectivity — which channels can actually send today */
  channelStatus: { channel: string; connected: boolean; reason: string }[];
}

const CHANNEL_ORDER = ["whatsapp", "instagram", "facebook", "linkedin", "email"];

async function fetchOutreachStats(supabase: any, userId: string): Promise<OutreachStats> {
  const today = startOfTodayISO();
  const empty: OutreachStats = {
    sentToday: 0,
    byChannel: { whatsapp: 0, instagram: 0, facebook: 0, linkedin: 0, email: 0 },
    conversationsActive: 0,
    meetingsBooked: 0,
    repliesToday: 0,
    followUpsToday: 0,
    enrichedToday: 0,
    qualifiedToday: 0,
    interestedToday: 0,
    inProgressToday: 0,
    rejectedToday: 0,
    channelStatus: [],
  };
  try {
    const { data: events } = await supabase
      .from("funnel_events")
      .select("metadata, event_type")
      .eq("user_id", userId)
      .or(`event_type.eq.OUTREACH_SENT,event_type.eq.WHATSAPP_INBOUND,event_type.eq.FOLLOWUP_SENT,event_type.eq.INBOUND_REPLY`)
      .gte("created_at", today)
      .limit(500);
    for (const e of events ?? []) {
      if (e.event_type === "OUTREACH_SENT") {
        const ch = e?.metadata?.channel;
        if (ch && ch in empty.byChannel) {
          empty.byChannel[ch as keyof OutreachStats["byChannel"]] += 1;
        }
        empty.sentToday += 1;
      } else if (e.event_type === "WHATSAPP_INBOUND" || e.event_type === "INBOUND_REPLY") {
        empty.repliesToday += 1;
      } else if (e.event_type === "FOLLOWUP_SENT") {
        empty.followUpsToday += 1;
      }
    }
    const { count: convActive } = await supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active");
    empty.conversationsActive = convActive ?? 0;
    const { count: meetings } = await supabase
      .from("meetings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "scheduled")
      .gte("scheduled_at", today);
    empty.meetingsBooked = meetings ?? 0;

    // ─── Real funnel counts for today ────────────────────────────────────
    // enriched: discovered today with actual contact values
    const { data: discoveredToday } = await supabase
      .from("discovered_leads")
      .select("id, lead_score, evidence")
      .eq("user_id", userId)
      .gte("created_at", today)
      .limit(200);
    let enriched = 0;
    let qualified = 0;
    for (const d of discoveredToday ?? []) {
      const cd = d?.evidence?.contact_details ?? {};
      if (cd.phone || cd.email || cd.instagram) enriched += 1;
      if ((d?.lead_score ?? 0) >= 60) qualified += 1;
    }
    empty.enrichedToday = enriched;
    empty.qualifiedToday = qualified;

    // interested / in-progress / rejected from the leads table (today's rows)
    const { data: leadsToday } = await supabase
      .from("leads")
      .select("status, funnel_stage")
      .eq("user_id", userId)
      .gte("created_at", today)
      .limit(200);
    for (const l of leadsToday ?? []) {
      const st = String(l?.status ?? "");
      const fs = String(l?.funnel_stage ?? "");
      if (/reject|cold|closed_lost|not_relevant/i.test(st) || /rejected|not_relevant/i.test(fs)) {
        empty.rejectedToday += 1;
      } else if (/interest|qualified|proposal/i.test(fs) || /interested|qualified/i.test(st)) {
        empty.interestedToday += 1;
      } else {
        empty.inProgressToday += 1;
      }
    }

    // ─── Channel connectivity (real statuses) ────────────────────────────
    const { data: connections } = await supabase
      .from("social_connections")
      .select("platform, status")
      .eq("user_id", userId);
    const connMap: Record<string, string> = {};
    for (const c of connections ?? []) {
      const p = String(c?.platform ?? "").toLowerCase();
      const s = String(c?.status ?? "");
      if (!connMap[p] || s !== "connected") connMap[p] = s;
    }
    // WhatsApp counts as connected when a baileys session or profile phone exists
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone, personal_assistant_enabled, personal_whatsapp_jid")
      .eq("id", userId)
      .maybeSingle();
    const whatsappOk = !!(profile?.phone || profile?.personal_whatsapp_jid);
    const profileData = profile as any;
    empty.channelStatus = CHANNEL_ORDER.map((ch) => {
      if (ch === "whatsapp") {
        return whatsappOk
          ? { channel: ch, connected: true, reason: "" }
          : { channel: ch, connected: false, reason: "profile phone not set" };
      }
      const st = connMap[ch] ?? "not_connected";
      if (st === "connected") return { channel: ch, connected: true, reason: "" };
      if (st === "expired") return { channel: ch, connected: false, reason: "token expired" };
      if (st === "pending") return { channel: ch, connected: false, reason: "pending connection" };
      return { channel: ch, connected: false, reason: "not connected" };
    });
  } catch {}
  return empty;
}

async function fetchMonthlyMeetingStats(supabase: any, userId: string): Promise<{
  target: number;
  booked: number;
  remaining: number;
  pct: number;
} | null> {
  try {
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const { data: ctx } = await supabase
      .from("business_context")
      .select("monthly_meeting_target")
      .eq("user_id", userId)
      .maybeSingle();
    const target = Number((ctx as any)?.monthly_meeting_target ?? 0);
    if (!target || target <= 0) return null;
    const { count } = await supabase
      .from("meetings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["scheduled", "confirmed"])
      .gte("scheduled_at", startOfMonth.toISOString());
    const booked = count ?? 0;
    return {
      target,
      booked,
      remaining: Math.max(0, target - booked),
      pct: Math.min(100, Math.round((booked / target) * 100)),
    };
  } catch {
    return null;
  }
}

async function fetchPendingApprovals(supabase: any, userId: string): Promise<{ posts: number; drafts: number }> {
  try {
    const [{ count: posts }, { count: drafts }] = await Promise.all([
      supabase
        .from("social_posts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("approval_status", "pending"),
      supabase
        .from("content")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "draft"),
    ]);
    return { posts: posts ?? 0, drafts: drafts ?? 0 };
  } catch {
    return { posts: 0, drafts: 0 };
  }
}

export function composeDailySummary(
  s: Awaited<ReturnType<typeof gatherOwnerSnapshot>>,
  newToday: LeadRow[],
  hot: LeadRow[],
  outreach?: OutreachStats,
  approvals?: { posts: number; drafts: number },
  monthly?: { target: number; booked: number; remaining: number; pct: number } | null
): string {
  const lines: string[] = ["Aaj ka business summary:"];

  const leadBits: string[] = [];
  if (s.leadsNew > 0) leadBits.push(`${s.leadsNew} nayi leads`);
  if (newToday.length) {
    const names = newToday.map((l) => `${shortName(l.name)}${l.lead_score ? ` (${l.lead_score}pt)` : ""}`);
    leadBits.push(names.join(", "));
  }
  lines.push(`• Leads: ${leadBits.length ? leadBits.join(" — ") : "aaj kuch nahi aaya"}`);

  if (hot.length) {
    lines.push(`• Garam leads: ${hot.map((l) => `${shortName(l.name)} ${l.funnel_stage || ""}`.trim()).join(", ")}`);
  }

  // Today's funnel counts (REAL DB values)
  if (outreach) {
    const funnelBits: string[] = [];
    if (outreach.enrichedToday > 0) funnelBits.push(`${outreach.enrichedToday} contact-details mili`);
    if (outreach.qualifiedToday > 0) funnelBits.push(`${outreach.qualifiedToday} qualified`);
    if (outreach.interestedToday > 0) funnelBits.push(`${outreach.interestedToday} interested`);
    if (outreach.inProgressToday > 0) funnelBits.push(`${outreach.inProgressToday} in progress`);
    if (outreach.rejectedToday > 0) funnelBits.push(`${outreach.rejectedToday} rejected/not relevant`);
    if (funnelBits.length) lines.push(`• Pipeline aaj: ${funnelBits.join(", ")}`);
  }

  // Outreach pipeline (multi-channel)
  if (outreach && outreach.sentToday > 0) {
    const ch = outreach.byChannel;
    const channelBits: string[] = [];
    if (ch.whatsapp > 0) channelBits.push(`${ch.whatsapp} wa`);
    if (ch.instagram > 0) channelBits.push(`${ch.instagram} ig`);
    if (ch.facebook > 0) channelBits.push(`${ch.facebook} fb`);
    if (ch.linkedin > 0) channelBits.push(`${ch.linkedin} li`);
    if (ch.email > 0) channelBits.push(`${ch.email} email`);
    lines.push(
      `• Outreach: ${outreach.sentToday} messages aaj (${channelBits.join(", ")})`
    );
  }
  if (outreach && outreach.repliesToday > 0) {
    lines.push(`• Replies aaj: ${outreach.repliesToday} lead ne reply kiya`);
  }
  if (outreach && outreach.followUpsToday > 0) {
    lines.push(`• Follow-ups aaj: ${outreach.followUpsToday} bheje`);
  }

  // Channel connectivity — which channels were NOT usable and why
  if (outreach && outreach.channelStatus.length) {
    const notConnected = outreach.channelStatus.filter((c) => !c.connected);
    if (notConnected.length) {
      const skipped = notConnected.map((c) => `${c.channel} (${c.reason})`);
      lines.push(`• Connected nahi (isliye skip): ${skipped.join(", ")}`);
    }
  }

  lines.push(
    `• Meetings: ${s.meetingsScheduled} booked, ${s.meetingsUpcoming} upcoming`,
    `• Content: ${s.postsPublishedToday} aaj publish hue (total ${s.postsPublishedTotal}), ${s.postsDraft} draft, ${s.postsScheduled} scheduled`,
    `• Discovery se relevant leads: ${s.discoveredQualified}`
  );

  if (outreach && outreach.conversationsActive > 0) {
    lines.push(`• Active conversations: ${outreach.conversationsActive}`);
  }

  if (approvals && (approvals.posts > 0 || approvals.drafts > 0)) {
    lines.push(`• Pending approvals: ${approvals.posts} posts review ke liye (yes/no bol kar approve karo)`);
  }

  // Monthly meeting target progress
  if (monthly && monthly.target > 0) {
    lines.push(
      `• Monthly meeting target: ${monthly.booked}/${monthly.target} (${monthly.pct}%), ${monthly.remaining} remaining`
    );
    if (monthly.pct < 50) {
      lines.push(`  → Action: outreach focus karo — "${'outreach chalao'}" se top leads ko message bhejo.`);
    } else if (monthly.remaining > 0) {
      lines.push(`  → Action: interested leads se follow-up karo meetings book karne ke liye.`);
    } else {
      lines.push(`  → Target achieved ✅ pais!`);
    }
  }

  if (s.meetingsUpcoming > 0 || s.discoveredQualified >= 60) {
    lines.push("", `"meetings" ya "relevant leads" bolke detail dekh.`);
  }
  lines.push("Kal ke liye sab ready hai 💪");
  return lines.join("\n");
}

/** Send the daily summary to every user who has a WhatsApp number (or the
 *  owner fallback number when the profile phone is unset). */
export async function sendDailySummaries(supabase: any): Promise<DailySummaryResult[]> {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, phone")
    .not("phone", "is", null)
    .limit(500);

  if (error) throw new Error(`profiles query failed: ${error.message}`);

  const results: DailySummaryResult[] = [];

  for (const p of profiles ?? []) {
    const jid = await resolveUserJid(supabase, p.id);
    if (!jid) continue;
    try {
      const [snapshot, newToday, hot, outreach, approvals, monthly] = await Promise.all([
        gatherOwnerSnapshot(supabase, p.id),
        fetchNewToday(supabase, p.id),
        fetchHotLeads(supabase, p.id),
        fetchOutreachStats(supabase, p.id),
        fetchPendingApprovals(supabase, p.id),
        fetchMonthlyMeetingStats(supabase, p.id),
      ]);
      // Skip silent accounts entirely — no noise for zero-activity users
      const hasActivity =
        snapshot.leadsTotal > 0 ||
        snapshot.discoveredQualified > 0 ||
        snapshot.postsPublishedTotal > 0 ||
        outreach.sentToday > 0 ||
        outreach.repliesToday > 0 ||
        approvals.posts > 0;
      if (!hasActivity) {
        results.push({ userId: p.id, phoneJid: jid, ok: true, error: "skipped_empty_account" });
        continue;
      }
      const message = composeDailySummary(snapshot, newToday, hot, outreach, approvals, monthly);
      await sendViaBaileys({ userId: p.id, jid, message });
      results.push({ userId: p.id, phoneJid: jid, ok: true });
    } catch (err: any) {
      results.push({ userId: p.id, phoneJid: jid, ok: false, error: err?.message ?? "unknown" });
    }
  }

  return results;
}
