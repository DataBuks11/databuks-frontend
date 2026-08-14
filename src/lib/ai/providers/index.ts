import { DeepSeekProvider } from "./deepseek";
import type { AiProvider } from "./types";

let activeProvider: AiProvider | null = null;

export function getActiveProvider(): AiProvider {
  if (!activeProvider) {
    activeProvider = new DeepSeekProvider();
  }
  return activeProvider;
}

export function resetActiveProviderForTests(): void {
  activeProvider = null;
}

export type { AiProvider, AiCompletionInput } from "./types";
