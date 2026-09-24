import { describe, expect, it } from "vitest";
import { buildEvidenceBlock } from "../multi-channel";

const cand = (evidence: any) => ({
  detected_requirement: "SERVICE_REQUIRED",
  business_context_match: "restaurant",
  evidence,
});

describe("outreach evidence block", () => {
  it("injects opportunities with evidence (no invention surface)", () => {
    const b = buildEvidenceBlock(cand({
      why_this_lead: {
        requirement_evidence: { reason: "explicit service requirement found" },
        opportunities: [
          { type: "WEBSITE_GAP", strength: "HIGH", reason: "no working website", evidence: ["No website discovered across sources"] },
        ],
        primary_opportunity: { type: "WEBSITE_GAP" },
      },
    }));
    expect(b).toMatch(/WEBSITE_GAP/);
    expect(b).toMatch(/No website discovered/);
    expect(b).toMatch(/restaurant/);
  });

  it("falls back to thin-evidence honesty line when empty", () => {
    const b = buildEvidenceBlock({
      detected_requirement: null,
      business_context_match: null,
      evidence: null,
    });
    expect(b).toMatch(/thin evidence/);
    expect(b).toMatch(/do not invent/);
  });
});
