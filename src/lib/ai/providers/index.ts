import { MiniMaxProvider } from "./minimax";
import { ApmixProvider, FailoverProvider } from "./apmix";
import type { AiProvider } from "./types";

let activeProvider: AiProvider | null = null;

export function getActiveProvider(): AiProvider {
  if (!activeProvider) {
    activeProvider = createDefaultProvider();
  }
  return activeProvider;
}

function createDefaultProvider(): AiProvider {
  // Apmix (4M free tokens) is PRIMARY; legacy chain (TokenHarbor /
  // TokenRouter / DeepSeek direct) stays as automatic fallback, so one
  // dead endpoint never silences the AI.
  const chain: AiProvider[] = [];
  try {
    chain.push(new ApmixProvider());
  } catch {
    // no APMIX_API_KEY — legacy only
  }
  try {
    chain.push(new MiniMaxProvider());
  } catch {
    // no legacy keys — Apmix only (or bust below)
  }
  if (chain.length === 0) {
    // Preserve the original loud error when nothing is configured.
    return new MiniMaxProvider();
  }
  if (chain.length === 1) return chain[0];
  return new FailoverProvider(chain);
}

export function resetActiveProviderForTests(): void {
  activeProvider = null;
}

export type { AiProvider, AiCompletionInput } from "./types";
