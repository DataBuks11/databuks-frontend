import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 120;

/**
 * GET/POST /api/cron/lead-followups
 * Vercel Cron: sends follow-up nudges to leads that were outreached but
 * never replied (72h+ cooldown, max 3 follow-ups per lead).
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
    const limit = parseInt(url.searchParams.get("limit") ?? "15", 10);

    const supabase = adminClient();
    const { runLeadFollowUps } = await import("@/lib/ai/outreach/followups");
    const result = await runLeadFollowUps(supabase, { userId, limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error(`[API:cron:lead-followups] ${err?.message}`);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}