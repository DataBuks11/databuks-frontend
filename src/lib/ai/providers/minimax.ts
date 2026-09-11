import {
  postChatCompletionJsonWithRetry,
  resolveBaseUrl,
} from "./base-url";
import type { AiCompletionInput, AiProvider } from "./types";

const DEFAULT_MODEL = "deepseek-v4.1-flash:free";
const DEFAULT_BASE_URL = "https://tokenharbor.ai/v1";

/**
 * DeepSeek 4.1 Flash (free) via Token Harbor — replaced GLM 5.3 free
 * (TokenRouter free channel was overloaded: frequent null content +
 * 503s). Same OpenAI-compatible chat-completions API; retries transient
 * failures. Prompts, flows and system behavior are unchanged — only the
 * model + API endpoint changed.
 */
export class MiniMaxProvider implements AiProvider {
  readonly id = "minimax";
  readonly model: string;
  readonly modelVersion = "deepseek-v4.1-flash-free";
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    // Token Harbor key first, then legacy TokenRouter / OpenRouter keys so
    // existing deployments keep working.
    const usingTokenHarbor = !!env.TOKENHARBOR_API_KEY;
    const usingTokenRouter = !usingTokenHarbor && !!env.TOKENROUTER_API_KEY;
    const usingDeepSeek = !usingTokenHarbor && !usingTokenRouter && !!env.DEEPSEEK_API_KEY;
    this.apiKey = env.TOKENHARBOR_API_KEY || env.TOKENROUTER_API_KEY || env.OX_ALPHA_API_KEY || env.DEEPSEEK_API_KEY;
    if (!this.apiKey) {
      throw new Error(
        "TOKENHARBOR_API_KEY (or TOKENROUTER_API_KEY / OX_ALPHA_API_KEY / DEEPSEEK_API_KEY) is not configured (required for DeepSeek 4.1 Flash)"
      );
    }
    this.model = env.MINIMAX_MODEL || env.TOKENHARBOR_MODEL || (usingDeepSeek ? (env.DEEPSEEK_MODEL || "deepseek-chat") : DEFAULT_MODEL);
    // With a Token Harbor key, ALWAYS talk to Token Harbor (any other base
    // URL would reject the key). Legacy setups keep their env.
    const rawBase = usingTokenHarbor
      ? env.TOKENHARBOR_BASE_URL
      : usingTokenRouter
        ? env.TOKENROUTER_BASE_URL
        : usingDeepSeek
          ? env.DEEPSEEK_BASE_URL
          : env.OX_ALPHA_BASE_URL;
    const fallbackBase = usingTokenHarbor
      ? DEFAULT_BASE_URL
      : usingTokenRouter
        ? "https://api.tokenrouter.com/v1"
        : usingDeepSeek
          ? "https://api.deepseek.com"
          : "https://openrouter.ai/api/v1";
    const resolution = resolveBaseUrl(rawBase, { defaultUrl: fallbackBase });
    if (!resolution.ok || !resolution.url) {
      throw new Error(
        `Failed to resolve base URL for DeepSeek 4.1 Flash: ${resolution.errorCode ?? "unknown"}`
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
        reasoningEffort: input.reasoningEffort ?? "low",
        timeoutMs: input.timeoutMs,
        providerLabel: "DeepSeek 4.1",
      },
      // Default 3 attempts for resilience
      { maxAttempts: input.maxAttempts ?? 3, baseBackoffMs: 500 }
    );
  }
}
