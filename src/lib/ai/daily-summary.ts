import { gatherOwnerSnapshot } from "./owner-assistant";

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

function sendViaBaileys(input: {
  userId: string;
  jid: string;
  message: string;
}): Promise<void> {
  const baseUrl = process.env.BAILEYS_SERVER_URL;
  if (!baseUrl) return Promise.reject(new Error("BAILEYS_SERVER_URL not configured"));
  return fetch(`${baseUrl.replace(/\/+$/, "")}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.BAILEYS_API_KEY || "dev-key",
    },
    body: JSON.stringify(input),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`WhatsApp send failed (${res.status})`);
  });
}

function profileToJid(phone: unknown): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? `${digits}@s.whatsapp.net` : null;
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
  const { data } = await supabase
    .from("leads")
    .select("name, lead_score, funnel_stage")
    .eq("user_id", userId)
    .gte("created_at", startOfTodayISO())
    .order("lead_score", { ascending: false })
    .limit(limit);
  return data ?? [];
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
}

async function fetchOutreachStats(supabase: any, userId: string): Promise<OutreachStats> {
  const today = startOfTodayISO();
  const empty: OutreachStats = {
    sentToday: 0,
    byChannel: { whatsapp: 0, instagram: 0, facebook: 0, linkedin: 0, email: 0 },
    conversationsActive: 0,
    meetingsBooked: 0,
  };
  try {
    const { data: events } = await supabase
      .from("funnel_events")
      .select("metadata")
      .eq("user_id", userId)
      .eq("event_type", "OUTREACH_SENT")
      .gte("created_at", today)
      .limit(200);
    for (const e of events ?? []) {
      const ch = e?.metadata?.channel;
      if (ch && ch in empty.byChannel) {
        empty.byChannel[ch as keyof OutreachStats["byChannel"]] += 1;
      }
      empty.sentToday += 1;
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
  } catch {}
  return empty;
}

export function composeDailySummary(
  s: Awaited<ReturnType<typeof gatherOwnerSnapshot>>,
  newToday: LeadRow[],
  hot: LeadRow[],
  outreach?: OutreachStats
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

  lines.push(
    `• Meetings: ${s.meetingsScheduled} booked, ${s.meetingsUpcoming} upcoming`,
    `• Content: ${s.postsPublishedToday} aaj publish hue (total ${s.postsPublishedTotal}), ${s.postsDraft} draft, ${s.postsScheduled} scheduled`,
    `• Discovery se relevant leads: ${s.discoveredQualified}`
  );

  if (outreach && outreach.conversationsActive > 0) {
    lines.push(`• Active conversations: ${outreach.conversationsActive}`);
  }

  if (s.meetingsUpcoming > 0 || s.discoveredQualified >= 60) {
    lines.push("", `"meetings" ya "relevant leads" bolke detail dekh.`);
  }
  lines.push("Kal ke liye sab ready hai 💪");
  return lines.join("\n");
}

/** Send the daily summary to every user who has a WhatsApp number bound. */
export async function sendDailySummaries(supabase: any): Promise<DailySummaryResult[]> {
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, phone")
    .not("phone", "is", null)
    .limit(500);

  if (error) throw new Error(`profiles query failed: ${error.message}`);

  const results: DailySummaryResult[] = [];

  for (const p of profiles ?? []) {
    const jid = profileToJid(p.phone);
    if (!jid) continue;
    try {
      const [snapshot, newToday, hot, outreach] = await Promise.all([
        gatherOwnerSnapshot(supabase, p.id),
        fetchNewToday(supabase, p.id),
        fetchHotLeads(supabase, p.id),
        fetchOutreachStats(supabase, p.id),
      ]);
      // Skip silent accounts entirely — no noise for zero-activity users
      const hasActivity =
        snapshot.leadsTotal > 0 ||
        snapshot.discoveredQualified > 0 ||
        snapshot.postsPublishedTotal > 0 ||
        outreach.sentToday > 0;
      if (!hasActivity) {
        results.push({ userId: p.id, phoneJid: jid, ok: true, error: "skipped_empty_account" });
        continue;
      }
      const message = composeDailySummary(snapshot, newToday, hot, outreach);
      await sendViaBaileys({ userId: p.id, jid, message });
      results.push({ userId: p.id, phoneJid: jid, ok: true });
    } catch (err: any) {
      results.push({ userId: p.id, phoneJid: jid, ok: false, error: err?.message ?? "unknown" });
    }
  }

  return results;
}
