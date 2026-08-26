import {
  describeBaseUrlError,
  postChatCompletionJson,
  resolveBaseUrl,
} from "./base-url";
import type { AiCompletionInput, AiProvider } from "./types";

const DEFAULT_MODEL = "ox-alpha";

export class OxAlphaProvider implements AiProvider {
  readonly id = "ox_alpha";
  readonly model: string;
  readonly modelVersion = "ox-alpha";
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.apiKey = env.OX_ALPHA_API_KEY;
    this.model = env.OX_ALPHA_MODEL || DEFAULT_MODEL;

    const resolution = resolveBaseUrl(env.OX_ALPHA_BASE_URL);
    if (!resolution.ok || !resolution.url) {
      // Fail clearly — never fall back silently when Ox Alpha is configured
      // but malformed. Safe log line (no secrets):
      console.error(
        `[Ox Alpha] Invalid OX_ALPHA_BASE_URL (code=${resolution.errorCode ?? "unknown"}, preview=${resolution.sanitizedPreview ?? "n/a"})`
      );
      throw new Error(describeBaseUrlError(resolution, "OX_ALPHA_BASE_URL"));
    }
    if (!this.apiKey) {
      throw new Error(
        "OX_ALPHA_API_KEY is not configured on the server while OX_ALPHA_BASE_URL is set."
      );
    }
    this.baseUrl = resolution.url;
  }

  async completeJson(input: AiCompletionInput): Promise<Record<string, any>> {
    if (!this.apiKey) {
      throw new Error("OX_ALPHA_API_KEY is not configured on the server");
    }
    return postChatCompletionJson({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey!,
      model: this.model,
      system: input.system,
      user: input.user,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      reasoningEffort: input.reasoningEffort,
      providerLabel: "Ox Alpha",
    });
  }
}
