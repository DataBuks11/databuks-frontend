import { generateDiscoveryQueries, type DiscoveryQuery } from "../discovery/query-generator";
import { idempotencyKey } from "../ai/utils/idempotency";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCandidates } from "../discovery/normalization";
import { groupIntoCanonicalBusinesses } from "../discovery/identity-resolution";
import { enrichFromWebsite } from "../discovery/enrichment";
import { analyzeRequirement, analyzeUrgency } from "../discovery/requirement-analysis";

export interface FindLeadsResult {
  run_id: string;
  status: "COMPLETED" | "PARTIAL" | "FAILED" | "RUNNING";
  queries_generated: number;
  raw_candidates: number;
  canonical_businesses: number;
  enriched_count: number;
  qualified_count: number;
  needs_review_count: number;
  errors: string[];
}

export async function runFindLeads(
  supabase: SupabaseClient,
  userId: string,
  options?: { max_queries?: number; max_pages?: number }
): Promise<FindLeadsResult> {
  const result: FindLeadsResult = {
    run_id: "", status: "RUNNING", queries_generated: 0, raw_candidates: 0,
    canonical_businesses: 0, enriched_count: 0, qualified_count: 0,
    needs_review_count: 0, errors: [],
  };

  const maxQueries = options?.max_queries ?? 15;
  const maxPages = options?.max_pages ?? 100;

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
    const queries: DiscoveryQuery[] = generateDiscoveryQueries(queryInput as any, maxQueries);
    result.queries_generated = queries.length;

    // Providers
    const allRawCandidates: { source_url: string; title: string; snippet: string; website_url: string | null; provider: string }[] = [];
    let googleSearchOk = false;
    let googleMapsOk = false;

    try {
      const gsMod = await import("../discovery/providers/google-search");
      const gsProvider = new gsMod.GoogleSearchProvider();
      if (gsProvider.isConfigured()) {
        const gsResult = await gsProvider.discover(queries.slice(0, Math.min(queries.length, 10)));
        for (const c of gsResult.candidates) {
          allRawCandidates.push({ source_url: c.source_url, title: c.title, snippet: c.snippet, website_url: c.website_url, provider: "google_search" });
        }
        googleSearchOk = true;
      }
    } catch {}

    try {
      const gmMod = await import("../discovery/providers/google-maps");
      const gmProvider = new gmMod.GoogleMapsProvider();
      if (gmProvider.isConfigured()) {
        const gmResult = await gmProvider.discover(queries.slice(0, Math.min(queries.length, 10)));
        for (const c of gmResult.candidates) {
          allRawCandidates.push({ source_url: c.source_url, title: c.title, snippet: c.snippet, website_url: c.website_url, provider: "google_maps" });
        }
        googleMapsOk = true;
      }
    } catch {}

    result.raw_candidates = allRawCandidates.length;

    // Normalize
    const normalized = normalizeCandidates(
      allRawCandidates.map((c) => ({
        source: "google_search", source_url: c.source_url, title: c.title, snippet: c.snippet,
        website_url: c.website_url, query: "", query_type: "BUSINESS_DISCOVERY",
        discovered_at: new Date().toISOString(), raw_metadata: { provider: c.provider },
      }))
    );

    // Identity resolution
    const canonicalGroups = groupIntoCanonicalBusinesses(normalized);
    result.canonical_businesses = canonicalGroups.length;

    // Enrich + score + persist
    let enrichedCount = 0;
    let qualifiedCount = 0;
    let needsReviewCount = 0;

    for (const group of canonicalGroups) {
      if (enrichedCount >= maxPages) break;
      const primary = group.primary;

      let enrichmentData: any = {};
      let hasPhone = false;
      let hasEmail = false;
      let addressText: string | null = null;
      let socialLinks: Record<string, string | null> = {};

      if (primary.websiteUrl) {
        try {
          const enrichment = await enrichFromWebsite(primary.websiteUrl);
          if (enrichment.success) {
            enrichedCount += 1;
            enrichmentData = enrichment;
            hasPhone = (enrichment.phones?.length ?? 0) > 0;
            hasEmail = (enrichment.emails?.length ?? 0) > 0;
            socialLinks = enrichment.social_links ?? {};
          }
        } catch {}
      }

      const fullText = group.all_candidates.map((c) => c.raw?.snippet ?? "").join(" ");
      const reqAnalysis = analyzeRequirement(fullText || primary.businessName);
      const urgAnalysis = analyzeUrgency(fullText, reqAnalysis.status);

      // Sub-scores (deterministic)
      const relevanceBase = Math.min(100, primary.raw?.snippet?.length ? primary.raw.snippet.length / 10 : 30);
      const subScores = computeSubScores({
        requirementStatus: reqAnalysis.status,
        intentScore: 50,
        urgencyScore: urgAnalysis.score,
        relevanceScore: Math.round(relevanceBase),
        hasPhone, hasEmail,
        hasWebsite: !!primary.websiteUrl,
        hasSocialLinks: Object.keys(socialLinks).length > 0,
        hasAddress: !!addressText,
        evidenceStrengthAvg: 50,
        identityConfidence: group.identity_confidence * 100,
        targetIndustries: Array.isArray(bcData.industries) ? bcData.industries : [],
        detectedIndustry: null,
      });

      const scoring = calculateFinalScore(subScores, []);
      const isQualified = scoring.quality_gate_status === "QUALIFIED" || scoring.quality_gate_status === "NEEDS_REVIEW";
      if (!isQualified) continue;
      if (scoring.quality_gate_status === "QUALIFIED") qualifiedCount += 1;
      else needsReviewCount += 1;

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
        phones: enrichmentData?.phones ?? [],
        emails: enrichmentData?.emails ?? [],
        address: addressText,
        instagram_url: socialLinksFinal.instagram ?? null,
        facebook_url: socialLinksFinal.facebook ?? null,
        linkedin_url: socialLinksFinal.linkedin ?? null,
        enriched: true,
        enrichment_data: enrichmentData ?? {},
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

      await supabase.from("discovered_leads").insert({
        user_id: userId,
        source_platform: "google_search",
        source_url: primary.sourceUrl,
        source_content: primary.businessName,
        external_author_id: null,
        author_name: group.business_name,
        idempotency_key: idempotencyKey("find-leads", userId, String(Date.now()), identityKey),
        metadata: {
          canonical_business_id: bizId,
          final_score: scoring.final_score,
          confidence: scoring.confidence,
          quality_gate: scoring.quality_gate_status,
          site_type: "business",
          requirement: reqAnalysis.requirement_type,
          detected_requirement: null,
          recommended_channel: channelRec?.channel ?? null,
          channel_reason: channelRec?.reason ?? null,
          why_this_lead: `Score ${scoring.final_score}/100, Confidence ${scoring.confidence}%`,
        },
      });
    }

    result.enriched_count = enrichedCount;
    result.qualified_count = qualifiedCount;
    result.needs_review_count = needsReviewCount;

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
