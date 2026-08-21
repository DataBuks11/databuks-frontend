import type { NormalizedCandidate } from "./normalization";
import { extractDomain, normalizeNameForComparison } from "./normalization";

export interface IdentitySignal {
  signal_type: string;
  matched_value: string;
  confidence: number;
  reason: string;
}

export interface IdentityMatchResult {
  same_business: boolean;
  confidence: number;
  signals: IdentitySignal[];
  reason: string;
}

/** Confidence thresholds */
const MERGE_THRESHOLD = 0.7;
const STRONG_SIGNAL_CONFIDENCE = 0.85;

function extractDomainFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Compare two business names for similarity (0.0-1.0) */
function nameSimilarity(a: string, b: string): number {
  const na = normalizeNameForComparison(a);
  const nb = normalizeNameForComparison(b);
  if (na === nb) return 1.0;
  if (na.length === 0 || nb.length === 0) return 0.0;

  // Check if one contains the other
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  // Token overlap
  const tokensA = new Set(na.split(" "));
  const tokensB = new Set(nb.split(" "));
  const common = [...tokensA].filter((t) => tokensB.has(t)).length;
  const total = new Set([...tokensA, ...tokensB]).size;
  if (total === 0) return 0.0;

  return common / total;
}

/**
 * Determine whether two normalized candidates represent the same business.
 * Uses deterministic signals only. No AI, no fuzzy guessing.
 */
export function resolveIdentityMatch(
  a: NormalizedCandidate,
  b: NormalizedCandidate
): IdentityMatchResult {
  const signals: IdentitySignal[] = [];
  let confidence = 0.0;

  // ─── Signal 1: Exact domain match (strongest) ────────────────────────────
  const domainA = a.domain ?? extractDomainFromUrl(a.websiteUrl);
  const domainB = b.domain ?? extractDomainFromUrl(b.websiteUrl);

  if (domainA && domainB && domainA === domainB) {
    confidence = 0.95;
    signals.push({
      signal_type: "exact_domain_match",
      matched_value: domainA,
      confidence: 0.95,
      reason: `Both records share the exact domain: ${domainA}`,
    });
  }

  // ─── Signal 2: Business name similarity + domain match ───────────────────
  const nameSim = nameSimilarity(a.businessName, b.businessName);

  if (domainA && domainB && domainA !== domainB && nameSim >= 0.7) {
    confidence = Math.max(confidence, 0.55);
    signals.push({
      signal_type: "similar_name_different_domain",
      matched_value: `${a.businessName} vs ${b.businessName}`,
      confidence: 0.55,
      reason: `Similar business names but different domains (${domainA} vs ${domainB}) — insufficient for automatic merge`,
    });
  }

  // ─── Signal 3: Exact same domain root (subdomain variation) ──────────────
  if (domainA && domainB && domainA !== domainB) {
    const rootA = domainA.split(".").slice(-2).join(".");
    const rootB = domainB.split(".").slice(-2).join(".");
    if (rootA === rootB && domainA !== domainB) {
      confidence = Math.max(confidence, 0.75);
      signals.push({
        signal_type: "same_root_domain",
        matched_value: rootA,
        confidence: 0.75,
        reason: `Subdomain variation of the same root domain: ${rootA}`,
      });
    }
  }

  // ─── Signal 4: Business name exact match (after normalization) ───────────
  if (nameSim >= 1.0) {
    confidence = Math.max(confidence, 0.45);
    signals.push({
      signal_type: "exact_name_match",
      matched_value: a.businessName,
      confidence: 0.45,
      reason: "Exact business name match after normalization — moderate signal only",
    });

    // Name match + same query context boosts confidence
    if (a.query === b.query) {
      confidence = Math.max(confidence, 0.55);
      signals.push({
        signal_type: "name_match_same_query",
        matched_value: a.query,
        confidence: 0.55,
        reason: "Exact name match found by the same search query",
      });
    }
  }

  // ─── Signal 5: High name similarity (but not exact) ──────────────────────
  if (nameSim >= 0.7 && nameSim < 1.0) {
    confidence = Math.max(confidence, 0.35);
    signals.push({
      signal_type: "similar_name",
      matched_value: `${a.businessName} ~ ${b.businessName}`,
      confidence: 0.35,
      reason: `Similar business names (${Math.round(nameSim * 100)}% similarity) — insufficient alone for merge`,
    });
  }

  // ─── Determine result ────────────────────────────────────────────────────
  const sameBusiness = confidence >= MERGE_THRESHOLD;

  const reason = sameBusiness
    ? `Same business identified (confidence: ${Math.round(confidence * 100)}%) — ${signals.map((s) => s.reason).join("; ")}`
    : `Different or ambiguous businesses (confidence: ${Math.round(confidence * 100)}%) — ${signals.length > 0 ? signals.map((s) => s.reason).join("; ") : "no strong identity signals found"}`;

  return {
    same_business: sameBusiness,
    confidence: Math.round(confidence * 100) / 100,
    signals,
    reason,
  };
}

// ─── Canonical Business Grouping ────────────────────────────────────────────

export interface CanonicalBusinessGroup {
  /** Primary candidate (highest quality / most data) */
  primary: NormalizedCandidate;
  /** All candidates that belong to this same business */
  all_candidates: NormalizedCandidate[];
  /** Merged domain (best available) */
  domain: string | null;
  /** Merged business name (from primary) */
  business_name: string;
  /** Identity confidence of the grouping */
  identity_confidence: number;
}

/**
 * Group normalized candidates into canonical businesses.
 * Uses pairwise identity resolution to cluster candidates.
 */
export function groupIntoCanonicalBusinesses(
  candidates: NormalizedCandidate[]
): CanonicalBusinessGroup[] {
  if (candidates.length === 0) return [];
  if (candidates.length === 1) {
    return [{ primary: candidates[0], all_candidates: [candidates[0]], domain: candidates[0].domain, business_name: candidates[0].businessName, identity_confidence: 1.0 }];
  }

  // Sort by domain availability (candidates with domains are better primaries)
  const sorted = [...candidates].sort((a, b) => {
    if (a.domain && !b.domain) return -1;
    if (!a.domain && b.domain) return 1;
    return 0;
  });

  const groups: CanonicalBusinessGroup[] = [];
  const assigned = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (assigned.has(i)) continue;
    assigned.add(i);

    const primary = sorted[i];
    const group: NormalizedCandidate[] = [primary];
    let minConfidence = 1.0;

    for (let j = i + 1; j < sorted.length; j++) {
      if (assigned.has(j)) continue;
      const match = resolveIdentityMatch(primary, sorted[j]);
      if (match.same_business) {
        assigned.add(j);
        group.push(sorted[j]);
        minConfidence = Math.min(minConfidence, match.confidence);
      }
    }

    groups.push({
      primary,
      all_candidates: group,
      domain: primary.domain,
      business_name: primary.businessName,
      identity_confidence: Math.round(minConfidence * 100) / 100,
    });
  }

  return groups;
}
