import { describe, expect, it } from "vitest";
import { evaluateRules, evaluateRule } from "@/lib/ai/rules";
import type { RuleContext } from "@/lib/ai/rules";

const baseLead = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Jane Founder",
  company: "Acme Corp",
  email: "jane@acme.com",
  phone: null,
  industry: "SaaS",
  funnel_stage: "OUTREACH_READY",
  opted_out: false,
};

const baseIntelligence = {
  icp_fit_score: 92,
  intent_score: 95,
  urgency_score: 88,
  buying_signal_score: 91,
  confidence: 0.91,
  evidence: [{ source: "website", signal: "new_service" }],
  why_now: "Business recently launched a new service",
};

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    lead: baseLead,
    intelligence: baseIntelligence,
    channel: "email",
    message: "Hi Jane, quick intro to our platform.",
    ...overrides,
  };
}

describe("rule engine", () => {
  it("passes when all threshold rules are satisfied", () => {
    const result = evaluateRules(["LEAD_001", "LEAD_002", "LEAD_003", "LEAD_005", "LEAD_006", "LEAD_008"], ctx());
    expect(result.allowed).toBe(true);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("fails LEAD_001 when ICP fit is below threshold", () => {
    const result = evaluateRules(["LEAD_001"], ctx({ intelligence: { ...baseIntelligence, icp_fit_score: 30 } }));
    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("LEAD_001");
  });

  it("fails LEAD_002 when business information is missing", () => {
    const result = evaluateRules(["LEAD_002"], ctx({ lead: { ...baseLead, company: null, industry: null } }));
    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("LEAD_002");
  });

  it("fails LEAD_003 when no contact channel exists", () => {
    const result = evaluateRules(["LEAD_003"], ctx({ lead: { ...baseLead, email: null, phone: null } }));
    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("LEAD_003");
  });

  it("fails LEAD_005 when intent below minimum", () => {
    const result = evaluateRules(["LEAD_005"], ctx({ intelligence: { ...baseIntelligence, intent_score: 20 } }));
    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("LEAD_005");
  });

  it("fails LEAD_006 when urgency below minimum", () => {
    const result = evaluateRules(["LEAD_006"], ctx({ intelligence: { ...baseIntelligence, urgency_score: 10 } }));
    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("LEAD_006");
  });

  it("LEAD_007 requires evidence and why_now for high intent", () => {
    const highIntent = { ...baseIntelligence, intent_score: 90 };
    const noEvidence = evaluateRules(["LEAD_007"], ctx({ intelligence: { ...highIntent, evidence: [], why_now: null } }));
    expect(noEvidence.allowed).toBe(false);
    expect(noEvidence.ruleId).toBe("LEAD_007");

    const withEvidence = evaluateRules(["LEAD_007"], ctx({ intelligence: highIntent }));
    expect(withEvidence.allowed).toBe(true);

    const lowIntent = evaluateRules(["LEAD_007"], ctx({ intelligence: { ...highIntent, intent_score: 50, evidence: [], why_now: null } }));
    expect(lowIntent.allowed).toBe(true);
  });

  it("fails LEAD_008 when confidence below minimum", () => {
    const result = evaluateRules(["LEAD_008"], ctx({ intelligence: { ...baseIntelligence, confidence: 0.3 } }));
    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("LEAD_008");
  });

  it("fails LEAD_010 when lead opted out", () => {
    const result = evaluateRules(["LEAD_010"], ctx({ lead: { ...baseLead, opted_out: true } }));
    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("LEAD_010");
  });

  it("fails LEAD_011 when outreach within duplicate window", () => {
    const recent = new Date(Date.now() - 1000 * 60 * 5).toISOString();
    const result = evaluateRules(["LEAD_011"], ctx({ lastOutreachAt: recent }));
    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("LEAD_011");

    const old = new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString();
    expect(evaluateRules(["LEAD_011"], ctx({ lastOutreachAt: old })).allowed).toBe(true);
    expect(evaluateRules(["LEAD_011"], ctx({ lastOutreachAt: null })).allowed).toBe(true);
  });

  it("fails LEAD_013 when lead not in OUTREACH_READY for outreach", () => {
    const result = evaluateRules(["LEAD_013"], ctx({ lead: { ...baseLead, funnel_stage: "QUALIFIED" }, actionType: "outreach" }));
    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("LEAD_013");

    expect(evaluateRules(["LEAD_013"], ctx({ actionType: "outreach" })).allowed).toBe(true);
  });

  it("fails LEAD_013 when lead not in MEETING_INTENT for booking", () => {
    const result = evaluateRules(["LEAD_013"], ctx({ lead: { ...baseLead, funnel_stage: "CONVERSATION" }, actionType: "meeting_booking" }));
    expect(result.allowed).toBe(false);
  });

  it("fails LEAD_014 when meeting intent not confirmed", () => {
    const result = evaluateRules(["LEAD_014"], ctx({ meetingIntent: false }));
    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("LEAD_014");

    expect(evaluateRules(["LEAD_014"], ctx({ meetingIntent: true })).allowed).toBe(true);
  });

  it("fails LEAD_015 when scheduling information invalid", () => {
    const past = new Date(Date.now() - 1000 * 60 * 60).toISOString();
    expect(evaluateRules(["LEAD_015"], ctx({ scheduledAt: past, durationMinutes: 30 })).allowed).toBe(false);
    expect(evaluateRules(["LEAD_015"], ctx({ scheduledAt: null, durationMinutes: 30 })).allowed).toBe(false);

    const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    expect(evaluateRules(["LEAD_015"], ctx({ scheduledAt: future, durationMinutes: 30 })).allowed).toBe(true);
    expect(evaluateRules(["LEAD_015"], ctx({ scheduledAt: future, durationMinutes: 0 })).allowed).toBe(false);
  });

  it("fails LEAD_017 when daily outreach limit reached", () => {
    const result = evaluateRules(["LEAD_017"], ctx({ outreachCountInWindow: 20 }));
    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("LEAD_017");

    expect(evaluateRules(["LEAD_017"], ctx({ outreachCountInWindow: 19 })).allowed).toBe(true);
  });

  it("fails LEAD_018 on unsupported claims", () => {
    const result = evaluateRules(["LEAD_018"], ctx({ message: "We guarantee you will get 5 clients" }));
    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("LEAD_018");

    expect(evaluateRules(["LEAD_018"], ctx({ message: "Happy to walk you through how it works." })).allowed).toBe(true);
  });

  it("fails LEAD_019 on unverifiable social-proof numbers", () => {
    const result = evaluateRules(["LEAD_019"], ctx({ message: "We have 500+ clients worldwide" }));
    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("LEAD_019");

    const allowed = evaluateRules(["LEAD_019"], ctx({
      message: "We have 500+ clients worldwide",
      businessContext: { constraints: { allowed_claims: ["500+ clients"] } },
    }));
    expect(allowed.allowed).toBe(true);
  });

  it("fails LEAD_020 when meeting intent lacks evidence", () => {
    const result = evaluateRules(["LEAD_020"], ctx({ meetingIntent: true, meetingIntentEvidence: [] }));
    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("LEAD_020");

    const withEvidence = evaluateRules(["LEAD_020"], ctx({
      meetingIntent: true,
      meetingIntentEvidence: [{ source: "conversation", signal: "requested_call" }],
    }));
    expect(withEvidence.allowed).toBe(true);

    expect(evaluateRules(["LEAD_020"], ctx({ meetingIntent: false, meetingIntentEvidence: [] })).allowed).toBe(true);
  });

  it("reports unknown rules as failed", () => {
    const result = evaluateRule("DOES_NOT_EXIST", ctx());
    expect(result.passed).toBe(false);
  });

  it("returns first failing rule deterministically", () => {
    const result = evaluateRules(["LEAD_001", "LEAD_002", "LEAD_008"], ctx({
      intelligence: { ...baseIntelligence, icp_fit_score: 10 },
    }));
    expect(result.ruleId).toBe("LEAD_001");
  });
});
