import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bookMeeting, listMeetings } from "@/lib/ai/meeting/engine";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "";
    const meetings = await listMeetings(supabase, user.id, status);
    return NextResponse.json({ meetings });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    if (!body.lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    if (!body.scheduled_at) return NextResponse.json({ error: "scheduled_at required" }, { status: 400 });
    if (!body.duration_minutes) return NextResponse.json({ error: "duration_minutes required" }, { status: 400 });

    const result = await bookMeeting(supabase, {
      userId: user.id,
      leadId: body.lead_id,
      conversationId: body.conversation_id ?? null,
      scheduledAt: body.scheduled_at,
      durationMinutes: Number(body.duration_minutes),
      medium: body.medium ?? "call",
      location: body.location ?? null,
      notes: body.notes ?? null,
      idempotencyKey: typeof body.idempotency_key === "string" ? body.idempotency_key : undefined,
    });

    return NextResponse.json(result, { status: result.allowed ? 201 : 422 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
