export interface SubScores {
  icp_fit: number;
  requirement_fit: number;
  urgency: number;
  business_fit: number;
  contactability: number;
  evidence_strength: number;
  identity_confidence: number;
}

export interface ScorePenalties {
  conflicting_data: number;
  outdated_evidence: number;
  single_source: number;
  unsupported_inference: number;
  duplicate: number;
  missing_critical_evidence: number;
}

export interface ScoringResult {
  final_score: number;
  confidence: number;
  sub_scores: SubScores;
  penalties_applied: { reason: string; amount: number }[];
  quality_gate_status: "QUALIFIED" | "NEEDS_REVIEW" | "REJECTED" | "INSUFFICIENT";
  score_explanation: string;
  confidence_explanation: string;
}

const DEFAULT_WEIGHTS = {
  icp_fit: 15,
  requirement_fit: 20,
  urgency: 20,
  business_fit: 15,
  contactability: 10,
  evidence_strength: 10,
  identity_confidence: 10,
};

const DEFAULT_THRESHOLDS = {
  qualified_min_score: 60,
  qualified_min_confidence: 60,
  needs_review_min_score: 45,
};

export function computeSubScores(input: {
  requirementStatus: string;
  intentScore: number;
  urgencyScore: number;
  relevanceScore: number;
  hasPhone: boolean;
  hasEmail: boolean;
  hasWebsite: boolean;
  hasSocialLinks: boolean;
  hasAddress: boolean;
  evidenceStrengthAvg: number;
  identityConfidence: number;
  targetIndustries: string[];
  detectedIndustry: string | null;
}): SubScores {
  const reqStatusWeight: Record<string, number> = {
    EXPLICIT: 100, STRONGLY_INFERRED: 70, WEAKLY_INFERRED: 35, UNKNOWN: 0, CONFLICTING: 0,
  };

  let icpFit = input.relevanceScore;
  if (input.detectedIndustry && input.targetIndustries.length > 0) {
    const match = input.targetIndustries.some((ind) =>
      input.detectedIndustry!.toLowerCase().includes(ind.toLowerCase()) ||
      ind.toLowerCase().includes(input.detectedIndustry!.toLowerCase())
    );
    if (match) icpFit = Math.min(100, icpFit + 15);
  }

  let contactability = 0;
  if (input.hasPhone) contactability += 40;
  if (input.hasEmail) contactability += 25;
  if (input.hasWebsite) contactability += 20;
  if (input.hasSocialLinks) contactability += 15;

  return {
    icp_fit: Math.min(100, Math.round(icpFit)),
    requirement_fit: reqStatusWeight[input.requirementStatus] ?? 0,
    urgency: input.urgencyScore,
    business_fit: Math.min(100, Math.round(icpFit * 0.8 + input.relevanceScore * 0.2)),
    contactability: Math.min(100, contactability),
    evidence_strength: input.evidenceStrengthAvg,
    identity_confidence: Math.round(input.identityConfidence * 100),
  };
}

export function applyPenalties(subScores: SubScores, conflicts: { field: string; values: string[] }[]): {
  adjusted: SubScores;
  penalties: { reason: string; amount: number }[];
} {
  const penalties: { reason: string; amount: number }[] = [];
  const adjusted = { ...subScores };
  let penaltyTotal = 0;

  if (conflicts.length > 0) {
    const p = Math.min(conflicts.length * 5, 15);
    penalties.push({ reason: `${conflicts.length} conflicting data point(s)`, amount: p });
    penaltyTotal += p;
  }

  if (adjusted.contactability < 20) {
    penalties.push({ reason: "low contactability — limited ways to reach this business", amount: 10 });
    penaltyTotal += 10;
  }

  const netPenalty = Math.min(penaltyTotal, 25);

  for (const key of Object.keys(adjusted) as (keyof SubScores)[]) {
    adjusted[key] = Math.max(0, Math.max(0, adjusted[key] - Math.round(netPenalty / Object.keys(adjusted).length)));
  }

  return { adjusted, penalties };
}

export function calculateFinalScore(
  subScores: SubScores,
  penalties: { reason: string; amount: number }[],
  thresholds?: Partial<typeof DEFAULT_THRESHOLDS>
): ScoringResult {
  const weights = DEFAULT_WEIGHTS;
  let rawScore = 0;
  const explanations: string[] = [];

  for (const [key, weight] of Object.entries(weights)) {
    const value = subScores[key as keyof SubScores] ?? 0;
    rawScore += (value / 100) * weight;
    explanations.push(`${key.replace(/_/g, " ")}: ${value}/100 × ${weight}% = ${Math.round(value * weight / 100)}`);
  }

  const totalPenaltyAmount = penalties.reduce((sum, p) => sum + p.amount, 0);
  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore - totalPenaltyAmount)));

  const avgSubScore = Math.round(
    (subScores.icp_fit + subScores.requirement_fit + subScores.urgency +
     subScores.business_fit + subScores.contactability + subScores.evidence_strength +
     subScores.identity_confidence) / 7
  );
  const confidence = Math.min(100, Math.max(0, avgSubScore));

  const th = { ...DEFAULT_THRESHOLDS, ...thresholds };
  let qualityGate: ScoringResult["quality_gate_status"];
  if (subScores.requirement_fit === 0 && subScores.evidence_strength === 0) {
    qualityGate = "INSUFFICIENT";
  } else if (
    finalScore >= th.qualified_min_score &&
    confidence >= th.qualified_min_confidence
  ) {
    qualityGate = "QUALIFIED";
  } else if (finalScore >= th.needs_review_min_score) {
    qualityGate = "NEEDS_REVIEW";
  } else {
    qualityGate = "REJECTED";
  }

  return {
    final_score: finalScore,
    confidence,
    sub_scores: subScores,
    penalties_applied: penalties,
    quality_gate_status: qualityGate,
    score_explanation: `Final score ${finalScore}/100 based on weighted subscores minus ${totalPenaltyAmount > 0 ? `${totalPenaltyAmount} penalty points` : "no penalties"}. Breakdown: ${explanations.join("; ")}`,
    confidence_explanation: `Confidence ${confidence}% reflects average reliability across all qualification dimensions.`,
  };
}
