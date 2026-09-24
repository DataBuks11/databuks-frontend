import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ApmixProvider } from "../apmix";

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ["APMIX_API_KEY", "APMIX_MODEL", "APMIX_BASE_URL"]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  process.env.APMIX_API_KEY = "test-apmix-key";
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("apmix provider model selection", () => {
  it("defaults to the free DeepSeek V4.1 Flash model", () => {
    const p = new ApmixProvider();
    expect(p.id).toBe("apmix");
    expect(p.model).toBe("deepseek-v4.1-flash-free");
  });

  it("honours APMIX_MODEL override (e.g. xai/grok-4.7 on paid plans)", () => {
    process.env.APMIX_MODEL = "xai/grok-4.7";
    const p = new ApmixProvider();
    expect(p.model).toBe("xai/grok-4.7");
  });

  it("throws a clear error without APMIX_API_KEY", () => {
    delete process.env.APMIX_API_KEY;
    expect(() => new ApmixProvider()).toThrow(/APMIX_API_KEY is not configured/);
  });
});
