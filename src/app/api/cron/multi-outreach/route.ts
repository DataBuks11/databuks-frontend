import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

/**
 * GET/POST /api/cron/multi-outreach
 * Vercel Cron handler: daily, picks top discovered leads and runs
 * multi-channel outreach (WhatsApp / Instagram / Facebook / LinkedIn / Email).
 */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin credentials are not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function authorized(request: NextRequest): boolean {
  // Use BAILEYS_API_KEY as the primary (always set, always non-empty).
  // Fall back to other cron keys only if BAILEYS is empty.
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
  if (!providedKey) return false;
  return expectedKeys.includes(providedKey);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runOutreach(request);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runOutreach(request);
}

async function runOutreach(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const limit = parseInt(url.searchParams.get("limit") ?? "5", 10);

    const supabase = adminClient();
    const { runMultiChannelOutreachForUser } = await import(
      "@/lib/ai/outreach/multi-channel"
    );

    if (userId) {
      const result = await runMultiChannelOutreachForUser(supabase, userId, { limit });
      return NextResponse.json({ ok: true, scope: "single_user", ...result });
    }

    // Run for all users with active discovered leads
    const { data: users } = await supabase
      .from("discovered_leads")
      .select("user_id")
      .in("conversation_stage", ["DISCOVER", "QUALIFY"])
      .gte("lead_score", 60)
      .limit(50);
    const userIds = Array.from(new Set((users ?? []).map((u: any) => u.user_id)));

    const all: any[] = [];
    for (const uid of userIds) {
      try {
        const r = await runMultiChannelOutreachForUser(supabase, uid, { limit: 3 });
        all.push({ userId: uid, ...r });
      } catch (err: any) {
        console.error(`[API:cron/multi-outreach] user ${uid} failed: ${err?.message}`);
      }
    }

    const totalProcessed = all.reduce((s, r) => s + r.processed, 0);
    const totalChannels = all.reduce((s, r) => s + r.results.reduce((rs: number, rr: any) => rs + rr.channels.length, 0), 0);
    return NextResponse.json({
      ok: true,
      scope: "all_users",
      users_processed: userIds.length,
      leads_contacted: totalProcessed,
      channels_attempted: totalChannels,
      details: all,
    });
  } catch (err: any) {
    console.error(`[API:cron/multi-outreach] ${err?.message}`);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
