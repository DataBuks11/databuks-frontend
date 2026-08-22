import { describe, expect, it } from "vitest";
import {
  CHAT_COMPLETIONS_PATH,
  describeBaseUrlError,
  resolveBaseUrl,
} from "@/lib/ai/providers/base-url";

describe("resolveBaseUrl", () => {
  it("1. accepts a correct base URL", () => {
    const res = resolveBaseUrl("https://openrouter.ai/api/v1");
    expect(res.ok).toBe(true);
    expect(res.url).toBe("https://openrouter.ai/api/v1");
  });

  it("2. builds correct endpoint (provider appends path exactly once)", () => {
    const res = resolveBaseUrl("https://openrouter.ai/api/v1");
    expect(res.ok).toBe(true);
    expect(`${res.url}${CHAT_COMPLETIONS_PATH}`).toBe(
      "https://openrouter.ai/api/v1/chat/completions"
    );
  });

  it("3. heals a malformed KEY=VALUE paste (the production bug)", () => {
    const res = resolveBaseUrl("OX_ALPHA_BASE_URL=https://openrouter.ai/api/v1");
    expect(res.ok).toBe(true);
    expect(res.url).toBe("https://openrouter.ai/api/v1");
    // never leaks into the request URL
    expect(res.url).not.toContain("OX_ALPHA_BASE_URL=");
  });

  it("4. strips a trailing slash", () => {
    const res = resolveBaseUrl("https://openrouter.ai/api/v1/");
    expect(res.ok).toBe(true);
    expect(res.url).toBe("https://openrouter.ai/api/v1");
  });

  it("5. keeps a base URL without trailing slash unchanged", () => {
    const res = resolveBaseUrl("https://api.deepseek.com");
    expect(res.ok).toBe(true);
    expect(res.url).toBe("https://api.deepseek.com");
  });

  it("6. strips an accidental /chat/completions suffix from the base URL", () => {
    const res = resolveBaseUrl("https://openrouter.ai/api/v1/chat/completions");
    expect(res.ok).toBe(true);
    expect(res.url).toBe("https://openrouter.ai/api/v1");
    expect(`${res.url}${CHAT_COMPLETIONS_PATH}`).toBe(
      "https://openrouter.ai/api/v1/chat/completions"
    );
  });

  it("7. rejects an invalid/unparseable URL", () => {
    const res = resolveBaseUrl("http://");
    expect(res.ok).toBe(false);
    expect(describeBaseUrlError(res, "OX_ALPHA_BASE_URL")).toContain("OX_ALPHA_BASE_URL is malformed");
  });

  it("8. rejects a value without http/https protocol", () => {
    const res = resolveBaseUrl("openrouter.ai/api/v1");
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("missing_protocol");
  });

  it("9. empty env falls back to defaultUrl when provided, fails otherwise", () => {
    const fallback = resolveBaseUrl("", { defaultUrl: "https://api.deepseek.com" });
    expect(fallback.ok).toBe(true);
    expect(fallback.url).toBe("https://api.deepseek.com");

    const none = resolveBaseUrl(undefined);
    expect(none.ok).toBe(false);
    expect(none.errorCode).toBe("missing");
  });

  it("10. quotes, whitespace and duplicate slashes are normalized", () => {
    const quoted = resolveBaseUrl('  "https://openrouter.ai/api/v1"  ');
    expect(quoted.ok).toBe(true);
    expect(quoted.url).toBe("https://openrouter.ai/api/v1");

    const dup = resolveBaseUrl("https://openrouter.ai//api//v1");
    expect(dup.ok).toBe(true);
    expect(dup.url).toBe("https://openrouter.ai/api/v1");
  });

  it("rejects non-http protocols like ftp", () => {
    const res = resolveBaseUrl("ftp://files.example.com");
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("invalid_protocol");
  });

  it("does not mangle URLs containing '=' (query strings)", () => {
    const res = resolveBaseUrl("https://proxy.example.com/v1?route=openai");
    expect(res.ok).toBe(true);
    expect(res.url).toContain("?route=openai");
  });

  it("KEY=VALUE healing requires an env-var-shaped prefix", () => {
    // lowercase prefix is not an env var name -> treated as part of URL -> unparseable
    const res = resolveBaseUrl("somekey=https://x.test");
    expect(res.ok).toBe(false);

    // uppercase env-var prefix with garbage remainder -> explicit malformed code
    const bad = resolveBaseUrl("OX_ALPHA_BASE_URL=not-a-url");
    expect(bad.ok).toBe(false);
    expect(["unparseable_url", "missing_protocol"]).toContain(bad.errorCode);
  });
});
