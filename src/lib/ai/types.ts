export const AI_TASK_TYPES = [
  "ENRICH_LEAD",
  "QUALIFY_LEAD",
  "SCORE_LEAD",
  "ANALYZE_INTENT",
  "ANALYZE_URGENCY",
  "GENERATE_OUTREACH",
  "ANALYZE_REPLY",
  "DETECT_BUYING_SIGNAL",
  "DETECT_MEETING_INTENT",
  "GENERATE_FOLLOWUP",
  "SUMMARIZE_CONVERSATION",
] as const;

export type AiTaskType = (typeof AI_TASK_TYPES)[number];

export type AiTaskStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "BLOCKED";

export interface RuleCheckResult {
  ruleId: string;
  passed: boolean;
  reason: string;
}

export interface RuleResult {
  allowed: boolean;
  ruleId?: string;
  reason: string;
  checks: RuleCheckResult[];
}

export interface TransitionDecision {
  allowed: boolean;
  ruleId?: string;
  reason: string;
}

export interface AiDecisionLog {
  user_id: string;
  lead_id?: string | null;
  conversation_id?: string | null;
  task_type: string;
  model: string;
  model_version: string;
  prompt_version: string;
  input_context: Record<string, unknown>;
  output: Record<string, unknown> | null;
  ai_decision: string;
  rule_result: RuleResult | Record<string, unknown>;
  action?: string | null;
  action_status?: string | null;
  error_code?: string | null;
  error_message?: string | null;
}

export interface AiTaskInput {
  userId: string;
  taskType: AiTaskType;
  leadId?: string | null;
  conversationId?: string | null;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface AiTaskResult {
  taskId: string;
  status: AiTaskStatus;
  output: Record<string, unknown> | null;
  decision: {
    allowed: boolean;
    ruleId?: string;
    reason: string;
    action?: string | null;
    actionStatus?: string | null;
  };
  error?: string | null;
}

export interface BusinessContext {
  business_name: string | null;
  description: string | null;
  products: Record<string, unknown>[];
  services: Record<string, unknown>[];
  target_audience: Record<string, unknown>[];
  ideal_customer_profile: Record<string, unknown>;
  locations: string[];
  industries: string[];
  offer: Record<string, unknown>;
  pricing: Record<string, unknown>;
  brand_voice: string[];
  tone: string | null;
  constraints: Record<string, unknown>;
  excluded_industries: string[];
  excluded_lead_types: string[];
  preferred_channels: string[];
  monthly_meeting_target: number;
  available: boolean;
  missing_fields: string[];
}

export interface TaskContext {
  business: BusinessContext;
  lead: Record<string, any> | null;
  intelligence: Record<string, any> | null;
  conversation: Record<string, any> | null;
  messages: Record<string, any>[];
  conversationSummary: string | null;
  duplicateExists: boolean;
  lastOutreachAt: string | null;
  outreachCountInWindow: number;
}

export interface LeadScores {
  icp_fit: number;
  intent: number;
  urgency: number;
  buying_signal: number;
  problem_severity: number;
  timing: number;
  reachability: number;
  evidence_quality: number;
}

export interface EvidenceItem {
  source: string;
  signal: string;
  detail?: string;
}

export interface QualificationOutput {
  task: "lead_qualification";
  lead_id: string;
  decision: "qualified" | "disqualified" | "needs_more_data";
  scores: LeadScores;
  confidence: number;
  why_now: string;
  evidence: EvidenceItem[];
  recommended_channel: string | null;
  recommended_action: string | null;
}

export interface MeetingIntentOutput {
  task: "meeting_intent_detection";
  conversation_id: string;
  meeting_intent: boolean;
  confidence: number;
  evidence: EvidenceItem[];
  suggested_next_step: string | null;
}
