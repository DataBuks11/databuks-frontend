import { outreachDailyLimit, outreachDuplicateWindowHours, THRESHOLDS } from "./thresholds";

export const VALID_CHANNELS = [
  "instagram",
  "facebook",
  "whatsapp",
  "telegram",
  "linkedin",
  "email",
] as const;

export type ActionType = "outreach" | "meeting_booking";

export interface RuleContext {
  lead?: Record<string, any> | null;
  intelligence?: Record<string, any> | null;
  businessContext?: Record<string, any> | null;
  duplicateExists?: boolean;
  lastOutreachAt?: string | null;
  channel?: string | null;
  message?: string | null;
  meetingIntent?: boolean | null;
  meetingIntentEvidence?: unknown[] | null;
  scheduledAt?: string | null;
  durationMinutes?: number | null;
  outreachCountInWindow?: number;
  qualificationDecision?: string | null;
  aiReplyCountInWindow?: number;
  duplicateReplyDetected?: boolean;
  actionType?: ActionType;
  now?: Date;
}

export interface RuleDefinition {
  id: string;
  evaluate: (ctx: RuleContext) => { passed: boolean; reason: string };
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export const RULE_CATALOG: Record<string, RuleDefinition> = {
  LEAD_001: {
    id: "LEAD_001",
    evaluate: (ctx) => {
      const icp = asNumber(ctx.intelligence?.icp_fit_score);
      if (icp === null) return { passed: false, reason: "ICP fit score missing" };
      if (icp < THRESHOLDS.ICP_FIT_MIN) {
        return { passed: false, reason: `ICP fit ${icp} below minimum ${THRESHOLDS.ICP_FIT_MIN}` };
      }
      return { passed: true, reason: "ICP fit above threshold" };
    },
  },
  LEAD_002: {
    id: "LEAD_002",
    evaluate: (ctx) => {
      const name = asText(ctx.lead?.name);
      if (!name) return { passed: false, reason: "lead name missing" };
      const hasBusiness = asText(ctx.lead?.company) || asText(ctx.lead?.industry);
      if (!hasBusiness) return { passed: false, reason: "business information (company/industry) missing" };
      return { passed: true, reason: "required business information present" };
    },
  },
  LEAD_003: {
    id: "LEAD_003",
    evaluate: (ctx) => {
      const email = asText(ctx.lead?.email);
      const phone = asText(ctx.lead?.phone);
      if (!email && !phone) return { passed: false, reason: "no usable contact channel (email/phone missing)" };
      return { passed: true, reason: "usable contact channel present" };
    },
  },
  LEAD_004: {
    id: "LEAD_004",
    evaluate: (ctx) => {
      if (ctx.duplicateExists) return { passed: false, reason: "duplicate lead detected" };
      return { passed: true, reason: "no duplicate lead" };
    },
  },
  LEAD_005: {
    id: "LEAD_005",
    evaluate: (ctx) => {
      const intent = asNumber(ctx.intelligence?.intent_score);
      if (intent === null) return { passed: false, reason: "intent score missing" };
      if (intent < THRESHOLDS.INTENT_MIN) {
        return { passed: false, reason: `intent ${intent} below minimum ${THRESHOLDS.INTENT_MIN}` };
      }
      return { passed: true, reason: "intent above threshold" };
    },
  },
  LEAD_006: {
    id: "LEAD_006",
    evaluate: (ctx) => {
      const urgency = asNumber(ctx.intelligence?.urgency_score);
      if (urgency === null) return { passed: false, reason: "urgency score missing" };
      if (urgency < THRESHOLDS.URGENCY_MIN) {
        return { passed: false, reason: `urgency ${urgency} below minimum ${THRESHOLDS.URGENCY_MIN}` };
      }
      return { passed: true, reason: "urgency above threshold" };
    },
  },
  LEAD_007: {
    id: "LEAD_007",
    evaluate: (ctx) => {
      const intent = asNumber(ctx.intelligence?.intent_score);
      if (intent === null || intent < THRESHOLDS.HIGH_INTENT_LEVEL) {
        return { passed: true, reason: "intent below high-intent level, evidence not required" };
      }
      const evidence = Array.isArray(ctx.intelligence?.evidence) ? ctx.intelligence.evidence : [];
      const whyNow = asText(ctx.intelligence?.why_now);
      if (evidence.length === 0) {
        return { passed: false, reason: "high-intent classification requires evidence" };
      }
      if (!whyNow) {
        return { passed: false, reason: "high-intent classification requires why_now" };
      }
      return { passed: true, reason: "high-intent evidence and why_now present" };
    },
  },
  LEAD_008: {
    id: "LEAD_008",
    evaluate: (ctx) => {
      const confidence = asNumber(ctx.intelligence?.confidence);
      if (confidence === null) return { passed: false, reason: "confidence missing" };
      if (confidence < THRESHOLDS.CONFIDENCE_MIN) {
        return { passed: false, reason: `confidence ${confidence} below minimum ${THRESHOLDS.CONFIDENCE_MIN}` };
      }
      return { passed: true, reason: "confidence above threshold" };
    },
  },
  LEAD_009: {
    id: "LEAD_009",
    evaluate: (ctx) => {
      const email = asText(ctx.lead?.email);
      const phone = asText(ctx.lead?.phone);
      if (!email && !phone) return { passed: false, reason: "lead has no contact channel for outreach" };
      const channel = ctx.channel;
      if (!channel) return { passed: false, reason: "outreach channel not specified" };
      if (!(VALID_CHANNELS as readonly string[]).includes(channel)) {
        return { passed: false, reason: `channel ${channel} is not a valid outreach channel` };
      }
      return { passed: true, reason: "outreach eligibility confirmed" };
    },
  },
  LEAD_010: {
    id: "LEAD_010",
    evaluate: (ctx) => {
      if (ctx.lead?.opted_out === true) return { passed: false, reason: "lead has explicitly opted out" };
      return { passed: true, reason: "no opt-out on record" };
    },
  },
  LEAD_011: {
    id: "LEAD_011",
    evaluate: (ctx) => {
      if (!ctx.lastOutreachAt) return { passed: true, reason: "no previous outreach" };
      const now = ctx.now ? ctx.now.getTime() : Date.now();
      const last = new Date(ctx.lastOutreachAt).getTime();
      const windowMs = outreachDuplicateWindowHours() * 3600 * 1000;
      if (now - last < windowMs) {
        return { passed: false, reason: `duplicate outreach within ${outreachDuplicateWindowHours()}h window` };
      }
      return { passed: true, reason: "outside duplicate outreach window" };
    },
  },
  LEAD_012: {
    id: "LEAD_012",
    evaluate: (ctx) => {
      const channel = ctx.channel;
      if (!channel || !(VALID_CHANNELS as readonly string[]).includes(channel)) {
        return { passed: false, reason: "channel invalid" };
      }
      return { passed: true, reason: "channel valid" };
    },
  },
  LEAD_013: {
    id: "LEAD_013",
    evaluate: (ctx) => {
      if (ctx.actionType === "outreach") {
        if (ctx.lead?.funnel_stage !== "OUTREACH_READY") {
          return { passed: false, reason: `lead must be OUTREACH_READY for outreach, currently ${ctx.lead?.funnel_stage ?? "unknown"}` };
        }
        return { passed: true, reason: "lead in correct funnel state for outreach" };
      }
      if (ctx.actionType === "meeting_booking") {
        if (ctx.lead?.funnel_stage !== "MEETING_INTENT") {
          return { passed: false, reason: `lead must be MEETING_INTENT before booking, currently ${ctx.lead?.funnel_stage ?? "unknown"}` };
        }
        return { passed: true, reason: "lead in correct funnel state for meeting booking" };
      }
      return { passed: true, reason: "funnel state check not applicable" };
    },
  },
  LEAD_014: {
    id: "LEAD_014",
    evaluate: (ctx) => {
      if (ctx.meetingIntent !== true) return { passed: false, reason: "meeting intent not confirmed" };
      return { passed: true, reason: "meeting intent confirmed" };
    },
  },
  LEAD_015: {
    id: "LEAD_015",
    evaluate: (ctx) => {
      if (!ctx.scheduledAt) return { passed: false, reason: "scheduled time missing" };
      const scheduledMs = new Date(ctx.scheduledAt).getTime();
      const now = ctx.now ? ctx.now.getTime() : Date.now();
      if (!Number.isFinite(scheduledMs) || scheduledMs <= now) {
        return { passed: false, reason: "scheduled time must be in the future" };
      }
      if (!ctx.durationMinutes || ctx.durationMinutes <= 0) {
        return { passed: false, reason: "meeting duration missing" };
      }
      return { passed: true, reason: "valid scheduling information" };
    },
  },
  LEAD_016: {
    id: "LEAD_016",
    evaluate: (ctx) => {
      if (ctx.lead?.opted_out === true) return { passed: false, reason: "lead opted out" };
      if (ctx.lead?.funnel_stage === "LOST") return { passed: false, reason: "lead is in LOST stage" };
      return { passed: true, reason: "lead not blocked or suppressed" };
    },
  },
  LEAD_017: {
    id: "LEAD_017",
    evaluate: (ctx) => {
      const count = typeof ctx.outreachCountInWindow === "number" ? ctx.outreachCountInWindow : 0;
      const limit = outreachDailyLimit();
      if (count >= limit) {
        return { passed: false, reason: `daily outreach limit reached (${count}/${limit})` };
      }
      return { passed: true, reason: `within outreach limits (${count}/${limit})` };
    },
  },
  LEAD_018: {
    id: "LEAD_018",
    evaluate: (ctx) => {
      const message = ctx.message ?? null;
      if (!message) return { passed: false, reason: "outreach message missing" };
      if (message.length > THRESHOLDS.OUTREACH_MESSAGE_MAX_LENGTH) {
        return { passed: false, reason: `outreach message exceeds ${THRESHOLDS.OUTREACH_MESSAGE_MAX_LENGTH} characters` };
      }
      const unsupported = [
        /\bguaranteed\b/i,
        /\bguarantee(s|d)?\b/i,
        /\bwe promise\b/i,
        /\bassured results\b/i,
        /\bcertain revenue\b/i,
        /\b100% (success|conversion|results|approval)\b/i,
        /\bdefinitely (will|make|earn|get)\b/i,
      ];
      for (const pattern of unsupported) {
        if (pattern.test(message)) {
          return { passed: false, reason: "message contains unsupported guarantee claims" };
        }
      }
      return { passed: true, reason: "message contains no unsupported claims" };
    },
  },
  LEAD_019: {
    id: "LEAD_019",
    evaluate: (ctx) => {
      const message = ctx.message ?? null;
      if (!message) return { passed: true, reason: "no message to check" };
      const socialProof = /(\d{1,4})\+?\s+(clients|customers|projects|leads|sales|bookings|meetings)/i.exec(message);
      if (!socialProof) return { passed: true, reason: "no fabricated social-proof numbers detected" };
      const businessName = asText(ctx.businessContext?.business_name);
      const constraints = ctx.businessContext?.constraints;
      const allowedClaims = Array.isArray(constraints?.allowed_claims)
        ? (constraints.allowed_claims as string[])
        : Array.isArray(ctx.businessContext?.allowed_claims)
          ? (ctx.businessContext.allowed_claims as string[])
          : [];
      const isAllowed = allowedClaims.some((claim: string) => message.includes(claim));
      if (!isAllowed) {
        return { passed: false, reason: "message references unverifiable business metrics not present in business context" };
      }
      if (businessName) {
        const otherNames = [/\bAcme\b/, /\bDataBuks Competitor\b/, /\bWidgets Inc\b/];
        for (const namePattern of otherNames) {
          if (namePattern.test(message)) {
            return { passed: false, reason: "message references a business name that differs from configured business context" };
          }
        }
      }
      return { passed: true, reason: "no fabricated business information detected" };
    },
  },
  LEAD_020: {
    id: "LEAD_020",
    evaluate: (ctx) => {
      if (ctx.meetingIntent !== true) return { passed: true, reason: "no meeting intent claimed" };
      const evidence = Array.isArray(ctx.meetingIntentEvidence) ? ctx.meetingIntentEvidence : [];
      if (evidence.length === 0) {
        return { passed: false, reason: "meeting intent claimed without conversation evidence" };
      }
      return { passed: true, reason: "meeting intent backed by evidence" };
    },
  },
  WA_001: {
    id: "WA_001",
    evaluate: (ctx) => {
      const count = typeof ctx.aiReplyCountInWindow === "number" ? ctx.aiReplyCountInWindow : 0;
      if (count >= 8) return { passed: false, reason: "WhatsApp AI reply rate limit reached for this conversation" };
      return { passed: true, reason: "within WhatsApp reply rate limit" };
    },
  },
  WA_002: {
    id: "WA_002",
    evaluate: (ctx) => {
      if (ctx.duplicateReplyDetected) return { passed: false, reason: "identical reply sent recently" };
      return { passed: true, reason: "no duplicate reply" };
    },
  },
};
