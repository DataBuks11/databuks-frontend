import type { SupabaseClient } from "@supabase/supabase-js";
import { runAiTask } from "../ai/orchestrator";
import { buildBusinessContext } from "../ai/context/business-context";
import { idempotencyKey } from "../ai/utils/idempotency";
import type { OpportunityInput, OpportunityStatus } from "./types";

export interface ProcessedOpportunity {
  status: "ANALYZED" | "DUPLICATE" | "FAILED";
  opportunityId?: string;
  leadId?: string | null;
  analysis?: Record<string, any> | null;
}

export function combineLeadScore(analysis: Record<string, any>): number {
  const relevance = typeof analysis.relevance_score === "number" ? analysis.relevance_score : 0;
  const intent = typeof analysis.intent_score === "number" ? analysis.intent_score : 0;
  const urgency = typeof analysis.urgency_score === "number" ? analysis.urgency_score : 0;
  const weighted = relevance * 0.35 + intent * 0.35 + urgency * 0.3;
  return Math.min(100, Math.max(0, Math.round(weighted)));
}

export function opportunityStatusFromAnalysis(analysis: Record<string, any>): OpportunityStatus {
  if (analysis.should_engage !== true) return "IGNORED";
  if (analysis.recommended_next_action === "BOOK_MEETING") return "MEETING_INTENT";
  if (analysis.recommended_next_action === "HANDOFF_WHATSAPP") return "HANDOFF_READY";
  if (analysis.lead_score >= 70) return "QUALIFIED";
  if (analysis.lead_score >= 50) return "NURTURING";
  return "NEW";
}

export async function processOpportunity(
  supabase: SupabaseClient,
  userId: string,
  opportunity: OpportunityInput
): Promise<ProcessedOpportunity> {
  const key =
    opportunity.idempotencyKey ??
    idempotencyKey(
      "opportunity",
      userId,
      opportunity.channel,
      opportunity.external_event_id ?? (opportunity.content ?? "").slice(0, 80)
    );

  const { data: existing } = await supabase
    .from("opportunities")
    .select("id, status, lead_id")
    .eq("user_id", userId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing) {
    return { status: "DUPLICATE", opportunityId: existing.id, leadId: existing.lead_id ?? null };
  }

  const { data: created, error: insertError } = await supabase
    .from("opportunities")
    .insert({
      user_id: userId,
      source: opportunity.source,
      channel: opportunity.channel,
      event_type: opportunity.event_type,
      external_event_id: opportunity.external_event_id ?? null,
      actor_id: opportunity.actor_id ?? null,
      actor_name: opportunity.actor_name ?? null,
      actor_handle: opportunity.actor_handle ?? null,
      content: opportunity.content ?? null,
      source_url: opportunity.source_url ?? null,
      parent_content: opportunity.parent_content ?? null,
      timestamp: opportunity.timestamp ?? null,
      metadata: opportunity.metadata ?? {},
      idempotency_key: key,
      status: "ANALYZING",
    })
    .select()
    .single();

  if (insertError || !created) {
    return { status: "FAILED" };
  }
  const opportunityId = created.id;
  const content = typeof opportunity.content === "string" ? opportunity.content : "";

  if (content.trim().length === 0) {
    await supabase.from("opportunities").update({ status: "IGNORED", updated_at: new Date().toISOString() }).eq("id", opportunityId);
    return { status: "ANALYZED", opportunityId, leadId: null, analysis: { should_engage: false } };
  }

  try {
    const business = await buildBusinessContext(supabase, userId);
    const context = {
      business,
      lead: null,
      intelligence: null,
      conversation: null,
      messages: [],
      conversationSummary: null,
      duplicateExists: false,
      lastOutreachAt: null,
      outreachCountInWindow: 0,
      opportunity: {
        content,
        channel: opportunity.channel,
        actor_name: opportunity.actor_name ?? null,
        parent_content: opportunity.parent_content ?? null,
      },
    } as any;

    const result = await runAiTask(supabase, {
      userId,
      taskType: "ANALYZE_OPPORTUNITY",
      payload: { opportunity_id: opportunityId },
      idempotencyKey: idempotencyKey("opportunity:analyze", userId, opportunityId),
      prebuiltContext: context,
    });

    if (result.status !== "COMPLETED" || !result.output) {
      await supabase.from("opportunities").update({ status: "NEW", updated_at: new Date().toISOString() }).eq("id", opportunityId);
      return { status: "FAILED", opportunityId };
    }

    const analysis = result.output as Record<string, any>;
    const finalLeadScore = combineLeadScore(analysis);
    const status = opportunityStatusFromAnalysis(analysis);

    const updates: Record<string, any> = {
      relevance_score: analysis.relevance_score ?? 0,
      intent_score: analysis.intent_score ?? 0,
      urgency_score: analysis.urgency_score ?? 0,
      lead_score: finalLeadScore,
      confidence: analysis.confidence ?? 0,
      detected_requirement: analysis.detected_requirement ?? null,
      evidence: { quotes: analysis.evidence ?? [], reason: analysis.reason ?? null },
      recommended_next_action: analysis.recommended_next_action ?? null,
      status,
      updated_at: new Date().toISOString(),
    };

    let leadId: string | null = null;

    if (status !== "IGNORED" && finalLeadScore >= 50) {
      const phone = null;
      const email = null;
      const name = opportunity.actor_name ?? opportunity.actor_handle ?? `${opportunity.channel} prospect`;

      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .insert({
          user_id: userId,
          name,
          phone,
          email,
          company: null,
          industry: null,
          lead_score: finalLeadScore,
          status: "new",
          funnel_stage: "DISCOVERED",
          opted_out: false,
          notes: `Discovered via ${opportunity.channel}. Requirement: ${analysis.detected_requirement ?? "unclear"}`,
        })
        .select()
        .single();
      if (!leadError && lead) {
        leadId = lead.id;
        updates.lead_id = lead.id;
        await supabase.from("social_lead_signals").insert({
          user_id: userId,
          lead_id: lead.id,
          provider: opportunity.channel.toLowerCase(),
          event_id: opportunity.external_event_id ?? null,
          signal_type: analysis.intent ?? "unknown",
          intent_score: analysis.intent_score ?? 0,
          lead_score: finalLeadScore,
          sentiment: "neutral",
          evidence: { content: content.slice(0, 500), reason: analysis.reason ?? null },
        });
      }
    }

    await supabase.from("opportunities").update(updates).eq("id", opportunityId);
    return { status: "ANALYZED", opportunityId, leadId, analysis };
  } catch (error: any) {
    await supabase.from("opportunities").update({ status: "NEW", updated_at: new Date().toISOString() }).eq("id", opportunityId);
    return { status: "FAILED", opportunityId };
  }
}
