import type { DiscoveryQuery } from "../query-generator";

export type { DiscoveryQuery };

// â”€â”€â”€ Raw Discovery Candidate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The MINIMUM normalized output a provider must return.
// Enrichment (phone/email/social/scores) happens LATER â€” not here.

export interface RawDiscoveryCandidate {
  /** Which provider produced this candidate (e.g. "google_search") */
  source: string;
  /** URL of the source page where this candidate was found */
  source_url: string;
  /** Business/page title from the search result */
  title: string;
  /** Snippet/description from the search result (NOT a verified fact) */
  snippet: string;
  /** Business website URL if visible in the result (null if not) */
  website_url: string | null;
  /** The query that produced this candidate */
  query: string;
  /** The query_type from the DiscoveryQuery */
  query_type: string;
  /** When this candidate was discovered */
  discovered_at: string;
  /** Provider-specific raw metadata for debugging/enrichment */
  raw_metadata: Record<string, any>;
}

// â”€â”€â”€ Provider Result â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface DiscoveryProviderResult {
  provider: string;
  candidates: RawDiscoveryCandidate[];
  total_queries_executed: number;
  total_queries_requested: number;
  errors: { query: string; error: string }[];
  rate_limit_hit: boolean;
}

// â”€â”€â”€ Provider Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ProviderConfig {
  apiKey?: string | null;
  [key: string]: string | number | null | undefined;
}

// â”€â”€â”€ Provider Contract â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Every external discovery provider MUST implement this interface.
// The pipeline consumes this contract, never a provider-specific type.

export interface DiscoveryProvider {
  /** Provider identifier (e.g. "google_search", "google_maps", "justdial") */
  readonly name: string;
  /** Whether the provider is configured (API key present etc.) */
  isConfigured(): boolean;
  /** Execute discovery queries and return normalized raw candidates */
  discover(
    queries: DiscoveryQuery[],
    config: ProviderConfig
  ): Promise<DiscoveryProviderResult>;
}
