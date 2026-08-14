import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/orchestrator";

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

    const result = await runAiTask(supabase, {
      userId: user.id,
      taskType: "ANALYZE_REPLY",
      conversationId: id,
      leadId: body.lead_id ?? null,
      payload: { message: body.message ?? null },
      idempotencyKey: typeof body.idempotency_key === "string" ? body.idempotency_key : undefined,
    });

    return NextResponse.json(result, { status: result.status === "COMPLETED" ? 200 : 422 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
