/**
 * Shared OpenAI-compatible provider plumbing.
 *
 * Centralizes:
 * - Base URL resolution/normalization with deterministic validation
 * - The chat-completions JSON request used by every provider
 *
 * Every AI workflow must go through the provider layer; no parallel
 * LLM implementations are allowed.
 */

export const CHAT_COMPLETIONS_PATH = "/chat/completions";

export type BaseUrlErrorCode =
  | "missing"
  | "malformed_key_value_pair"
  | "missing_protocol"
  | "unparseable_url"
  | "invalid_protocol"
  | "missing_hostname"
  | "empty_after_normalization";

export interface BaseUrlResolution {
  ok: boolean;
  url: string | null;
  errorCode?: BaseUrlErrorCode;
  /** protocol + host + path only — safe to log, never contains credentials */
  sanitizedPreview: string | null;
}

const ENDPOINT_SUFFIX_RE = /\/chat\/completions\/?$/i;

function stripWrappingQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1).trim();
    }
  }
  return value;
}

/**
 * Detects an env-var-name prefix accidentally baked into the value,
 * e.g. OX_ALPHA_BASE_URL="OX_ALPHA_BASE_URL=https://openrouter.ai/api/v1".
 * Only strips when the prefix is a plausible env var name (A-Z, 0-9, _)
 * so legitimate URLs containing "=" (query strings) are never touched.
 */
function looksLikeEnvVarName(candidate: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(candidate) && candidate.includes("_");
}

