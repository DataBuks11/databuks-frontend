import type { DiscoveryQuery } from "../query-generator";
import type {
  DiscoveryProvider,
  DiscoveryProviderResult,
  ProviderConfig,
  RawDiscoveryCandidate,
} from "./types";

/**
 * Deterministic mock provider for tests.
 * Returns realistic but FIXED results based on query content.
 * No randomness — same input always produces the same output.
 */

const MOCK_TEMPLATES: Record<string, Partial<RawDiscoveryCandidate>> = {
  hotel: {
    title: "Hotel Grand Palace — Best Hotel Reviews & Booking",
    snippet: "Hotel Grand Palace offers comfortable rooms, banquet halls and restaurant services. Visit our website to book online.",
    website_url: "https://hotelgrandpalace.example.com",
  },
  restaurant: {
    title: "Spice Garden Restaurant — Fine Dining & Catering",
    snippet: "Authentic cuisine, family friendly, online reservations available. Visit us for lunch or dinner.",
    website_url: "https://spicegarden.example.com",
  },
  clinic: {
    title: "City Care Clinic — Multi-Speciality Healthcare",
    snippet: "Trusted healthcare provider offering OPD, diagnostics, and telemedicine services.",
    website_url: null,
  },
  school: {
    title: "Sunrise Public School — Admissions Open",
    snippet: "CBSE-affiliated school offering quality education from nursery to class 12.",
    website_url: "https://sunriseschool.example.com",
  },
  store: {
    title: "Fashion Hub Store — Latest Trends & Offers",
    snippet: "Shop the latest fashion trends online. Free delivery on orders above ₹999.",
    website_url: "https://fashionhub.example.com",
  },
  default: {
    title: "Local Business Directory Listing",
    snippet: "Find contact details, address, reviews and more for local businesses.",
    website_url: null,
  },
};

function pickTemplate(query: string): Partial<RawDiscoveryCandidate> {
  const lower = query.toLowerCase();
  for (const [key, template] of Object.entries(MOCK_TEMPLATES)) {
    if (key !== "default" && lower.includes(key)) return template;
  }
  return MOCK_TEMPLATES.default;
}

export class MockGoogleSearchProvider implements DiscoveryProvider {
  readonly name = "google_search_mock";

  isConfigured(): boolean {
    return true;
  }

  async discover(
    queries: DiscoveryQuery[],
    _config: ProviderConfig = {}
  ): Promise<DiscoveryProviderResult> {
    const discoveredAt = new Date("2026-01-15T10:00:00Z").toISOString();
    const candidates: RawDiscoveryCandidate[] = [];

    for (const query of queries) {
      const template = pickTemplate(query.query);
      const hash = query.query.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);

      candidates.push({
        source: this.name,
        source_url: `https://results.example.com/search?q=${encodeURIComponent(query.query)}&pos=${hash % 10}`,
        title: `${template.title ?? "Business Result"} — ${query.query.slice(0, 40)}`,
        snippet: template.snippet ?? "Local business listing result.",
        website_url: template.website_url ?? null,
        query: query.query,
        query_type: query.query_type,
        discovered_at: discoveredAt,
        raw_metadata: {
          mock: true,
          original_query_priority: query.priority,
          original_query_rationale: query.rationale,
          position_in_results: (hash % 10) + 1,
        },
      });
    }

    return {
      provider: this.name,
      candidates,
      total_queries_executed: queries.length,
      total_queries_requested: queries.length,
      errors: [],
      rate_limit_hit: false,
    };
  }
}
