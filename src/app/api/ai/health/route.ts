import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveProvider } from "@/lib/ai/providers";

const TABLES = [
  "business_context",
  "lead_intelligence",
  "ai_decisions",
  "funnel_events",
  "ai_tasks",
  "meetings",
] as const;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const provider = getActiveProvider();
    const tables: Record<string, boolean> = {};
    for (const table of TABLES) {
      const { error } = await supabase.from(table).select("id", { head: true, count: "exact" });
      tables[table] = !error;
    }

    const { error: leadsError } = await supabase
      .from("leads")
      .select("funnel_stage, opted_out", { head: true });
    const { error: convError } = await supabase
      .from("conversations")
      .select("lead_id", { head: true });
    const { error: msgError } = await supabase
      .from("messages")
      .select("idempotency_key", { head: true });

    return NextResponse.json({
      ai: {
        provider: provider.id,
        model: provider.model,
        model_version: provider.modelVersion,
        deepseek_api_key_configured: !!process.env.DEEPSEEK_API_KEY,
      },
      database: {
        tables,
        leads_funnel_stage_column: !leadsError,
        conversations_lead_id_column: !convError,
        messages_idempotency_key_column: !msgError,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
