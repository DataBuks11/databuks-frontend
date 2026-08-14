import type {
  AiDecisionLog,
  AiTaskInput,
  AiTaskResult,
  RuleResult,
  TaskContext,
} from "../types";
import { getActiveProvider } from "../providers";
import { buildTaskContext } from "../context";
import { evaluateRules, type ActionType, type RuleContext } from "../rules";
import { PROMPT_VERSIONS } from "../prompts";
import { validateAiOutput } from "../schemas";
import { TASK_DEFINITIONS } from "../tasks/definitions";
import {
  blockAiTask,
  completeAiTask,
  createAiTask,
  failAiTask,
  isTerminalStatus,
  startAiTask,
} from "../tasks";
import { logAiDecision } from "../audit/log";

function buildRuleContext(
  input: AiTaskInput,
  context: TaskContext,
  validated: Record<string, any>
): RuleContext {
  const channel =
    (typeof validated.channel === "string" && validated.channel) ||
    (typeof input.payload?.channel === "string" && input.payload.channel) ||
    null;

  const message =
    (typeof validated.body === "string" && validated.body) ||
    (typeof validated.suggested_reply === "string" && validated.suggested_reply) ||
    (typeof input.payload?.message === "string" && input.payload.message) ||
    null;

  const actionType: ActionType | undefined =
    input.taskType === "GENERATE_OUTREACH" || input.taskType === "GENERATE_FOLLOWUP"
      ? "outreach"
      : undefined;

  let intelligence = context.intelligence;
  if (validated.scores && typeof validated.scores === "object") {
    const existing = context.intelligence ?? {};
    intelligence = {
      ...existing,
      icp_fit_score: validated.scores.icp_fit ?? existing.icp_fit_score,
      intent_score: validated.scores.intent ?? existing.intent_score,
      urgency_score: validated.scores.urgency ?? existing.urgency_score,
      buying_signal_score: validated.scores.buying_signal ?? existing.buying_signal_score,
      problem_severity_score: validated.scores.problem_severity ?? existing.problem_severity_score,
      timing_score: validated.scores.timing ?? existing.timing_score,
      reachability_score: validated.scores.reachability ?? existing.reachability_score,
      evidence_quality_score: validated.scores.evidence_quality ?? existing.evidence_quality_score,
      confidence: typeof validated.confidence === "number" ? validated.confidence : existing.confidence,
      why_now: typeof validated.why_now === "string" ? validated.why_now : existing.why_now,
      evidence: Array.isArray(validated.evidence) ? validated.evidence : existing.evidence ?? [],
    };
  }

  return {
    lead: context.lead,
    intelligence,
    businessContext: {
      ...context.business,
      allowed_claims: (context.business.constraints as Record<string, unknown>)?.allowed_claims,
    },
    duplicateExists: context.duplicateExists,
    lastOutreachAt: context.lastOutreachAt,
    channel: channel as string | null,
    message,
    meetingIntent: validated.meeting_intent === true,
    meetingIntentEvidence:
      (Array.isArray(validated.meeting_intent_evidence) && validated.meeting_intent_evidence) ||
      (Array.isArray(validated.evidence) && validated.evidence) ||
      null,
    scheduledAt:
      (typeof input.payload?.scheduled_at === "string" && input.payload.scheduled_at) || null,
    durationMinutes:
      typeof input.payload?.duration_minutes === "number"
        ? input.payload.duration_minutes
        : typeof validated.duration_minutes === "number"
          ? validated.duration_minutes
          : null,
    outreachCountInWindow: context.outreachCountInWindow,
    qualificationDecision: validated.decision ?? null,
    actionType,
  };
}

function compactContext(context: TaskContext): Record<string, unknown> {
  return {
    business: {
      business_name: context.business.business_name,
      industries: context.business.industries,
      preferred_channels: context.business.preferred_channels,
      monthly_meeting_target: context.business.monthly_meeting_target,
      available: context.business.available,
    },
    lead: context.lead
      ? {
          id: context.lead.id,
          name: context.lead.name,
          company: context.lead.company,
          industry: context.lead.industry,
          funnel_stage: context.lead.funnel_stage,
          opted_out: context.lead.opted_out,
        }
      : null,
    intelligence: context.intelligence
      ? {
          overall_score: context.intelligence.overall_score,
          intent_score: context.intelligence.intent_score,
          confidence: context.intelligence.confidence,
        }
      : null,
    conversation: context.conversation ? { id: context.conversation.id, platform: context.conversation.platform } : null,
    messageCount: context.messages.length,
    duplicateExists: context.duplicateExists,
    outreachCountInWindow: context.outreachCountInWindow,
  };
}

async function logDecision(
  supabase: any,
  input: AiTaskInput,
  deps: {
    model: string;
    modelVersion: string;
    promptVersion: string;
    aiDecision: string;
    ruleResult: RuleResult;
    output?: Record<string, any> | null;
    context: TaskContext;
    action?: string | null;
    actionStatus?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }
): Promise<void> {
  const entry: AiDecisionLog = {
    user_id: input.userId,
    lead_id: input.leadId ?? null,
    conversation_id: input.conversationId ?? null,
    task_type: input.taskType,
    model: deps.model,
    model_version: deps.modelVersion,
    prompt_version: deps.promptVersion,
    input_context: compactContext(deps.context),
    output: deps.output ?? {},
    ai_decision: deps.aiDecision,
    rule_result: deps.ruleResult,
    action: deps.action ?? null,
    action_status: deps.actionStatus ?? null,
    error_code: deps.errorCode ?? null,
    error_message: deps.errorMessage ?? null,
  };
  await logAiDecision(supabase, entry);
}

