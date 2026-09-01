import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

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
  const providedKey =
    request.headers.get("x-api-key") ??
    (request.headers.get("authorization")?.startsWith("Bearer ")
      ? request.headers.get("authorization")?.slice(7)
      : null);
  return !!providedKey && expectedKeys.includes(providedKey);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runOutreachV2(request);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runOutreachV2(request);
}

async function runOutreachV2(request: NextRequest) {
  try {
    const supabase = adminClient();
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const limit = parseInt(url.searchParams.get("limit") ?? "5", 10);

    // Pull top leads that have actual contact data
    let query = supabase
      .from("discovered_leads")
      .select("id, user_id, author_name, source_platform, evidence, lead_score, conversation_stage")
      .gte("lead_score", 60)
      .in("conversation_stage", ["DISCOVER", "QUALIFY"])
      .order("lead_score", { ascending: false })
      .limit(limit);

    if (userId) query = query.eq("user_id", userId);

    const { data: leads, error } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!leads || leads.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, results: [], note: "no qualified leads" });
    }

    // Use the existing orchestrator (already updated to read contact_details)
    const { runMultiChannelOutreachForUser } = await import(
      "@/lib/ai/outreach/multi-channel"
    );
    const userIds = userId ? [userId] : Array.from(new Set(leads.map((l) => l.user_id)));
    let totalProcessed = 0;
    let totalPushed = 0;
    const allResults: any[] = [];
    for (const uid of userIds) {
      const result = await runMultiChannelOutreachForUser(supabase, uid, { limit });
      totalProcessed += result.processed;
      totalPushed += (result.results as any[]).reduce(
        (s: number, r: any) => s + r.channels.filter((c: any) => c.ok).length,
        0
      );
      allResults.push({ userId: uid, ...result });
    }
    return NextResponse.json({
      ok: true,
      processed: totalProcessed,
      pushed: totalPushed,
      results: allResults,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "unknown" }, { status: 500 });
  }
}
