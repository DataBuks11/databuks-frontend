import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateMeetingStatus } from "@/lib/ai/meeting/engine";

const ALLOWED_STATUSES = ["suggested", "scheduled", "confirmed", "held", "cancelled", "no_show"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    if (!ALLOWED_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid meeting status" }, { status: 400 });
    }

    const meeting = await updateMeetingStatus(supabase, {
      userId: user.id,
      meetingId: id,
      status: body.status,
    });

    return NextResponse.json(meeting);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
