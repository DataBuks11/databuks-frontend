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
        status: "FAILED",
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

    return NextResponse.json({ success: true, cancelled: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
