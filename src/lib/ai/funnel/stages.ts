export const FUNNEL_STAGES = [
  "DISCOVERED",
  "ENRICHED",
  "QUALIFIED",
  "PRIORITIZED",
  "OUTREACH_READY",
  "CONTACTED",
  "CONVERSATION",
  "MEETING_INTENT",
  "MEETING_BOOKED",
  "MEETING_HELD",
  "WON",
  "LOST",
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const LEGACY_STATUS_TO_STAGE: Record<string, FunnelStage> = {
  new: "DISCOVERED",
  nurturing: "ENRICHED",
  qualified: "QUALIFIED",
  contacted: "CONTACTED",
  converted: "WON",
  lost: "LOST",
};

export const STAGE_TO_LEGACY_STATUS: Partial<Record<FunnelStage, string>> = {
  DISCOVERED: "new",
  ENRICHED: "nurturing",
  QUALIFIED: "qualified",
  CONTACTED: "contacted",
  WON: "converted",
  LOST: "lost",
};

export function isFunnelStage(value: unknown): value is FunnelStage {
  return typeof value === "string" && (FUNNEL_STAGES as readonly string[]).includes(value);
}

export function normalizeFunnelStage(value: unknown): FunnelStage {
  if (isFunnelStage(value)) return value;
  if (typeof value === "string" && LEGACY_STATUS_TO_STAGE[value]) {
    return LEGACY_STATUS_TO_STAGE[value];
  }
  return "DISCOVERED";
}
