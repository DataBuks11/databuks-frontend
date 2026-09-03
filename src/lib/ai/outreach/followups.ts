/**
 * LEAD FOLLOW-UP ENGINE
 *
 * Outreach sends the first message; if no reply comes back, we nudge.
 * This engine picks discovered leads that:
 *   - got at least one outreach message (stage NURTURE), and
 *   - have NOT heard back from the lead for ≥ FOLLOWUP_DELAY_MS (72h), and
 *   - have fewer than MAX_FOLLOWUPS per lead so we don't spam forever.
 *
 * Each follow-up bumps total_messages / last_message_at and writes a
 * FOLLOWUP_SENT funnel event so owner reports can show follow-up activity.
 */

import { getActiveProvider } from "../providers";
import { sendViaBaileys } from "@/lib/whatsapp/jid-utils";

export const FOLLOWUP_DELAY_MS = 72 * 3600 * 1000;
export const MAX_FOLLOWUPS = 3;

export interface FollowUpCandidate {
  id: string;
  user_id: string;
  author_name: string | null;
  author_handle: string | null;
  detected_requirement: string | null;
  lead_score: number;
  evidence: any;
  total_messages: number;
  last_message_at: string | null;
}

export interface FollowUpResult {
  leadId: string;
  ok: boolean;
  error?: string;
  channel?: string;
}

/** Pure selector: which leads are currently due for a follow-up? */
export function selectFollowUpCandidates(
  rows: FollowUpCandidate[],
  now: number = Date.now()
): FollowUpCandidate[] {
  return rows.filter((r) => {
    if (!r.last_message_at) return false;
    const last = new Date(r.last_message_at).getTime();
    if (isNaN(last)) return false;
    if (now - last < FOLLOWUP_DELAY_MS) return false;
    return r.total_messages < MAX_FOLLOWUPS;
  });
}

/** Find the lead's WhatsApp number from evidence contact details. */
function leadPhone(c: FollowUpCandidate): string | null {
  const cd = c.evidence?.contact_details ?? {};
  const raw = cd.phone ?? null;
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  return digits.length >= 10 ? digits : null;
}

async function buildFollowUpMessage(c: FollowUpCandidate, followupNumber: number): Promise<string> {
  const provider = getActiveProvider();
  const biz = "DataBuks";
  try {
    const out = await provider.completeJson({
      system: [
        "You are a sales assistant sending a SHORT follow-up WhatsApp message to a prospect who did not reply to your first outreach.",
        `This is follow-up #${followupNumber} of a max of 3. Keep it casual, brief (max 120 characters), no emojis, no links, one friendly question.`,
        "If this is the 3rd follow-up, the message should gracefully close the loop (e.g. 'no worries, ping me whenever') instead of pushing harder.",
        'Reply as JSON: {"message": "..."}',
      ].join("\n"),
      user: [
        `Prospect: ${c.author_name ?? c.author_handle ?? "there"}`,
        `Detected requirement: ${c.detected_requirement ?? "your business needs"}`,
        `Our business: ${biz} — websites, MVPs, AI features, automations.`,
      ].join("\n"),
      temperature: 0.7,
      maxTokens: 200,
    });
    const msg = String((out as any)?.message ?? "").trim();
    if (msg) return msg;
  } catch {
    // fall through to template
  }
  const name = c.author_name ?? c.author_handle ?? "there";
  if (followupNumber >= 3) {
    return `hey ${name}, no pressure — if the timing's off just ignore this. happy to connect whenever works for you!`;
  }
  return `hey ${name}, just checking if you saw my last message about ${c.detected_requirement ?? "your business needs"}? happy to share details when you're free.`;
}

export async function runLeadFollowUps(
  supabase: any,
  opts: { userId?: string; limit?: number } = {}
): Promise<{ processed: number; results: FollowUpResult[]; skipped: number }> {
  const limit = opts.limit ?? 15;

  let query = supabase
    .from("discovered_leads")
    .select(
      "id, user_id, author_name, author_handle, detected_requirement, lead_score, evidence, total_messages, last_message_at, conversation_stage"
    )
    .eq("conversation_stage", "NURTURE")
    .not("last_message_at", "is", null)
    .order("last_message_at", { ascending: true })
    .limit(limit * 2);

  if (opts.userId) query = query.eq("user_id", opts.userId);

  const { data: rows, error } = await query;
  if (error) throw new Error(`follow-up query failed: ${error.message}`);

  const candidates = selectFollowUpCandidates((rows ?? []) as FollowUpCandidate[]).slice(0, limit);
  const results: FollowUpResult[] = [];
  let processed = 0;
  let skipped = 0;

  for (const c of candidates) {
    const phone = leadPhone(c);
    if (!phone) {
      skipped += 1;
      results.push({ leadId: c.id, ok: false, error: "no_phone" });
      continue;
    }
    const followupNumber = (c.total_messages ?? 0);
    const message = await buildFollowUpMessage(c, followupNumber);
    try {
      const digits = phone.slice(-10);
      await sendViaBaileys({
        userId: c.user_id,
        jid: `${digits}@s.whatsapp.net`,
        message,
      });
      await Promise.all([
        supabase.from("funnel_events").insert({
          user_id: c.user_id,
          event_type: "FOLLOWUP_SENT",
          from_stage: "NURTURE",
          to_stage: null,
          metadata: {
            discovered_lead_id: c.id,
            channel: "whatsapp",
            followup_number: followupNumber,
            score: c.lead_score,
          },
        }),
        supabase
          .from("discovered_leads")
          .update({
            total_messages: (c.total_messages ?? 0) + 1,
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", c.id),
      ]);
      processed += 1;
      results.push({ leadId: c.id, ok: true, channel: "whatsapp" });
    } catch (err: any) {
      skipped += 1;
      results.push({ leadId: c.id, ok: false, error: err?.message ?? "send_failed" });
    }
  }

  return { processed, results, skipped };
}