import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processPendingWhatsAppMessages } from "@/lib/ai/whatsapp/engine";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get("dry_run") === "1";
    const limit = Math.min(Number(searchParams.get("limit") ?? "10"), 20);

    const results = await processPendingWhatsAppMessages(
      supabase,
      user.id,
      { sendReply: !dryRun },
      limit
    );

    return NextResponse.json({ processed: results.length, dry_run: dryRun, results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
