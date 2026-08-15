import type { TransitionDecision } from "../types";
import type { FunnelStage } from "./stages";

export const FUNNEL_TRANSITIONS: Record<FunnelStage, FunnelStage[]> = {
  DISCOVERED: ["ENRICHED", "LOST"],
  ENRICHED: ["QUALIFIED", "DISCOVERED", "LOST"],
  QUALIFIED: ["PRIORITIZED", "ENRICHED", "LOST"],
  PRIORITIZED: ["OUTREACH_READY", "QUALIFIED", "LOST"],
  OUTREACH_READY: ["CONTACTED", "PRIORITIZED", "LOST"],
  CONTACTED: ["CONVERSATION", "OUTREACH_READY", "LOST"],
  CONVERSATION: ["MEETING_INTENT", "CONTACTED", "LOST"],
  MEETING_INTENT: ["MEETING_BOOKED", "CONVERSATION", "LOST"],
  MEETING_BOOKED: ["MEETING_HELD", "CONVERSATION", "LOST"],
  MEETING_HELD: ["WON", "LOST", "CONVERSATION"],
  WON: [],
  LOST: ["DISCOVERED"],
};

export const INBOUND_TRANSITIONS: Partial<Record<FunnelStage, FunnelStage[]>> = {
  DISCOVERED: ["CONTACTED"],
  ENRICHED: ["CONTACTED"],
};

export const STAGE_GUARDS: Partial<Record<FunnelStage, string[]>> = {
  ENRICHED: ["LEAD_002"],
  QUALIFIED: ["LEAD_001", "LEAD_002", "LEAD_003", "LEAD_005", "LEAD_006", "LEAD_007", "LEAD_008"],
  PRIORITIZED: ["LEAD_008"],
  OUTREACH_READY: ["LEAD_003", "LEAD_009"],
  MEETING_BOOKED: ["LEAD_013", "LEAD_014", "LEAD_015", "LEAD_020"],
};

export function canTransition(
  currentStage: FunnelStage,
  nextStage: FunnelStage,
  options?: { inbound?: boolean }
): TransitionDecision {
  if (currentStage === nextStage) {
    return { allowed: true, reason: "already in target stage" };
  }
  const allowedStages = FUNNEL_TRANSITIONS[currentStage] ?? [];
  const inboundStages = (options?.inbound && INBOUND_TRANSITIONS[currentStage]) || [];
  if (allowedStages.includes(nextStage) || inboundStages.includes(nextStage)) {
    return { allowed: true, reason: "valid funnel transition" };
  }
  return {
    allowed: false,
    ruleId: "FUNNEL_001",
    reason: `Invalid funnel transition ${currentStage} -> ${nextStage}`,
  };
}