export async function runAiTask(supabase: any, input: AiTaskInput): Promise<AiTaskResult> {
  const definition = TASK_DEFINITIONS[input.taskType];
  if (!definition) {
    throw new Error(`Unknown AI task type: ${input.taskType}`);
  }

  const provider = getActiveProvider();
  const promptVersion = PROMPT_VERSIONS[input.taskType];

  const { task, replayed } = await createAiTask(supabase, {
    userId: input.userId,
    taskType: input.taskType,
    leadId: input.leadId ?? null,
    conversationId: input.conversationId ?? null,
    payload: input.payload ?? {},
    idempotencyKey: input.idempotencyKey,
    model: provider.model,
  });

  if (replayed && isTerminalStatus(task.status)) {
    return {
      taskId: task.id,
      status: task.status,
      output: task.output ?? null,
      decision: {
        allowed: task.status === "COMPLETED",
        reason: "replayed idempotent task",
      },
      error: task.error_message ?? null,
    };
  }

  await startAiTask(supabase, task.id, (task.attempts ?? 0) + 1);

  let context: TaskContext | null = null;
  try {
    context = await buildTaskContext(supabase, input);
  } catch (error: any) {
    await failAiTask(supabase, task.id, `Context build failed: ${error.message}`);
    return {
      taskId: task.id,
      status: "FAILED",
      output: null,
      decision: { allowed: false, reason: "context build failed" },
      error: error.message,
    };
  }

  try {
    const prompt = definition.buildPrompt(context);
    const raw = await provider.completeJson(prompt);

    const validation = validateAiOutput(definition.schema, raw);
    if (!validation.success) {
      const reason = `AI schema validation failed: ${validation.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`;
      await blockAiTask(supabase, task.id, reason);
      await logDecision(supabase, input, {
        model: provider.model,
        modelVersion: provider.modelVersion,
        promptVersion,
        aiDecision: "schema_invalid",
        ruleResult: { allowed: false, ruleId: "AI_SCHEMA", reason, checks: [] },
        output: raw,
        context,
        errorCode: "AI_SCHEMA_INVALID",
        errorMessage: reason,
      });
      return {
        taskId: task.id,
        status: "BLOCKED",
        output: raw,
        decision: { allowed: false, ruleId: "AI_SCHEMA", reason },
        error: reason,
      };
    }

    const validated = validation.data as Record<string, any>;
    const ruleIds =
      typeof definition.rules === "function"
        ? definition.rules({ input, context, validated })
        : definition.rules;
    const ruleContext = buildRuleContext(input, context, validated);
    const ruleResult = evaluateRules(ruleIds, ruleContext);
    const aiDecision = definition.decisionOf(validated);

    if (!ruleResult.allowed) {
      await blockAiTask(supabase, task.id, ruleResult.reason);
      await logDecision(supabase, input, {
        model: provider.model,
        modelVersion: provider.modelVersion,
        promptVersion,
        aiDecision,
        ruleResult,
        output: validated,
        context,
        actionStatus: "BLOCKED",
        errorCode: ruleResult.ruleId ?? null,
        errorMessage: ruleResult.reason,
      });
      return {
        taskId: task.id,
        status: "BLOCKED",
        output: validated,
        decision: {
          allowed: false,
          ruleId: ruleResult.ruleId,
          reason: ruleResult.reason,
        },
        error: ruleResult.reason,
      };
    }

    let actionResult: { action: string; actionStatus: string; data?: Record<string, any> } | null = null;
    if (definition.action) {
      actionResult = await definition.action({
        supabase,
        userId: input.userId,
        leadId: input.leadId ?? null,
        conversationId: input.conversationId ?? null,
        validated,
        context,
        model: provider.model,
        modelVersion: provider.modelVersion,
        promptVersion,
      });
    }

    await completeAiTask(supabase, task.id, validated);
    await logDecision(supabase, input, {
      model: provider.model,
      modelVersion: provider.modelVersion,
      promptVersion,
      aiDecision,
      ruleResult,
      output: validated,
      context,
      action: actionResult?.action ?? null,
      actionStatus: actionResult?.actionStatus ?? "EVALUATED",
    });

    return {
      taskId: task.id,
      status: "COMPLETED",
      output: validated,
      decision: {
        allowed: true,
        reason: "rules passed",
        action: actionResult?.action ?? null,
        actionStatus: actionResult?.actionStatus ?? "EVALUATED",
      },
      error: null,
    };
  } catch (error: any) {
    const reason = error?.message ?? "unknown AI error";
    await failAiTask(supabase, task.id, reason);
    await logDecision(supabase, input, {
      model: provider.model,
      modelVersion: provider.modelVersion,
      promptVersion,
      aiDecision: "ai_failed",
      ruleResult: { allowed: false, ruleId: "AI_PROVIDER", reason, checks: [] },
      context: context as TaskContext,
      errorCode: "AI_PROVIDER_ERROR",
      errorMessage: reason,
    });
    return {
      taskId: task.id,
      status: "FAILED",
      output: null,
      decision: { allowed: false, ruleId: "AI_PROVIDER", reason },
      error: reason,
    };
  }
}
