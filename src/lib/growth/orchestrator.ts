import { generateDiscoveryQueries, type DiscoveryQuery, type GeoScope } from "../discovery/query-generator";
import { idempotencyKey } from "../ai/utils/idempotency";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCandidates } from "../discovery/normalization";
import { groupIntoCanonicalBusinesses } from "../discovery/identity-resolution";
import { enrichFromWebsite } from "../discovery/enrichment";
import { analyzeRequirement, analyzeUrgency } from "../discovery/requirement-analysis";
import { detectOpportunities, primaryOpportunity } from "../discovery/opportunity-detector";

/** Max LLM industry checks per discovery run (free-tier budget). */
const MAX_AI_INDUSTRY_CHECKS = 12;

export interface AiIndustryVerdict {
  detected_industry: string | null;
  relevance: number;
  is_competitor: boolean;
  reason: string;
}

/**
 * AI industry relevance — the LLM (not keyword substring) decides:
 * (1) what industry is this business actually in,
 * (2) 0-100 relevance as a prospect for OUR business,
 * (3) whether it's a same-line competitor (never a lead).
 * Only called for shortlisted candidates (keeps the funnel fast + free).
 */
export async function classifyIndustryFit(
  candidateName: string,
  candidateText: string,
  business: { name: string; industries: string[]; services: string[]; excluded: string[] }
): Promise<AiIndustryVerdict | null> {
  const fallback: AiIndustryVerdict = { detected_industry: null, relevance: 50, is_competitor: false, reason: "llm-unavailable" };
  try {
    const { getActiveProvider } = await import("../ai/providers");
    const provider = getActiveProvider();
    const out: any = await provider.completeJson({
      system: [
        "You classify whether a discovered business is a good sales prospect.",
        "Our business sells to specific industries — decide fit from EVIDENCE, not name similarity.",
        "is_competitor=true ONLY when the candidate sells the same services we sell (agency/studio/consultancy overlap). A hospital using software is a prospect, not a competitor. A web-design agency IS a competitor to a web agency.",
        "relevance 0-100: would our sales team want this as a lead? Needs our services + reachable + real business = high. Same-line competitor = 0.",
        "Respond ONLY with JSON: {\"detected_industry\": string|null, \"relevance\": 0-100, \"is_competitor\": bool, \"reason\": short string}.",
      ].join("\n"),
      user: [
        `OUR BUSINESS: ${business.name || "unknown"}`,
        `OUR INDUSTRIES: ${(business.industries || []).join(", ") || "unknown"}`,
        `OUR SERVICES: ${(business.services || []).slice(0, 12).join(", ") || "unknown"}`,
        `EXCLUDED: ${(business.excluded || []).join(", ") || "none"}`,
        `CANDIDATE: ${candidateName || "unknown"}`,
        `CANDIDATE TEXT: ${String(candidateText || "").slice(0, 1500)}`,
      ].join("\n"),
      temperature: 0,
      maxTokens: 300,
      reasoningEffort: "low",
      timeoutMs: 30_000,
      maxAttempts: 2,
    });
    if (!out || typeof out !== "object") return fallback;
    return {
      detected_industry: typeof out.detected_industry === "string" ? out.detected_industry : null,
      relevance: Math.max(0, Math.min(100, Number(out.relevance ?? 50) || 0)),
      is_competitor: out.is_competitor === true,
      reason: String(out.reason ?? "no reason").slice(0, 300),
    };
  } catch {
    return fallback;
  }
}

/** Most-specific scope wins when a business appears under multiple scopes. */
const SCOPE_PRIORITY: Record<GeoScope, number> = { LOCAL: 0, NEARBY: 1, DISTRICT: 2, STATE: 3, COUNTRY: 4, GLOBAL: 5 };

function mostSpecificScope(scopes: (GeoScope | undefined)[]): GeoScope {
  let best: GeoScope = "GLOBAL";
  for (const s of scopes) {
    const scope = (s ?? "LOCAL") as GeoScope;
    if (SCOPE_PRIORITY[scope] < SCOPE_PRIORITY[best]) best = scope;
  }
  return best;
}

/** Geo relevance bonus — closer to the user's region = more relevant lead. */
export function geoRelevanceBonus(scope: GeoScope): number {
  switch (scope) {
    case "LOCAL": return 15;
    case "NEARBY": return 12;
    case "DISTRICT": return 10;
    case "STATE": return 8;
    case "COUNTRY": return 5;
    default: return 0;
  }
}

