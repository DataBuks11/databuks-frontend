import { describe, expect, it } from "vitest";
import {
  selectFollowUpCandidates,
  FOLLOWUP_DELAY_MS,
  MAX_FOLLOWUPS,
} from "@/lib/ai/outreach/followups";
import type { FollowUpCandidate } from "@/lib/ai/outreach/followups";

const now = Date.now();

function row(overrides: Partial<FollowUpCandidate>): FollowUpCandidate {
  return {
    id: "lead-1",
    user_id: "user-1",
    author_name: "Test Lead",
    author_handle: null,
    detected_requirement: "website",
    lead_score: 80,
    evidence: { contact_details: { phone: "+91 98765 43210" } },
    total_messages: 1,
    last_message_at: new Date(now - 100 * 3600 * 1000).toISOString(),
    ...overrides,
  };
}

describe("selectFollowUpCandidates", () => {
  it("picks leads overdue for a follow-up", () => {
    const due = row({});
    const out = selectFollowUpCandidates([due], now);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("lead-1");
  });

  it("skips leads contacted recently (within cooldown)", () => {
    const recent = row({ last_message_at: new Date(now - 24 * 3600 * 1000).toISOString() });
    expect(selectFollowUpCandidates([recent], now)).toHaveLength(0);
  });

  it("skips leads without last_message_at", () => {
    expect(selectFollowUpCandidates([row({ last_message_at: null })], now)).toHaveLength(0);
  });

  it("skips leads at max follow-ups", () => {
    const maxed = row({ total_messages: MAX_FOLLOWUPS });
    expect(selectFollowUpCandidates([maxed], now)).toHaveLength(0);
  });

  it("respects the exact delay boundary", () => {
    const atBoundary = row({ last_message_at: new Date(now - FOLLOWUP_DELAY_MS).toISOString() });
    expect(selectFollowUpCandidates([atBoundary], now)).toHaveLength(1);
  });
});