import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [decisions, actions, signals] = await Promise.all([
      supabase
        .from("ai_decisions")
        .select("task_type, ai_decision, action_status, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("social_actions")
        .select("action_type, status, error_code, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("social_lead_signals")
        .select("signal_type, lead_score, sentiment, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const feed = [
      ...((decisions.data ?? []).map((d: any) => ({
        type: "ai_decision",
        message: d.ai_decision ?? d.task_type,
        status: d.action_status,
        at: d.created_at,
      }))),
      ...((actions.data ?? []).map((a: any) => ({
        type: "social_action",
        message: `${a.action_type} ${a.status.toLowerCase()}`,
        status: a.status,
        at: a.created_at,
        error: a.error_code ?? null,
      }))),
      ...((signals.data ?? []).map((s: any) => ({
        type: "lead_signal",
        message: `${s.signal_type} (lead score ${s.lead_score})`,
        status: "DETECTED",
        at: s.created_at,
      }))),
    ].sort((a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 40);

    return NextResponse.json({ feed });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