export interface FindLeadsResult {
  run_id: string;
  status: "COMPLETED" | "PARTIAL" | "FAILED" | "RUNNING";
  queries_generated: number;
  raw_candidates: number;
  canonical_businesses: number;
  enriched_count: number;
  qualified_count: number;
  needs_review_count: number;
  competitors_filtered: number;
  errors: string[];
  geo_counts?: Record<string, { qualified: number; needs_review: number }>;
}

const AGENCY_SIGNALS = [
  /\bagenc(?:y|ies)\b/i,
  /\bstudio\b/i,
  /\bsoftware\b/i,
  /\bweb\s?design\b/i,
  /\bweb\s?development\b/i,
  /\bwebsite\s?(design|development|makers|company|firm|studio|agency)\b/i,
  /\bapp\s?development\b/i,
  /\bmobile\s?apps?\b/i,
  /\bdigital\s?marketing\b/i,
  /\bseo\b/i,
  /\btechnologies\b/i,
  /\btechnology\b/i,
  /\btech\s?(solutions|company|firm)\b/i,
  /\bit\s?(solutions|services|company|firm)\b/i,
  /\bsoft\s?tech\b/i,
  /\bsoftware\s?(company|firm|solutions)\b/i,
  /\bdevelopment\s?(company|firm)\b/i,
  /\bweb\s?solutions\b/i,
  /\bweb\s?(studio|agency|firm|company)\b/i,
  /\becommerce\s?development\b/i,
  /\bdevelopers?\b/i,
  /\bmakers\b/i,
  /\btech\b/i,
  /\bdesign\s?(company|firm|studio|agency)\b/i,
  // Single-token names starting with "web"/"app" + 3 (WebCreata, Appzmine…)
  /\bweb[a-z]{3,}\b/i,
  /\bapp[a-z]{3,}\b/i,
  /\bcreat[a-z]*\b/i,
];
const STOPWORDS = new Set("and,the,for,with,our,your,from,that,this,will,have,has,are,was,were,into,over,under,services,service,solutions,solution,company,business,agency,digital,online,best,top,leading,professional,quality,custom".split(","));

/** Own-service keywords from business context (significant words only). */
function ownServiceKeywords(bcData: any): string[] {
  const names: string[] = [
    ...(Array.isArray(bcData.services) ? bcData.services.map((s: any) => (typeof s === "string" ? s : s?.name ?? "")) : []),
    ...(Array.isArray(bcData.products) ? bcData.products.map((p: any) => (typeof p === "string" ? p : p?.name ?? "")) : []),
  ];
  const words = new Set<string>();
  for (const n of names) {
    for (const w of String(n ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length > 2 && !STOPWORDS.has(w)) words.add(w);
    }
  }
  return [...words];
}

/**
 * Competitor detection — answers "ye lead kaise hui?": a candidate that IS
 * in our own line of business (agency/studio selling the same services) is
 * a competitor, NOT a prospect. Only the CANDIDATE's own text is examined.
 * Returns a reason or null.
 */
function detectCompetitor(candidateText: string, bcData: any): string | null {
  const text = String(candidateText ?? "").toLowerCase();
  const excluded: string[] = Array.isArray(bcData.excluded_industries) ? bcData.excluded_industries : [];
  for (const ex of excluded) {
    if (typeof ex === "string" && ex.length > 2 && text.includes(ex.toLowerCase())) {
      return `excluded industry "${ex}"`;
    }
  }
  // Count distinct agency signals (not raw hits — one phrase family = 1).
  const signalCount = AGENCY_SIGNALS.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
  if (signalCount === 0) return null;
  const keywords = ownServiceKeywords(bcData);
  if (keywords.length === 0) return signalCount >= 3 ? "strong agency signals (no service keywords configured)" : null;
  // Whole-word overlap only: "website" must NOT match keyword "web".
  const hits = keywords.filter((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text));
  if (signalCount >= 2 || (signalCount >= 1 && hits.length >= 1)) {
    return `same-line agency (${signalCount} signals${hits.length > 0 ? ` + own services: ${hits.slice(0, 3).join(", ")}` : ""})`;
  }
  return null;
}

