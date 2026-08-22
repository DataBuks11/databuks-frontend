import type { DiscoveryQuery } from "../query-generator";
import type { DiscoveryProvider, DiscoveryProviderResult, ProviderConfig, RawDiscoveryCandidate } from "./types";

const MAPS_ENDPOINT = "https://maps.googleapis.com/maps/api/place/textsearch/json";

export class GoogleMapsProvider implements DiscoveryProvider {
  readonly name = "google_maps";

  isConfigured(): boolean {
    return !!process.env.GOOGLE_MAPS_API_KEY;
  }

  async discover(
    queries: DiscoveryQuery[],
    config: ProviderConfig = {}
  ): Promise<DiscoveryProviderResult> {
    const apiKey = config.apiKey ?? process.env.GOOGLE_MAPS_API_KEY ?? null;
    const discoveredAt = new Date().toISOString();

    if (!apiKey) {
      return {
        provider: this.name,
        candidates: [],
        total_queries_executed: 0,
        total_queries_requested: queries.length,
        errors: queries.map((q) => ({ query: q.query, error: "GOOGLE_MAPS_API_KEY not configured" })),
        rate_limit_hit: false,
      };
    }

    const candidates: RawDiscoveryCandidate[] = [];
    const errors: { query: string; error: string }[] = [];
    let executed = 0;
    let rateLimitHit = false;

    for (const query of queries.slice(0, 10)) {
      if (rateLimitHit) {
        errors.push({ query: query.query, error: "skipped due to rate limit" });
        continue;
      }
      executed += 1;
      try {
        const url = new URL(MAPS_ENDPOINT);
        url.searchParams.set("key", apiKey);
        url.searchParams.set("query", query.query);

        const response = await fetch(url.toString(), { method: "GET", headers: { Accept: "application/json" } });
        if (response.status === 429) { rateLimitHit = true; errors.push({ query: query.query, error: "rate limit" }); continue; }
        if (!response.ok) { errors.push({ query: query.query, error: `HTTP ${response.status}` }); continue; }

        const data = await response.json();
        const places = data.results ?? [];
        for (const place of places.slice(0, 8)) {
          if (!place.name || !place.formatted_address) continue;
          candidates.push({
            source: this.name,
            source_url: place.place_id ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}` : query.query,
            title: place.name,
            snippet: place.formatted_address ?? "",
            website_url: null,
            query: query.query,
            query_type: query.query_type,
            discovered_at: discoveredAt,
            raw_metadata: {
              place_id: place.place_id ?? null,
              rating: place.rating ?? null,
              review_count: place.user_ratings_total ?? null,
              business_status: place.business_status ?? null,
              location: place.geometry?.location ?? null,
              original_query_priority: query.priority,
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