function sanitizePreview(url: URL): string {
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/{2,}/g, "/")}`;
}

function finish(url: URL): BaseUrlResolution {
  const cleaned = url.toString().replace(/\/+$/, "");
  return { ok: true, url: cleaned, sanitizedPreview: sanitizePreview(url) };
}

function fail(errorCode: BaseUrlErrorCode, url: URL | null): BaseUrlResolution {
  return {
    ok: false,
    url: null,
    errorCode,
    sanitizedPreview: url ? sanitizePreview(url) : null,
  };
}

/**
 * Resolve and validate a base URL from an environment value.
 *
 * Guarantees for a successful result:
 * - parseable as a URL
 * - protocol is http/https
 * - hostname present
 * - no trailing slash
 * - no accidental "/chat/completions" suffix (provider appends it itself)
 * - accidental "KEY=VALUE" pastes are healed deterministically
 */
export function resolveBaseUrl(
  raw: string | undefined | null,
  options: { defaultUrl?: string } = {}
): BaseUrlResolution {
  let value = typeof raw === "string" ? raw.trim() : "";

  if (!value) {
    if (options.defaultUrl) {
      try {
        return finish(new URL(options.defaultUrl));
      } catch {
        return fail("unparseable_url", null);
      }
    }
    return fail("missing", null);
  }

  value = stripWrappingQuotes(value);

  const eqIndex = value.indexOf("=");
  if (eqIndex > 0) {
    const prefix = value.slice(0, eqIndex).trim();
    if (looksLikeEnvVarName(prefix)) {
      const rest = stripWrappingQuotes(value.slice(eqIndex + 1).trim());
      if (!rest) {
        return fail("malformed_key_value_pair", null);
      }
      value = rest;
    }
  }

  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) {
    return fail("missing_protocol", null);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return fail("unparseable_url", null);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return fail("invalid_protocol", parsed);
  }
  if (!parsed.hostname) {
    return fail("missing_hostname", parsed);
  }

  parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/");
  if (ENDPOINT_SUFFIX_RE.test(parsed.pathname)) {
    parsed.pathname = parsed.pathname.replace(ENDPOINT_SUFFIX_RE, "") || "/";
  }
  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }

  return finish(parsed);
}

export function describeBaseUrlError(resolution: BaseUrlResolution, envName: string): string {
  const expected = `Expected an origin URL such as "https://example.com/api/v1" without a trailing "${CHAT_COMPLETIONS_PATH}".`;
  switch (resolution.errorCode) {
    case "missing":
      return `${envName} is not configured on the server. ${expected}`;
    case "malformed_key_value_pair":
      return `${envName} is malformed (KEY=VALUE paste detected with empty value). ${expected}`;
    case "missing_protocol":
      return `${envName} is malformed (missing http/https protocol). ${expected}`;
    case "invalid_protocol":
      return `${envName} is malformed (protocol must be http or https). ${expected}`;
    case "missing_hostname":
      return `${envName} is malformed (hostname missing). ${expected}`;
    case "empty_after_normalization":
      return `${envName} is malformed (empty after normalization). ${expected}`;
    case "unparseable_url":
    default:
      return `${envName} is malformed (not a parseable URL). ${expected}`;
  }
}

export interface ChatCompletionParams {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  /** OpenRouter reasoning effort control — low = much faster for simple tasks */
  reasoningEffort?: "low" | "medium" | "high";
  /** Hard abort timeout in ms. Default 90s, max 5min, min 5s. */
  timeoutMs?: number;
  providerLabel: string;
}

/**
 * Single shared chat-completions JSON request used by all providers.
 * Fails loudly on transport/HTTP errors; never logs the API key.
 */
export async function postChatCompletionJson(params: ChatCompletionParams): Promise<Record<string, any>> {
  const requestUrl = `${params.baseUrl}${CHAT_COMPLETIONS_PATH}`;
  const timeoutMs = Math.max(5_000, Math.min(params.timeoutMs ?? 90_000, 300_000));

  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${params.apiKey}`,
        },
        body: JSON.stringify({
          model: params.model,
          messages: [
            { role: "system", content: params.system },
            { role: "user", content: params.user },
          ],
          temperature: params.temperature ?? 0.2,
          response_format: { type: "json_object" },
          ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
          ...(params.reasoningEffort ? { reasoning: { effort: params.reasoningEffort } } : {}),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (error: any) {
    const msg = error?.name === "AbortError"
      ? `request aborted after ${timeoutMs}ms`
      : (error?.message ?? "unknown fetch error");
    throw new Error(
      `${params.providerLabel} request failed for ${requestUrl}: ${msg}`
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${params.providerLabel} API error ${response.status}: ${errorText.slice(0, 500)}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message;
  // Some reasoning models (e.g. GLM 5.3 Flash) put text in `content` but
  // may return null content if max_tokens was consumed by reasoning.
  // Fallback: try the `reasoning` field for extractable JSON.
  let content: string | null = typeof message?.content === "string" ? message.content : null;
  if ((!content || content.trim() === "") && typeof message?.reasoning === "string") {
    // Try to extract JSON from reasoning text
    const jsonMatch = message.reasoning.match(/\{[\s\S]*\}/);
    content = jsonMatch ? jsonMatch[0] : null;
  }
  if (!content || content.trim() === "") {
    throw new Error(`${params.providerLabel} returned no content`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Attempt 1: strip markdown code fences
    let cleaned = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Attempt 2: extract the largest {...} block from the content
      const matches = cleaned.match(/\{[\s\S]*?\}/g);
      if (matches) {
        // Try largest first (likely the main JSON object)
        const sorted = matches.sort((a, b) => b.length - a.length);
        for (const m of sorted) {
          try {
            parsed = JSON.parse(m);
            break;
          } catch {
            // continue trying next match
          }
        }
      }
      if (!parsed) {
        // Attempt 3: try to find a JSON object and fix common issues (trailing commas, single quotes)
        const firstBrace = cleaned.indexOf("{");
        const lastBrace = cleaned.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          const slice = cleaned.slice(firstBrace, lastBrace + 1);
          const fixed = slice
            .replace(/,(\s*[}\]])/g, "$1") // remove trailing commas
            .replace(/'/g, '"'); // single → double quotes
          try {
            parsed = JSON.parse(fixed);
          } catch {
            // give up
          }
        }
      }
      if (!parsed) {
        throw new Error(`${params.providerLabel} response is not valid JSON`);
      }
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${params.providerLabel} response is not a JSON object`);
  }

  return parsed as Record<string, any>;
}

/**
 * Chat-completion with automatic retry on transient failures (network errors,
 * 429 rate limit, 5xx server errors, empty/malformed JSON response). Up to
 * 3 attempts total with exponential backoff. Hard timeout per attempt still
 * applies via AbortController.
 */
export async function postChatCompletionJsonWithRetry(
  params: ChatCompletionParams,
  opts: { maxAttempts?: number; baseBackoffMs?: number } = {}
): Promise<Record<string, any>> {
  const maxAttempts = Math.max(1, Math.min(opts.maxAttempts ?? 3, 5));
  const baseBackoff = Math.max(100, opts.baseBackoffMs ?? 500);
  let lastErr: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await postChatCompletionJson(params);
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message ?? "");
      const transient =
        /aborted after|fetch failed|timeout|429|5\d\d|empty|not valid JSON|JSON object/i.test(msg);
      if (!transient || attempt === maxAttempts) throw err;
      const backoff = baseBackoff * Math.pow(2, attempt - 1);
      console.warn(
        `[providers] ${params.providerLabel} attempt ${attempt}/${maxAttempts} failed (${msg.slice(0, 120)}); retrying in ${backoff}ms`
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr ?? new Error(`${params.providerLabel} retry exhausted`);
}
