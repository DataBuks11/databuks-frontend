import {
  describeBaseUrlError,
  postChatCompletionJson,
  resolveBaseUrl,
} from "./base-url";
import type { AiCompletionInput, AiProvider } from "./types";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";

export class DeepSeekProvider implements AiProvider {
  readonly id = "deepseek";
  readonly model: string;
  readonly modelVersion = "v4-flash";
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.apiKey = env.DEEPSEEK_API_KEY;
    this.model = env.DEEPSEEK_MODEL || DEFAULT_MODEL;

    const resolution = resolveBaseUrl(env.DEEPSEEK_BASE_URL, { defaultUrl: DEFAULT_BASE_URL });
    if (!resolution.ok || !resolution.url) {
      console.error(
        `[DeepSeek] Invalid DEEPSEEK_BASE_URL (code=${resolution.errorCode ?? "unknown"}, preview=${resolution.sanitizedPreview ?? "n/a"})`
      );
      throw new Error(describeBaseUrlError(resolution, "DEEPSEEK_BASE_URL"));
    }
    this.baseUrl = resolution.url;
  }

  async completeJson(input: AiCompletionInput): Promise<Record<string, any>> {
    if (!this.apiKey) {
      throw new Error("DEEPSEEK_API_KEY is not configured on the server");
    }
    return postChatCompletionJson({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      model: this.model,
      system: input.system,
      user: input.user,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      providerLabel: "DeepSeek",
    });
  }
}
