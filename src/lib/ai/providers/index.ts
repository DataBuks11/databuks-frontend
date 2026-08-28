import { OxAlphaProvider } from "./ox-alpha";
import { DeepSeekProvider } from "./deepseek";
import { MiniMaxProvider } from "./minimax";
import { FallbackProvider } from "./fallback";
import type { AiProvider } from "./types";

let activeProvider: AiProvider | null = null;

export function getActiveProvider(): AiProvider {
  if (!activeProvider) {
    activeProvider = createDefaultProvider();
  }
  return activeProvider;
}

function createDefaultProvider(): AiProvider {
  // Ox Alpha is the primary paid provider. When configured, we wrap it with
  // MiniMax (free) as a transparent fallback so the app keeps working when
  // the OpenRouter credit balance is depleted.
  if (process.env.OX_ALPHA_API_KEY || process.env.OX_ALPHA_BASE_URL) {
    const primary = new OxAlphaProvider();
    const fallback = new MiniMaxProvider();
    return new FallbackProvider(primary, fallback);
  }
  // No OpenRouter config — try DeepSeek (paid) as a standalone.
  if (process.env.DEEPSEEK_API_KEY) {
    return new DeepSeekProvider();
  }
  // No env at all — try the free MiniMax model directly (still needs an
  // OpenRouter key, but the provider will throw a clear error if missing).
  return new MiniMaxProvider();
}

export function resetActiveProviderForTests(): void {
  activeProvider = null;
}

export type { AiProvider, AiCompletionInput } from "./types";
