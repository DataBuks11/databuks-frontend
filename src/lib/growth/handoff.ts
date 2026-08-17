import type { SupabaseClient } from "@supabase/supabase-js";

export interface HandoffContext {
  leadId?: string | null;
  opportunityId?: string | null;
  platform: string;
  prospectName: string | null;
  profileUrl: string | null;
  originalRequirement: string | null;
  intent: string | null;
  leadScore: number;
  conversationSummary: string | null;
  requirements: string[];
  objections: string[];
  evidence: Record<string, any>;
  recommendedNextStep: string | null;
}

export async function createHandoffRequest(
  supabase: SupabaseClient,
  userId: string,
  context: HandoffContext
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from("handoff_requests")
    .insert({
      user_id: userId,
      opportunity_id: context.opportunityId ?? null,
      lead_id: context.leadId ?? null,
      platform: context.platform,
      profile_url: context.profileUrl,
      original_requirement: context.originalRequirement,
      intent: context.intent,
      lead_score: context.leadScore,
      conversation_summary: context.conversationSummary,
      requirements: context.requirements,
      objections: context.objections,
      evidence: context.evidence,
      recommended_next_step: context.recommendedNextStep,
      status: "PENDING",
    })
    .select()
    .single();
  if (error || !data) return { error: error?.message ?? "failed to create handoff" };
  return { id: data.id };
}

export async function buildHandoffContextFromOpportunity(
  supabase: SupabaseClient,
  userId: string,
  opportunityId: string
): Promise<HandoffContext | null> {
  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("*")
    .eq("id", opportunityId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!opportunity) return null;

  return {
    leadId: opportunity.lead_id ?? null,
    opportunityId: opportunity.id,
    platform: opportunity.channel,
    prospectName: opportunity.actor_name ?? opportunity.actor_handle ?? null,
    profileUrl: opportunity.source_url ?? null,
    originalRequirement: opportunity.detected_requirement ?? null,
    intent: opportunity.recommended_next_action ?? null,
    leadScore: opportunity.lead_score ?? 0,
    conversationSummary: opportunity.conversation_summary ?? opportunity.content?.slice(0, 800) ?? null,
    requirements: Array.isArray(opportunity.requirements) ? opportunity.requirements : [],
    objections: Array.isArray(opportunity.objections) ? opportunity.objections : [],
    evidence: opportunity.evidence ?? {},
    recommendedNextStep: opportunity.recommended_next_action ?? null,
  };
}
