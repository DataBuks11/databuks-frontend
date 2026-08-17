export type OpportunitySource =
  | "INBOUND"
  | "OUTBOUND"
  | "SOCIAL_DISCOVERY"
  | "WEBSITE"
  | "EMAIL";

export type OpportunityChannel =
  | "WHATSAPP"
  | "INSTAGRAM"
  | "FACEBOOK"
  | "LINKEDIN"
  | "EMAIL"
  | "WEBSITE"
  | "MANUAL"
  | "OTHER";

export type OpportunityEventType =
  | "COMMENT"
  | "POST"
  | "REEL"
  | "DM"
  | "MESSAGE"
  | "EMAIL"
  | "MENTION"
  | "FORM_SUBMISSION"
  | "REPLY"
  | "OUTREACH_RESPONSE"
  | "WEBSITE_LEAD"
  | "OTHER";

export interface OpportunityInput {
  source: OpportunitySource;
  channel: OpportunityChannel;
  event_type: OpportunityEventType;
  external_event_id?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_handle?: string | null;
  content?: string | null;
  source_url?: string | null;
  parent_content?: string | null;
  timestamp?: string | null;
  metadata?: Record<string, any>;
  idempotencyKey?: string;
}

export interface DiscoveryAvailability {
  channel: OpportunityChannel;
  connected: boolean;
  discovery_supported: boolean;
  reason: string;
}

export interface DiscoveryResult {
  availability: DiscoveryAvailability[];
  opportunities: OpportunityInput[];
}

export const OPPORTUNITY_STATUSES = [
  "NEW",
  "ANALYZING",
  "QUALIFIED",
  "CONVERSING",
  "NURTURING",
  "MEETING_INTENT",
  "MEETING_BOOKED",
  "CONVERTED",
  "LOST",
  "IGNORED",
  "ESCALATED",
  "HANDOFF_READY",
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];
