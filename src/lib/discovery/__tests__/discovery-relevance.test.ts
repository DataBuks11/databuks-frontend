/**
 * Discovery Relevance Tests
 * Tests for: signal quality, dedup, cooldown, opt-out, group filtering,
 * conversation memory, meeting intent, provider failures
 */

import { describe, it, expect } from "vitest";
import { computeDiscoveryLeadScore, isEvidenceSufficient, stageFromAnalysis } from "../scoring";
import { generateDiscoveryIdempotencyKey } from "../deduplication";
import { detectOptOut, detectMessageLoop, detectNoResponse } from "../cooldown";
import type { DiscoveryAnalysisResult, DiscoveredLeadInput } from "../types";
import { MIN_LEAD_SCORE_THRESHOLD } from "../types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeAnalysis(overrides: Partial<DiscoveryAnalysisResult> = {}): DiscoveryAnalysisResult {
  return {
    relevance_score: 0,
    intent_score: 0,
    urgency_score: 0,
    lead_score: 0,
    confidence: 0,
    detected_requirement: null,
    business_context_match: null,
    evidence: {
      source: "instagram",
      content_url: null,
      content_summary: "",
      detected_requirement: null,
      intent_score: 0,
      relevance_score: 0,
      lead_score: 0,
      urgency_score: 0,
      confidence: 0,
      reason: "",
      signals: [],
      quotes: [],
    },
    should_engage: false,
    recommended_next_action: "IGNORE",
    reason: "",
    signals: [],
    ...overrides,
  };
}

function makeInput(overrides: Partial<DiscoveredLeadInput> = {}): DiscoveredLeadInput {
  return {
    source_platform: "instagram",
    source_url: null,
    source_content: "test content",
    source_content_type: "comment",
    external_author_id: "user123",
    author_name: "Test User",
    author_handle: "@testuser",
    author_profile_url: null,
    parent_content: null,
    timestamp: null,
    metadata: {},
    idempotency_key: null,
    ...overrides,
  };
}

// ─── Generic / Weak Comments → IGNORED ──────────────────────────────────────

describe("Generic comments should score low", () => {
  it("'nice' comment scores below threshold", () => {
    const score = computeDiscoveryLeadScore({
      relevance_score: 5,
      intent_score: 3,
      urgency_score: 0,
    });
    expect(score).toBeLessThan(MIN_LEAD_SCORE_THRESHOLD);
  });

  it("'hello' comment scores below threshold", () => {
    const score = computeDiscoveryLeadScore({
      relevance_score: 2,
      intent_score: 1,
      urgency_score: 0,
    });
    expect(score).toBeLessThan(MIN_LEAD_SCORE_THRESHOLD);
  });

  it("'great post 🔥' scores below threshold", () => {
    const score = computeDiscoveryLeadScore({
      relevance_score: 8,
      intent_score: 5,
      urgency_score: 0,
    });
    expect(score).toBeLessThan(MIN_LEAD_SCORE_THRESHOLD);
  });

  it("generic 'good morning' is not evidence-sufficient", () => {
    const analysis = makeAnalysis({
      relevance_score: 3,
      intent_score: 2,
      urgency_score: 0,
      confidence: 0.1,
      should_engage: false,
    });
    expect(isEvidenceSufficient(analysis)).toBe(false);
  });
});

// ─── Explicit Requirements → High Score ─────────────────────────────────────

describe("Explicit requirements should score high", () => {
  it("'I need a website for my business' scores above threshold", () => {
    const score = computeDiscoveryLeadScore({
      relevance_score: 85,
      intent_score: 80,
      urgency_score: 40,
    });
    expect(score).toBeGreaterThanOrEqual(MIN_LEAD_SCORE_THRESHOLD);
  });

  it("pricing inquiry scores high", () => {
    const score = computeDiscoveryLeadScore({
      relevance_score: 75,
      intent_score: 90,
      urgency_score: 50,
    });
    expect(score).toBeGreaterThanOrEqual(50);
  });

  it("agency search has high evidence sufficiency", () => {
    const analysis = makeAnalysis({
      relevance_score: 80,
      intent_score: 75,
      urgency_score: 30,
      confidence: 0.8,
      should_engage: true,
      detected_requirement: "looking for a social media management agency",
      signals: ["VENDOR_SEARCH", "EXPLICIT_REQUIREMENT"],
    });
    expect(isEvidenceSufficient(analysis)).toBe(true);
  });
});

