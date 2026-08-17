/**
 * Discovery Pipeline Tests
 * Tests for the full discovery pipeline: relevant/irrelevant content,
 * deduplication, scoring, conversation, and handoff scenarios.
 */
import { describe, it, expect } from "vitest";
import {
  computeDiscoveryLeadScore,
  computePriorityRank,
  isEvidenceSufficient,
  stageFromAnalysis,
} from "../scoring";
import {
  generateDiscoveryIdempotencyKey,
} from "../deduplication";
import {
  detectMessageLoop,
  detectOptOut,
  detectNoResponse,
} from "../cooldown";
import type { DiscoveryAnalysisResult, DiscoveredLeadInput } from "../types";

// ─── Scoring Tests ──────────────────────────────────────────────────────────

describe("computeDiscoveryLeadScore", () => {
  it("computes weighted score from relevance, intent, and urgency", () => {
    const score = computeDiscoveryLeadScore({
      relevance_score: 80,
      intent_score: 70,
      urgency_score: 60,
    });
    // 80*0.35 + 70*0.35 + 60*0.30 = 28 + 24.5 + 18 = 70.5 → 71
    expect(score).toBe(71);
  });

  it("clamps scores to 0-100 range", () => {
    expect(computeDiscoveryLeadScore({ relevance_score: 150, intent_score: -10, urgency_score: 200 })).toBeLessThanOrEqual(100);
    expect(computeDiscoveryLeadScore({ relevance_score: 150, intent_score: -10, urgency_score: 200 })).toBeGreaterThanOrEqual(0);
  });

  it("handles missing scores as 0", () => {
    expect(computeDiscoveryLeadScore({})).toBe(0);
    expect(computeDiscoveryLeadScore({ relevance_score: 100 })).toBe(35);
  });
});

describe("computePriorityRank", () => {
  it("ranks EXPLICIT_REQUIREMENT highest (0)", () => {
    expect(computePriorityRank(["EXPLICIT_REQUIREMENT"])).toBe(0);
  });

  it("ranks BUYING_INTENT second (1)", () => {
    expect(computePriorityRank(["BUYING_INTENT"])).toBe(1);
  });

  it("returns best rank when multiple signals present", () => {
    expect(computePriorityRank(["PROFILE_RELEVANCE", "BUYING_INTENT"])).toBe(1);
  });

  it("returns 999 for empty signals", () => {
    expect(computePriorityRank([])).toBe(999);
  });
});

describe("isEvidenceSufficient", () => {
  const baseAnalysis: DiscoveryAnalysisResult = {
    relevance_score: 70,
    intent_score: 70,
    urgency_score: 50,
    lead_score: 60,
    confidence: 0.8,
    detected_requirement: "Need a website",
    business_context_match: "Web development",
    evidence: {
      source: "instagram",
      content_url: null,
      content_summary: "test",
      detected_requirement: "Need a website",
      intent_score: 70,
      relevance_score: 70,
      lead_score: 60,
      urgency_score: 50,
      confidence: 0.8,
      reason: "Match",
      signals: ["EXPLICIT_REQUIREMENT"],
      quotes: ["I need a website"],
    },
    should_engage: true,
    recommended_next_action: "CREATE_LEAD",
    reason: "Direct service match",
    signals: ["EXPLICIT_REQUIREMENT"],
  };

  it("returns true when relevance >= 60 and score >= 50", () => {
    expect(isEvidenceSufficient(baseAnalysis)).toBe(true);
  });

  it("returns false when relevance < 60", () => {
    expect(isEvidenceSufficient({ ...baseAnalysis, relevance_score: 40 })).toBe(false);
  });

  it("returns false when should_engage is false", () => {
    expect(isEvidenceSufficient({ ...baseAnalysis, should_engage: false })).toBe(false);
  });

  it("returns true with strong intent but moderate combined score", () => {
    expect(isEvidenceSufficient({ ...baseAnalysis, lead_score: 40, intent_score: 80, relevance_score: 75 })).toBe(true);
  });

  it("returns false with weak keyword-only signal (low scores)", () => {
    expect(isEvidenceSufficient({ ...baseAnalysis, relevance_score: 20, lead_score: 15, intent_score: 10 })).toBe(false);
  });
});

