import {
  postChatCompletionJsonWithRetry,
  resolveBaseUrl,
} from "./base-url";
import type { AiCompletionInput, AiProvider } from "./types";

const DEFAULT_MODEL = "deepseek-v4-flash-free";
const DEFAULT_BASE_URL = "https://api.apmix.ai/v1";

/**
 * Apmix gateway (OpenAI-compatible) — 4M free tokens. Used as PRIMARY
 * provider with automatic fallback to the legacy provider chain, so one
 * dead/slow endpoint can never silence the AI (critical before demos).
 */
export class ApmixProvider implements AiProvider {
  readonly id = "apmix";
  readonly model: string;
  readonly modelVersion = "deepseek-v4-flash-free";
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.apiKey = env.APMIX_API_KEY;
    if (!this.apiKey) {
      throw new Error("APMIX_API_KEY is not configured");
    }
    this.model = env.APMIX_MODEL || DEFAULT_MODEL;
    const resolution = resolveBaseUrl(env.APMIX_BASE_URL, { defaultUrl: DEFAULT_BASE_URL });
    if (!resolution.ok || !resolution.url) {
      throw new Error("Failed to resolve Apmix base URL");
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
        providerLabel: "Apmix",
      },
      { maxAttempts: input.maxAttempts ?? 3, baseBackoffMs: 500 }
    );
  }
}

/**
 * Failover wrapper: tries providers in order, first success wins.
 * Used so presentation/demo traffic survives any single endpoint outage.
 */
export class FailoverProvider implements AiProvider {
  readonly id = "failover";
  readonly model: string;
  readonly modelVersion: string;
  private readonly chain: AiProvider[];

  constructor(chain: AiProvider[]) {
    if (chain.length === 0) throw new Error("FailoverProvider needs at least one provider");
    this.chain = chain;
    this.model = chain[0].model;
    this.modelVersion = chain[0].modelVersion;
  }

  async completeJson(input: AiCompletionInput): Promise<Record<string, any>> {
    let lastErr: any = null;
    for (const p of this.chain) {
      try {
        return await p.completeJson(input);
      } catch (err: any) {
        lastErr = err;
        console.warn(`[providers] ${p.id} failed (${String(err?.message ?? err).slice(0, 120)}), trying next`);
      }
    }
    throw lastErr ?? new Error("All AI providers failed");
  }
}
