import type { AiDecisionLog } from "../types";

export async function logAiDecision(
  supabase: any,
  decision: AiDecisionLog
): Promise<Record<string, any> | null> {
  const { data, error } = await supabase
    .from("ai_decisions")
    .insert({
      user_id: decision.user_id,
      lead_id: decision.lead_id ?? null,
      conversation_id: decision.conversation_id ?? null,
      task_type: decision.task_type,
      model: decision.model,
      model_version: decision.model_version,
      prompt_version: decision.prompt_version,
      input_context: decision.input_context ?? {},
      output: decision.output ?? {},
      ai_decision: decision.ai_decision,
      rule_result: decision.rule_result ?? {},
      action: decision.action ?? null,
      action_status: decision.action_status ?? null,
      error_code: decision.error_code ?? null,
      error_message: decision.error_message ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error(`[LIB:ai:audit] failed to log decision: ${error.message}`);
    return null;
  }
  return data;
}
