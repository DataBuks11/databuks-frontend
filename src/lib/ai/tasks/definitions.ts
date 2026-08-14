import type { AiTaskInput, AiTaskType, TaskContext } from "../types";
import type { TaskAction } from "../actions";
import { TASK_ACTIONS } from "../actions";
import { buildPrompt, buildWhatsAppReplyPrompt, type PromptTemplate } from "../prompts";
import {
  buyingSignalSchema,
  enrichSchema,
  followupSchema,
  intentSchema,
  meetingIntentSchema,
  outreachSchema,
  qualificationSchema,
  replyAnalysisSchema,
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
    action: TASK_ACTIONS.GENERATE_WHATSAPP_REPLY,
    decisionOf: (validated) => (validated.meeting_intent === true ? "whatsapp_reply_with_meeting_intent" : "whatsapp_reply"),
  },
};
