import type { AiTaskInput, AiTaskType, TaskContext } from "../types";
import type { TaskAction } from "../actions";
import { TASK_ACTIONS } from "../actions";
import {
  buildPrompt,
  buildDiscoveryAnalysisPrompt,
  buildNurtureReplyPrompt,
  buildOpportunityAnalysisPrompt,
  buildSocialContentPrompt,
  buildSocialEventPrompt,
  buildSocialReplyPrompt,
  buildWhatsAppReplyPrompt,
  type PromptTemplate,
} from "../prompts";
import {
  buyingSignalSchema,
  discoveryAnalysisSchema,
  enrichSchema,
  followupSchema,
  intentSchema,
  meetingIntentSchema,
  nurtureReplySchema,
  opportunityAnalysisSchema,
  outreachSchema,
  qualificationSchema,
  replyAnalysisSchema,
  socialContentDraftSchema,
  socialEventClassificationSchema,
  socialReplySchema,
  summarizeSchema,
  urgencySchema,
  whatsappReplySchema,
} from "../schemas";
import type { ZodTypeAny } from "zod";

export interface TaskRuleDeps {
  input: AiTaskInput;
  context: TaskContext;
  validated: Record<string, any>;
}

export interface TaskDefinition {
  schema: ZodTypeAny;
  rules: string[] | ((deps: TaskRuleDeps) => string[]);
  buildPrompt: (ctx: TaskContext) => PromptTemplate;
  action?: TaskAction;
  decisionOf: (validated: Record<string, any>) => string;
  maxTokens?: number;
  /** Lower reasoning effort = faster responses for real-time tasks */
  reasoningEffort?: "low" | "medium" | "high";
  /** Per-task hard timeout (ms) — applied to the LLM HTTP call */
  timeoutMs?: number;
}

