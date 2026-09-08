import {
  postChatCompletionJsonWithRetry,
  resolveBaseUrl,
} from "./base-url";
import type { AiCompletionInput, AiProvider } from "./types";

const DEFAULT_MODEL = "z-ai/glm-5.3-free";
const DEFAULT_BASE_URL = "https://api.tokenrouter.com/v1";

/**
 * GLM 5.3 (free) via TokenRouter — replaced the retired free MiniMax slug
 * ("minimax/minimax-m3:free" returned 404 "model is unavailable for free").
 * Same OpenAI-compatible chat-completions API; retries transient failures.
 */
export class MiniMaxProvider implements AiProvider {
  readonly id = "minimax";
  readonly model: string;
  readonly modelVersion = "glm-5.3-free";
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    // TokenRouter key (TOKENROUTER_API_KEY) with fallback to the legacy
    // OpenRouter key so existing deployments keep working.
    const usingTokenRouter = !!env.TOKENROUTER_API_KEY;
    this.apiKey = env.TOKENROUTER_API_KEY || env.OX_ALPHA_API_KEY;
    if (!this.apiKey) {
      throw new Error(
        "TOKENROUTER_API_KEY (or OX_ALPHA_API_KEY) is not configured (required for GLM 5.3)"
      );
    }
    this.model = env.MINIMAX_MODEL || DEFAULT_MODEL;
    // With a TokenRouter key, ALWAYS talk to TokenRouter (an OpenRouter base
    // URL would reject the key). Legacy OpenRouter setups keep their env.
    const rawBase = usingTokenRouter ? env.TOKENROUTER_BASE_URL : env.OX_ALPHA_BASE_URL;
    const fallbackBase = usingTokenRouter ? DEFAULT_BASE_URL : "https://openrouter.ai/api/v1";
    const resolution = resolveBaseUrl(rawBase, { defaultUrl: fallbackBase });
    if (!resolution.ok || !resolution.url) {
      throw new Error(
        `Failed to resolve base URL for GLM 5.3: ${resolution.errorCode ?? "unknown"}`
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
      // 2 attempts max: WhatsApp webhook lambdas die at 60s — 2×28s LLM
      // worst-case still fits only without extra waiting, so keep this low.
      { maxAttempts: 2, baseBackoffMs: 500 }
    );
  }
}
