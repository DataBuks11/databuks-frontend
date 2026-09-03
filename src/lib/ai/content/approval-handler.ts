/**
 * WhatsApp post-approval handler.
 *
 * The daily-post generator sends drafts to the user's personal-assistant
 * WhatsApp. When the user replies with "yes", "no", "edit: ...", or
 * "schedule: ...", we match the reply to the most recent pending
 * social_posts row for that user and update approval_status.
 *
 * The actual approval detection runs as part of the inbound lead-message
 * path: this module is invoked from engine.ts when the sender is the
 * OWNER (i.e. when the user replies to their own assistant). For non-owner
 * inbound leads we just pass the message through normally.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ApprovalDecision = "approved" | "rejected" | "edited" | "scheduled" | "unknown";

export interface ApprovalParseResult {
  decision: ApprovalDecision;
  /** Edit text if decision = "edited" */
  editText: string | null;
  /** Schedule time string if decision = "scheduled" */
  scheduleAt: string | null;
  /** Numeric reference: which draft (1-based) the user is talking about */
  index: number | null;
}

/** Parse the user's free-form WhatsApp reply into an approval decision. */
export function parseApprovalReply(text: string): ApprovalParseResult {
  const lower = text.toLowerCase().trim();

  // Numeric prefix (optional)
  let index: number | null = null;
  const numMatch = lower.match(/^(\d+)\s*[:.)\-]?\s*/);
  if (numMatch) index = parseInt(numMatch[1], 10);

  const remaining = numMatch ? lower.slice(numMatch[0].length).trim() : lower;

  // Order matters: schedule must be checked before edit (since "edit" prefix
  // also matches "schedule: ...")
  if (/^schedule\s*[:\-]?\s*/.test(remaining)) {
    const scheduleAt = remaining.replace(/^schedule\s*[:\-]?\s*/, "").trim();
    return { decision: "scheduled", editText: null, scheduleAt, index };
  }
  if (/^edit\s*[:\-]?\s*/.test(remaining)) {
    const editText = remaining.replace(/^edit\s*[:\-]?\s*/, "").trim();
    return { decision: "edited", editText, scheduleAt: null, index };
  }
  if (
    /^(yes|y|ok|done|approved|approve|👍|✅)$/.test(remaining) ||
    /^(yes|y|ok|done)\b/.test(remaining)
  ) {
    return { decision: "approved", editText: null, scheduleAt: null, index };
  }
  if (
    /^(no|nope|nah|cancel|reject|rejected|👎|❌)$/.test(remaining) ||
    /^no\b/.test(remaining) ||
    /^cancel\b/.test(remaining)
  ) {
    return { decision: "rejected", editText: null, scheduleAt: null, index };
  }
  return { decision: "unknown", editText: null, scheduleAt: null, index };
}

export interface PublishRowInput {
  user_id: string;
  topic: string | null;
  caption: string | null;
  content_type: string | null;
  provider?: string | null;
  hashtags?: string[] | null;
  cta?: string | null;
  image_url?: string | null;
  image_prompt?: string | null;
}

/**
 * Build the row that goes into the `content` table when a draft is approved.
 * Approved means "publish it" — so the row is status='scheduled' DUE NOW
 * (publisher picks it up on the next run). Before this fix, approved rows
 * were mirrored as 'draft', which the publisher ignores, so approved posts
 * never actually published.
 */
export function buildPublishRow(
  draft: PublishRowInput,
  decision: ApprovalDecision,
  scheduledAt: string | null
): Record<string, any> {
  const publishAt = decision === "scheduled" && scheduledAt ? scheduledAt : new Date().toISOString();
  return {
    user_id: draft.user_id,
    title: draft.topic ?? "Post",
    body: draft.caption ?? "",
    type: draft.content_type ?? "post",
    platform: draft.provider ?? "instagram",
    status: "scheduled",
    scheduled_date: publishAt,
    hashtags: Array.isArray(draft.hashtags) ? draft.hashtags : [],
    cta: draft.cta ?? null,
    image_url: draft.image_url ?? null,
    image_prompt: draft.image_prompt ?? null,
    author: null,
  };
}

