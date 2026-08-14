import { describe, expect, it } from "vitest";
import { qualificationSchema, outreachSchema, meetingIntentSchema, replyAnalysisSchema } from "@/lib/ai/schemas";

const validQualification = {
  task: "lead_qualification",
  lead_id: "11111111-1111-1111-1111-111111111111",
  decision: "qualified",
  scores: {
    icp_fit: 92,
    intent: 95,
    urgency: 88,
    buying_signal: 91,
    problem_severity: 84,
    timing: 90,
    reachability: 94,
    evidence_quality: 89,
  },
  confidence: 0.91,
  why_now: "Launched a new service recently",
  evidence: [{ source: "website", signal: "new_service" }],
  recommended_channel: "email",
  recommended_action: "send intro",
};

describe("strict AI schemas", () => {
  it("accepts valid qualification output", () => {
    expect(qualificationSchema.safeParse(validQualification).success).toBe(true);
  });

  it("rejects malformed LLM JSON (missing fields)", () => {
    expect(qualificationSchema.safeParse({ task: "lead_qualification" }).success).toBe(false);
  });

  it("rejects invalid enum decision", () => {
    expect(
      qualificationSchema.safeParse({ ...validQualification, decision: "maybe" }).success
    ).toBe(false);
  });

  it("rejects out-of-range scores", () => {
    const bad = {
      ...validQualification,
      scores: { ...validQualification.scores, intent: 150 },
    };
    expect(qualificationSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects confidence outside 0-1", () => {
    expect(qualificationSchema.safeParse({ ...validQualification, confidence: 1.4 }).success).toBe(false);
    expect(qualificationSchema.safeParse({ ...validQualification, confidence: -0.2 }).success).toBe(false);
  });

  it("rejects evidence without valid source enum", () => {
    const bad = {
      ...validQualification,
      evidence: [{ source: "my_mind", signal: "vibes" }],
    };
    expect(qualificationSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects extra unknown fields (strict)", () => {
    expect(qualificationSchema.safeParse({ ...validQualification, hallucinated_field: true }).success).toBe(false);
  });

  it("accepts valid meeting intent output", () => {
    const valid = {
      task: "meeting_intent_detection",
      conversation_id: "11111111-1111-1111-1111-111111111111",
      meeting_intent: true,
      confidence: 0.85,
      evidence: [{ source: "conversation", signal: "requested_call" }],
      suggested_next_step: "share availability",
    };
    expect(meetingIntentSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects meeting intent with false but missing evidence is allowed, missing confidence is not", () => {
    const noConfidence = {
      task: "meeting_intent_detection",
      conversation_id: "11111111-1111-1111-1111-111111111111",
      meeting_intent: false,
      evidence: [],
      suggested_next_step: null,
    };
    expect(meetingIntentSchema.safeParse(noConfidence).success).toBe(false);
  });

  it("accepts valid outreach output and rejects empty body", () => {
    const valid = {
      task: "outreach_generation",
      lead_id: "11111111-1111-1111-1111-111111111111",
      channel: "email",
      subject: null,
      body: "Hi Jane, quick intro.",
      personalization_refs: ["launched new service"],
      call_to_action: "Reply if interested",
      tone: "friendly",
      claims: [],
    };
    expect(outreachSchema.safeParse(valid).success).toBe(true);
    expect(outreachSchema.safeParse({ ...valid, body: "" }).success).toBe(false);
    expect(outreachSchema.safeParse({ ...valid, channel: "fax" }).success).toBe(false);
  });

  it("accepts valid reply analysis output", () => {
    const valid = {
      task: "reply_analysis",
      conversation_id: "11111111-1111-1111-1111-111111111111",
      sentiment: "positive",
      intent_score: 80,
      buying_signal_score: 70,
      objections: [],
      questions: ["How does pricing work?"],
      reply_required: true,
      suggested_reply: "Happy to explain pricing.",
      meeting_intent: false,
      meeting_intent_evidence: [],
      confidence: 0.9,
    };
    expect(replyAnalysisSchema.safeParse(valid).success).toBe(true);
  });
});
