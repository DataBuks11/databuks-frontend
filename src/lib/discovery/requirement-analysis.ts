export type RequirementStatus = "EXPLICIT" | "STRONGLY_INFERRED" | "WEAKLY_INFERRED" | "UNKNOWN" | "CONFLICTING";
export type UrgencyLevel = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export interface RequirementAnalysis {
  status: RequirementStatus;
  requirement_type: string;
  evidence_level: string;
  reason: string;
}

export interface UrgencyAnalysis {
  level: UrgencyLevel;
  score: number;
  reason: string;
}

const EXPLICIT_PATTERNS = [
  /looking for|need|require|hiring|seeking|want(ed)?\s+(a|an)?\s*(developer|agency|company)/i,
  /need (a |an )?(website|software|app|erp|crm|automation|ai)/i,
  /(build|develop|create) (a |an )?(website|app|software|system)/i,
  /(website|software|app|erp|crm)\s+(banwana|banwane|chahiye|karna)/i,
  /request(ing)? (a )?(quote|proposal|estimate)/i,
];

const STRONG_INFERRED_PATTERNS = [
  /(comparing|comparing).*(solutions?|platforms?|systems?)/i,
  /(dissatisfied|unhappy|frustrated) with (our |the )?(current |existing )?(website|software|system|vendor)/i,
  /(expanding|growing|launching) (our |the )?(business|operations)/i,
  /(budget|investing|spending).*(digital|tech|website|software)/i,
  /(outsourcing|offshoring) (development|it|tech)/i,
];

const WEAK_SIGNAL_PATTERNS = [
  /(hotel|restaurant|clinic|school|store|shop|gym|salon)/i,
  /(ceo|founder|owner|director|manager)/i,
  /(small|medium|large) business/i,
];

export function analyzeRequirement(text: string): RequirementAnalysis {
  if (!text || text.trim().length < 5) {
    return { status: "UNKNOWN", requirement_type: "UNKNOWN", evidence_level: "NO_EVIDENCE", reason: "insufficient text content" };
  }
  for (const pattern of EXPLICIT_PATTERNS) {
    if (pattern.test(text)) {
      return { status: "EXPLICIT", requirement_type: "SERVICE_REQUIRED", evidence_level: "VERIFIED_DIRECT", reason: "explicit service requirement found in public content" };
    }
  }
  for (const pattern of STRONG_INFERRED_PATTERNS) {
    if (pattern.test(text)) {
      return { status: "STRONGLY_INFERRED", requirement_type: "SERVICE_REQUIRED", evidence_level: "STRONG_INFERRED", reason: "multiple strong signals suggest a need for our services" };
    }
  }
  for (const pattern of WEAK_SIGNAL_PATTERNS) {
    if (pattern.test(text)) {
      return { status: "WEAKLY_INFERRED", requirement_type: "POTENTIAL_INTEREST", evidence_level: "WEAK_SIGNAL", reason: "weak business-type signal detected, insufficient for qualification" };
    }
  }
  return { status: "UNKNOWN", requirement_type: "UNKNOWN", evidence_level: "NO_EVIDENCE", reason: "no requirement evidence found in available content" };
}

export function analyzeUrgency(text: string, requirementStatus: RequirementStatus): UrgencyAnalysis {
  if (requirementStatus === "UNKNOWN") {
    return { level: "UNKNOWN", score: 0, reason: "no requirement evidence — urgency cannot be assessed" };
  }

  const urgentPatterns = [
    /urgent(ly)?/i, /asap/i, /immediately/i, /right away/i,
    /deadline/i, /this week/i, /next week/i, /by (monday|tuesday|wednesday|thursday|friday)/i,
    /\bnow\b/i, /\btoday\b/i, /starting (this|next) month/i,
  ];
  for (const p of urgentPatterns) {
    if (p.test(text)) {
      return { level: "HIGH", score: 85, reason: "explicit urgency signal found (deadline or immediate timeline)" };
    }
  }

  if (requirementStatus === "EXPLICIT") {
    return { level: "MEDIUM", score: 60, reason: "explicit requirement but no explicit deadline" };
  }

  const moderatePatterns = [/soon/i, /coming up/i, /planning/i, /in the next/i];
  for (const p of moderatePatterns) {
    if (p.test(text)) {
      return { level: "MEDIUM", score: 45, reason: "moderate timeline signal detected" };
    }
  }

  if (requirementStatus === "STRONGLY_INFERRED") {
    return { level: "MEDIUM", score: 40, reason: "strong inferred requirement without explicit timeline" };
  }

  return { level: "LOW", score: 15, reason: "weak signals only — no time-sensitive evidence" };
}
