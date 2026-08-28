import { MiniMaxProvider } from "./minimax";
import type { AiProvider } from "./types";

let activeProvider: AiProvider | null = null;

export function getActiveProvider(): AiProvider {
  if (!activeProvider) {
    activeProvider = createDefaultProvider();
  }
  return activeProvider;
}

function createDefaultProvider(): AiProvider {
  // MiniMax (free) is the sole LLM provider for the whole app — no other
  // providers are used. The single source of truth keeps the model surface
  // small and avoids credit / fallback complexity.
  return new MiniMaxProvider();
}

export function resetActiveProviderForTests(): void {
  activeProvider = null;
}

export type { AiProvider, AiCompletionInput } from "./types";
