import type { DiscoveryQuery } from "../query-generator";
import type { DiscoveryProvider, DiscoveryProviderResult, ProviderConfig, RawDiscoveryCandidate } from "./types";

const MAPS_ENDPOINT = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const MAPS_DETAILS_ENDPOINT = "https://maps.googleapis.com/maps/api/place/details/json";

/** Fields required for enrichment/contactability (website + real phone). */
const DETAILS_FIELDS = "website,international_phone_number,formatted_phone_number,url";

interface PlaceDetailsResult {
  website: string | null;
  phone: string | null;
  mapsUrl: string | null;
}

async function fetchPlaceDetails(
  apiKey: string,
  placeId: string
): Promise<PlaceDetailsResult | { error: string }> {
  const url = new URL(MAPS_DETAILS_ENDPOINT);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", DETAILS_FIELDS);

  const response = await fetch(url.toString(), { method: "GET", headers: { Accept: "application/json" } });
  if (!response.ok) return { error: `details HTTP ${response.status}` };

  const data = await response.json();
  if (data.status === "OK" && data.result) {
    return {
      website: typeof data.result.website === "string" ? data.result.website : null,
      phone:
        (typeof data.result.international_phone_number === "string" && data.result.international_phone_number) ||
        (typeof data.result.formatted_phone_number === "string" && data.result.formatted_phone_number) ||
        null,
      mapsUrl: typeof data.result.url === "string" ? data.result.url : null,
    };
  }
  if (data.status === "ZERO_RESULTS" || data.status === "NOT_FOUND") {
    return { website: null, phone: null, mapsUrl: null };
  }
  return { error: `details ${data.status}${data.error_message ? `: ${data.error_message}` : ""}` };
}

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
    const detailsFailures: string[] = [];
    let executed = 0;
    let rateLimitHit = false;

    for (const query of queries.slice(0, 10)) {
      if (rateLimitHit) {
        errors.push({ query: query.query, error: "skipped due to rate limit" });
        continue;
      }
      executed += 1;
      detailsFailures.length = 0;
      try {
        const url = new URL(MAPS_ENDPOINT);
        url.searchParams.set("key", apiKey);
        url.searchParams.set("query", query.query);

        const response = await fetch(url.toString(), { method: "GET", headers: { Accept: "application/json" } });
        if (response.status === 429) { rateLimitHit = true; errors.push({ query: query.query, error: "rate limit" }); continue; }
        if (!response.ok) { errors.push({ query: query.query, error: `HTTP ${response.status}` }); continue; }

        const data = await response.json();

        // Surface API-level failures explicitly. Silent empty results here
        // made discovery report COMPLETED with zero candidates and no cause
        // (e.g. REQUEST_DENIED when the key lacks Places API authorization).
        if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
          const detail = data.error_message ? `: ${data.error_message}` : "";
          errors.push({ query: query.query, error: `${data.status}${detail}` });
          continue;
        }

        const places = data.results ?? [];
        for (const place of places.slice(0, 8)) {
          if (!place.name || !place.formatted_address) continue;

          // Place Details lookup: Text Search alone has no website/phone,
          // and without a website the enrichment stage is skipped entirely
          // (every candidate would fail the quality gate as unreachable).
          let details: PlaceDetailsResult | null = null;
          if (place.place_id) {
            try {
              const d = await fetchPlaceDetails(apiKey, place.place_id);
              if ("error" in d) {
                detailsFailures.push(d.error);
              } else {
                details = d;
              }
            } catch (err: any) {
              detailsFailures.push(err?.message ?? "details fetch failed");
            }
          }

          candidates.push({
            source: this.name,
            source_url: details?.mapsUrl ?? (place.place_id ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}` : query.query),
            title: place.name,
            snippet: place.formatted_address ?? "",
            website_url: details?.website ?? null,
            query: query.query,
            query_type: query.query_type,
            discovered_at: discoveredAt,
            raw_metadata: {
              place_id: place.place_id ?? null,
              rating: place.rating ?? null,
              review_count: place.user_ratings_total ?? null,
              business_status: place.business_status ?? null,
              location: place.geometry?.location ?? null,
              details_phone: details?.phone ?? null,
              details_website: details?.website ?? null,
              owner_hint: null,
              scope: (query as any).scope ?? "LOCAL",
              original_query_priority: query.priority,
            },
          });
        }

        if (detailsFailures.length > 0 && detailsFailures.length === places.slice(0, 8).filter((p: any) => p.name && p.formatted_address && p.place_id).length) {
          errors.push({
            query: query.query,
            error: `all place-details lookups failed (${[...new Set(detailsFailures)].slice(0, 2).join("; ")})`,
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
