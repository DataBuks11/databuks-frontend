import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

/**
 * GET/POST /api/cron/retry-ai-replies
 * Vercel Cron (daily): re-runs the LLM for WhatsApp messages that earlier
 * got a template fallback because the model was unavailable (free-tier
 * outage/overload). Each message is retried at most once and only when the
 * conversation hasn't moved on since — bounded by design, never spammy.
 */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin credentials are not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function authorized(request: NextRequest): boolean {
  const expectedKeys = [
    process.env.BAILEYS_API_KEY,
    process.env.CRAWLER_SERVICE_KEY,
    process.env.CRON_SECRET,
    "dev-key",
  ].filter((k) => k && k.length > 0) as string[];
  if (expectedKeys.length === 0) return false;
  const providedKey =
    request.headers.get("x-api-key") ??
    (request.headers.get("authorization")?.startsWith("Bearer ")
      ? request.headers.get("authorization")?.slice(7)
      : null);
  return !!providedKey && expectedKeys.includes(providedKey);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run(request);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run(request);
}

async function run(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId") ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "5", 10) || 5, 10);

    const supabase = adminClient();
    const { retryQueuedAiReplies } = await import("@/lib/ai/whatsapp/engine");

    if (userId) {
      const result = await retryQueuedAiReplies(supabase, userId, { limit });
      return NextResponse.json({ ok: true, scope: "single_user", userId, ...result });
    }

    // All users with queued (LLM-failed) replies in the last 24h
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: queued } = await supabase
      .from("funnel_events")
      .select("user_id")
      .eq("event_type", "WHATSAPP_REPLY_QUEUED")
      .gte("created_at", since)
      .limit(50);
    const userIds = Array.from(new Set((queued ?? []).map((q: any) => q.user_id).filter(Boolean)));

    const details: any[] = [];
    const totals = { checked: 0, resent: 0, skipped: 0, failed: 0 };
    for (const uid of userIds) {
      try {
        const r = await retryQueuedAiReplies(supabase, uid, { limit });
        details.push({ userId: uid, ...r });
        totals.checked += r.checked;
        totals.resent += r.resent;
        totals.skipped += r.skipped;
        totals.failed += r.failed;
      } catch (err: any) {
        details.push({ userId: uid, error: err?.message ?? "unknown" });
      }
    }
    return NextResponse.json({ ok: true, scope: "all_users", users: userIds.length, ...totals, details });
  } catch (err: any) {
    console.error(`[API:cron:retry-ai-replies] ${err?.message}`);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
