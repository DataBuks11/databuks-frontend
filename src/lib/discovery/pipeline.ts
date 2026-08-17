/**
 * Discovery Pipeline
 * Main entry point for processing discovered signals into qualified leads.
 * Pipeline: Normalize → Dedupe → Business Context → AI Relevance Analysis → Score → Create/Link Lead → Evidence
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoveredLeadInput, DiscoveryAnalysisResult, DiscoveryPipelineResult, LeadEvidence } from "./types";
import { MIN_LEAD_SCORE_THRESHOLD } from "./types";
import { checkDuplicate, findExistingLead, generateDiscoveryIdempotencyKey } from "./deduplication";
import { computeDiscoveryLeadScore, isEvidenceSufficient, stageFromAnalysis } from "./scoring";
import { isAuthorInCooldown } from "./cooldown";
import { buildBusinessContext } from "../ai/context/business-context";
import { runAiTask } from "../ai/orchestrator";
import { idempotencyKey } from "../ai/utils/idempotency";

/**
 * Process a single discovered signal through the full pipeline.
 */
export async function processDiscoveredSignal(
  supabase: SupabaseClient,
  userId: string,
  input: DiscoveredLeadInput
): Promise<DiscoveryPipelineResult> {
  // 1. Generate idempotency key
  const key = input.idempotency_key ?? generateDiscoveryIdempotencyKey(userId, input);
  const inputWithKey = { ...input, idempotency_key: key };

  // 2. Check cooldown
  if (input.external_author_id) {
    const inCooldown = await isAuthorInCooldown(
      supabase,
      userId,
      input.source_platform,
      input.external_author_id
    );
    if (inCooldown) {
      return {
        status: "IGNORED",
        discovered_lead_id: null,
        lead_id: null,
        opportunity_id: null,
        analysis: null,
        duplicate_of: null,
        reason: "author_in_cooldown",
      };
    }
  }

  // 3. Deduplicate
  const dedup = await checkDuplicate(supabase, userId, inputWithKey);
  if (dedup.isDuplicate) {
    return {
      status: "DUPLICATE",
      discovered_lead_id: dedup.existingDiscoveredLeadId,
      lead_id: dedup.existingLeadId,
      opportunity_id: null,
      analysis: null,
      duplicate_of: dedup.existingDiscoveredLeadId,
      reason: dedup.reason ?? "duplicate",
    };
  }

  // 4. Skip empty content
  const content = (input.source_content ?? "").trim();
  if (content.length === 0) {
    return {
      status: "IGNORED",
      discovered_lead_id: null,
      lead_id: null,
      opportunity_id: null,
      analysis: null,
      duplicate_of: null,
      reason: "empty_content",
    };
  }

  // 5. Build business context
  let business;
  try {
    business = await buildBusinessContext(supabase, userId);
  } catch {
    return {
      status: "FAILED",
      discovered_lead_id: null,
      lead_id: null,
      opportunity_id: null,
      analysis: null,
      duplicate_of: null,
      reason: "business_context_unavailable",
    };
  }

  // 6. Run AI relevance analysis
  const aiContext = {
    business,
    lead: null,
    intelligence: null,
    conversation: null,
    messages: [],
    conversationSummary: null,
    duplicateExists: false,
    lastOutreachAt: null,
    outreachCountInWindow: 0,
    discovery: {
      content,
      platform: input.source_platform,
      author_name: input.author_name ?? null,
      parent_content: input.parent_content ?? null,
      content_type: input.source_content_type ?? null,
    },
  } as any;

  const aiResult = await runAiTask(supabase, {
    userId,
    taskType: "ANALYZE_DISCOVERY",
    payload: { source_platform: input.source_platform },
    idempotencyKey: idempotencyKey("discovery:analyze", userId, key),
    prebuiltContext: aiContext,
  });

  if (aiResult.status !== "COMPLETED" || !aiResult.output) {
    return {
      status: "FAILED",
      discovered_lead_id: null,
      lead_id: null,
      opportunity_id: null,
      analysis: null,
      duplicate_of: null,
      reason: `ai_analysis_failed: ${aiResult.error ?? "unknown"}`,
    };
  }

  // 7. Compute scores
  const output = aiResult.output as Record<string, any>;
  const leadScore = computeDiscoveryLeadScore(output);
  const analysis: DiscoveryAnalysisResult = {
    relevance_score: output.relevance_score ?? 0,
    intent_score: output.intent_score ?? 0,
    urgency_score: output.urgency_score ?? 0,
    lead_score: leadScore,
    confidence: output.confidence ?? 0,
    detected_requirement: output.detected_requirement ?? null,
    business_context_match: output.business_context_match ?? null,
    evidence: {
      source: input.source_platform,
      content_url: input.source_url,
      content_summary: content.slice(0, 500),
      detected_requirement: output.detected_requirement ?? null,
      intent_score: output.intent_score ?? 0,
      relevance_score: output.relevance_score ?? 0,
      lead_score: leadScore,
      urgency_score: output.urgency_score ?? 0,
      confidence: output.confidence ?? 0,
      reason: output.reason ?? "",
      signals: Array.isArray(output.signals) ? output.signals : [],
      quotes: (Array.isArray(output.evidence) ? output.evidence : [])
        .map((e: any) => e.quote ?? e.detail ?? "")
        .filter(Boolean),
    },
    should_engage: output.should_engage === true,
    recommended_next_action: output.recommended_next_action ?? "IGNORE",
    reason: output.reason ?? "",
    signals: Array.isArray(output.signals) ? output.signals : [],
  };

  // 8. Determine stage
  const stage = stageFromAnalysis(analysis);

  // 9. Create discovered_lead record
  const { data: created, error: insertError } = await supabase
    .from("discovered_leads")
    .insert({
      user_id: userId,
      source_platform: input.source_platform,
      source_url: input.source_url,
      source_content: content.slice(0, 5000),
      source_content_type: input.source_content_type,
      external_author_id: input.external_author_id,
      author_name: input.author_name,
      author_handle: input.author_handle,
      author_profile_url: input.author_profile_url,
      detected_requirement: analysis.detected_requirement,
      business_context_match: analysis.business_context_match,
      relevance_score: analysis.relevance_score,
      intent_score: analysis.intent_score,
      lead_score: leadScore,
      urgency_score: analysis.urgency_score,
      confidence: analysis.confidence,
      evidence: analysis.evidence,
      recommended_next_action: analysis.recommended_next_action,
      conversation_stage: stage,
      idempotency_key: key,
    })
    .select()
    .single();

  if (insertError || !created) {
    // Could be a race condition duplicate
    if (insertError?.code === "23505") {
      return {
        status: "DUPLICATE",
        discovered_lead_id: null,
        lead_id: null,
        opportunity_id: null,
        analysis,
        duplicate_of: null,
        reason: "idempotency_conflict",
      };
    }
    return {
      status: "FAILED",
      discovered_lead_id: null,
      lead_id: null,
      opportunity_id: null,
      analysis,
      duplicate_of: null,
      reason: `db_insert_failed: ${insertError?.message ?? "unknown"}`,
    };
  }

  const discoveredLeadId = created.id;

  // 10. If evidence is sufficient, try to link or create a lead
  let leadId: string | null = null;
  let opportunityId: string | null = null;

  if (isEvidenceSufficient(analysis) && leadScore >= MIN_LEAD_SCORE_THRESHOLD) {
    // Try to find existing lead
    leadId = await findExistingLead(supabase, userId, input);

    if (!leadId) {
      // Create a new lead
      const name = input.author_name ?? input.author_handle ?? `${input.source_platform} prospect`;
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .insert({
          user_id: userId,
          name,
          phone: null,
          email: null,
          company: null,
          industry: null,
          lead_score: leadScore,
          status: "new",
          funnel_stage: "DISCOVERED",
          opted_out: false,
          source_platform: input.source_platform,
          notes: `Discovered via ${input.source_platform}. Requirement: ${analysis.detected_requirement ?? "unclear"}. Reason: ${analysis.reason}`,
        })
        .select()
        .single();
      if (!leadError && lead) {
        leadId = lead.id;
      }
    }

    // Link discovered lead to the lead
    if (leadId) {
      await supabase
        .from("discovered_leads")
        .update({ lead_id: leadId, updated_at: new Date().toISOString() })
        .eq("id", discoveredLeadId);

      // Create a lead signal for evidence tracking
      await supabase.from("social_lead_signals").insert({
        user_id: userId,
        lead_id: leadId,
        provider: input.source_platform,
        event_id: null,
        signal_type: output.intent ?? "discovery",
        intent_score: analysis.intent_score,
        lead_score: leadScore,
        sentiment: "neutral",
        evidence: { content: content.slice(0, 500), reason: analysis.reason },
      });
    }
  }

  return {
    status: stage === "IGNORED" ? "IGNORED" : "CREATED",
    discovered_lead_id: discoveredLeadId,
    lead_id: leadId,
    opportunity_id: opportunityId,
    analysis,
    duplicate_of: null,
    reason: analysis.reason,
  };
}
