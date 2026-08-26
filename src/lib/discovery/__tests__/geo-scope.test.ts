import { describe, expect, it } from "vitest";
import {
  generateDiscoveryQueries,
  parseLocationParts,
  type GeoScope,
} from "@/lib/discovery/query-generator";
import { normalizeInstagram } from "@/lib/discovery/enrichment";

const INPUT = {
  services: [{ name: "Website Development" }],
  target_audience: [{ segment: "hotels", description: "Hotels needing websites" }],
  industries: ["hotel"],
  locations: ["Nagpur, Maharashtra, India"],
};

describe("geo-scope discovery", () => {
  it("parses location parts (city/district/state/country)", () => {
    expect(parseLocationParts("Nagpur, Maharashtra, India")).toEqual({
      city: "Nagpur",
      district: "Nagpur",
      state: "Maharashtra",
      country: "India",
    });
    expect(parseLocationParts("Mumbai").city).toBe("Mumbai");
    const only = parseLocationParts("Mahal, Nagpur");
    expect(only.city).toBe("Mahal");
    expect(only.state).toBe("");
    expect(only.country).toBe("");
  });

  it("LOCAL-only default keeps backward-compatible queries without explicit scope field requirement", () => {
    const queries = generateDiscoveryQueries(INPUT as any, 30);
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(q.scope ?? "LOCAL").toBe("LOCAL");
      expect(q.query).toContain("Nagpur");
    }
  });

  it("generates queries for every requested scope with correct tagging", () => {
    const scopes: GeoScope[] = ["LOCAL", "NEARBY", "DISTRICT", "STATE", "COUNTRY", "GLOBAL"];
    const queries = generateDiscoveryQueries(INPUT as any, 90, scopes);
    for (const scope of scopes) {
      const inScope = queries.filter((q) => q.scope === scope);
      expect(inScope.length, `scope ${scope}`).toBeGreaterThan(0);
    }
    // NEARBY queries target curated neighbouring cities
    const nearbyQ = queries.find((q) => q.scope === "NEARBY");
    expect(nearbyQ?.query.toLowerCase()).toMatch(/kamptee|wardha|bhandara|nearby/);
    // DISTRICT queries target the district
    const districtQ = queries.find((q) => q.scope === "DISTRICT");
    expect(districtQ?.query).toContain("Nagpur");
    // STATE queries target the parsed state
    const stateQ = queries.find((q) => q.scope === "STATE");
    expect(stateQ?.query).toContain("Maharashtra");
    // COUNTRY queries target the parsed country
    const countryQ = queries.find((q) => q.scope === "COUNTRY");
    expect(countryQ?.query.toLowerCase()).toContain("india");
    // GLOBAL queries are worldwide
    const globalQ = queries.find((q) => q.scope === "GLOBAL");
    expect(globalQ?.query).toMatch(/worldwide|business/i);
  });

  it("caps maxQueries across scopes", () => {
    const queries = generateDiscoveryQueries(INPUT as any, 10, ["LOCAL", "STATE", "COUNTRY", "GLOBAL"]);
    expect(queries.length).toBeLessThanOrEqual(10);
  });
});

describe("normalizeInstagram", () => {
  it("normalizes profile URLs to canonical form + handle", () => {
    expect(normalizeInstagram("https://www.instagram.com/myhotel/?hl=en")).toEqual({
      url: "https://www.instagram.com/myhotel/",
      handle: "myhotel",
    });
    expect(normalizeInstagram("instagram.com/hotel.grande/")).toEqual({
      url: "https://www.instagram.com/hotel.grande/",
      handle: "hotel.grande",
    });
  });

  it("rejects generic/system URLs", () => {
    expect(normalizeInstagram("https://www.instagram.com/explore/")).toBeNull();
    expect(normalizeInstagram("https://www.instagram.com/p/Cxyz123/")).toBeNull();
    expect(normalizeInstagram("https://www.instagram.com/accounts/login")).toBeNull();
    expect(normalizeInstagram("https://www.instagram.com/")).toBeNull();
    expect(normalizeInstagram(null)).toBeNull();
    expect(normalizeInstagram("https://facebook.com/somepage")).toBeNull();
  });
});
