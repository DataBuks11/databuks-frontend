import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { executeSocialAction, approveSocialAction } from "@/lib/social/executor";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: actions, error } = await supabase
      .from("social_actions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ actions: actions ?? [] });
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

    if (body.action === "approve" && body.action_id) {
      const result = await approveSocialAction(supabase, user.id, body.action_id);
      return NextResponse.json(result, { status: result.allowed ? 200 : 422 });
    }

    if (!body.provider || !body.action_type) {
      return NextResponse.json({ error: "provider and action_type required" }, { status: 400 });
    }

    const result = await executeSocialAction(supabase, {
      userId: user.id,
      provider: body.provider,
      actionType: body.action_type,
      targetId: body.target_id ?? null,
      content: body.content ?? null,
      aiDecisionId: body.ai_decision_id ?? null,
      idempotencyKey: body.idempotency_key ?? undefined,
      requireApproval: body.require_approval !== false,
    });

    return NextResponse.json(result, { status: result.allowed ? 200 : 422 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
