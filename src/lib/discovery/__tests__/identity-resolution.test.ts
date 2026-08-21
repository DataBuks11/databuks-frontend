import { describe, expect, it } from "vitest";
import {
  normalizeWebsiteUrl,
  normalizeCandidate,
} from "@/lib/discovery/normalization";
import { resolveIdentityMatch } from "@/lib/discovery/identity-resolution";
import type { RawDiscoveryCandidate } from "@/lib/discovery/providers/types";

function makeCandidate(overrides: Partial<RawDiscoveryCandidate> = {}): RawDiscoveryCandidate {
  return {
    source: "google_search",
    source_url: "https://results.example.com/search?q=test",
    title: "Test Business",
    snippet: "A test business snippet",
    website_url: null,
    query: "test query",
    query_type: "BUSINESS_DISCOVERY",
    discovered_at: "2026-01-15T10:00:00Z",
    raw_metadata: {},
    ...overrides,
  };
}

describe("normalization", () => {
  it("extracts domain from website_url", () => {
    const candidate = makeCandidate({ website_url: "https://www.example.com/about" });
    const normalized = normalizeCandidate(candidate);
    expect(normalized.domain).toBe("example.com");
  });

  it("strips www. prefix from URLs", () => {
    expect(normalizeWebsiteUrl("https://www.example.com")).toBe("https://example.com");
  });

  it("removes tracking parameters when normalizing URLs", () => {
    const result = normalizeWebsiteUrl("https://example.com/page?utm_source=google");
    expect(result).toBe("https://example.com/page");
  });

  it("cleans suffixes from business names", () => {
    const candidate = makeCandidate({ title: "ABC Hotel | Home" });
    const normalized = normalizeCandidate(candidate);
    expect(normalized.businessName).toBe("ABC Hotel");
  });
});

describe("identity resolution — domain matching", () => {
  it("matches candidates with the exact same domain (strong signal)", () => {
    const a = normalizeCandidate(makeCandidate({ title: "ABC Hotel", website_url: "https://abc-hotel.com" }));
    const b = normalizeCandidate(makeCandidate({ title: "ABC Hotel Nagpur", website_url: "https://www.abc-hotel.com/" }));
    const match = resolveIdentityMatch(a, b);
    expect(match.same_business).toBe(true);
    expect(match.confidence).toBeGreaterThanOrEqual(0.9);
    expect(match.signals.some((s) => s.signal_type === "exact_domain_match")).toBe(true);
  });

  it("does NOT merge same-name businesses with different domains (false positive protection)", () => {
    const a = normalizeCandidate(makeCandidate({ title: "ABC Hotel", website_url: "https://abc-hotel.com" }));
    const b = normalizeCandidate(makeCandidate({ title: "ABC Hotel", website_url: "https://different-site.example" }));
    const match = resolveIdentityMatch(a, b);
    expect(match.same_business).toBe(false);
  });
});

describe("identity resolution — name-based matching limits", () => {
  it("does NOT merge businesses with similar names but no shared domain (false positive protection)", () => {
    const a = normalizeCandidate(makeCandidate({ title: "Hotel Sunrise Nagpur" }));
    const b = normalizeCandidate(makeCandidate({ title: "Sunrise Hotel Nagpur" }));
    const match = resolveIdentityMatch(a, b);
    expect(match.same_business).toBe(false);
  });

  it("does NOT merge different businesses in the same city", () => {
    const a = normalizeCandidate(makeCandidate({ title: "Hotel A Nagpur" }));
    const b = normalizeCandidate(makeCandidate({ title: "Hotel B Nagpur" }));
    const match = resolveIdentityMatch(a, b);
    expect(match.same_business).toBe(false);
  });

  it("gives moderate confidence for exact name match without domain evidence", () => {
    const a = normalizeCandidate(makeCandidate({ title: "Test Co Mumbai" }));
    const b = normalizeCandidate(makeCandidate({ title: "Test Co Mumbai" }));
    const match = resolveIdentityMatch(a, b);
    expect(match.confidence).toBeGreaterThanOrEqual(0.45);
    expect(match.confidence).toBeLessThan(0.7);
  });
});

describe("identity resolution — deterministic results", () => {
  it("produces identical results for identical inputs regardless of call order", () => {
    const a = normalizeCandidate(makeCandidate({ title: "Test Co", website_url: "https://test.co" }));
    const b = normalizeCandidate(makeCandidate({ title: "Test Co Branch", website_url: "https://test.co/branch" }));

    const first = resolveIdentityMatch(a, b);
    const second = resolveIdentityMatch(b, a);
    expect(first.same_business).toBe(second.same_business);
    expect(first.confidence).toBe(second.confidence);
  });
});
