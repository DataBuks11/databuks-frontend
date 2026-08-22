import { OxAlphaProvider } from "./ox-alpha";
import { DeepSeekProvider } from "./deepseek";
import type { AiProvider } from "./types";

let activeProvider: AiProvider | null = null;

export function getActiveProvider(): AiProvider {
  if (!activeProvider) {
    activeProvider = createDefaultProvider();
  }
  return activeProvider;
}

function createDefaultProvider(): AiProvider {
  // Ox Alpha is the primary/default LLM provider.
  // If either variable is set, Ox Alpha owns the slot: a malformed or
  // incomplete configuration must fail loudly here — never silently
  // degrade to the fallback provider.
  if (process.env.OX_ALPHA_API_KEY || process.env.OX_ALPHA_BASE_URL) {
    return new OxAlphaProvider();
  }
  // Fallback: DeepSeek V4 Flash
  if (process.env.DEEPSEEK_API_KEY) {
    return new DeepSeekProvider();
  }
  throw new Error("No AI provider configured. Set OX_ALPHA_API_KEY + OX_ALPHA_BASE_URL or DEEPSEEK_API_KEY.");
}

export function resetActiveProviderForTests(): void {
  activeProvider = null;
}

export type { AiProvider, AiCompletionInput } from "./types";
