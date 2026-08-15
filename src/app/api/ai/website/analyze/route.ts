import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { finalizeScanFromStoredPages } from "@/lib/ai/website-scanner/scanner";

export const maxDuration = 300;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin credentials are not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest) {
  const expectedKey = process.env.CRAWLER_SERVICE_KEY || process.env.BAILEYS_API_KEY || "dev-key";
  const providedKey = request.headers.get("x-api-key");
  if (providedKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const { scan_id: scanId, user_id: userId } = body ?? {};
    if (!scanId || !userId) {
      return NextResponse.json({ error: "scan_id and user_id required" }, { status: 400 });
    }

    const supabase = adminClient();
    await finalizeScanFromStoredPages(supabase, scanId, userId);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(`[API:ai/website/analyze] ${err?.message}`);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
