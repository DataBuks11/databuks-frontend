import type { DiscoveryQuery } from "../query-generator";
import type {
  DiscoveryProvider,
  DiscoveryProviderResult,
  ProviderConfig,
  RawDiscoveryCandidate,
} from "./types";

const GOOGLE_SEARCH_ENDPOINT = "https://www.googleapis.com/customsearch/v1";

interface GoogleSearchItem {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
  pagemap?: Record<string, any>;
}

interface GoogleSearchResponse {
  items?: GoogleSearchItem[];
  searchInformation?: { totalResults?: string };
  error?: { message?: string; code?: number };
}

export class GoogleSearchProvider implements DiscoveryProvider {
  readonly name = "google_search";
  private cxId: string | null;

  constructor(config?: ProviderConfig) {
    this.cxId = (config?.cx as string) ?? process.env.GOOGLE_SEARCH_CX_ID ?? null;
  }

  isConfigured(): boolean {
    return !!process.env.GOOGLE_SEARCH_API_KEY && !!this.cxId;
  }

  async discover(
    queries: DiscoveryQuery[],
    config: ProviderConfig = {}
  ): Promise<DiscoveryProviderResult> {
    const apiKey = config.apiKey ?? process.env.GOOGLE_SEARCH_API_KEY ?? null;
    const cxId = (config.cx as string) ?? this.cxId;
    
    const discoveredAt = new Date().toISOString();

    if (!apiKey || !cxId) {
      return {
        provider: this.name,
        candidates: [],
        total_queries_executed: 0,
        total_queries_requested: queries.length,
        errors: queries.map((q) => ({
          query: q.query,
          error: "Google Search API key or CX ID not configured",
        })),
        rate_limit_hit: false,
      };
    }

    const candidates: RawDiscoveryCandidate[] = [];
    const errors: { query: string; error: string }[] = [];
    let executed = 0;
    let rateLimitHit = false;

    for (const query of queries) {
      if (rateLimitHit) {
        errors.push({ query: query.query, error: "skipped due to rate limit" });
        continue;
      }
      executed += 1;

      try {
        const url = new URL(GOOGLE_SEARCH_ENDPOINT);
        url.searchParams.set("key", apiKey);
        url.searchParams.set("cx", cxId);
        url.searchParams.set("q", query.query);
        url.searchParams.set("num", String(Math.min(Number(config.max_results_per_query ?? 10), 10)));

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        if (response.status === 429) {
          rateLimitHit = true;
          errors.push({ query: query.query, error: "rate limit hit" });
          continue;
        }

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "");
          errors.push({
            query: query.query,
            error: `HTTP ${response.status}: ${errorBody.slice(0, 200)}`,
          });
          continue;
        }

        const data: GoogleSearchResponse = await response.json();

        if (data.error) {
          errors.push({ query: query.query, error: data.error.message ?? "unknown API error" });
          continue;
        }

        const items = data.items ?? [];
        for (const item of items) {
          if (!item.link || !item.title) continue;
          candidates.push({
            source: this.name,
            source_url: item.link,
            title: item.title,
            snippet: item.snippet ?? "",
            website_url: item.displayLink ? `https://${item.displayLink}` : null,
            query: query.query,
            query_type: query.query_type,
            discovered_at: discoveredAt,
            raw_metadata: {
              display_link: item.displayLink ?? null,
              pagemap_present: !!item.pagemap,
              original_query_priority: query.priority,
              original_query_rationale: query.rationale,
              google_search_total_results: data.searchInformation?.totalResults ?? null,
            },
          });
        }
      } catch (error: any) {
        errors.push({ query: query.query, error: error?.message ?? "fetch failed" });
      }
    }

    return {
      provider: this.name,
      candidates,
      total_queries_executed: executed,
      total_queries_requested: queries.length,
      errors,
      rate_limit_hit: rateLimitHit,
    };
  }
}
