import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getActiveProvider, resetActiveProviderForTests } from "@/lib/ai/providers";
import { MiniMaxProvider } from "@/lib/ai/providers/minimax";

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ["OX_ALPHA_API_KEY", "OX_ALPHA_BASE_URL", "OX_ALPHA_MODEL", "DEEPSEEK_API_KEY", "DEEPSEEK_MODEL", "DEEPSEEK_BASE_URL", "MINIMAX_MODEL"]) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  // Default: MiniMax needs an OpenRouter key to authenticate
  process.env.OX_ALPHA_API_KEY = "test-railway-key";
  resetActiveProviderForTests();
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetActiveProviderForTests();
  vi.unstubAllGlobals();
});

describe("provider selection", () => {
  it("always selects MiniMax (no other providers)", () => {
    expect(getActiveProvider().id).toBe("minimax");
  });

  it("selects MiniMax even when Ox Alpha env is set (ignored)", () => {
    process.env.OX_ALPHA_API_KEY = "test-key";
    process.env.OX_ALPHA_BASE_URL = "https://openrouter.ai/api/v1";
    expect(getActiveProvider().id).toBe("minimax");
  });

  it("selects MiniMax even when DeepSeek env is set (ignored)", () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    expect(getActiveProvider().id).toBe("minimax");
  });

  it("throws a clear error when OX_ALPHA_API_KEY is missing (needed for OpenRouter auth)", () => {
    delete process.env.OX_ALPHA_API_KEY;
    resetActiveProviderForTests();
    expect(() => getActiveProvider()).toThrow(/OX_ALPHA_API_KEY is not configured/);
  });
});

describe("endpoint construction", () => {
  it("MiniMax hits the OpenRouter chat completions endpoint", async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MiniMaxProvider({
      OX_ALPHA_API_KEY: "secret-do-not-log",
    } as unknown as NodeJS.ProcessEnv);

    const out = await provider.completeJson({ system: "s", user: "u" });

    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(url).not.toContain("chat/completions/chat/completions");
  });

  it("MiniMax honours MINIMAX_MODEL env override", async () => {
    process.env.MINIMAX_MODEL = "minimax/minimax-m3:free";
    const fetchMock = vi.fn(async (_url: string) =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":1}' } }] }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MiniMaxProvider({
      OX_ALPHA_API_KEY: "k",
      MINIMAX_MODEL: "minimax/minimax-m3:free",
    } as unknown as NodeJS.ProcessEnv);

    await provider.completeJson({ system: "s", user: "u" });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(call[1]?.body ?? "{}"));
    expect(body.model).toBe("minimax/minimax-m3:free");
  });

  it("transport errors include the request URL but never the API key", async () => {
    const fetchMock = vi.fn(async (_url: string) => {
      throw new Error("boom");
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MiniMaxProvider({
      OX_ALPHA_API_KEY: "sk-super-secret-value",
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
