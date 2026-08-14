import type { RuleResult, TransitionDecision } from "../types";
import { evaluateRules, type ActionType, type RuleContext } from "../rules";
import { normalizeFunnelStage, STAGE_TO_LEGACY_STATUS, type FunnelStage } from "./stages";
import { canTransition, STAGE_GUARDS } from "./transitions";

export interface TransitionLeadInput {
  leadId: string;
  userId: string;
  toStage: FunnelStage;
  intelligence?: Record<string, any> | null;
  meetingIntent?: boolean | null;
  meetingIntentEvidence?: unknown[] | null;
  scheduledAt?: string | null;
  durationMinutes?: number | null;
  qualificationDecision?: string | null;
  eventType?: string;
  metadata?: Record<string, unknown>;
  actionType?: ActionType;
}

export interface TransitionLeadResult {
  allowed: boolean;
  ruleId?: string;
  reason: string;
  fromStage: FunnelStage | null;
  toStage: FunnelStage;
  alreadyInStage?: boolean;
  ruleResult?: RuleResult;
}

export async function recordFunnelEvent(
  supabase: any,
  input: {
    userId: string;
    leadId: string;
    eventType: string;
    fromStage?: string | null;
    toStage?: string | null;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string | null;
  }
): Promise<Record<string, any> | null> {
  const { data, error } = await supabase
    .from("funnel_events")
    .insert({
      user_id: input.userId,
      lead_id: input.leadId,
      event_type: input.eventType,
      from_stage: input.fromStage ?? null,
      to_stage: input.toStage ?? null,
      metadata: input.metadata ?? {},
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select()
    .single();
  if (error) {
    console.error(`[LIB:ai:funnel] failed to record event: ${error.message}`);
    return null;
  }
  return data;
}

function buildGuardContext(input: TransitionLeadInput, lead: Record<string, any>): RuleContext {
  const recommendedChannel =
    typeof input.intelligence?.recommended_channel === "string" && input.intelligence.recommended_channel
      ? input.intelligence.recommended_channel
      : null;
  const fallbackChannel = recommendedChannel ??
    (typeof lead.email === "string" && lead.email.trim() !== "" ? "email" : null) ??
    (typeof lead.phone === "string" && lead.phone.trim() !== "" ? "whatsapp" : null);

  return {
    lead,
    intelligence: input.intelligence ?? null,
    meetingIntent: input.meetingIntent ?? null,
    meetingIntentEvidence: input.meetingIntentEvidence ?? null,
    scheduledAt: input.scheduledAt ?? null,
    durationMinutes: input.durationMinutes ?? null,
    qualificationDecision: input.qualificationDecision ?? null,
    channel: fallbackChannel,
    actionType: input.actionType,
  };
}

export async function transitionLead(
  supabase: any,
  input: TransitionLeadInput
): Promise<TransitionLeadResult> {
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", input.leadId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (leadError || !lead) {
    throw new Error(`Lead not found: ${leadError?.message ?? input.leadId}`);
  }

  const fromStage = normalizeFunnelStage(lead.funnel_stage ?? lead.status);
  const toStage = input.toStage;

  const structural = canTransition(fromStage, toStage);
  if (!structural.allowed) {
    await recordFunnelEvent(supabase, {
      userId: input.userId,
      leadId: input.leadId,
      eventType: "TRANSITION_BLOCKED",
      fromStage,
      toStage,
      metadata: {
        ruleId: structural.ruleId,
        reason: structural.reason,
        ...(input.metadata ?? {}),
      },
    });
    return { allowed: false, ruleId: structural.ruleId, reason: structural.reason, fromStage, toStage };
  }

  if (fromStage === toStage) {
    return { allowed: true, reason: "already in target stage", fromStage, toStage, alreadyInStage: true };
  }

  const guardRules = STAGE_GUARDS[toStage] ?? [];
  const guardContext = buildGuardContext(input, lead);
  const ruleResult = evaluateRules(guardRules, guardContext);

  if (!ruleResult.allowed) {
    await recordFunnelEvent(supabase, {
      userId: input.userId,
      leadId: input.leadId,
      eventType: "TRANSITION_BLOCKED",
      fromStage,
      toStage,
      metadata: {
        ruleId: ruleResult.ruleId,
        reason: ruleResult.reason,
        checks: ruleResult.checks,
        ...(input.metadata ?? {}),
      },
    });
    return {
      allowed: false,
      ruleId: ruleResult.ruleId,
      reason: ruleResult.reason,
      fromStage,
      toStage,
      ruleResult,
    };
  }

  const legacyStatus = STAGE_TO_LEGACY_STATUS[toStage];
  const updates: Record<string, any> = {
    funnel_stage: toStage,
    updated_at: new Date().toISOString(),
  };
  if (legacyStatus) updates.status = legacyStatus;

  const { error: updateError } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", input.leadId)
    .eq("user_id", input.userId);

  if (updateError) {
    throw new Error(`Failed to update lead stage: ${updateError.message}`);
  }

  await recordFunnelEvent(supabase, {
    userId: input.userId,
    leadId: input.leadId,
    eventType: input.eventType ?? "STAGE_TRANSITION",
    fromStage,
    toStage,
    metadata: {
      checks: ruleResult.checks,
      ...(input.metadata ?? {}),
    },
  });

  return {
    allowed: true,
    reason: "transition executed",
    fromStage,
    toStage,
    ruleResult,
  };
}

export type { TransitionDecision };