export async function runFindLeads(
  supabase: SupabaseClient,
  userId: string,
  options?: { max_queries?: number; max_pages?: number; scopes?: GeoScope[] }
): Promise<FindLeadsResult> {
  const result: FindLeadsResult = {
    run_id: "", status: "RUNNING", queries_generated: 0, raw_candidates: 0,
    canonical_businesses: 0, enriched_count: 0, qualified_count: 0,
    needs_review_count: 0, competitors_filtered: 0, errors: [], geo_counts: {},
  };

  const maxQueries = options?.max_queries ?? 15;
  const maxPages = options?.max_pages ?? 100;
  const scopes: GeoScope[] = options?.scopes?.length ? options.scopes : ["LOCAL"];

  const { data: bcData } = await supabase.from("business_context").select("*").eq("user_id", userId).maybeSingle();
  if (!bcData) {
    result.status = "FAILED";
    result.errors.push("Business context not configured.");
    return result;
  }

  const { data: runRecord } = await supabase.from("discovery_runs").insert({ user_id: userId, status: "RUNNING" }).select().single();
  result.run_id = runRecord.id;

  try {
    const queryInput = {
      services: Array.isArray(bcData.services) ? bcData.services.map((s: any) => ({ name: typeof s === "string" ? s : s.name ?? "" })) : [],
      target_audience: Array.isArray(bcData.target_audience) ? bcData.target_audience.map((a: any) => ({
        segment: typeof a === "string" ? a : (a?.segment ?? ""),
        description: typeof a === "object" && a !== null ? a.description ?? null : null,
      })) : [],
      industries: Array.isArray(bcData.industries) ? bcData.industries : [],
      locations: Array.isArray(bcData.locations) ? bcData.locations : [],
      content_themes: Array.isArray(bcData.content_themes) ? bcData.content_themes.map((t: any) => ({ title: typeof t === "string" ? t : t?.title ?? "" })) : [],
    };
    const queries: DiscoveryQuery[] = generateDiscoveryQueries(queryInput as any, maxQueries, scopes);
    result.queries_generated = queries.length;

    // Providers — carry each query's geo scope through to its candidates
    const allRawCandidates: { source_url: string; title: string; snippet: string; website_url: string | null; provider: string; scope: GeoScope }[] = [];
    let googleSearchOk = false;
    let googleMapsOk = false;

    const scopeOf = (queryText: string): GeoScope => {
      const q = queries.find((qq) => qq.query === queryText);
      return (q?.scope ?? "LOCAL") as GeoScope;
    };

    try {
      const gsMod = await import("../discovery/providers/google-search");
      const gsProvider = new gsMod.GoogleSearchProvider();
      if (gsProvider.isConfigured()) {
        const gsResult = await gsProvider.discover(queries.slice(0, Math.min(queries.length, 10)));
        for (const c of gsResult.candidates) {
          allRawCandidates.push({ source_url: c.source_url, title: c.title, snippet: c.snippet, website_url: c.website_url, provider: "google_search", scope: (c.raw_metadata?.scope as GeoScope) ?? scopeOf(c.query) });
        }
        for (const e of gsResult.errors.slice(0, 3)) {
          result.errors.push(`google_search [${e.query}]: ${e.error}`);
        }
        googleSearchOk = true;
      }
    } catch (err: any) {
      result.errors.push(`google_search provider failed: ${err?.message ?? "unknown"}`);
    }

    try {
      const gmMod = await import("../discovery/providers/google-maps");
      const gmProvider = new gmMod.GoogleMapsProvider();
      if (gmProvider.isConfigured()) {
        const gmResult = await gmProvider.discover(queries.slice(0, Math.min(queries.length, 10)));
        for (const c of gmResult.candidates) {
          allRawCandidates.push({ source_url: c.source_url, title: c.title, snippet: c.snippet, website_url: c.website_url, provider: "google_maps", scope: (c.raw_metadata?.scope as GeoScope) ?? scopeOf(c.query) });
        }
        for (const e of gmResult.errors.slice(0, 3)) {
          result.errors.push(`google_maps [${e.query}]: ${e.error}`);
        }
        googleMapsOk = true;
      } else {
        result.errors.push("google_maps: GOOGLE_MAPS_API_KEY not configured");
      }
    } catch (err: any) {
      result.errors.push(`google_maps provider failed: ${err?.message ?? "unknown"}`);
    }

    // --- DeepSeek LLM discovery (no Google keys needed) ---
    // The LLM proposes real businesses per category; every suggestion is
    // live-verified (website must fetch) before entering the pipeline.
    try {
      const llmMod = await import("../discovery/providers/deepseek-llm");
      const llmProvider = new llmMod.DeepSeekDiscoveryProvider();
      const svcNames: string[] = Array.isArray(bcData.services)
        ? bcData.services.map((s: any) => (typeof s === "string" ? s : s?.name ?? "")).filter(Boolean)
        : [];
      const locs: string[] = Array.isArray(bcData.locations) && bcData.locations.length > 0
        ? bcData.locations.map((l: any) => String(l ?? "")).filter(Boolean)
        : [];
      const llmResult = await llmProvider.discover(queries.slice(0, Math.min(queries.length, 10)), {
        business: {
          name: typeof bcData.business_name === "string" ? bcData.business_name : "",
          industries: Array.isArray(bcData.industries) ? bcData.industries : [],
          services: svcNames,
        },
        locations: locs,
      } as any);
      for (const c of llmResult.candidates) {
        allRawCandidates.push({ source_url: c.source_url, title: c.title, snippet: c.snippet, website_url: c.website_url, provider: "deepseek_llm", scope: (c.raw_metadata?.scope as GeoScope) ?? "LOCAL" });
      }
      for (const e of llmResult.errors.slice(0, 3)) {
        result.errors.push(`deepseek_llm [${e.query}]: ${e.error}`);
      }
    } catch (err: any) {
      result.errors.push(`deepseek_llm provider failed: ${err?.message ?? "unknown"}`);
    }

    // Honest run status: zero raw candidates must never read as a clean COMPLETED run.
    // result.errors carries the per-provider cause (unconfigured / denied / rate-limited).
    if (allRawCandidates.length === 0) {
      result.status = "PARTIAL";
    }

    result.raw_candidates = allRawCandidates.length;

    // Normalize — real provider provenance + scope carried through
    const normalized = normalizeCandidates(
      allRawCandidates.map((c) => ({
        source: c.provider, source_url: c.source_url, title: c.title, snippet: c.snippet,
        website_url: c.website_url, query: "", query_type: "BUSINESS_DISCOVERY",
        discovered_at: new Date().toISOString(),
        raw_metadata: { provider: c.provider, scope: c.scope },
      }))
    );

    // Identity resolution
    const canonicalGroups = groupIntoCanonicalBusinesses(normalized);
    result.canonical_businesses = canonicalGroups.length;

    // Enrich + score + persist
    let enrichedCount = 0;
    let qualifiedCount = 0;
    let needsReviewCount = 0;
    let aiChecksUsed = 0;

    // Our business fingerprint for AI relevance checks (built once per run).
    const strList = (v: any): string[] =>
      Array.isArray(v) ? v.map((x: any) => (typeof x === "string" ? x : x?.name ?? x?.segment ?? "")).filter((s: any) => typeof s === "string" && s.length > 0) : [];
    const ourBusiness = {
      name: typeof bcData.business_name === "string" ? bcData.business_name : "",
      industries: strList(bcData.industries),
      services: [...strList(bcData.services), ...strList(bcData.products)],
      excluded: strList(bcData.excluded_industries),
    };

    for (const group of canonicalGroups) {
      if (enrichedCount >= maxPages) break;
      const primary = group.primary;

      let enrichmentData: any = {};
      let hasPhone = false;
      let hasEmail = false;
      let addressText: string | null = null;
      let socialLinks: Record<string, string | null> = {};

      // Google Places Details provides a real phone even when the website
      // cannot be crawled — genuine contactability evidence.
      const placesPhone = group.all_candidates
        .map((c: any) => c.raw?.raw_metadata?.details_phone)
        .find((p: any) => typeof p === "string" && p.replace(/\D/g, "").length >= 8) ?? null;

      if (primary.websiteUrl) {
        try {
          const enrichment = await enrichFromWebsite(primary.websiteUrl);
          if (enrichment.success) {
            enrichedCount += 1;
            enrichmentData = enrichment;
            hasPhone = (enrichment.phones?.length ?? 0) > 0;
            hasEmail = (enrichment.emails?.length ?? 0) > 0;
            socialLinks = enrichment.social_links ?? {};
            if (!addressText && enrichment.address) addressText = enrichment.address;
          }
        } catch {}
      }
      hasPhone = hasPhone || !!placesPhone;

      // Evidence for requirement/urgency analysis must include real website
      // content — a Maps address alone proves existence, not need.
      const fullText = [
        ...group.all_candidates.map((c) => c.raw?.snippet ?? ""),
        typeof enrichmentData?.page_text === "string" ? enrichmentData.page_text.slice(0, 6000) : "",
      ].join(" ");

      // Competitor gate: same-line agencies are NOT prospects. Skip before
      // scoring/persist so they never enter outreach or meeting pipelines.
      const competitorReason = detectCompetitor(
        `${group.business_name ?? ""} ${fullText}`,
        bcData
      );
      if (competitorReason) {
        result.competitors_filtered += 1;
        continue;
      }

      const reqAnalysis = analyzeRequirement(fullText || primary.businessName);
      const urgAnalysis = analyzeUrgency(fullText, reqAnalysis.status);

      // ICP industry match from available evidence
      const targetIndustries: string[] = Array.isArray(bcData.industries) ? bcData.industries : [];
      let detectedIndustry: string | null = null;
      if (targetIndustries.length > 0) {
        const haystack = `${fullText} ${primary.businessName}`.toLowerCase();
        detectedIndustry = targetIndustries.find((ind) => typeof ind === "string" && ind.length > 2 && haystack.includes(ind.toLowerCase())) ?? null;
      }

      // Relevance for place-based candidates: a verified Google Business
      // listing with rating/review history is an established local business.
      const meta = primary.raw?.raw_metadata ?? {};
      const rating = typeof meta.rating === "number" ? meta.rating : null;
      const reviewCount = typeof meta.review_count === "number" ? meta.review_count : null;
      let relevanceScore = primary.raw?.snippet ? 40 : 20;
      if (rating !== null) relevanceScore += rating >= 4 ? 15 : 8;
      if (reviewCount !== null && reviewCount >= 50) relevanceScore += 10;
      if (primary.websiteUrl) relevanceScore += 5;

      // Geo scope of this business = most specific scope among its candidates
      const groupScope = mostSpecificScope(
        group.all_candidates.map((c: any) => c.raw?.raw_metadata?.scope)
      );

      // Geo relevance: businesses closer to the user's region are more
      // relevant leads (LOCAL > STATE > COUNTRY > GLOBAL).
      relevanceScore += geoRelevanceBonus(groupScope);
      relevanceScore = Math.min(85, relevanceScore);

      // Opportunity detection (deterministic, evidence-gated): DataBuks ki
      // kaunsi service me actual scope hai. Bina evidence ke koi claim nahi.
      const enrichedPageText = typeof enrichmentData?.page_text === "string" ? enrichmentData.page_text : "";
      const opportunityText = `${fullText} ${enrichedPageText}`;
      const opportunities = detectOpportunities({
        businessName: group.business_name ?? primary.businessName ?? "",
        categoryHint: detectedIndustry ?? "",
        fullText: opportunityText,
        websiteUrl: primary.websiteUrl ?? null,
        websiteReachable: enrichmentData?.success === true,
        pageTextLength: enrichedPageText.length,
        hasPhone,
        hasEmail,
        hasWhatsAppSignal: /wa\.me|whatsapp/i.test(opportunityText),
        hasInstagram: !!socialLinks.instagram,
        hasFacebook: !!socialLinks.facebook,
      });
      const primaryOpp = primaryOpportunity(opportunities);
      // Capped relevance bonus: clear HIGH-strength scope (e.g. no website)
      // makes the lead genuinely more attractive. Weights untouched.
      if (primaryOpp?.strength === "HIGH") {
        relevanceScore = Math.min(90, relevanceScore + 5);
      }

      // Sub-scores (deterministic)
      const subScores = computeSubScores({
        requirementStatus: reqAnalysis.status,
        intentScore: 50,
        urgencyScore: urgAnalysis.score,
        relevanceScore: Math.round(relevanceScore),
        hasPhone, hasEmail,
        hasWebsite: !!primary.websiteUrl,
        hasSocialLinks: Object.keys(socialLinks).length > 0,
        hasAddress: !!addressText,
        evidenceStrengthAvg: 50,
        identityConfidence: group.identity_confidence * 100,
        targetIndustries,
        detectedIndustry,
      });

      const scoring = calculateFinalScore(subScores, []);
      const isQualified = scoring.quality_gate_status === "QUALIFIED" || scoring.quality_gate_status === "NEEDS_REVIEW";
      if (!isQualified) continue;

      // AI industry verdict (shortlist only — max 12 LLM calls per run).
      // Overrides keyword matching: real relevance + competitor detection.
      let aiVerdict: AiIndustryVerdict | null = null;
      if (aiChecksUsed < MAX_AI_INDUSTRY_CHECKS) {
        aiChecksUsed += 1;
        aiVerdict = await classifyIndustryFit(
          group.business_name ?? primary.businessName ?? "",
          fullText.slice(0, 2000),
          ourBusiness
        );
        if (aiVerdict?.is_competitor) {
          result.competitors_filtered += 1;
          continue;
        }
        if (aiVerdict?.detected_industry) detectedIndustry = aiVerdict.detected_industry;
      }
      if (aiVerdict) {
        (subScores as any).ai_industry_relevance = aiVerdict.relevance;
        (subScores as any).ai_industry_reason = aiVerdict.reason;
      }
      if (scoring.quality_gate_status === "QUALIFIED") {
        qualifiedCount += 1;
        const gc = result.geo_counts![groupScope] ?? { qualified: 0, needs_review: 0 };
        gc.qualified += 1;
        result.geo_counts![groupScope] = gc;
      } else {
        needsReviewCount += 1;
        const gc = result.geo_counts![groupScope] ?? { qualified: 0, needs_review: 0 };
        gc.needs_review += 1;
        result.geo_counts![groupScope] = gc;
      }

      const identityKey = normalizeKey(group.business_name);
      const socialLinksFinal = enrichmentData?.social_links ?? {};

      const { data: existingBiz } = await supabase
        .from("canonical_businesses")
        .select("id")
        .eq("user_id", userId)
        .eq("identity_key", identityKey)
        .maybeSingle();

      let bizId: string = "";
      const bizPayload = {
        user_id: userId,
        identity_key: identityKey,
        business_name: group.business_name,
        domain: primary.domain,
        website_url: primary.websiteUrl,
        phones: placesPhone && !(enrichmentData?.phones ?? []).length ? [placesPhone] : enrichmentData?.phones ?? [],
        emails: enrichmentData?.emails ?? [],
        address: addressText,
        instagram_url: socialLinksFinal.instagram ?? null,
        facebook_url: socialLinksFinal.facebook ?? null,
        linkedin_url: socialLinksFinal.linkedin ?? null,
        enriched: true,
        // owner_name + instagram_handle live inside enrichment_data JSONB
        // (no dedicated columns needed — additive schema stays untouched)
        enrichment_data: {
          ...(enrichmentData ?? {}),
          owner_name: enrichmentData?.owner_name ?? null,
          instagram_handle: enrichmentData?.instagram_handle ?? null,
        },
        source_records: group.all_candidates.map((c: any) => ({ url: c.sourceUrl, title: c.businessName })),
        updated_at: new Date().toISOString(),
      };
      void bizId;

      if (existingBiz) {
        await supabase.from("canonical_businesses").update(bizPayload).eq("id", existingBiz.id);
        bizId = existingBiz.id;
      } else {
        const { data: newBiz } = await supabase.from("canonical_businesses").insert(bizPayload).select().single();
        bizId = newBiz.id;
      }

      const channelRec = selectChannel({
        hasPhone, hasWhatsAppEvidence: null, hasEmail,
        instagramUrl: socialLinksFinal.instagram ?? null,
        facebookUrl: socialLinksFinal.facebook ?? null,
        linkedinUrl: socialLinksFinal.linkedin ?? null,
      });

      // Real provider provenance (never hardcode google_search)
      const candidateProviders = [...new Set(group.all_candidates.map((c: any) => c.raw?.raw_metadata?.provider ?? c.provider ?? "google_maps"))];

      // Structured, evidence-backed "Why This Lead" — concise, no chain-of-thought
      const missing: string[] = [];
      if (!hasPhone) missing.push("phone");
      if (!hasEmail) missing.push("email");
      if (!primary.websiteUrl) missing.push("website");
      if (!socialLinksFinal.instagram && !socialLinksFinal.facebook && !socialLinksFinal.linkedin) missing.push("social profiles");

      const whyThisLead = {
        match_reason: detectedIndustry
          ? `Matches target industry "${detectedIndustry}"${rating !== null ? ` with ${rating}★ Google rating` : ""}`
          : `Verified local business listing${group.business_name ? `: ${group.business_name}` : ""}`,
        ai_industry_verdict: aiVerdict
          ? { industry: aiVerdict.detected_industry, relevance: aiVerdict.relevance, reason: aiVerdict.reason }
          : null,
        geo_scope: groupScope,
        geo_relevance: `${geoRelevanceBonus(groupScope)}pt region relevance (${groupScope.toLowerCase()})`,
        owner_name: enrichmentData?.owner_name ?? null,
        requirement_evidence: {
          status: reqAnalysis.status,
          type: reqAnalysis.requirement_type,
          reason: reqAnalysis.reason,
        },
        urgency_evidence: {
          level: urgAnalysis.level,
          score: urgAnalysis.score,
          reason: urgAnalysis.reason,
        },
        opportunities: opportunities.map((o) => ({
          type: o.type,
          strength: o.strength,
          reason: o.reason,
          evidence: o.evidence,
        })),
        primary_opportunity: primaryOpp
          ? { type: primaryOpp.type, strength: primaryOpp.strength, reason: primaryOpp.reason, evidence: primaryOpp.evidence }
          : null,
        score: scoring.final_score,
        confidence: scoring.confidence,
        provenance: {
          providers: candidateProviders,
          sources: group.all_candidates.slice(0, 3).map((c: any) => c.sourceUrl ?? c.raw?.source_url).filter(Boolean),
          query: primary.query ?? null,
        },
        contacts_found: {
          phone: hasPhone, email: hasEmail, website: !!primary.websiteUrl,
          instagram: !!socialLinksFinal.instagram, facebook: !!socialLinksFinal.facebook, linkedin: !!socialLinksFinal.linkedin,
        },
        contact_details: {
          phone: placesPhone ?? (enrichmentData?.phones?.[0] ?? null),
          email: enrichmentData?.emails?.[0] ?? null,
          website: primary.websiteUrl,
          instagram: socialLinksFinal.instagram ?? null,
          facebook: socialLinksFinal.facebook ?? null,
          linkedin: socialLinksFinal.linkedin ?? null,
          address: addressText,
        },
        conflicts: [] as string[],
        missing_information: missing,
        recommended_channel: channelRec?.channel ?? null,
        channel_reason: channelRec?.reason ?? null,
      };

      const leadRow = {
        user_id: userId,
        source_platform: candidateProviders[0] ?? "google_maps",
        source_url: primary.sourceUrl,
        source_content: primary.businessName,
        external_author_id: primary.domain,
        author_name: group.business_name,
        detected_requirement: reqAnalysis.requirement_type,
        business_context_match: detectedIndustry,
        relevance_score: subScores.icp_fit,
        intent_score: subScores.requirement_fit,
        lead_score: scoring.final_score,
        urgency_score: urgAnalysis.score,
        confidence: Math.round(scoring.confidence) / 100,
        evidence: {
          canonical_business_id: bizId,
          quality_gate: scoring.quality_gate_status,
          geo_scope: groupScope,
          why_this_lead: whyThisLead,
          sub_scores: subScores,
          contacts_found: {
            phone: hasPhone, email: hasEmail, website: !!primary.websiteUrl,
            instagram: !!socialLinksFinal.instagram, facebook: !!socialLinksFinal.facebook, linkedin: !!socialLinksFinal.linkedin,
          },
          contact_details: {
            phone: placesPhone ?? (enrichmentData?.phones?.[0] ?? null),
            email: enrichmentData?.emails?.[0] ?? null,
            website: primary.websiteUrl,
            instagram: socialLinksFinal.instagram ?? null,
            facebook: socialLinksFinal.facebook ?? null,
            linkedin: socialLinksFinal.linkedin ?? null,
            address: addressText,
          },
        },
        recommended_next_action: channelRec ? `${channelRec.channel}: ${channelRec.reason}` : "REVIEW",
        conversation_stage: "DISCOVER",
        idempotency_key: idempotencyKey("find-leads", userId, identityKey),
      };

      // Repeat runs refresh the same row — never duplicate.
      // (PostgREST cannot target the partial unique index on idempotency_key,
      // so we resolve the row manually instead of ON CONFLICT.)
      const stableKey = idempotencyKey("find-leads", userId, identityKey);
      const { data: existingLead } = await supabase
        .from("discovered_leads")
        .select("id")
        .eq("user_id", userId)
        .eq("idempotency_key", stableKey)
        .maybeSingle();

      let persistError: string | null = null;
      if (existingLead?.id) {
        const { error } = await supabase
          .from("discovered_leads")
          .update(leadRow)
          .eq("id", existingLead.id);
        persistError = error?.message ?? null;
      } else {
        const { error } = await supabase
          .from("discovered_leads")
          .insert({ ...leadRow, idempotency_key: stableKey });
        if (error?.code === "23505") {
          persistError = null; // concurrent run created it first — acceptable
        } else {
          persistError = error?.message ?? null;
        }
      }
      if (persistError) {
        result.errors.push(`discovered_leads persist failed for ${group.business_name}: ${persistError}`);
      }
    }

    result.enriched_count = enrichedCount;
    result.qualified_count = qualifiedCount;
    result.needs_review_count = needsReviewCount;
    if (result.competitors_filtered > 0) {
      console.log(`[growth] filtered ${result.competitors_filtered} same-line competitor(s) — not prospects, skipped from leads`);
    }

    const hasErrors = result.errors.length > 0;
    result.status = hasErrors ? "PARTIAL" : "COMPLETED";

    if (runRecord) {
      await supabase.from("discovery_runs").update({
        status: result.status,
        completed_at: new Date().toISOString(),
        queries_generated: queries.length,
        raw_candidates: allRawCandidates.length,
        normalized_count: normalized.length,
        canonical_count: canonicalGroups.length,
        enriched_count: enrichedCount,
        qualified_count: qualifiedCount,
        needs_review_count: needsReviewCount,
        errors: result.errors,
      }).eq("id", runRecord.id);
    }

    return result;
  } catch (error: any) {
    result.status = "FAILED";
    result.errors.push(error.message);
    if (runRecord) {
      await supabase.from("discovery_runs").update({ status: "FAILED", error_message: error.message, completed_at: new Date().toISOString() }).eq("id", runRecord.id);
    }
    return result;
  }
}

