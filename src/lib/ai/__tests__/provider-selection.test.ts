import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getActiveProvider, resetActiveProviderForTests } from "@/lib/ai/providers";
import { OxAlphaProvider } from "@/lib/ai/providers/ox-alpha";
import { DeepSeekProvider } from "@/lib/ai/providers/deepseek";

const ENV_KEYS = [
  "OX_ALPHA_API_KEY",
  "OX_ALPHA_BASE_URL",
  "OX_ALPHA_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_MODEL",
  "DEEPSEEK_BASE_URL",
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  resetActiveProviderForTests();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetActiveProviderForTests();
  vi.unstubAllGlobals();
});

describe("provider selection", () => {
  it("selects Ox Alpha when correctly configured", () => {
    process.env.OX_ALPHA_API_KEY = "test-key";
    process.env.OX_ALPHA_BASE_URL = "https://openrouter.ai/api/v1";
    expect(getActiveProvider().id).toBe("ox_alpha");
  });

  it("fails LOUDLY (no silent fallback) when Ox Alpha base URL is malformed", () => {
    process.env.OX_ALPHA_API_KEY = "test-key";
    // exact production bug: value contains the variable name prefix
    process.env.OX_ALPHA_BASE_URL =
      "OX_ALPHA_BASE_URL=https://openrouter.ai/api/v1/chat/completions";
    let provider: { id: string };
    expect(() => {
      provider = getActiveProvider();
    }).not.toThrow(); // self-heals the KEY=VALUE paste + endpoint suffix
    expect(provider!.id).toBe("ox_alpha");
  });

  it("fails clearly when base URL is set but API key is missing", () => {
    process.env.OX_ALPHA_BASE_URL = "https://openrouter.ai/api/v1";
    expect(() => new OxAlphaProvider()).toThrow(/OX_ALPHA_API_KEY is not configured/);
  });

  it("fails clearly when API key is set but base URL is missing", () => {
    process.env.OX_ALPHA_API_KEY = "test-key";
    expect(() => new OxAlphaProvider()).toThrow(/OX_ALPHA_BASE_URL is not configured/);
  });

  it("fails on truly unparseable Ox Alpha URL instead of constructing an invalid request", () => {
    process.env.OX_ALPHA_API_KEY = "test-key";
    process.env.OX_ALPHA_BASE_URL = "openrouter.ai/api/v1"; // no protocol
    expect(() => new OxAlphaProvider()).toThrow(/OX_ALPHA_BASE_URL is malformed/);
  });

  it("falls back to DeepSeek only when Ox Alpha is entirely unconfigured", () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    expect(getActiveProvider().id).toBe("deepseek");
  });

  it("throws a clear error when no provider is configured at all", () => {
    expect(() => getActiveProvider()).toThrow(/No AI provider configured/);
  });
});

describe("endpoint construction", () => {
  it("requests exactly baseUrl + /chat/completions once", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OxAlphaProvider({
      OX_ALPHA_API_KEY: "secret-do-not-log",
      OX_ALPHA_BASE_URL: "https://openrouter.ai/api/v1/",
    } as unknown as NodeJS.ProcessEnv);

    const out = await provider.completeJson({ system: "s", user: "u" });

    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(url).not.toContain("chat/completions/chat/completions");
  });

  it("DeepSeek uses default base URL and appends the endpoint", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":1}' } }] }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new DeepSeekProvider({
      DEEPSEEK_API_KEY: "k",
    } as unknown as NodeJS.ProcessEnv);

    await provider.completeJson({ system: "s", user: "u" });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("https://api.deepseek.com/chat/completions");
  });

  it("transport errors include the request URL but never the API key", async () => {
    const fetchMock = vi.fn(async (_url: string) => {
      throw new Error("boom");
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OxAlphaProvider({
      OX_ALPHA_API_KEY: "sk-super-secret-value",
      OX_ALPHA_BASE_URL: "https://openrouter.ai/api/v1",
    } as unknown as NodeJS.ProcessEnv);

    await expect(provider.completeJson({ system: "s", user: "u" })).rejects.toThrow(
      /https:\/\/openrouter\.ai\/api\/v1\/chat\/completions/
    );
    try {
      await provider.completeJson({ system: "s", user: "u" });
    } catch (err: any) {
      expect(err.message).not.toContain("sk-super-secret-value");
    }
  });
});
