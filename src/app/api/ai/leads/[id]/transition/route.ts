import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { transitionLead } from "@/lib/ai/funnel/service";
import { isFunnelStage } from "@/lib/ai/funnel/stages";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    if (!isFunnelStage(body.to_stage)) {
      return NextResponse.json({ error: "Invalid target stage" }, { status: 400 });
    }

    const result = await transitionLead(supabase, {
      leadId: id,
      userId: user.id,
      toStage: body.to_stage,
      intelligence: body.intelligence ?? null,
      meetingIntent: body.meeting_intent ?? null,
      meetingIntentEvidence: body.meeting_intent_evidence ?? null,
      scheduledAt: body.scheduled_at ?? null,
      durationMinutes: body.duration_minutes ?? null,
      qualificationDecision: body.qualification_decision ?? null,
      eventType: body.event_type ?? "STAGE_TRANSITION",
      metadata: body.metadata ?? {},
    });

    return NextResponse.json(result, { status: result.allowed ? 200 : 422 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
