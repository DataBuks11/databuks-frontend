import { describe, expect, it } from "vitest";
import { shouldSyncContext } from "../website-scanner/scanner";

describe("profile-anchored context sync", () => {
  it("syncs on first run even without profile website", () => {
    const r = shouldSyncContext("https://anything.com/", null, false);
    expect(r.sync).toBe(true);
  });

  it("syncs when scanned domain matches profile website", () => {
    expect(shouldSyncContext("https://databuks.org/pricing", "databuks.org", true).sync).toBe(true);
    expect(shouldSyncContext("https://www.databuks.org/", "https://databuks.org", true).sync).toBe(true);
  });

  it("does NOT sync a prospect scan over a curated profile", () => {
    const r = shouldSyncContext("https://allrightdental.com/", "databuks.org", true);
    expect(r.sync).toBe(false);
    expect(r.reason).toMatch(/prospect scan/);
  });

  it("does NOT sync when no profile website is set (safe default)", () => {
    const r = shouldSyncContext("https://unknown-biz.com/", null, true);
    expect(r.sync).toBe(false);
  });

  it("handles garbage input without throwing", () => {
    expect(shouldSyncContext("not a url", "databuks.org", true).sync).toBe(false);
    expect(shouldSyncContext(null, null, false).sync).toBe(true);
  });
});
