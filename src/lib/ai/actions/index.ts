import type { AiTaskType, TaskContext } from "../types";
import { transitionLead } from "../funnel/service";
import { upsertLeadIntelligence } from "../intelligence/lead-intelligence";

export interface ActionDeps {
  supabase: any;
  userId: string;
  leadId: string | null;
  conversationId: string | null;
  validated: Record<string, any>;
  context: TaskContext;
  model: string;
  modelVersion: string;
  promptVersion: string;
}

export interface ActionResult {
  action: string;
  actionStatus: string;
  data?: Record<string, any>;
}

async function tryTransition(
  supabase: any,
  input: {
    leadId: string;
    userId: string;
    toStage: any;
    context: TaskContext;
    validated: Record<string, any>;
    eventType?: string;
    meetingIntent?: boolean | null;
    meetingIntentEvidence?: unknown[] | null;
    qualificationDecision?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<Record<string, any> | null> {
  try {
    return await transitionLead(supabase, {
      leadId: input.leadId,
      userId: input.userId,
      toStage: input.toStage,
      intelligence: input.context.intelligence,
      meetingIntent: input.meetingIntent ?? null,
      meetingIntentEvidence: input.meetingIntentEvidence ?? null,
      qualificationDecision: input.qualificationDecision ?? null,
      eventType: input.eventType,
      metadata: input.metadata,
    });
  } catch (error: any) {
    return { allowed: false, ruleId: "TRANSITION_ERROR", reason: error.message };
  }
}

const enrichLeadAction = async (deps: ActionDeps): Promise<ActionResult> => {
  const lead = deps.context.lead;
  const validated = deps.validated;
  if (!lead) return { action: "NONE", actionStatus: "SKIPPED_NO_LEAD" };

  const evidence = Array.isArray(validated.evidence) ? validated.evidence : [];
  const evidenceSignals = evidence.map((item: Record<string, any>) => item?.signal).filter(Boolean);

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  const fieldMap: Record<string, string> = {
    company: "company",
    industry: "industry",
    location: "location",
  };
  for (const [aiField, dbField] of Object.entries(fieldMap)) {
    const value = validated[aiField];
    if (typeof value === "string" && value.trim() !== "" && !lead[dbField]) {
      updates[dbField] = value.trim();
    }
  }

  if (validated.website && typeof validated.website === "string" && validated.website.trim() !== "" && !lead.website) {
    updates.notes = lead.notes ? `${lead.notes}\nWebsite: ${validated.website.trim()}` : `Website: ${validated.website.trim()}`;
  }

  if (Object.keys(updates).length > 1 && evidenceSignals.length > 0) {
    await deps.supabase.from("leads").update(updates).eq("id", lead.id).eq("user_id", deps.userId);
    return {
      action: "LEAD_ENRICHED",
      actionStatus: "APPLIED",
      data: { fields: Object.keys(updates).filter((k) => k !== "updated_at"), evidence: evidenceSignals },
    };
  }
  return { action: "LEAD_ENRICHED", actionStatus: "NO_OP", data: { reason: "no evidence-backed fields to fill" } };
};

const applyQualification = async (deps: ActionDeps): Promise<ActionResult> => {
  const validated = deps.validated;
  if (!deps.leadId) return { action: "NONE", actionStatus: "SKIPPED_NO_LEAD" };

  const intelligenceRow = await upsertLeadIntelligence(deps.supabase, {
    leadId: deps.leadId,
    userId: deps.userId,
    scores: validated.scores,
    confidence: validated.confidence,
    whyNow: validated.why_now ?? null,
    evidence: validated.evidence ?? [],
    recommendedChannel: validated.recommended_channel ?? null,
    recommendedAction: validated.recommended_action ?? null,
    modelName: deps.model,
    modelVersion: deps.modelVersion,
    promptVersion: deps.promptVersion,
  });

  const enrichedTransition = await tryTransition(deps.supabase, {
    leadId: deps.leadId,
    userId: deps.userId,
    toStage: "ENRICHED",
    context: { ...deps.context, intelligence: intelligenceRow ?? deps.context.intelligence },
    validated,
    eventType: "LEAD_ENRICHED",
    qualificationDecision: validated.decision ?? null,
  });

  if (validated.decision === "qualified") {
    const qualifiedTransition = await tryTransition(deps.supabase, {
      leadId: deps.leadId,
      userId: deps.userId,
      toStage: "QUALIFIED",
      context: { ...deps.context, intelligence: intelligenceRow ?? deps.context.intelligence },
      validated,
      eventType: "LEAD_QUALIFIED",
      qualificationDecision: "qualified",
    });

    if (!qualifiedTransition?.allowed) {
      return {
        action: "LEAD_QUALIFICATION",
        actionStatus: "BLOCKED",
        data: { transition: qualifiedTransition },
      };
    }
    return {
      action: "LEAD_QUALIFICATION",
      actionStatus: "QUALIFIED",
      data: { intelligence: intelligenceRow, transitions: [enrichedTransition, qualifiedTransition] },
    };
  }

  if (validated.decision === "disqualified") {
    return {
      action: "LEAD_QUALIFICATION",
      actionStatus: "DISQUALIFIED",
      data: { intelligence: intelligenceRow, transitions: [enrichedTransition] },
    };
  }

  return {
    action: "LEAD_QUALIFICATION",
    actionStatus: "NEEDS_MORE_DATA",
    data: { intelligence: intelligenceRow, transitions: [enrichedTransition] },
  };
};

const applyScores = async (deps: ActionDeps): Promise<ActionResult> => {
  const validated = deps.validated;
  if (!deps.leadId) return { action: "NONE", actionStatus: "SKIPPED_NO_LEAD" };
  const row = await upsertLeadIntelligence(deps.supabase, {
    leadId: deps.leadId,
    userId: deps.userId,
    scores: validated.scores,
    confidence: validated.confidence ?? null,
    whyNow: validated.why_now ?? null,
    evidence: validated.evidence ?? [],
    recommendedChannel: validated.recommended_channel ?? null,
    recommendedAction: validated.recommended_action ?? null,
    modelName: deps.model,
    modelVersion: deps.modelVersion,
    promptVersion: deps.promptVersion,
  });
  return { action: "LEAD_SCORED", actionStatus: "APPLIED", data: { intelligence: row } };
};

const applyIntent = async (deps: ActionDeps): Promise<ActionResult> => {
  if (!deps.leadId) return { action: "NONE", actionStatus: "SKIPPED_NO_LEAD" };
  const row = await upsertLeadIntelligence(deps.supabase, {
    leadId: deps.leadId,
    userId: deps.userId,
    scores: { intent: deps.validated.intent_score },
    confidence: deps.validated.confidence ?? null,
    modelName: deps.model,
    modelVersion: deps.modelVersion,
    promptVersion: deps.promptVersion,
  });
  return { action: "INTENT_ANALYZED", actionStatus: "APPLIED", data: { intelligence: row } };
};

const applyUrgency = async (deps: ActionDeps): Promise<ActionResult> => {
  if (!deps.leadId) return { action: "NONE", actionStatus: "SKIPPED_NO_LEAD" };
  const row = await upsertLeadIntelligence(deps.supabase, {
    leadId: deps.leadId,
    userId: deps.userId,
    scores: { urgency: deps.validated.urgency_score },
    confidence: deps.validated.confidence ?? null,
    modelName: deps.model,
    modelVersion: deps.modelVersion,
    promptVersion: deps.promptVersion,
  });
  return { action: "URGENCY_ANALYZED", actionStatus: "APPLIED", data: { intelligence: row } };
};

const applyBuyingSignal = async (deps: ActionDeps): Promise<ActionResult> => {
  if (!deps.leadId) return { action: "NONE", actionStatus: "SKIPPED_NO_LEAD" };
  const row = await upsertLeadIntelligence(deps.supabase, {
    leadId: deps.leadId,
    userId: deps.userId,
    scores: { buying_signal: deps.validated.buying_signal_score },
    evidence: deps.validated.evidence ?? null,
    confidence: deps.validated.confidence ?? null,
    modelName: deps.model,
    modelVersion: deps.modelVersion,
    promptVersion: deps.promptVersion,
  });
  return { action: "BUYING_SIGNAL_DETECTED", actionStatus: "APPLIED", data: { intelligence: row } };
};

const validateOutreachDraft = async (deps: ActionDeps): Promise<ActionResult> => {
  if (!deps.leadId) return { action: "NONE", actionStatus: "SKIPPED_NO_LEAD" };
  const channel = deps.validated.channel ?? null;
  const body = deps.validated.body ?? null;
  const result = await tryTransition(deps.supabase, {
    leadId: deps.leadId,
    userId: deps.userId,
    toStage: "OUTREACH_READY",
    context: deps.context,
    validated: deps.validated,
    eventType: "OUTREACH_ELIGIBLE",
    metadata: { channel },
  });
  return {
    action: "OUTREACH_DRAFT",
    actionStatus: "VALIDATED",
    data: { channel, body, eligibility: result },
  };
};

const applyMeetingIntent = async (deps: ActionDeps): Promise<ActionResult> => {
  const validated = deps.validated;
  const lead = deps.context.lead;
  if (!lead) return { action: "NONE", actionStatus: "SKIPPED_NO_LEAD" };

  if (validated.meeting_intent !== true) {
    return { action: "MEETING_INTENT_DETECTION", actionStatus: "NOT_DETECTED", data: { meeting_intent: false } };
  }

  if (lead.funnel_stage === "CONTACTED") {
    await tryTransition(deps.supabase, {
      leadId: lead.id,
      userId: deps.userId,
      toStage: "CONVERSATION",
      context: deps.context,
      validated,
      eventType: "CONVERSATION_STARTED",
    });
  }

  const transition = await tryTransition(deps.supabase, {
    leadId: lead.id,
    userId: deps.userId,
    toStage: "MEETING_INTENT",
    context: deps.context,
    validated,
    eventType: "MEETING_INTENT_DETECTED",
    meetingIntent: true,
    meetingIntentEvidence: validated.evidence ?? [],
    metadata: { confidence: validated.confidence ?? null },
  });

  if (!transition?.allowed) {
    return {
      action: "MEETING_INTENT_DETECTION",
      actionStatus: "BLOCKED",
      data: { transition },
    };
  }

  return {
    action: "MEETING_INTENT_DETECTION",
    actionStatus: "DETECTED",
    data: { meeting_intent: true, transition },
  };
};

const logOnly = (action: string) => async (_deps: ActionDeps): Promise<ActionResult> => ({
  action,
  actionStatus: "LOGGED",
});

export type TaskAction = (deps: ActionDeps) => Promise<ActionResult>;

export const TASK_ACTIONS: Partial<Record<AiTaskType, TaskAction>> = {
  ENRICH_LEAD: enrichLeadAction,
  QUALIFY_LEAD: applyQualification,
  SCORE_LEAD: applyScores,
  ANALYZE_INTENT: applyIntent,
  ANALYZE_URGENCY: applyUrgency,
  DETECT_BUYING_SIGNAL: applyBuyingSignal,
  GENERATE_OUTREACH: validateOutreachDraft,
  DETECT_MEETING_INTENT: applyMeetingIntent,
  ANALYZE_REPLY: async (deps) => {
    const result = await logOnly("REPLY_ANALYZED")(deps);
    const validated = deps.validated;
    if (deps.context.lead && deps.context.lead.funnel_stage === "CONTACTED" && validated.reply_required) {
      await tryTransition(deps.supabase, {
        leadId: deps.context.lead.id,
        userId: deps.userId,
        toStage: "CONVERSATION",
        context: deps.context,
        validated,
        eventType: "CONVERSATION_STARTED",
      });
      result.actionStatus = "CONVERSATION_MARKED";
    }
    return result;
  },
  GENERATE_FOLLOWUP: logOnly("FOLLOWUP_GENERATED"),
  SUMMARIZE_CONVERSATION: logOnly("CONVERSATION_SUMMARIZED"),
};
