import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { GeminiProvider } from "../gemini";
import { getActiveProvider, resetActiveProviderForTests } from "../index";

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ["GEMINI_API_KEY", "GEMINI_MODEL", "APMIX_API_KEY", "OX_ALPHA_API_KEY", "TOKENHARBOR_API_KEY", "TOKENROUTER_API_KEY", "DEEPSEEK_API_KEY"]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  resetActiveProviderForTests();
  vi.unstubAllGlobals();
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetActiveProviderForTests();
  vi.unstubAllGlobals();
});

describe("gemini fast lane", () => {
  it("throws a clear error without GEMINI_API_KEY", () => {
    expect(() => new GeminiProvider()).toThrow(/GEMINI_API_KEY is not configured/);
  });

  it("defaults to gemini-2.5-flash, honours GEMINI_MODEL", () => {
    process.env.GEMINI_API_KEY = "k";
    expect(new GeminiProvider().model).toBe("gemini-2.5-flash");
    process.env.GEMINI_MODEL = "gemini-3-flash-preview";
    expect(new GeminiProvider().model).toBe("gemini-3-flash-preview");
  });

  it("parses JSON-mode output", async () => {
    process.env.GEMINI_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"intent":"HELP"}' }] } }] }),
      { status: 200 }
    )));
    const out = await new GeminiProvider().completeJson({ system: "s", user: "u" });
    expect(out).toEqual({ intent: "HELP" });
  });

  it("fails fast on 402 (unfunded key never stalls the chain)", async () => {
    process.env.GEMINI_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("credits depleted", { status: 402 })));
    const t0 = Date.now();
    await expect(new GeminiProvider().completeJson({ system: "s", user: "u", timeoutMs: 20_000 })).rejects.toThrow(/402/);
    expect(Date.now() - t0).toBeLessThan(10_000);
  });

  it("chain prefers gemini when key is set", () => {
    process.env.GEMINI_API_KEY = "k";
    process.env.OX_ALPHA_API_KEY = "legacy";
    const p = getActiveProvider();
    expect(p.id === "failover" ? (p as any).model : p.id).toBeDefined();
    // failover chain starts with gemini
    const chain = (p as any).chain ?? [p];
    expect(chain[0].id).toBe("gemini");
  });

  it("chain skips gemini without key (legacy behavior preserved)", () => {
    process.env.OX_ALPHA_API_KEY = "legacy";
    const p = getActiveProvider();
    const chain = (p as any).chain ?? [p];
    expect(chain.some((c: any) => c.id === "gemini")).toBe(false);
  });
});
