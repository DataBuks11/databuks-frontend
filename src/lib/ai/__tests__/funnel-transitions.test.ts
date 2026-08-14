import { describe, expect, it } from "vitest";
import { canTransition, FUNNEL_TRANSITIONS } from "@/lib/ai/funnel/transitions";
import { normalizeFunnelStage, isFunnelStage } from "@/lib/ai/funnel/stages";

describe("funnel state machine", () => {
  it("allows a valid full happy-path progression", () => {
    const path = [
      "DISCOVERED",
      "ENRICHED",
      "QUALIFIED",
      "PRIORITIZED",
      "OUTREACH_READY",
      "CONTACTED",
      "CONVERSATION",
      "MEETING_INTENT",
      "MEETING_BOOKED",
      "MEETING_HELD",
      "WON",
    ] as const;
    for (let i = 0; i < path.length - 1; i++) {
      const decision = canTransition(path[i], path[i + 1]);
      expect(decision.allowed, `${path[i]} -> ${path[i + 1]}`).toBe(true);
    }
  });

  it("rejects arbitrary jumps", () => {
    expect(canTransition("DISCOVERED", "MEETING_BOOKED").allowed).toBe(false);
    expect(canTransition("DISCOVERED", "QUALIFIED").allowed).toBe(false);
    expect(canTransition("QUALIFIED", "CONVERSATION").allowed).toBe(false);
    expect(canTransition("CONTACTED", "MEETING_BOOKED").allowed).toBe(false);
  });

  it("returns FUNNEL_001 rule id for invalid transitions", () => {
    const decision = canTransition("DISCOVERED", "WON");
    expect(decision.allowed).toBe(false);
    expect(decision.ruleId).toBe("FUNNEL_001");
  });

  it("allows LOST -> DISCOVERED re-entry", () => {
    expect(canTransition("LOST", "DISCOVERED").allowed).toBe(true);
  });

  it("WON is terminal", () => {
    expect(FUNNEL_TRANSITIONS.WON).toEqual([]);
    expect(canTransition("WON", "LOST").allowed).toBe(false);
  });

  it("treats same-stage as allowed no-op", () => {
    const decision = canTransition("QUALIFIED", "QUALIFIED");
    expect(decision.allowed).toBe(true);
  });

  it("normalizes legacy status values", () => {
    expect(normalizeFunnelStage("new")).toBe("DISCOVERED");
    expect(normalizeFunnelStage("contacted")).toBe("CONTACTED");
    expect(normalizeFunnelStage("converted")).toBe("WON");
    expect(normalizeFunnelStage("lost")).toBe("LOST");
    expect(normalizeFunnelStage("QUALIFIED")).toBe("QUALIFIED");
    expect(normalizeFunnelStage(null)).toBe("DISCOVERED");
    expect(normalizeFunnelStage("garbage")).toBe("DISCOVERED");
  });

  it("validates stage names", () => {
    expect(isFunnelStage("DISCOVERED")).toBe(true);
    expect(isFunnelStage("MEETING_BOOKED")).toBe(true);
    expect(isFunnelStage("not_a_stage")).toBe(false);
    expect(isFunnelStage(42)).toBe(false);
  });
});
