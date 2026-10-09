import { MiniMaxProvider } from "./minimax";
import { ApmixProvider, FailoverProvider } from "./apmix";
import { GeminiProvider } from "./gemini";
import type { AiProvider } from "./types";

let activeProvider: AiProvider | null = null;

export function getActiveProvider(): AiProvider {
  if (!activeProvider) {
    activeProvider = createDefaultProvider();
  }
  return activeProvider;
}

function createDefaultProvider(): AiProvider {
  // Fast lane first: Gemini Flash (1-4s when funded) → Apmix (4M free) →
  // legacy TokenHarbor/DeepSeek chain. Each lane fails fast (single attempt,
  // tight timeouts), so total latency ≈ fastest working lane, never the sum.
  //
  // Explicit override wins: TOKENHARBOR_MODEL / MINIMAX_MODEL set hone par
  // (e.g. claude-haiku-5.5) wahi lane sabse pehle try hoti hai.
  const chain: AiProvider[] = [];
  const unshiftOverride = (p: AiProvider) => {
    chain.unshift(p);
  };
  try {
    chain.push(new GeminiProvider());
  } catch {
    // no GEMINI_API_KEY — free lanes only
  }
  try {
    chain.push(new ApmixProvider());
  } catch {
    // no APMIX_API_KEY — legacy only
  }
  try {
    const mm = new MiniMaxProvider();
    const hasOverride =
      !!process.env.MINIMAX_MODEL || !!process.env.TOKENHARBOR_MODEL;
    if (hasOverride) unshiftOverride(mm);
    else chain.push(mm);
  } catch {
    // no legacy keys — Gemini/Apmix only (or bust below)
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