describe("stageFromAnalysis", () => {
  const base: DiscoveryAnalysisResult = {
    relevance_score: 70,
    intent_score: 70,
    urgency_score: 50,
    lead_score: 60,
    confidence: 0.8,
    detected_requirement: null,
    business_context_match: null,
    evidence: {} as any,
    should_engage: true,
    recommended_next_action: "CREATE_LEAD",
    reason: "test",
    signals: [],
  };

  it("returns IGNORED when should_engage is false", () => {
    expect(stageFromAnalysis({ ...base, should_engage: false })).toBe("IGNORED");
  });

  it("returns MEETING_INTENT for BOOK_MEETING action", () => {
    expect(stageFromAnalysis({ ...base, recommended_next_action: "BOOK_MEETING" })).toBe("MEETING_INTENT");
  });

  it("returns QUALIFY for high score + high intent", () => {
    expect(stageFromAnalysis({ ...base, lead_score: 85, intent_score: 75 })).toBe("QUALIFY");
  });

  it("returns CONVERSATION for moderate score", () => {
    expect(stageFromAnalysis({ ...base, lead_score: 65 })).toBe("CONVERSATION");
  });

  it("returns DISCOVER for score at threshold", () => {
    expect(stageFromAnalysis({ ...base, lead_score: 50 })).toBe("DISCOVER");
  });
});

// ─── Deduplication Tests ────────────────────────────────────────────────────

describe("generateDiscoveryIdempotencyKey", () => {
  it("generates consistent keys for same input", () => {
    const input: DiscoveredLeadInput = {
      source_platform: "instagram",
      source_url: null,
      source_content: "I need a website developer",
      source_content_type: "comment",
      external_author_id: "user123",
      author_name: "John",
      author_handle: null,
      author_profile_url: null,
      parent_content: null,
      timestamp: null,
      metadata: {},
      idempotency_key: null,
    };
    const key1 = generateDiscoveryIdempotencyKey("user-abc", input);
    const key2 = generateDiscoveryIdempotencyKey("user-abc", input);
    expect(key1).toBe(key2);
  });

  it("generates different keys for different authors", () => {
    const base: DiscoveredLeadInput = {
      source_platform: "instagram",
      source_url: null,
      source_content: "I need a website",
      source_content_type: "comment",
      external_author_id: "user1",
      author_name: null,
      author_handle: null,
      author_profile_url: null,
      parent_content: null,
      timestamp: null,
      metadata: {},
      idempotency_key: null,
    };
    const key1 = generateDiscoveryIdempotencyKey("user-abc", base);
    const key2 = generateDiscoveryIdempotencyKey("user-abc", { ...base, external_author_id: "user2" });
    expect(key1).not.toBe(key2);
  });
});

// ─── Cooldown / Loop Detection Tests ────────────────────────────────────────

describe("detectMessageLoop", () => {
  it("detects repeated identical agent messages", () => {
    const messages = [
      { role: "agent", content: "How can I help you?" },
      { role: "user", content: "Tell me about your services" },
      { role: "agent", content: "How can I help you?" },
      { role: "user", content: "I said tell me about services" },
      { role: "agent", content: "How can I help you?" },
    ];
    expect(detectMessageLoop(messages, "How can I help you?")).toBe(true);
  });

  it("does not flag different messages as loop", () => {
    const messages = [
      { role: "agent", content: "Welcome! What are you looking for?" },
      { role: "user", content: "Web development" },
      { role: "agent", content: "We specialize in web development. What kind of site?" },
    ];
    expect(detectMessageLoop(messages, "Do you have a specific timeline?")).toBe(false);
  });

  it("handles empty message history", () => {
    expect(detectMessageLoop([], "Hello")).toBe(false);
  });
});

describe("detectOptOut", () => {
  it("detects 'not interested'", () => {
    const messages = [
      { role: "user", content: "I'm not interested, thanks" },
    ];
    expect(detectOptOut(messages)).toBe(true);
  });

  it("detects 'stop messaging'", () => {
    const messages = [
      { role: "agent", content: "Can I help?" },
      { role: "user", content: "Please stop messaging me" },
    ];
    expect(detectOptOut(messages)).toBe(true);
  });

  it("detects Hindi opt-out 'nahi chahiye'", () => {
    const messages = [
      { role: "user", content: "Nahi chahiye bhai" },
    ];
    expect(detectOptOut(messages)).toBe(true);
  });

  it("does not flag interested user", () => {
    const messages = [
      { role: "user", content: "Yes, tell me more about your web development services" },
    ];
    expect(detectOptOut(messages)).toBe(false);
  });

  it("does not flag empty messages", () => {
    expect(detectOptOut([])).toBe(false);
  });
});

describe("detectNoResponse", () => {
  it("detects no response after agent message", () => {
    const agentAt = new Date(Date.now() - 72 * 3600 * 1000).toISOString(); // 72 hours ago
    expect(detectNoResponse(agentAt, null)).toBe(true);
  });

  it("does not flag recent agent message", () => {
    const agentAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString(); // 2 hours ago
    expect(detectNoResponse(agentAt, null)).toBe(false);
  });

  it("does not flag when user responded after agent", () => {
    const agentAt = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
    const userAt = new Date(Date.now() - 1 * 3600 * 1000).toISOString();
    expect(detectNoResponse(agentAt, userAt)).toBe(false);
  });

  it("returns false when no agent message", () => {
    expect(detectNoResponse(null, null)).toBe(false);
  });
});
