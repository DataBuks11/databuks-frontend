import { getActiveProvider } from "../providers";

/**
 * PROACTIVE LEAD OUTREACH RUNNER
 *
 * Finds hot un-contacted leads that have a phone number, generates a
 * personalized opener grounded ONLY in real lead data (no fabrication),
 * gates it through the rule engine (rate limits, stage checks) and delivers
 * it over WhatsApp via the shared assistant session.
 */

export interface OutreachCandidate {
  id: string;
  user_id: string;
  name: string;
  company: string | null;
  industry: string | null;
  location: string | null;
  phone: string | null;
  lead_score: number;
}

export interface OutreachRunResult {
  leadId: string;
  userId: string;
  ok: boolean;
  error?: string;
  message?: string;
  gated?: boolean;
  reason?: string;
}

interface ProfileBits {
  company_name: string | null;
  website: string | null;
}

function phoneToJid(phone: string): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? `${digits}@s.whatsapp.net` : null;
}

async function fetchCandidates(supabase: any, userId?: string, limit = 5): Promise<OutreachCandidate[]> {
  let query = supabase
    .from("leads")
    .select("id, user_id, name, company, industry, location, phone, lead_score")
    .eq("status", "new")
    .gte("lead_score", 70)
    .not("phone", "is", null)
    .order("lead_score", { ascending: false })
    .limit(limit * 3); // headroom — we filter out contacted ones below
  if (userId) query = query.eq("user_id", userId);

  const { data: rows, error } = await query;
  if (error) throw new Error(`leads query failed: ${error.message}`);

  // Exclude anyone who already received outreach before
  const { data: priorEvents } = await supabase
    .from("funnel_events")
    .select("lead_id")
    .eq("event_type", "OUTREACH_SENT")
    .limit(1000);
  const contacted = new Set((priorEvents ?? []).map((e: any) => e.lead_id));

  return (rows ?? [])
    .filter((r: any) => !contacted.has(r.id))
    .slice(0, limit);
}

function templateOpener(lead: OutreachCandidate, biz: ProfileBits | null): string {
  const bits: string[] = [];
  const target = lead.name || "there";
  if (lead.company) bits.push(`${lead.company}`);
  else if (lead.industry) bits.push(`${lead.industry}`);
  const context = bits.length ? ` ${bits[0]}` : "";
  const brand = biz?.company_name ?? "";
  return (
    `Hi ${target}! 👋${brand ? ` Main ${brand} ki taraf se` : " Main"} WhatsApp pe reach kar raha hoon.` +
    `${context ? ` ${context.trim()} ke baare mein kaafi interesting cheezein dekhi maine recently.` : ""}` +
    ` Ek chhota sa kaam hai jisme hum help kar sakte hain — 2 min dein toh quick baat kar lein?`
  );
}

async function composeOpener(supabase: any, lead: OutreachCandidate, biz: ProfileBits | null): Promise<string> {
  try {
    const provider = getActiveProvider();
    const out = await provider.completeJson({
      system:
        'Write ONE short friendly first-touch sales opener for WhatsApp. Respond as JSON: {"reply":"..."}. ' +
        "Use ONLY the facts provided about the person/company — never invent details, prices, claims, or events. " +
        "Warm, human, 2-3 sentences max, end with a soft question asking to chat. No hashtags.",
      user: JSON.stringify({
        business: biz ?? {},
        lead: {
          name: lead.name,
          company: lead.company,
          industry: lead.industry,
          location: lead.location,
          score: lead.lead_score,
        },
      }),
      temperature: 0.7,
      maxTokens: 120,
      reasoningEffort: "low",
    });
    const text = String(out?.reply ?? out?.message ?? out?.text ?? "").trim();
    return text.length > 20 ? text : templateOpener(lead, biz);
  } catch {
    return templateOpener(lead, biz);
  }
}

async function getBusinessProfile(supabase: any, userId: string): Promise<ProfileBits | null> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("company_name, website")
      .eq("id", userId)
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

async function sendWhatsApp(userId: string, jid: string, message: string): Promise<void> {
  const baseUrl = process.env.BAILEYS_SERVER_URL;
  if (!baseUrl) throw new Error("BAILEYS_SERVER_URL not configured");
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.BAILEYS_API_KEY || "dev-key",
    },
    body: JSON.stringify({ userId, jid, message }),
  });
  if (!res.ok) throw new Error(`WhatsApp send failed (${res.status})`);
}

/** Run proactive outreach across all users (or one user). Gated + delivered. */
export async function runProactiveOutreach(
  supabase: any,
  opts: { userId?: string; limit?: number; dryRun?: boolean } = {}
): Promise<OutreachRunResult[]> {
  const { sendOutreach } = await import("./engine");
  const candidates = await fetchCandidates(supabase, opts.userId, opts.limit ?? 5);
  const results: OutreachRunResult[] = [];

  for (const lead of candidates) {
    const base = { leadId: lead.id, userId: lead.user_id };
    try {
      const jid = phoneToJid(String(lead.phone));
      if (!jid) {
        results.push({ ...base, ok: false, error: "bad_phone" });
        continue;
      }
      const biz = await getBusinessProfile(supabase, lead.user_id);
      const message = opts.dryRun
        ? templateOpener(lead, biz)
        : await composeOpener(supabase, lead, biz);

      // Gate first: rule engine records OUTREACH_SENT / OUTREACH_BLOCKED
      const gate = await sendOutreach(supabase, {
        userId: lead.user_id,
        leadId: lead.id,
        channel: "whatsapp",
        message,
      });
      if (!gate.allowed) {
        results.push({ ...base, ok: true, gated: true, reason: gate.reason });
        continue;
      }
      if (opts.dryRun) {
        results.push({ ...base, ok: true, gated: false, reason: "dry_run", message });
        continue;
      }
      await sendWhatsApp(lead.user_id, jid, message);
      results.push({ ...base, ok: true, message });
    } catch (err: any) {
      results.push({ ...base, ok: false, error: err?.message ?? "unknown" });
    }
  }

  return results;
}