export const TASK_DEFINITIONS: Partial<Record<AiTaskType, TaskDefinition>> = {
  ENRICH_LEAD: {
    schema: enrichSchema,
    rules: [],
    buildPrompt: (ctx) => buildPrompt("ENRICH_LEAD", ctx),
    action: TASK_ACTIONS.ENRICH_LEAD,
    decisionOf: () => "enriched",
  },
  QUALIFY_LEAD: {
    schema: qualificationSchema,
    rules: (deps) =>
      deps.validated.decision === "qualified"
        ? ["LEAD_001", "LEAD_002", "LEAD_003", "LEAD_005", "LEAD_006", "LEAD_007", "LEAD_008"]
        : [],
    buildPrompt: (ctx) => buildPrompt("QUALIFY_LEAD", ctx),
    action: TASK_ACTIONS.QUALIFY_LEAD,
    decisionOf: (validated) => validated.decision ?? "computed",
  },
  SCORE_LEAD: {
    schema: qualificationSchema,
    rules: [],
    buildPrompt: (ctx) => buildPrompt("SCORE_LEAD", ctx),
    action: TASK_ACTIONS.SCORE_LEAD,
    decisionOf: () => "scored",
  },
  ANALYZE_INTENT: {
    schema: intentSchema,
    rules: [],
    buildPrompt: (ctx) => buildPrompt("ANALYZE_INTENT", ctx),
    action: TASK_ACTIONS.ANALYZE_INTENT,
    decisionOf: () => "intent_analyzed",
  },
  ANALYZE_URGENCY: {
    schema: urgencySchema,
    rules: [],
    buildPrompt: (ctx) => buildPrompt("ANALYZE_URGENCY", ctx),
    action: TASK_ACTIONS.ANALYZE_URGENCY,
    decisionOf: () => "urgency_analyzed",
  },
  GENERATE_OUTREACH: {
    schema: outreachSchema,
    rules: [
      "LEAD_003",
      "LEAD_004",
      "LEAD_009",
      "LEAD_010",
      "LEAD_011",
      "LEAD_012",
      "LEAD_013",
      "LEAD_016",
      "LEAD_017",
      "LEAD_018",
      "LEAD_019",
    ],
    buildPrompt: (ctx) => buildPrompt("GENERATE_OUTREACH", ctx),
    action: TASK_ACTIONS.GENERATE_OUTREACH,
    decisionOf: () => "outreach_drafted",
  },
  ANALYZE_REPLY: {
    schema: replyAnalysisSchema,
    rules: [],
    buildPrompt: (ctx) => buildPrompt("ANALYZE_REPLY", ctx),
    action: TASK_ACTIONS.ANALYZE_REPLY,
    decisionOf: () => "reply_analyzed",
  },
  DETECT_BUYING_SIGNAL: {
    schema: buyingSignalSchema,
    rules: [],
    buildPrompt: (ctx) => buildPrompt("DETECT_BUYING_SIGNAL", ctx),
    action: TASK_ACTIONS.DETECT_BUYING_SIGNAL,
    decisionOf: () => "buying_signal_detected",
  },
  DETECT_MEETING_INTENT: {
    schema: meetingIntentSchema,
    rules: (deps) => (deps.validated.meeting_intent === true ? ["LEAD_020"] : []),
    buildPrompt: (ctx) => buildPrompt("DETECT_MEETING_INTENT", ctx),
    action: TASK_ACTIONS.DETECT_MEETING_INTENT,
    decisionOf: (validated) => (validated.meeting_intent === true ? "meeting_intent_detected" : "meeting_intent_not_detected"),
  },
  GENERATE_FOLLOWUP: {
    schema: followupSchema,
    rules: ["LEAD_010", "LEAD_016", "LEAD_018"],
    buildPrompt: (ctx) => buildPrompt("GENERATE_FOLLOWUP", ctx),
    action: TASK_ACTIONS.GENERATE_FOLLOWUP,
    decisionOf: () => "followup_drafted",
  },
  SUMMARIZE_CONVERSATION: {
    schema: summarizeSchema,
    rules: [],
    buildPrompt: (ctx) => buildPrompt("SUMMARIZE_CONVERSATION", ctx),
    action: TASK_ACTIONS.SUMMARIZE_CONVERSATION,
    decisionOf: () => "conversation_summarized",
  },
  GENERATE_WHATSAPP_REPLY: {
    schema: whatsappReplySchema,
    rules: [],
    buildPrompt: (ctx) => buildWhatsAppReplyPrompt(ctx),
    // Real-time chat: cap tokens + low reasoning effort for sub-10s replies
    maxTokens: 200,
    reasoningEffort: "low",
    timeoutMs: 60_000,
    action: TASK_ACTIONS.GENERATE_WHATSAPP_REPLY,
    decisionOf: (validated) => (validated.meeting_intent === true ? "whatsapp_reply_with_meeting_intent" : "whatsapp_reply"),
  },
  CLASSIFY_SOCIAL_EVENT: {
    schema: socialEventClassificationSchema,
    rules: [],
    buildPrompt: (ctx) => buildSocialEventPrompt(ctx, (ctx as any).socialEvent ?? { content: "", event_type: "comment" }, (ctx as any).socialRecentMessages),
    action: TASK_ACTIONS.GENERATE_WHATSAPP_REPLY,
    decisionOf: (validated) => validated.recommended_action ?? "classified",
  },
  GENERATE_SOCIAL_REPLY: {
    schema: socialReplySchema,
    rules: ["LEAD_018"],
    buildPrompt: (ctx) => buildSocialReplyPrompt(ctx, (ctx as any).socialEvent ?? { content: "" }),
    action: TASK_ACTIONS.GENERATE_WHATSAPP_REPLY,
    decisionOf: () => "social_reply",
  },
  GENERATE_SOCIAL_CONTENT: {
    schema: socialContentDraftSchema,
    rules: [],
    buildPrompt: (ctx) =>
      buildSocialContentPrompt(ctx, (ctx as any).contentRequest ?? { topic: null, content_type: "post" }),
    action: TASK_ACTIONS.GENERATE_WHATSAPP_REPLY,
    decisionOf: () => "content_draft",
  },
  ANALYZE_OPPORTUNITY: {
    schema: opportunityAnalysisSchema,
    rules: [],
    buildPrompt: (ctx) =>
      buildOpportunityAnalysisPrompt(ctx, (ctx as any).opportunity ?? { content: "", channel: "UNKNOWN" }),
    action: TASK_ACTIONS.GENERATE_WHATSAPP_REPLY,
    decisionOf: (validated) => validated.intent ?? "opportunity_analyzed",
  },
  ANALYZE_DISCOVERY: {
    schema: discoveryAnalysisSchema,
    rules: [],
    buildPrompt: (ctx) =>
      buildDiscoveryAnalysisPrompt(ctx, (ctx as any).discovery ?? { content: "", platform: "unknown" }),
    decisionOf: (validated) => validated.recommended_next_action ?? "discovery_analyzed",
  },
  GENERATE_NURTURE_REPLY: {
    schema: nurtureReplySchema,
    rules: ["LEAD_018"],
    buildPrompt: (ctx) =>
      buildNurtureReplyPrompt(ctx, (ctx as any).nurtureConversation ?? {
        prospect_name: null,
        detected_requirement: null,
        conversation_history: [],
        platform: "unknown",
        lead_memory: null,
        previous_questions: [],
      }),
    decisionOf: (validated) =>
      validated.meeting_intent_detected === true
        ? "nurture_meeting_intent"
        : validated.prospect_disinterested === true
          ? "nurture_prospect_disinterested"
          : "nurture_reply",
  },
};
