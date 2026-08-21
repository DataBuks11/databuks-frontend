import type { RawDiscoveryCandidate } from "./providers/types";

export interface NormalizedCandidate {
  /** Original raw candidate for provenance */
  raw: RawDiscoveryCandidate;
  /** Cleaned business/page title */
  businessName: string;
  /** Extracted domain (lowercase, no www/protocol/path) */
  domain: string | null;
  /** Normalized website URL */
  websiteUrl: string | null;
  /** The query that found this candidate */
  query: string;
  /** Query type */
  queryType: string;
  /** Source URL of the search result */
  sourceUrl: string;
  /** Discovered timestamp */
  discoveredAt: string;
  /** Provider name */
  provider: string;
}

/** Strip protocol, www., path, and lowercase a URL to get bare domain */
export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Clean whitespace and collapse multiple spaces */
function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Normalize a business name for comparison (not for display) */
export function normalizeNameForComparison(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(the|a|an|and|of|in|at|for)\b/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize a URL to canonical form */
export function normalizeWebsiteUrl(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  let cleaned = url.trim();
  if (!cleaned) return null;
  if (!/^https?:\/\//i.test(cleaned)) cleaned = `https://${cleaned}`;
  try {
    const parsed = new URL(cleaned);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `https://${host}${path}`;
  } catch {
    return null;
  }
}

/** Convert a RawDiscoveryCandidate into a NormalizedCandidate */
export function normalizeCandidate(raw: RawDiscoveryCandidate): NormalizedCandidate {
  // Try to extract a business name from the title by removing common suffixes
  let businessName = cleanText(raw.title);
  // Remove common suffixes like "| Home", "- Official Site", etc.
  businessName = businessName
    .replace(/\s*[|–—-]\s*(home|official\s*site|welcome|website|homepage)$/i, "")
    .replace(/\s*[|–—]\s*(best|top|leading)\s+.*$/i, "")
    .trim();

  // Only extract domain from website_url (the business's own site).
  // source_url is the SEARCH RESULTS page — NOT the business's domain.
  const websiteUrl = raw.website_url ? normalizeWebsiteUrl(raw.website_url) : null;
  const domain = websiteUrl ? extractDomain(websiteUrl) : null;

  return {
    raw,
    businessName,
    domain,
    websiteUrl,
    query: raw.query,
    queryType: raw.query_type,
    sourceUrl: raw.source_url,
    discoveredAt: raw.discovered_at,
    provider: raw.source,
  };
}

/** Normalize all candidates in a batch */
export function normalizeCandidates(candidates: RawDiscoveryCandidate[]): NormalizedCandidate[] {
  return candidates.map(normalizeCandidate);
}
