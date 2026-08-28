import type { AiCompletionInput, AiProvider } from "./types";

/**
 * FallbackProvider — wraps a primary provider and transparently switches to a
 * secondary provider when the primary hits a 402 (insufficient credits) or any
 * other credit-related error. Non-credit errors propagate normally.
 *
 * Used so the app keeps working when the paid OpenRouter balance is depleted
 * and the user has no credits to top up.
 */
export class FallbackProvider implements AiProvider {
  // Expose the primary's identity so callers still see "ox_alpha" / "deepseek"
  // etc. The fallback is an internal safety net, not a separate provider.
  readonly id: string;
  readonly model: string;
  readonly modelVersion: string;

  constructor(
    private readonly primary: AiProvider,
    private readonly secondary: AiProvider
  ) {
    this.id = primary.id;
    this.model = primary.model;
    this.modelVersion = primary.modelVersion;
  }

  async completeJson(input: AiCompletionInput): Promise<Record<string, any>> {
    try {
      return await this.primary.completeJson(input);
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      const isCreditError =
        /\b402\b/.test(msg) ||
        /insufficient credits|requires more credits|credit balance|afford/i.test(msg);
      if (!isCreditError) throw err;
      console.warn(
        `[FallbackProvider] primary ${this.primary.id} hit credit limit — falling back to ${this.secondary.id}`
      );
      return await this.secondary.completeJson(input);
    }
  }
}
