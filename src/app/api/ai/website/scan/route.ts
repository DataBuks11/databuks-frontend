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

    const crawlerServiceUrl = process.env.CRAWLER_SERVICE_URL;
    if (crawlerServiceUrl) {
      const crawlerKey = process.env.CRAWLER_SERVICE_KEY || process.env.BAILEYS_API_KEY || "dev-key";
      // Use AbortController to cap the crawler trigger call at 10s so this
      // function returns 202 quickly and the dashboard polling can start.
      const controller = new AbortController();
      const triggerTimeout = setTimeout(() => controller.abort(), 10_000);
      // Fire the crawler (or static fallback) in the background. Vercel's
      // `after()` keeps the function alive until the promise resolves or the
      // function's maxDuration (60s) is hit — so we must keep the trigger
      // call short. The crawler itself continues in the background on
      // Railway, then calls back to /api/ai/website/analyze for the LLM
      // analysis.
      after(async () => {
        try {
          const res = await fetch(`${crawlerServiceUrl.replace(/\/+$/, "")}/crawl`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": crawlerKey,
            },
            body: JSON.stringify({
              scan_id: scan.id,
              user_id: user.id,
              url: normalized,
              max_pages: Number(process.env.WEBSITE_MAX_PAGES ?? 40),
              max_depth: Number(process.env.WEBSITE_MAX_DEPTH ?? 4),
            }),
            signal: controller.signal,
          });
          if (!res.ok) {
            console.error(`[API:ai/website/scan] crawler returned ${res.status} — falling back to static`);
            await runWebsiteScan(scan.id, user.id);
          }
        } catch (err: any) {
          console.error(`[API:ai/website/scan] crawler trigger failed: ${err?.message} — falling back to static`);
          try {
            await runWebsiteScan(scan.id, user.id);
          } catch (fallbackErr: any) {
            console.error(`[API:ai/website/scan] static fallback failed: ${fallbackErr?.message}`);
            await supabase
              .from("website_scans")
              .update({ status: "FAILED", error_message: `Both crawler and static scan failed: ${fallbackErr?.message ?? "unknown"}`, completed_at: new Date().toISOString() })
              .eq("id", scan.id);
          }
        } finally {
          clearTimeout(triggerTimeout);
        }
      });
    } else {
      after(async () => {
        try {
          await runWebsiteScan(scan.id, user.id);
        } catch (err: any) {
          console.error(`[API:ai/website/scan] background scan failed: ${err?.message}`);
        }
      });
    }

    return NextResponse.json({ scan_id: scan.id, status: "QUEUED" }, { status: 202 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
