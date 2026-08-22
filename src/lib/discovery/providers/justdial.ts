import type { DiscoveryQuery } from "../query-generator";
import type { DiscoveryProvider, DiscoveryProviderResult, ProviderConfig, RawDiscoveryCandidate } from "./types";

export class JustdialProvider implements DiscoveryProvider {
  readonly name = "justdial";

  isConfigured(): boolean {
    return !!process.env.JUSTDIAL_API_KEY;
  }

  async discover(
    queries: DiscoveryQuery[],
    _config: ProviderConfig = {}
  ): Promise<DiscoveryProviderResult> {
    return {
      provider: this.name,
      candidates: [],
      total_queries_executed: 0,
      total_queries_requested: queries.length,
      errors: queries.map((q) => ({
        query: q.query,
        error: "Justdial API integration not yet available — adapter architecture ready",
      })),
      rate_limit_hit: false,
    };
  }
}
