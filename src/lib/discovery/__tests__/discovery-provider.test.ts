import { describe, expect, it } from "vitest";
import { MockGoogleSearchProvider } from "@/lib/discovery/providers/mock";
import { GoogleSearchProvider } from "@/lib/discovery/providers/google-search";
import type { DiscoveryProvider, DiscoveryQuery } from "@/lib/discovery/providers/types";
import type { DiscoveryQuery as GenQuery } from "@/lib/discovery/query-generator";

function makeQuery(query: string, queryType: string = "BUSINESS_DISCOVERY", priority = 7): DiscoveryQuery {
  return {
    query,
    query_type: queryType as any,
    priority,
    rationale: "test query",
    best_platform: "google_search",
  } as DiscoveryQuery;
}

function makeQueries(...items: [string, string?][]): DiscoveryQuery[] {
  return items.map(([q, qt]) => makeQuery(q, qt ?? "BUSINESS_DISCOVERY"));
}

describe("provider contract", () => {
  it("DiscoveryProvider interface is satisfied by mock provider", () => {
    const provider: DiscoveryProvider = new MockGoogleSearchProvider();
    expect(provider.name).toBe("google_search_mock");
    expect(provider.isConfigured()).toBe(true);
    expect(typeof provider.discover).toBe("function");
  });

  it("DiscoveryProvider interface is satisfied by google search provider", () => {
    const provider: DiscoveryProvider = new GoogleSearchProvider();
    expect(provider.name).toBe("google_search");
    expect(typeof provider.isConfigured).toBe("function");
    expect(typeof provider.discover).toBe("function");
  });
});

describe("mock provider", () => {
  it("returns deterministic results for the same input", async () => {
    const provider = new MockGoogleSearchProvider();
    const queries = makeQueries(["hotel in Nagpur"], ["clinic in Mumbai"]);
    const run1 = await provider.discover(queries);
    const run2 = await provider.discover(queries);
    expect(run1.candidates.map((c) => c.title)).toEqual(run2.candidates.map((c) => c.title));
  });

  it("returns hotel results for hotel queries", async () => {
    const provider = new MockGoogleSearchProvider();
    const queries = makeQueries(["hotels in Nagpur"]);
    const result = await provider.discover(queries);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].title.toLowerCase()).toContain("hotel");
  });

  it("preserves source URL from the result", async () => {
    const provider = new MockGoogleSearchProvider();
    const queries = makeQueries(["restaurants in Mumbai"]);
    const result = await provider.discover(queries);
    for (const candidate of result.candidates) {
      expect(candidate.source_url).toContain("results.example.com");
      expect(candidate.source_url).toContain(encodeURIComponent("restaurants"));
    }
  });

  it("preserves original query on each candidate", async () => {
    const provider = new MockGoogleSearchProvider();
    const queries = makeQueries(["hotel in Nagpur", "clinic in Delhi"]);
    const result = await provider.discover(queries);
    for (const candidate of result.candidates) {
      expect(["hotel in Nagpur", "clinic in Delhi"]).toContain(candidate.query);
    }
  });

  it("handles multiple queries without cross-contamination", async () => {
    const provider = new MockGoogleSearchProvider();
    const queries = makeQueries(["hotels in Nagpur", "schools in Delhi"]);
    const result = await provider.discover(queries);
    const hotelCandidates = result.candidates.filter((c) => c.query === "hotels in Nagpur");
    const schoolCandidates = result.candidates.filter((c) => c.query === "schools in Delhi");
    if (hotelCandidates.length > 0 && schoolCandidates.length > 0) {
      expect(hotelCandidates[0].title).not.toBe(schoolCandidates[0].title);
    }
  });

  it("returns zero candidates when zero queries provided", async () => {
    const provider = new MockGoogleSearchProvider();
    const result = await provider.discover([]);
    expect(result.candidates.length).toBe(0);
    expect(result.total_queries_executed).toBe(0);
  });

  it("does not fabricate urgency or contact information", async () => {
    const provider = new MockGoogleSearchProvider();
    const queries = makeQueries(["hotels looking for website"]);
    const result = await provider.discover(queries);
    for (const candidate of result.candidates) {
      const rawStr = JSON.stringify(candidate.raw_metadata);
      expect(rawStr).not.toContain("urgent");
      expect(rawStr).not.toContain("phone");
      expect(rawStr).not.toContain("email");
      expect(candidate).not.toHaveProperty("phone");
      expect(candidate).not.toHaveProperty("email");
      expect(candidate).not.toHaveProperty("urgency_score");
    }
  });
});

describe("google search provider (no credentials)", () => {
  it("reports not configured when API key is missing", () => {
    const savedKey = process.env.GOOGLE_SEARCH_API_KEY;
    delete process.env.GOOGLE_SEARCH_API_KEY;
    const provider = new GoogleSearchProvider({ cx: null });
    expect(provider.isConfigured()).toBe(false);
    if (savedKey) process.env.GOOGLE_SEARCH_API_KEY = savedKey;
  });

  it("returns errors for all queries when unconfigured", async () => {
    const savedKey = process.env.GOOGLE_SEARCH_API_KEY;
    delete process.env.GOOGLE_SEARCH_API_KEY;
    const provider = new GoogleSearchProvider({ cx: null });
    const queries = makeQueries(["test query"]);
    const result = await provider.discover(queries, { apiKey: null, cx: null });
    expect(result.candidates.length).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].error).toContain("not configured");
    if (savedKey) process.env.GOOGLE_SEARCH_API_KEY = savedKey;
  });
});

describe("result limiting and edge cases", () => {
  it("handles queries that produce no results", async () => {
    const provider = new MockGoogleSearchProvider();
    const result = await provider.discover([]);
    expect(result.candidates).toEqual([]);
    expect(result.provider).toBe("google_search_mock");
  });

  it("preserves query_type through to candidates", async () => {
    const provider = new MockGoogleSearchProvider();
    const queries: DiscoveryQuery[] = [
      { ...makeQuery("website gap test"), query_type: "WEBSITE_GAP" },
    ];
    const result = await provider.discover(queries);
    if (result.candidates.length > 0) {
      expect(result.candidates[0].query_type).toBe("WEBSITE_GAP");
    }
  });

  it("preserves raw metadata with original query priority", async () => {
    const provider = new MockGoogleSearchProvider();
    const query = makeQuery("priority check", "SERVICE_NEED", 9);
    const result = await provider.discover([query]);
    expect(result.candidates[0].raw_metadata.original_query_priority).toBe(9);
  });
});
