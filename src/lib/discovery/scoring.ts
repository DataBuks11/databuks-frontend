/**
 * Discovery Lead Scoring
 * Evidence-based scoring with priority ranking. No keyword-only matching.
 */

import type { DiscoveryAnalysisResult, DiscoverySignal } from "./types";
import { DISCOVERY_PRIORITY_ORDER } from "./types";

/**
 * Compute the final lead score from AI analysis.
 * Weights: relevance 35%, intent 35%, urgency 30%
 */
export function computeDiscoveryLeadScore(analysis: {
  relevance_score?: number;
  intent_score?: number;
  urgency_score?: number;
}): number {
  const relevance = clampScore(analysis.relevance_score);
  const intent = clampScore(analysis.intent_score);
  const urgency = clampScore(analysis.urgency_score);
  const weighted = relevance * 0.35 + intent * 0.35 + urgency * 0.3;
  return Math.min(100, Math.max(0, Math.round(weighted)));
}

/**
 * Rank discovered leads by priority.
 * Higher priority = should be engaged first.
 */
export function computePriorityRank(signals: DiscoverySignal[]): number {
  if (signals.length === 0) return 999;
  let best = 999;
  for (const signal of signals) {
    const idx = DISCOVERY_PRIORITY_ORDER.indexOf(signal as any);
    if (idx >= 0 && idx < best) best = idx;
  }
  return best;
}

/**
 * Determine if the lead evidence quality is sufficient to create a lead.
 * Requires: relevance ≥ 60 AND (explicit intent OR combined score ≥ 50)
 */
export function isEvidenceSufficient(analysis: DiscoveryAnalysisResult): boolean {
  if (analysis.relevance_score < 60) return false;
  if (!analysis.should_engage) return false;
  if (analysis.lead_score >= 50) return true;
  // Strong intent with moderate scores
  if (analysis.intent_score >= 70 && analysis.relevance_score >= 70) return true;
  return false;
}

/**
 * Determine the initial conversation stage based on analysis.
 */
export function stageFromAnalysis(analysis: DiscoveryAnalysisResult): string {
  if (!analysis.should_engage) return "IGNORED";
  if (analysis.recommended_next_action === "BOOK_MEETING") return "MEETING_INTENT";
  if (analysis.recommended_next_action === "HANDOFF_WHATSAPP") return "WHATSAPP_HANDOFF";
  if (analysis.lead_score >= 80 && analysis.intent_score >= 70) return "QUALIFY";
  if (analysis.lead_score >= 60) return "CONVERSATION";
  if (analysis.lead_score >= 50) return "DISCOVER";
  return "IGNORED";
}

/**
 * Clamp a score value to 0-100 integer range.
 */
function clampScore(value?: number): number {
  if (typeof value !== "number" || isNaN(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
