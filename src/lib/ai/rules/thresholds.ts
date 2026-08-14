export const THRESHOLDS = {
  ICP_FIT_MIN: 60,
  INTENT_MIN: 60,
  URGENCY_MIN: 40,
  CONFIDENCE_MIN: 0.6,
  HIGH_INTENT_LEVEL: 80,
  OVERALL_PRIORITY_MIN: 70,
  OUTREACH_DUPLICATE_WINDOW_HOURS: 24,
  OUTREACH_DAILY_LIMIT: 20,
  MEETING_INTENT_CONFIDENCE_MIN: 0.7,
  OUTREACH_MESSAGE_MAX_LENGTH: 2000,
} as const;

export function whatsAppReplyLimit(): number | null {
  const envLimit = Number(process.env.WA_HOURLY_REPLY_LIMIT);
  if (Number.isFinite(envLimit) && envLimit > 0) return Math.floor(envLimit);
  return null;
}

export function outreachDailyLimit(): number {
  const envLimit = Number(process.env.OUTREACH_DAILY_LIMIT);
  if (Number.isFinite(envLimit) && envLimit > 0) return Math.floor(envLimit);
  return THRESHOLDS.OUTREACH_DAILY_LIMIT;
}

export function outreachDuplicateWindowHours(): number {
  const envHours = Number(process.env.OUTREACH_DUPLICATE_WINDOW_HOURS);
  if (Number.isFinite(envHours) && envHours > 0) return envHours;
  return THRESHOLDS.OUTREACH_DUPLICATE_WINDOW_HOURS;
}
