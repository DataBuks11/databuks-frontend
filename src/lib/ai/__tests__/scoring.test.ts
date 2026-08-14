import { describe, expect, it } from "vitest";
import { computeOverallScore, fromDbScores, toDbScores } from "@/lib/ai/intelligence/scoring";
import type { LeadScores } from "@/lib/ai/types";

const fullScores: LeadScores = {
  icp_fit: 92,
  intent: 95,
  urgency: 88,
  buying_signal: 91,
  problem_severity: 84,
  timing: 90,
  reachability: 94,
  evidence_quality: 89,
};

describe("deterministic scoring", () => {
  it("computes weighted overall score", () => {
    const expected =
      Math.round(
        92 * 0.2 +
          95 * 0.2 +
          88 * 0.1 +
          91 * 0.15 +
          84 * 0.1 +
          90 * 0.05 +
          94 * 0.1 +
          89 * 0.1
      );
    expect(computeOverallScore(fullScores)).toBe(expected);
  });

  it("clamps overall score to 0-100", () => {
    const maxed = computeOverallScore({ ...fullScores, icp_fit: 200 });
    expect(maxed).toBeLessThanOrEqual(100);
    const zeroed = computeOverallScore({
      icp_fit: 0,
      intent: 0,
      urgency: 0,
      buying_signal: 0,
      problem_severity: 0,
      timing: 0,
      reachability: 0,
      evidence_quality: 0,
    });
    expect(zeroed).toBe(0);
  });

  it("round-trips scores to db columns and back", () => {
    const db = toDbScores(fullScores);
    expect(db).toEqual({
      icp_fit_score: 92,
      intent_score: 95,
      urgency_score: 88,
      buying_signal_score: 91,
      problem_severity_score: 84,
      timing_score: 90,
      reachability_score: 94,
      evidence_quality_score: 89,
    });
    expect(fromDbScores(db)).toEqual(fullScores);
  });

  it("returns null for incomplete db rows", () => {
    expect(fromDbScores(null)).toBeNull();
    expect(fromDbScores({ icp_fit_score: 10 })).toBeNull();
  });
});