function computeSubScores(input: {
  requirementStatus: string;
  intentScore: number;
  urgencyScore: number;
  relevanceScore: number;
  hasPhone: boolean;
  hasEmail: boolean;
  hasWebsite: boolean;
  hasSocialLinks: boolean;
  hasAddress: boolean;
  evidenceStrengthAvg: number;
  identityConfidence: number;
  targetIndustries: string[];
  detectedIndustry: string | null;
}) {
  const reqWeight: Record<string, number> = {
    EXPLICIT: 100, STRONGLY_INFERRED: 70, WEAKLY_INFERRED: 35, UNKNOWN: 0, CONFLICTING: 0,
  };

  let icpFit = input.relevanceScore;
  if (input.detectedIndustry && input.targetIndustries.length > 0) {
    const match = input.targetIndustries.some((ind) =>
      input.detectedIndustry!.toLowerCase().includes(ind.toLowerCase())
    );
    if (match) icpFit = Math.min(100, icpFit + 15);
  }

  let contactability = 0;
  if (input.hasPhone) contactability += 40;
  if (input.hasEmail) contactability += 25;
  if (input.hasWebsite) contactability += 20;
  if (input.hasSocialLinks) contactability += 15;

  return {
    icp_fit: Math.min(100, Math.round(icpFit)),
    requirement_fit: reqWeight[input.requirementStatus] ?? 0,
    urgency: input.urgencyScore,
    business_fit: Math.min(100, Math.round(icpFit * 0.8 + input.relevanceScore * 0.2)),
    contactability: Math.min(100, contactability),
    evidence_strength: input.evidenceStrengthAvg,
    identity_confidence: Math.round(input.identityConfidence),
  };
}

