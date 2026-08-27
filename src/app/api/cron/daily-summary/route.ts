import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 120;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin credentials are not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: NextRequest) {
  const expectedKey =
    process.env.CRON_SECRET || process.env.CRAWLER_SERVICE_KEY || process.env.BAILEYS_API_KEY || "dev-key";
  const providedKey =
    request.headers.get("x-api-key") ??
    (request.headers.get("authorization")?.startsWith("Bearer ")
      ? request.headers.get("authorization")?.slice(7)
      : null);
  if (providedKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = adminClient();
    const { sendDailySummaries } = await import("@/lib/ai/daily-summary");
    const results = await sendDailySummaries(supabase);
    const sent = results.filter((r) => r.ok && !r.error).length;
    const skipped = results.filter((r) => r.ok && r.error === "skipped_empty_account").length;
    const failed = results.filter((r) => !r.ok);
    return NextResponse.json({ ok: true, sent, skipped, failed: failed.length, details: results });
  } catch (err: any) {
    console.error(`[API:cron:daily-summary] ${err?.message}`);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
