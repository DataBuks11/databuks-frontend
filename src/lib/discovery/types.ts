/**
 * Discovery System Types
 * Normalized types for the multi-source lead discovery pipeline.
 */

// ─── Discovery Signals ─────────────────────────────────────────────────────

export const DISCOVERY_SIGNALS = [
  "EXPLICIT_REQUIREMENT",
  "BUYING_INTENT",
  "VENDOR_SEARCH",
  "RECOMMENDATION_REQUEST",
  "PROBLEM_SOLVING",
  "URGENCY",
  "BUDGET_DISCUSSION",
  "COMPARING_SOLUTIONS",
  "DISSATISFACTION",
  "BUSINESS_EXPANSION",
  "LAUNCHING_BUSINESS",
  "SOFTWARE_REQUIREMENT",
  "AI_REQUIREMENT",
  "AGENCY_REQUIREMENT",
  "SERVICE_REQUIREMENT",
  "HIRING_OUTSOURCING",
  "REPEATED_PROBLEM",
  "RELEVANT_COMMENT",
  "COMMUNITY_DISCUSSION",
  "PROFILE_RELEVANCE",
] as const;

export type DiscoverySignal = (typeof DISCOVERY_SIGNALS)[number];

// ─── Conversation Stages ────────────────────────────────────────────────────

export const CONVERSATION_STAGES = [
  "DISCOVER",
  "QUALIFY",
  "CONVERSATION",
  "NURTURE",
  "INTEREST_CONFIRMED",
  "MEETING_INTENT",
  "WHATSAPP_HANDOFF",
  "MEETING",
  "CLOSED",
  "IGNORED",
] as const;

export type ConversationStage = (typeof CONVERSATION_STAGES)[number];

// ─── Platform Types ──────────────────────────────────────────────────────────

export type DiscoveryPlatform =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "whatsapp"
  | "email"
  | "website"
  | "outbound"
  | "manual";

export type SourceContentType =
  | "post"
  | "reel"
  | "story"
  | "comment"
  | "message"
  | "article"
  | "discussion"
  | "profile"
  | "email"
  | "other";

// ─── Lead Evidence ──────────────────────────────────────────────────────────

export interface LeadEvidence {
  source: string;
  content_url: string | null;
  content_summary: string;
  detected_requirement: string | null;
  intent_score: number;
  relevance_score: number;
  lead_score: number;
  urgency_score: number;
  confidence: number;
  reason: string;
  signals: DiscoverySignal[];
  quotes: string[];
}

// ─── Discovered Lead Input ──────────────────────────────────────────────────

export interface DiscoveredLeadInput {
  source_platform: DiscoveryPlatform;
  source_url: string | null;
  source_content: string;
  source_content_type: SourceContentType;
  external_author_id: string | null;
  author_name: string | null;
  author_handle: string | null;
  author_profile_url: string | null;
  parent_content: string | null;
  timestamp: string | null;
  metadata: Record<string, any>;
  idempotency_key: string | null;
}

// ─── Discovery Analysis Result ──────────────────────────────────────────────

export interface DiscoveryAnalysisResult {
  relevance_score: number;
  intent_score: number;
  urgency_score: number;
  lead_score: number;
  confidence: number;
  detected_requirement: string | null;
  business_context_match: string | null;
  evidence: LeadEvidence;
  should_engage: boolean;
  recommended_next_action: string;
  reason: string;
  signals: DiscoverySignal[];
}

// ─── Pipeline Result ────────────────────────────────────────────────────────

export interface DiscoveryPipelineResult {
  status: "CREATED" | "DUPLICATE" | "IGNORED" | "FAILED";
  discovered_lead_id: string | null;
  lead_id: string | null;
  opportunity_id: string | null;
  analysis: DiscoveryAnalysisResult | null;
  duplicate_of: string | null;
  reason: string;
}

// ─── Conversation Message ───────────────────────────────────────────────────

export interface ConversationMessage {
  role: "agent" | "user";
  content: string;
  timestamp: string;
  platform: string;
  metadata?: Record<string, any>;
}

// ─── Handoff Context ────────────────────────────────────────────────────────

export interface DiscoveryHandoffContext {
  discovered_lead_id: string;
  lead_id: string | null;
  opportunity_id: string | null;
  platform: string;
  prospect_name: string | null;
  profile_url: string | null;
  original_requirement: string | null;
  detected_intent: string | null;
  lead_score: number;
  intent_score: number;
  confidence: number;
  evidence: LeadEvidence;
  conversation_summary: string | null;
  latest_messages: ConversationMessage[];
  objections: string[];
  why_qualified: string;
  recommended_next_step: string;
}

// ─── Discovery Priority ─────────────────────────────────────────────────────

export const DISCOVERY_PRIORITY_ORDER = [
  "EXPLICIT_REQUIREMENT",
  "BUYING_INTENT",
  "URGENCY",
  "VENDOR_SEARCH",
  "SERVICE_REQUIREMENT",
  "AI_REQUIREMENT",
  "SOFTWARE_REQUIREMENT",
  "AGENCY_REQUIREMENT",
  "PROBLEM_SOLVING",
  "COMPARING_SOLUTIONS",
  "DISSATISFACTION",
  "RECOMMENDATION_REQUEST",
  "BUSINESS_EXPANSION",
  "LAUNCHING_BUSINESS",
  "BUDGET_DISCUSSION",
  "HIRING_OUTSOURCING",
  "COMMUNITY_DISCUSSION",
  "RELEVANT_COMMENT",
  "REPEATED_PROBLEM",
  "PROFILE_RELEVANCE",
] as const;

// ─── Max conversation turns before requiring human review ────────────────────

export const MAX_AUTONOMOUS_TURNS = 10;
export const COOLDOWN_HOURS_DEFAULT = 24;
export const MIN_LEAD_SCORE_THRESHOLD = 50;
export const MIN_RELEVANCE_SCORE_THRESHOLD = 60;