function calculateFinalScore(subScores: ReturnType<typeof computeSubScores>, penalties: any[]): {
  final_score: number;
  confidence: number;
  quality_gate_status: string;
} {
  const weights: Record<string, number> = {
    icp_fit: 15, requirement_fit: 20, urgency: 20,
    business_fit: 15, contactability: 10, evidence_strength: 10, identity_confidence: 10,
  };

  let rawScore = 0;
  for (const [key, weight] of Object.entries(weights)) {
    rawScore += ((subScores[key as keyof typeof subScores] ?? 0) / 100) * weight;
  }

  const totalPenalty = penalties.reduce((sum, p) => sum + p.amount, 0);
  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore - totalPenalty)));

  const avg = Math.round(
    (subScores.icp_fit + subScores.requirement_fit + subScores.urgency +
     subScores.business_fit + subScores.contactability +
     subScores.evidence_strength + subScores.identity_confidence) / 7
  );
  const confidence = Math.max(0, Math.min(100, avg));

  let qualityGate: string;
  if (finalScore >= 60 && confidence >= 60) qualityGate = "QUALIFIED";
  else if (finalScore >= 45) qualityGate = "NEEDS_REVIEW";
  else qualityGate = "REJECTED";

  return { final_score: finalScore, confidence, quality_gate_status: qualityGate };
}

function selectChannel(contacts: {
  hasPhone: boolean;
  hasWhatsAppEvidence: boolean | null;
  hasEmail: boolean;
  instagramUrl: string | null;
  facebookUrl: string | null;
  linkedinUrl: string | null;
}): { channel: string; reason: string; confidence: string } | null {
  if (contacts.hasWhatsAppEvidence === true && contacts.hasPhone) return { channel: "whatsapp", reason: "Phone available and WhatsApp verified", confidence: "HIGH" };
  if (contacts.instagramUrl) return { channel: "instagram", reason: "Active Instagram profile found", confidence: contacts.hasEmail ? "MEDIUM" : "HIGH" };
  if (contacts.facebookUrl) return { channel: "facebook", reason: "Facebook page found", confidence: "MEDIUM" };
  if (contacts.linkedinUrl) return { channel: "linkedin", reason: "LinkedIn profile found", confidence: "MEDIUM" };
  if (contacts.hasEmail) return { channel: "email", reason: "Public email available", confidence: "LOW" };
  if (contacts.hasPhone) return { channel: "phone", reason: "Phone number available but WhatsApp unverified", confidence: "LOW" };
  return null;
}

function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80);
}
