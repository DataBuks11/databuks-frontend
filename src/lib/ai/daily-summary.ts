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

export function composeDailySummary(
  s: Awaited<ReturnType<typeof gatherOwnerSnapshot>>,
  newToday: LeadRow[],
  hot: LeadRow[]
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

  lines.push(
    `• Meetings: ${s.meetingsScheduled} booked, ${s.meetingsUpcoming} upcoming`,
    `• Content: ${s.postsPublishedToday} aaj publish hue (total ${s.postsPublishedTotal}), ${s.postsDraft} draft, ${s.postsScheduled} scheduled`,
    `• Discovery se relevant leads: ${s.discoveredQualified}`
  );

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
      const [snapshot, newToday, hot] = await Promise.all([
        gatherOwnerSnapshot(supabase, p.id),
        fetchNewToday(supabase, p.id),
        fetchHotLeads(supabase, p.id),
      ]);
      // Skip silent accounts entirely — no noise for zero-activity users
      const hasActivity =
        snapshot.leadsTotal > 0 ||
        snapshot.discoveredQualified > 0 ||
        snapshot.postsPublishedTotal > 0;
      if (!hasActivity) {
        results.push({ userId: p.id, phoneJid: jid, ok: true, error: "skipped_empty_account" });
        continue;
      }
      const message = composeDailySummary(snapshot, newToday, hot);
      await sendViaBaileys({ userId: p.id, jid, message });
      results.push({ userId: p.id, phoneJid: jid, ok: true });
    } catch (err: any) {
      results.push({ userId: p.id, phoneJid: jid, ok: false, error: err?.message ?? "unknown" });
    }
  }

  return results;
}
