import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runWebsiteScan } from "@/lib/ai/website-scanner/scanner";
import { normalizeUrl } from "@/lib/ai/website-scanner/crawler";

export const maxDuration = 60;

const RATE_LIMIT_WINDOW_MS = 120 * 1000;
const RATE_LIMIT_MAX_SCANS = 3;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    if (!body.url || typeof body.url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    let normalized: string;
    try {
      normalized = normalizeUrl(body.url);
    } catch (error: any) {
      return NextResponse.json({ error: error.message ?? "Invalid website URL" }, { status: 400 });
    }

    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count, error: countError } = await supabase
      .from("website_scans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since);
    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
    if ((count ?? 0) >= RATE_LIMIT_MAX_SCANS) {
      return NextResponse.json({ error: "Too many scans. Please wait a couple of minutes." }, { status: 429 });
    }

    const { data: scan, error } = await supabase
      .from("website_scans")
      .insert({
        user_id: user.id,
        url: normalized,
        status: "QUEUED",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    after(async () => {
      try {
        await runWebsiteScan(scan.id, user.id);
      } catch (err: any) {
        console.error(`[API:ai/website/scan] background scan failed: ${err?.message}`);
      }
    });

    return NextResponse.json({ scan_id: scan.id, status: "QUEUED" }, { status: 202 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
