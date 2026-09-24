import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { scan_id: scanId } = body;

    const query = supabase
      .from("website_scans")
      .update({
        status: "CANCELLED",
        error_message: "Scan stopped by user",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (scanId && typeof scanId === "string") {
      await query.eq("id", scanId);
    } else {
      await query.in("status", ["QUEUED", "SCANNING", "EXTRACTING", "ANALYZING"]);
    }

    // Best-effort: abort the live crawl task so budget isn't burned.
    // Crawler deploy without /cancel just 404s — DB row already flipped above.
    if (scanId && typeof scanId === "string") {
      try {
        const base = process.env.CRAWLER_SERVICE_URL ?? "";
        const key = process.env.CRAWLER_SERVICE_KEY ?? "";
        if (base) {
          const ctl = new AbortController();
          const t = setTimeout(() => ctl.abort(), 8000);
          await fetch(`${base.replace(/\/+$/, "")}/cancel`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": key },
            body: JSON.stringify({ scan_id: scanId }),
            signal: ctl.signal,
          }).catch(() => null);
          clearTimeout(t);
        }
      } catch {}
    }

    return NextResponse.json({ success: true, cancelled: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
