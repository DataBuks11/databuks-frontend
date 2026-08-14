import type { LeadScores } from "../types";

export const SCORE_WEIGHTS: Record<keyof LeadScores, number> = {
  icp_fit: 0.2,
  intent: 0.2,
  urgency: 0.1,
  buying_signal: 0.15,
  problem_severity: 0.1,
  timing: 0.05,
  reachability: 0.1,
  evidence_quality: 0.1,
};

export function computeOverallScore(scores: LeadScores): number {
  let weighted = 0;
  for (const key of Object.keys(SCORE_WEIGHTS) as (keyof LeadScores)[]) {
    const value = scores[key];
    const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
    weighted += numeric * SCORE_WEIGHTS[key];
  }
  return Math.min(100, Math.max(0, Math.round(weighted)));
}

export function toDbScores(scores: LeadScores) {
  return {
    icp_fit_score: scores.icp_fit,
    intent_score: scores.intent,
    urgency_score: scores.urgency,
    buying_signal_score: scores.buying_signal,
    problem_severity_score: scores.problem_severity,
    timing_score: scores.timing,
    reachability_score: scores.reachability,
    evidence_quality_score: scores.evidence_quality,
  };
}

export function fromDbScores(row: Record<string, any> | null): LeadScores | null {
  if (!row) return null;
  const scores = {
    icp_fit: row.icp_fit_score,
    intent: row.intent_score,
    urgency: row.urgency_score,
    buying_signal: row.buying_signal_score,
    problem_severity: row.problem_severity_score,
    timing: row.timing_score,
    reachability: row.reachability_score,
    evidence_quality: row.evidence_quality_score,
  };
  const values = Object.values(scores);
  if (values.some((v) => typeof v !== "number" || !Number.isFinite(v))) return null;
  return scores as LeadScores;
}
