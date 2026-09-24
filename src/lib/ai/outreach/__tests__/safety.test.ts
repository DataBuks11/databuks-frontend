import { describe, expect, it, vi, afterEach } from "vitest";
import { checkOutreachSafety, dailyCap, minIntervalSec, jitteredDelayMs } from "../safety";

function stubSupabase(rows: any[] = [], error: any = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => ({
              order: () => ({
                limit: async () => ({ data: rows, error }),
              }),
            }),
          }),
        }),
      }),
    }),
  };
}

afterEach(() => {
  delete process.env.OUTREACH_DAILY_CAP;
  delete process.env.OUTREACH_MIN_INTERVAL_S;
  vi.unstubAllEnvs?.();
});

describe("outreach safety gate", () => {
  it("allows when no sends today", async () => {
    const r = await checkOutreachSafety(stubSupabase([]), "u1");
    expect(r.allowed).toBe(true);
    expect(r.reason).toBeNull();
  });

  it("blocks at daily cap (default 20)", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      id: `e${i}`,
      created_at: new Date(Date.now() - (i + 5) * 3600_000).toISOString(),
    }));
    const r = await checkOutreachSafety(stubSupabase(rows), "u1");
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/daily outreach cap/);
  });

  it("respects OUTREACH_DAILY_CAP env", async () => {
    process.env.OUTREACH_DAILY_CAP = "2";
    expect(dailyCap()).toBe(2);
    const rows = [
      { id: "a", created_at: new Date(Date.now() - 4 * 3600_000).toISOString() },
      { id: "b", created_at: new Date(Date.now() - 5 * 3600_000).toISOString() },
    ];
    const r = await checkOutreachSafety(stubSupabase(rows), "u1");
    expect(r.allowed).toBe(false);
  });

  it("enforces min interval between sends", async () => {
    process.env.OUTREACH_MIN_INTERVAL_S = "90";
    expect(minIntervalSec()).toBe(90);
    const rows = [{ id: "a", created_at: new Date(Date.now() - 10_000).toISOString() }];
    const r = await checkOutreachSafety(stubSupabase(rows), "u1");
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/min send interval/);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it("allows after interval elapsed", async () => {
    process.env.OUTREACH_MIN_INTERVAL_S = "90";
    const rows = [{ id: "a", created_at: new Date(Date.now() - 200_000).toISOString() }];
    const r = await checkOutreachSafety(stubSupabase(rows), "u1");
    expect(r.allowed).toBe(true);
  });

  it("fails closed when DB unreadable", async () => {
    const r = await checkOutreachSafety(stubSupabase([], new Error("boom")), "u1");
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/failing closed/);
  });

  it("jitteredDelayMs stays within [base, base+jitter]", () => {
    for (let i = 0; i < 50; i++) {
      const d = jitteredDelayMs(1000, 500);
      expect(d).toBeGreaterThanOrEqual(1000);
      expect(d).toBeLessThanOrEqual(1500);
    }
  });
});