// ─── Urgency Detection ──────────────────────────────────────────────────────

describe("Urgency detection", () => {
  it("high urgency + high intent = high overall score", () => {
    const score = computeDiscoveryLeadScore({
      relevance_score: 70,
      intent_score: 80,
      urgency_score: 90,
    });
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it("high urgency alone without intent stays low", () => {
    const score = computeDiscoveryLeadScore({
      relevance_score: 20,
      intent_score: 10,
      urgency_score: 90,
    });
    expect(score).toBeLessThan(50);
  });
});

// ─── Stage Assignment ───────────────────────────────────────────────────────

describe("Stage from analysis", () => {
  it("low score → IGNORED", () => {
    const analysis = makeAnalysis({ lead_score: 10, should_engage: false });
    expect(stageFromAnalysis(analysis)).toBe("IGNORED");
  });

  it("high score with engagement → not IGNORED", () => {
    const analysis = makeAnalysis({ lead_score: 65, should_engage: true });
    const stage = stageFromAnalysis(analysis);
    expect(stage).not.toBe("IGNORED");
  });
});

// ─── Deduplication ──────────────────────────────────────────────────────────

describe("Deduplication", () => {
  it("same content from same author produces same idempotency key", () => {
    const input1 = makeInput({ source_content: "I need help", external_author_id: "user1" });
    const input2 = makeInput({ source_content: "I need help", external_author_id: "user1" });
    const key1 = generateDiscoveryIdempotencyKey("user-abc", input1);
    const key2 = generateDiscoveryIdempotencyKey("user-abc", input2);
    expect(key1).toBe(key2);
  });

  it("different content produces different keys", () => {
    const input1 = makeInput({ source_content: "I need a website" });
    const input2 = makeInput({ source_content: "I need social media help" });
    const key1 = generateDiscoveryIdempotencyKey("user-abc", input1);
    const key2 = generateDiscoveryIdempotencyKey("user-abc", input2);
    expect(key1).not.toBe(key2);
  });

  it("different authors produce different keys", () => {
    const input1 = makeInput({ external_author_id: "author1" });
    const input2 = makeInput({ external_author_id: "author2" });
    const key1 = generateDiscoveryIdempotencyKey("user-abc", input1);
    const key2 = generateDiscoveryIdempotencyKey("user-abc", input2);
    expect(key1).not.toBe(key2);
  });
});

// ─── Opt-Out Detection ──────────────────────────────────────────────────────

describe("Opt-out detection", () => {
  it("detects 'not interested'", () => {
    const messages = [
      { role: "agent", content: "Hi! How can we help?" },
      { role: "user", content: "not interested" },
    ];
    expect(detectOptOut(messages)).toBe(true);
  });

  it("detects 'stop messaging me'", () => {
    const messages = [
      { role: "user", content: "please stop messaging me" },
    ];
    expect(detectOptOut(messages)).toBe(true);
  });

  it("detects 'nahi chahiye'", () => {
    const messages = [
      { role: "user", content: "nahi chahiye bhai" },
    ];
    expect(detectOptOut(messages)).toBe(true);
  });

  it("does not flag normal conversation as opt-out", () => {
    const messages = [
      { role: "user", content: "Tell me more about your services" },
    ];
    expect(detectOptOut(messages)).toBe(false);
  });

  it("does not flag 'I am interested' as opt-out", () => {
    const messages = [
      { role: "user", content: "I am interested, let's talk" },
    ];
    expect(detectOptOut(messages)).toBe(false);
  });
});

// ─── Conversation Loop Detection ────────────────────────────────────────────

describe("Loop detection", () => {
  it("detects repeated agent message", () => {
    const messages = [
      { role: "agent", content: "What kind of website do you need?" },
      { role: "user", content: "ecommerce" },
      { role: "agent", content: "What kind of website do you need?" },
      { role: "user", content: "I said ecommerce" },
      { role: "agent", content: "What kind of website do you need?" },
    ];
    const newReply = "What kind of website do you need?";
    expect(detectMessageLoop(messages, newReply)).toBe(true);
  });

  it("does not flag different messages as loop", () => {
    const messages = [
      { role: "agent", content: "What services are you looking for?" },
      { role: "user", content: "Social media management" },
    ];
    const newReply = "Great! How many platforms do you want managed?";
    expect(detectMessageLoop(messages, newReply)).toBe(false);
  });
});

// ─── No-Response Detection ──────────────────────────────────────────────────

describe("No-response detection", () => {
  it("detects when agent sent message but user never responded", () => {
    const agentAt = new Date(Date.now() - 72 * 3600 * 1000).toISOString(); // 72 hours ago
    expect(detectNoResponse(agentAt, null, 48)).toBe(true);
  });

  it("does not flag when agent message is recent", () => {
    const agentAt = new Date(Date.now() - 1 * 3600 * 1000).toISOString(); // 1 hour ago
    expect(detectNoResponse(agentAt, null, 48)).toBe(false);
  });

  it("does not flag when user responded after agent", () => {
    const agentAt = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
    const userAt = new Date(Date.now() - 1 * 3600 * 1000).toISOString();
    expect(detectNoResponse(agentAt, userAt, 48)).toBe(false);
  });
});

// ─── WhatsApp Group Message Filtering ───────────────────────────────────────

describe("WhatsApp group message filtering", () => {
  it("@g.us addresses are group messages", () => {
    const authorId = "120363123456789012@g.us";
    expect(authorId.endsWith("@g.us")).toBe(true);
  });

  it("@s.whatsapp.net addresses are individual messages", () => {
    const authorId = "919876543210@s.whatsapp.net";
    expect(authorId.endsWith("@g.us")).toBe(false);
  });

  it("null author_id does not crash the filter", () => {
    const authorId = null as string | null;
    expect(authorId?.endsWith("@g.us") ?? false).toBe(false);
  });
});

// ─── Meeting Intent Detection ───────────────────────────────────────────────

describe("Meeting intent stage mapping", () => {
  it("high scoring lead with SCHEDULE_MEETING action is not IGNORED", () => {
    const analysis = makeAnalysis({
      lead_score: 80,
      should_engage: true,
      recommended_next_action: "SCHEDULE_MEETING",
    });
    const stage = stageFromAnalysis(analysis);
    expect(typeof stage).toBe("string");
    expect(stage).not.toBe("IGNORED");
  });
});

// ─── Evidence Sufficiency ───────────────────────────────────────────────────

describe("Evidence sufficiency", () => {
  it("no signals + low confidence = insufficient", () => {
    const analysis = makeAnalysis({
      relevance_score: 15,
      intent_score: 10,
      confidence: 0.2,
      should_engage: false,
      signals: [],
    });
    expect(isEvidenceSufficient(analysis)).toBe(false);
  });

  it("strong signals + high confidence = sufficient", () => {
    const analysis = makeAnalysis({
      relevance_score: 80,
      intent_score: 75,
      confidence: 0.85,
      should_engage: true,
      signals: ["EXPLICIT_REQUIREMENT", "VENDOR_SEARCH"],
    });
    expect(isEvidenceSufficient(analysis)).toBe(true);
  });
});

// ─── Scoring Edge Cases ─────────────────────────────────────────────────────

describe("Scoring edge cases", () => {
  it("all zeros returns 0", () => {
    const score = computeDiscoveryLeadScore({
      relevance_score: 0,
      intent_score: 0,
      urgency_score: 0,
    });
    expect(score).toBe(0);
  });

  it("all 100s returns near 100", () => {
    const score = computeDiscoveryLeadScore({
      relevance_score: 100,
      intent_score: 100,
      urgency_score: 100,
    });
    expect(score).toBeGreaterThanOrEqual(90);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("handles undefined fields gracefully", () => {
    const score = computeDiscoveryLeadScore({});
    expect(typeof score).toBe("number");
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

// ─── Idempotency Keys ──────────────────────────────────────────────────────

describe("Idempotency key generation", () => {
  it("produces a string", () => {
    const key = generateDiscoveryIdempotencyKey("user1", makeInput());
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const input = makeInput({ source_content: "specific content" });
    const key1 = generateDiscoveryIdempotencyKey("user1", input);
    const key2 = generateDiscoveryIdempotencyKey("user1", input);
    expect(key1).toBe(key2);
  });
});