/** Apply the parsed decision to a specific draft in social_posts. */
export async function applyApproval(
  supabase: SupabaseClient,
  userId: string,
  postId: string,
  decision: ApprovalDecision,
  extras: { editText?: string | null; scheduleAt?: string | null } = {}
): Promise<{ ok: boolean; error?: string }> {
  if (decision === "unknown") {
    return { ok: false, error: "decision unknown" };
  }

  // Fetch the draft first so we can mirror it into the content table for
  // the auto-publisher cron to pick up on approve.
  const { data: draft, error: fetchErr } = await supabase
    .from("social_posts")
    .select("*")
    .eq("id", postId)
    .eq("user_id", userId)
    .single();
  if (fetchErr || !draft) return { ok: false, error: fetchErr?.message ?? "draft not found" };

  const update: Record<string, any> = { approval_status: decision };
  if (decision === "approved" || decision === "scheduled") {
    update.approved_at = new Date().toISOString();
    if (decision === "scheduled" && extras.scheduleAt) {
      const parsed = parseSchedule(extras.scheduleAt);
      if (parsed) update.scheduled_at = parsed;
    }
  }
  if (decision === "edited" && extras.editText) {
    update.edit_suggestion = extras.editText.slice(0, 800);
  }

  const { error } = await supabase
    .from("social_posts")
    .update(update)
    .eq("id", postId)
    .eq("user_id", userId)
    .eq("approval_status", "pending");
  if (error) return { ok: false, error: error.message };

  // Mirror to content table (legacy schema) so the auto-publisher cron
  // picks it up. Approving means "publish it" — so approved drafts are
  // mirrored as status='scheduled' DUE NOW (scheduled_date = now), not
  // 'draft'. The publisher only reads scheduled rows; mirroring as draft
  // made approved posts never leave the queue.
  if (decision === "approved" || decision === "scheduled") {
    try {
      await supabase.from("content").insert(
        buildPublishRow(draft as PublishRowInput, decision, update.scheduled_at ?? null)
      );
    } catch (err: any) {
      console.warn(`[approval-handler] could not mirror to content table: ${err?.message}`);
    }
  }

  return { ok: true };
}

/** Find the most recent pending draft for a user. */
export async function findPendingDraft(
  supabase: SupabaseClient,
  userId: string,
  index: number | null
): Promise<{ id: string; topic: string; caption: string | null } | null> {
  let query = supabase
    .from("social_posts")
    .select("id, topic, caption")
    .eq("user_id", userId)
    .eq("approval_status", "pending")
    .order("created_at", { ascending: false });
  if (index !== null) {
    query = query.range(index - 1, index - 1);
  } else {
    query = query.limit(1);
  }
  const { data, error } = await query;
  if (error || !data || data.length === 0) return null;
  return { id: data[0].id, topic: data[0].topic, caption: data[0].caption };
}

function parseSchedule(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // "HH:MM" today or tomorrow
  const hmMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hmMatch) {
    const h = parseInt(hmMatch[1], 10);
    const m = parseInt(hmMatch[2], 10);
    if (h >= 0 && h < 24 && m >= 0 && m < 60) {
      const d = new Date();
      d.setHours(h, m, 0, 0);
      // if time already passed today, schedule for tomorrow
      if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
      return d.toISOString();
    }
  }
  // try full ISO date
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
}

/**
 * Entry point: try to interpret an inbound WhatsApp message as a post
 * approval. Returns a result with status: "approved" | "rejected" |
 * "edited" | "scheduled" | "no-pending" | "not-approval".
 */
export async function handleApprovalReply(
  supabase: SupabaseClient,
  userId: string,
  messageText: string
): Promise<
  | { status: "approved" | "rejected" | "edited" | "scheduled"; postId: string; topic: string }
  | { status: "no-pending" }
  | { status: "not-approval" }
> {
  const parsed = parseApprovalReply(messageText);
  if (parsed.decision === "unknown") return { status: "not-approval" };

  const draft = await findPendingDraft(supabase, userId, parsed.index);
  if (!draft) return { status: "no-pending" };

  const res = await applyApproval(supabase, userId, draft.id, parsed.decision, {
    editText: parsed.editText,
    scheduleAt: parsed.scheduleAt,
  });
  if (!res.ok) return { status: "no-pending" };
  return { status: parsed.decision, postId: draft.id, topic: draft.topic };
}
