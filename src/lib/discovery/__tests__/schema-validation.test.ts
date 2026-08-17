/**
 * Schema Validation Tests
 * Tests for the new discoveryAnalysisSchema and nurtureReplySchema.
 */
import { describe, it, expect } from "vitest";
import { discoveryAnalysisSchema, nurtureReplySchema } from "../../ai/schemas";

describe("discoveryAnalysisSchema", () => {
  const valid = {
    task: "discovery_analysis",
    relevance_score: 70,
    intent: "SERVICE_INTEREST",
    intent_score: 65,
    urgency_score: 40,
    lead_score: 60,
    confidence: 0.85,
    detected_requirement: "Needs a new website for their restaurant",
    business_context_match: "Web development services match",
    signals: ["EXPLICIT_REQUIREMENT", "SERVICE_REQUIREMENT"],
    evidence: [
      { source: "conversation", signal: "explicit_need", quote: "I need a new website" },
    ],
    should_engage: true,
    recommended_next_action: "CREATE_LEAD",
    reason: "Direct service match with explicit web development need",
  };

  it("accepts valid discovery analysis", () => {
    const result = discoveryAnalysisSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects missing task field", () => {
    const { task, ...rest } = valid;
    const result = discoveryAnalysisSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects wrong task literal", () => {
    const result = discoveryAnalysisSchema.safeParse({ ...valid, task: "wrong" });
    expect(result.success).toBe(false);
  });

  it("rejects score out of range", () => {
    const result = discoveryAnalysisSchema.safeParse({ ...valid, relevance_score: 150 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid intent enum", () => {
    const result = discoveryAnalysisSchema.safeParse({ ...valid, intent: "INVALID" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid recommended_next_action", () => {
    const result = discoveryAnalysisSchema.safeParse({ ...valid, recommended_next_action: "DO_SOMETHING" });
    expect(result.success).toBe(false);
  });

  it("allows null detected_requirement", () => {
    const result = discoveryAnalysisSchema.safeParse({ ...valid, detected_requirement: null });
    expect(result.success).toBe(true);
  });

  it("rejects extra fields (strict mode)", () => {
    const result = discoveryAnalysisSchema.safeParse({ ...valid, extra_field: "bad" });
    expect(result.success).toBe(false);
  });
});

describe("nurtureReplySchema", () => {
  const valid = {
    task: "nurture_reply",
    reply: "Hi! I noticed you mentioned needing web development help. What kind of project do you have in mind?",
    language: "english",
    tone: "friendly",
    meeting_intent_detected: false,
    interest_confirmed: false,
    prospect_disinterested: false,
    needs_clarification: true,
    ask_one_question: "What kind of project do you have in mind?",
    used_business_fact: null,
    escalation_required: false,
    conversation_stage_suggestion: "CONVERSATION",
    close_reason: null,
    confidence: 0.9,
  };

  it("accepts valid nurture reply", () => {
    const result = nurtureReplySchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects empty reply", () => {
    const result = nurtureReplySchema.safeParse({ ...valid, reply: "" });
    expect(result.success).toBe(false);
  });

  it("rejects wrong task literal", () => {
    const result = nurtureReplySchema.safeParse({ ...valid, task: "wrong_task" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid conversation_stage_suggestion", () => {
    const result = nurtureReplySchema.safeParse({ ...valid, conversation_stage_suggestion: "INVALID" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid language enum", () => {
    const result = nurtureReplySchema.safeParse({ ...valid, language: "french" });
    expect(result.success).toBe(false);
  });

  it("accepts meeting intent detection", () => {
    const result = nurtureReplySchema.safeParse({
      ...valid,
      meeting_intent_detected: true,
      conversation_stage_suggestion: "MEETING_INTENT",
    });
    expect(result.success).toBe(true);
  });

  it("accepts prospect disinterest with close reason", () => {
    const result = nurtureReplySchema.safeParse({
      ...valid,
      prospect_disinterested: true,
      conversation_stage_suggestion: "CLOSED",
      close_reason: "Prospect said not interested",
    });
    expect(result.success).toBe(true);
  });

  it("rejects extra fields (strict mode)", () => {
    const result = nurtureReplySchema.safeParse({ ...valid, extra: "bad" });
    expect(result.success).toBe(false);
  });
});
