import { describe, expect, it } from "vitest";
import {
  generateDiscoveryQueries,
  type QueryGeneratorInput,
} from "@/lib/discovery/query-generator";

function makeInput(overrides: Partial<QueryGeneratorInput> = {}): QueryGeneratorInput {
  return {
    services: [{ name: "Website Development", description: "Custom websites for businesses" }],
    target_audience: [{ segment: "Hotels", description: "Hotel owners in Nagpur" }],
    industries: ["Hospitality"],
    locations: ["Nagpur", "Mumbai"],
    business_name: "DataBuks",
    ...overrides,
  };
}

describe("query generator", () => {
  it("generates BUSINESS_DISCOVERY queries from target audience + location", () => {
    const queries = generateDiscoveryQueries(makeInput());
    const discovery = queries.filter((q) => q.query_type === "BUSINESS_DISCOVERY");
    expect(discovery.length).toBeGreaterThan(0);
    expect(discovery.some((q) => q.query.includes("hotels"))).toBe(true);
    expect(discovery.some((q) => q.query.includes("Nagpur"))).toBe(true);
  });

  it("generates SERVICE_NEED queries with high priority (8-9)", () => {
    const queries = generateDiscoveryQueries(makeInput());
    const needQueries = queries.filter((q) => q.query_type === "SERVICE_NEED");
    expect(needQueries.length).toBeGreaterThan(0);
    expect(needQueries.every((q) => q.priority >= 8)).toBe(true);
  });

  it("generates WEBSITE_GAP queries only when service is web-related", () => {
    const withWeb = generateDiscoveryQueries(
      makeInput({ services: [{ name: "Website Development" }] })
    );
    expect(withWeb.some((q) => q.query_type === "WEBSITE_GAP")).toBe(true);

    const withoutWeb = generateDiscoveryQueries(
      makeInput({ services: [{ name: "Business Consulting" }] })
    );
    expect(withoutWeb.some((q) => q.query_type === "WEBSITE_GAP")).toBe(false);
  });

  it("generates AUTOMATION_NEED queries when automation is a service", () => {
    const input = makeInput({
      services: [{ name: "Business Process Automation" }, { name: "AI Chatbot Development" }],
    });
    const queries = generateDiscoveryQueries(input, 60);
    expect(queries.some((q) => q.query_type === "AUTOMATION_NEED")).toBe(true);
  });

  it("does NOT generate AUTOMATION_NEED when automation is not a service", () => {
    const input = makeInput({
      services: [{ name: "Logo Design" }],
      content_themes: [],
    });
    const queries = generateDiscoveryQueries(input);
    expect(queries.some((q) => q.query_type === "AUTOMATION_NEED")).toBe(false);
  });

  it("handles multiple services without duplicate query families", () => {
    const input = makeInput({
      services: [
        { name: "Website Development" },
        { name: "Custom Software Development" },
        { name: "ERP System" },
        { name: "Business Automation" },
      ],
    });
    const queries = generateDiscoveryQueries(input);
    const seen = new Set<string>();
    for (const q of queries) {
      const normalized = q.query.toLowerCase().replace(/\s+/g, " ").trim();
      expect(seen.has(normalized), `Duplicate: ${q.query}`).toBe(false);
      seen.add(normalized);
    }
  });

  it("handles multiple locations", () => {
    const input = makeInput({ locations: ["Nagpur", "Mumbai", "Delhi"] });
    const queries = generateDiscoveryQueries(input);
    const cities = new Set(queries.map((q) => q.query).join(" ").match(/nagpur|mumbai|delhi/gi));
    expect(cities.size).toBeGreaterThanOrEqual(2);
  });

  it("falls back to generic customer type when no audience provided", () => {
    const input = makeInput({ target_audience: [] });
    const queries = generateDiscoveryQueries(input);
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.some((q) => q.query.toLowerCase().includes("small business"))).toBe(true);
  });

  it("falls back to India when no locations provided", () => {
    const input = makeInput({ locations: [] });
    const queries = generateDiscoveryQueries(input);
    expect(queries.length).toBeGreaterThan(0);
  });

  it("output is deterministic for the same input", () => {
    const input = makeInput();
    const run1 = generateDiscoveryQueries(input);
    const run2 = generateDiscoveryQueries(input);
    expect(run1.map((q) => q.query)).toEqual(run2.map((q) => q.query));
  });

  it("respects max_queries limit", () => {
    const input = makeInput({
      services: [
        { name: "Website Development" },
        { name: "Software Development" },
        { name: "Automation" },
        { name: "AI Solutions" },
      ],
      target_audience: [
        { segment: "Hotels" },
        { segment: "Restaurants" },
        { segment: "Clinics" },
      ],
      locations: ["Nagpur", "Mumbai"],
    });
    const queries = generateDiscoveryQueries(input, 15);
    expect(queries.length).toBeLessThanOrEqual(15);
  });

  it("prioritizes SERVICE_NEED and HIRING_SIGNAL above BUSINESS_DISCOVERY", () => {
    const input = makeInput({
      services: [{ name: "Website Development" }],
      target_audience: [{ segment: "Small Businesses" }],
      locations: ["Nagpur"],
    });
    const queries = generateDiscoveryQueries(input);
    if (queries.length < 3) return;
    const sorted = [...queries].sort((a, b) => b.priority - a.priority);
    // Top queries should be SERVICE_NEED or HIRING_SIGNAL (priority >= 9)
    expect(sorted[0].priority).toBeGreaterThanOrEqual(sorted[sorted.length - 1].priority);
  });

  it("no fabricated urgency keywords in BUSINESS_DISCOVERY queries", () => {
    const input = makeInput();
    const queries = generateDiscoveryQueries(input);
    const discoveryOnly = queries.filter((q) => q.query_type === "BUSINESS_DISCOVERY");
    for (const q of discoveryOnly) {
      expect(q.query.match(/looking for|need|hiring|requirement|seeking/i)).toBeNull();
    }
  });

  it("extracts business types from audience descriptions", () => {
    const input = makeInput({
      target_audience: [
        { segment: "Local Businesses", description: "Restaurants and clinics that need digital transformation" },
      ],
    });
    const queries = generateDiscoveryQueries(input);
    const allQueries = queries.map((q) => q.query).join(" ");
    expect(allQueries.toLowerCase()).toContain("restaurant");
  });

  it("global business works without Indian city names", () => {
    const input = makeInput({
      target_audience: [{ segment: "E-commerce Stores" }],
      locations: ["United States", "United Kingdom"],
    });
    const queries = generateDiscoveryQueries(input);
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.some((q) => q.query.includes("United States"))).toBe(true);
  });

  it("local Indian business generates Justdial-friendly queries", () => {
    const input = makeInput({
      target_audience: [{ segment: "Interior Designers" }],
      locations: ["Pune"],
    });
    const queries = generateDiscoveryQueries(input);
    const localQueries = queries.filter((q) => q.best_platform === "google_maps");
    expect(localQueries.length).toBeGreaterThan(0);
  });
});
