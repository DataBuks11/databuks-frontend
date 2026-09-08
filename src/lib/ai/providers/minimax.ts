import {
  postChatCompletionJsonWithRetry,
  resolveBaseUrl,
} from "./base-url";
import type { AiCompletionInput, AiProvider } from "./types";

const DEFAULT_MODEL = "z-ai/glm-5.3";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * GLM 5.3 provider (OpenRouter) — replaces the retired free MiniMax slug
 * ("minimax/minimax-m3:free" started returning 404 "model is unavailable
 * for free"). Up to 3 retries with exponential backoff for transient
 * failures (timeout, 429, 5xx, empty JSON).
 */
export class MiniMaxProvider implements AiProvider {
  readonly id = "minimax";
  readonly model: string;
  readonly modelVersion = "glm-5.3";
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    // Reuse the same OpenRouter key the Ox Alpha provider uses.
    this.apiKey = env.OX_ALPHA_API_KEY;
    if (!this.apiKey) {
      throw new Error(
        "OX_ALPHA_API_KEY is not configured (required for GLM 5.3)"
      );
    }
    this.model = env.MINIMAX_MODEL || DEFAULT_MODEL;
    const resolution = resolveBaseUrl(env.OX_ALPHA_BASE_URL, { defaultUrl: DEFAULT_BASE_URL });
    if (!resolution.ok || !resolution.url) {
      throw new Error(
        `Failed to resolve OpenRouter base URL for GLM 5.3: ${resolution.errorCode ?? "unknown"}`
      );
    }
    this.baseUrl = resolution.url;
  }

  async completeJson(input: AiCompletionInput): Promise<Record<string, any>> {
    return postChatCompletionJsonWithRetry(
      {
        baseUrl: this.baseUrl,
        apiKey: this.apiKey!,
        model: this.model,
        system: input.system,
        user: input.user,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        reasoningEffort: input.reasoningEffort,
        timeoutMs: input.timeoutMs,
        providerLabel: "GLM 5.3",
      },
      { maxAttempts: 2, baseBackoffMs: 800 }
    );
  }
}
