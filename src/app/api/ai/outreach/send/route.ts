import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendOutreach } from "@/lib/ai/outreach/engine";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    if (!body.lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    if (!body.channel) return NextResponse.json({ error: "channel required" }, { status: 400 });
    if (!body.message || typeof body.message !== "string") {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }

    const result = await sendOutreach(supabase, {
      userId: user.id,
      leadId: body.lead_id,
      channel: body.channel,
      message: body.message,
      idempotencyKey: typeof body.idempotency_key === "string" ? body.idempotency_key : undefined,
    });

    return NextResponse.json(result, { status: result.allowed ? 200 : 422 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
