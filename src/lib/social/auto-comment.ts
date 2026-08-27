import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * AUTO-COMMENT RUNNER
 *
 * The social monitor's AI processor already drafts comment replies
 * (PENDING social_actions of type COMMENT_REPLY / CREATE_COMMENT). This
 * runner safely auto-executes low-risk drafts — short AI-proposed texts —
 * through approveSocialAction, which enforces rate limits + idempotency.
 * Anything long or lacking an AI decision stays human-approved.
 */

export interface AutoCommentResult {
  actionId: string;
  userId: string;
  ok: boolean;
  status?: string;
  reason?: string;
}

const MAX_AUTO_CHARS = 220;
const ALLOWED_TYPES = ["COMMENT_REPLY", "CREATE_COMMENT"];

export async function runAutoComments(
  supabase: SupabaseClient,
  opts: { userId?: string; limit?: number } = {}
): Promise<AutoCommentResult[]> {
  const limit = opts.limit ?? 5;

  let query = supabase
    .from("social_actions")
    .select("id, user_id, action_type, content")
    .eq("status", "PENDING")
    .in("action_type", ALLOWED_TYPES)
    .not("ai_decision_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (opts.userId) query = query.eq("user_id", opts.userId);

  const { data: rows, error } = await query;
  if (error) throw new Error(`social_actions query failed: ${error.message}`);

  const results: AutoCommentResult[] = [];
  const { approveSocialAction } = await import("./executor");

  for (const row of rows ?? []) {
    const base = { actionId: row.id, userId: row.user_id };
    const text = String(row.content ?? "");
    if (!text || text.length > MAX_AUTO_CHARS || text.includes("http")) {
      // Risky/unsuitable for auto-send — leave for human review
      continue;
    }
    try {
      const outcome = await approveSocialAction(supabase, row.user_id, row.id);
      results.push({
        ...base,
        ok: outcome.allowed,
        status: outcome.status,
        reason: outcome.reason,
      });
    } catch (err: any) {
      results.push({ ...base, ok: false, reason: err?.message ?? "unknown" });
    }
  }

  return results;
}
