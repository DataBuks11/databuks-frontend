import { computeOverallScore, fromDbScores, toDbScores } from "./scoring";

export interface IntelligenceUpsert {
  leadId: string;
  userId: string;
  scores?: Record<string, any> | null;
  confidence?: number | null;
  whyNow?: string | null;
  evidence?: unknown[] | null;
  recommendedChannel?: string | null;
  recommendedAction?: string | null;
  modelName?: string | null;
  modelVersion?: string | null;
  promptVersion?: string | null;
}

export async function upsertLeadIntelligence(
  supabase: any,
  input: IntelligenceUpsert
): Promise<Record<string, any> | null> {
  const { data: existing } = await supabase
    .from("lead_intelligence")
    .select("*")
    .eq("lead_id", input.leadId)
    .eq("user_id", input.userId)
    .maybeSingle();

  const updates: Record<string, any> = {
    user_id: input.userId,
    lead_id: input.leadId,
    updated_at: new Date().toISOString(),
  };

  if (input.scores) {
    const existingScores = fromDbScores(existing ?? null) ?? {
      icp_fit: 0,
      intent: 0,
      urgency: 0,
      buying_signal: 0,
      problem_severity: 0,
      timing: 0,
      reachability: 0,
      evidence_quality: 0,
    };
    const mergedScores = { ...existingScores, ...(input.scores as any) };
    Object.assign(updates, toDbScores(mergedScores as any));
    updates.overall_score = computeOverallScore(mergedScores as any);
  }
  if (input.confidence !== undefined && input.confidence !== null) updates.confidence = input.confidence;
  if (input.whyNow !== undefined && input.whyNow !== null) updates.why_now = input.whyNow;
  if (input.evidence) updates.evidence = input.evidence;
  if (input.recommendedChannel !== undefined) updates.recommended_channel = input.recommendedChannel;
  if (input.recommendedAction !== undefined) updates.recommended_action = input.recommendedAction;
  if (input.modelName) updates.model_name = input.modelName;
  if (input.modelVersion) updates.model_version = input.modelVersion;
  if (input.promptVersion) updates.prompt_version = input.promptVersion;

  if (existing) {
    const { data, error } = await supabase
      .from("lead_intelligence")
      .update(updates)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(`Failed to update lead intelligence: ${error.message}`);
    return data;
  }

  const { data, error } = await supabase
    .from("lead_intelligence")
    .insert({ ...updates, created_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(`Failed to insert lead intelligence: ${error.message}`);
  return data;
}

export async function getLeadIntelligence(
  supabase: any,
  userId: string,
  leadId: string
): Promise<Record<string, any> | null> {
  const { data, error } = await supabase
    .from("lead_intelligence")
    .select("*")
    .eq("lead_id", leadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    throw new Error(`Failed to read lead intelligence: ${error.message}`);
  }
  return data ?? null;
}
