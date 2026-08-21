/**
 * External Discovery — Canonical Data Model
 *
 * All external discovery sources (Google Search, Maps, Justdial, directories,
 * Scout/Kiryano) normalize their output into these types.
 *
 * Provider-neutral: the pipeline does NOT know or care which provider
 * fetched the data. Providers are swappable via environment config.
 */

// ─── External Discovery Platforms ───────────────────────────────────────────

export const EXTERNAL_PLATFORMS = [
  "google_search",
  "google_maps",
  "justdial",
  "directory",
  "scout",
] as const;

export type ExternalPlatform = (typeof EXTERNAL_PLATFORMS)[number];

// ─── Evidence Classification ────────────────────────────────────────────────
// Every claim about a business MUST carry one of these classifications.
// The system must NEVER invent urgency or fabricate evidence.

export const EVIDENCE_LEVELS = [
  "VERIFIED_DIRECT",   // Business explicitly stated the need
  "STRONG_INFERRED",   // Multiple independent signals corroborate
  "WEAK_SIGNAL",       // Single source, category-based, or old data
  "NO_EVIDENCE",       // No supporting data found
  "CONFLICTING",       // Sources disagree
] as const;

export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

// ─── Source Provenance ──────────────────────────────────────────────────────
// Tracks which source provided each data point and when.

export interface SourceProvenance {
  /** Which external platform provided this data */
  platform: ExternalPlatform;
  /** Provider-specific source identifier (e.g., SerpAPI, Google Places, manual) */
  provider: string;
  /** URL or reference to the original data */
  source_url: string | null;
  /** When this data was fetched */
  fetched_at: string;
  /** Raw snippet/excerpt from the source */
  raw_snippet: string | null;
}

// ─── Evidence Item ──────────────────────────────────────────────────────────
// A single piece of evidence about a business, with classification.

export interface EvidenceItem {
  /** What the evidence claims */
  claim: string;
  /** Classification of this evidence */
  level: EvidenceLevel;
  /** Where this evidence came from */
  source: SourceProvenance;
  /** Confidence in this specific claim (0.0–1.0) */
  confidence: number;
  /** Supporting quote or data excerpt */
  quote: string | null;
}

// ─── Contact Channel ────────────────────────────────────────────────────────

export interface ContactChannel {
  type: "phone" | "whatsapp" | "email" | "instagram" | "facebook" | "linkedin" | "website";
  value: string;
  /** Which source provided this contact */
  source: SourceProvenance;
  /** Whether this contact has been verified/validated */
  verified: boolean;
}

// ─── External Business ──────────────────────────────────────────────────────
// The CANONICAL lead model that ALL external sources normalize into.
// This is the single "shape" that flows through the pipeline.

export interface ExternalBusiness {
  /** Stable dedup key: normalized(name + location + phone/website) */
  identity_key: string;

  // ─── Identity ───────────────────────────────────────────────────────────
  business_name: string;
  business_category: string | null;
  location: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pin_code: string | null;

  // ─── Contact Channels ──────────────────────────────────────────────────
  contacts: ContactChannel[];

  // ─── Web Presence ──────────────────────────────────────────────────────
  website_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;

  // ─── Business Signals ──────────────────────────────────────────────────
  /** Rating from directory/maps (0–5 scale) */
  rating: number | null;
  /** Number of reviews */
  review_count: number | null;
  /** Years in business, if discoverable */
  years_in_business: number | null;
  /** Employee count range, if discoverable */
  employee_range: string | null;

  // ─── Evidence ──────────────────────────────────────────────────────────
  evidence: EvidenceItem[];

  // ─── Source Tracking ───────────────────────────────────────────────────
  /** All sources that contributed to this record */
  sources: SourceProvenance[];
  /** When this record was first discovered */
  discovered_at: string;

  // ─── Raw provider-specific data for debugging ─────────────────────────
  raw_data: Record<string, any>;
}

// ─── Sub-Scores ─────────────────────────────────────────────────────────────
// Each sub-score is 0–100. Penalties are negative adjustments.

export interface DiscoverySubScores {
  /** Does this business match the user's ICP? */
  icp_fit: number;
  /** Is there evidence of a specific requirement we can serve? */
  requirement_fit: number;
  /** Is there time-sensitive urgency? (NEVER fabricated) */
  urgency: number;
  /** Does the business size/type/stage fit our offering? */
  business_fit: number;
  /** Can we actually reach this business? (phone/email/social available) */
  contactability: number;
  /** How strong is the evidence behind our conclusions? */
  evidence_strength: number;
  /** How confident are we that this is a real, correctly-identified business? */
  identity_confidence: number;

  // ─── Penalties (negative values) ──────────────────────────────────────
  /** Penalty for conflicting data across sources */
  penalty_conflicting_data: number;
  /** Penalty for outdated/stale information */
  penalty_outdated: number;
  /** Penalty for single-source-only data */
  penalty_single_source: number;
  /** Penalty for unsupported inference (category-only guesses) */
  penalty_unsupported_inference: number;
}

// ─── Scored Business ────────────────────────────────────────────────────────
// ExternalBusiness after scoring — ready for the quality gate.

export interface ScoredBusiness extends ExternalBusiness {
  sub_scores: DiscoverySubScores;

  /** Final lead attractiveness/priority score (0–100) */
  final_score: number;

  /**
   * How reliable is the evidence behind this conclusion? (0.0–1.0)
   * This is NOT the same as final_score.
   *  - final_score = "how attractive is this opportunity?"
   *  - confidence = "how trustworthy is our data?"
   */
  confidence: number;

  /** Detected requirement/problem, if any */
  detected_requirement: string | null;

  /** Human-readable "Why This Lead" summary */
  why_this_lead: string | null;

  /** What information is missing */
  missing_information: string[];

  /** What information conflicts across sources */
  conflicting_information: string[];

  /** Recommended outreach channel + rationale */
  recommended_channel: ContactChannel["type"] | null;
  recommended_channel_reason: string | null;

  /** Whether this lead needs human review before outreach */
  needs_review: boolean;
  needs_review_reasons: string[];
}

// ─── Quality Gate Status ────────────────────────────────────────────────────

export type QualityGateStatus =
  | "APPROVED"         // Meets threshold, ready for Find Leads
  | "NEEDS_REVIEW"     // Has issues, needs human review
  | "REJECTED"         // Below threshold, not shown
  | "INSUFFICIENT";    // Not enough data to score

// ─── Discovery Run ──────────────────────────────────────────────────────────

export interface DiscoveryRunConfig {
  /** User's services/offerings */
  services: string[];
  /** Target industries/categories */
  target_industries: string[];
  /** Target locations */
  target_locations: string[];
  /** Target business problems */
  target_problems: string[];
  /** Max queries per source */
  max_queries_per_source: number;
  /** Max results per query */
  max_results_per_query: number;
  /** Which external platforms to use */
  enabled_platforms: ExternalPlatform[];
}

export const DEFAULT_RUN_CONFIG: Partial<DiscoveryRunConfig> = {
  max_queries_per_source: 5,
  max_results_per_query: 10,
  enabled_platforms: ["google_search", "google_maps", "justdial"],
};
