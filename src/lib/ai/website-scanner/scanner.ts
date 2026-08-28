import { createClient } from "@supabase/supabase-js";
import { getActiveProvider } from "../providers";
import { validateAiOutput, websiteAnalysisSchema, websiteFactsSchema } from "../schemas";
import {
  buildWebsiteFactsPrompt,
  buildWebsiteScanPrompt,
  buildWebsiteSynthesisPrompt,
  WEBSITE_SCAN_PROMPT_VERSION,
  type CorpusPage,
} from "../prompts";
import { crawlWebsite } from "./crawler";

export type WebsiteScanStatus =
  | "QUEUED"
  | "SCANNING"
  | "EXTRACTING"
  | "ANALYZING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED";

export const SCAN_PROGRESS_LABELS: Record<WebsiteScanStatus, string> = {
  QUEUED: "Preparing website scan...",
  SCANNING: "Scanning public pages...",
  EXTRACTING: "Extracting business information...",
  ANALYZING: "Analyzing business context...",
  COMPLETED: "Finalizing business profile...",
  PARTIAL: "Finalizing business profile...",
  FAILED: "Scan failed",
};

// Crawling limits: support up to 500 pages per site so the AI gets a complete
// picture. The single-stage LLM threshold is conservative; large sites always
// go through multi-stage extraction.
const SINGLE_STAGE_MAX_CHARS = 90_000;
const SINGLE_STAGE_MAX_PAGES = 30;
const FULL_CORPUS_MAX_CHARS = 5_000_000; // 5MB corpus cap (pre-LLM truncation)
const MAX_CHARS_PER_PAGE_IN_CORPUS = 10_000;
const PER_CHUNK_MAX_PAGES = 8; // Smaller chunks for huge sites → better LLM focus
const PER_CHUNK_MAX_CHARS = 80_000;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin credentials are not configured on the server");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function setScanStatus(supabase: any, scanId: string, status: WebsiteScanStatus, extra: Record<string, any> = {}) {
  const attempt = async (payload: Record<string, any>) => {
    const { error } = await supabase.from("website_scans").update(payload).eq("id", scanId);
    return error;
  };

  let error = await attempt({ status, updated_at: new Date().toISOString(), ...extra });
  if (error) {
    const { pages_discovered, pages_scanned, analysis_mode, ...safeExtras } = extra;
    void pages_discovered;
    void pages_scanned;
    void analysis_mode;
    error = await attempt({ status, updated_at: new Date().toISOString(), ...safeExtras });
  }
  if (error) {
    console.error(`[LIB:ai:website-scanner] failed to update scan status: ${error.message}`);
  }
}

function toCorpusPages(pages: any[]): CorpusPage[] {
  return pages.map((page) => ({
    url: page.url,
    title: page.title,
    page_type: page.page_type ?? "other",
    headings: page.headings ?? [],
    text:
      (typeof page.text === "string" ? page.text.slice(0, MAX_CHARS_PER_PAGE_IN_CORPUS) : "") +
      (typeof page.js_content === "string" && page.js_content
        ? `\n\n--- SITE CONTENT RECOVERED FROM JAVASCRIPT BUNDLES ---\n${page.js_content.slice(0, 30000)}`
        : ""),
  }));
}

function chunkCorpus(pages: CorpusPage[]): CorpusPage[][] {
  // Split into multiple chunks so very large sites (up to 500 pages) get
  // proper per-chunk fact extraction followed by a single synthesis pass.
  const chunks: CorpusPage[][] = [];
  let current: CorpusPage[] = [];
  let currentChars = 0;
  let totalChars = 0;
  for (const page of pages) {
    const pageText = page.text.length > MAX_CHARS_PER_PAGE_IN_CORPUS
      ? page.text.slice(0, MAX_CHARS_PER_PAGE_IN_CORPUS)
      : page.text;
    if (
      (current.length >= PER_CHUNK_MAX_PAGES || currentChars + pageText.length > PER_CHUNK_MAX_CHARS) &&
      current.length > 0
    ) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push({ ...page, text: pageText });
    currentChars += pageText.length;
    totalChars += pageText.length;
    if (totalChars >= FULL_CORPUS_MAX_CHARS) break;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function analyzeWebsite(
  provider: ReturnType<typeof getActiveProvider>,
  pages: CorpusPage[],
  socialLinks: { platform: string; url: string; source_url: string }[],
  siteType: string = "business"
): Promise<{ analysis: Record<string, any>; mode: string; partial: boolean }> {
  const totalChars = pages.reduce((sum, page) => sum + page.text.length, 0);
  const needsMultiStage = totalChars > SINGLE_STAGE_MAX_CHARS || pages.length > SINGLE_STAGE_MAX_PAGES;
  const SCAN_TIMEOUT_MS = 180_000; // 3 min per LLM call for big sites

  // If anything goes wrong during analysis, fall back to a partial analysis
  // built from the page titles + headings + first text blocks so the
  // dashboard still has something useful to show.
  function buildPartialAnalysis(reason: string): Record<string, any> {
    const titles = pages
      .map((p) => p.title?.trim())
      .filter((t): t is string => !!t && t.length > 0)
      .slice(0, 20);
    const headings = pages.flatMap((p) => p.headings ?? []).filter((h) => !!h).slice(0, 30);
    return {
      business_name: null,
      tagline: null,
      overview: `Partial scan — ${reason}. ${titles.length} pages and ${headings.length} headings were extracted; the AI analysis timed out.`,
      services: [],
      products: [],
      target_customers: [],
      industries: [],
      problems_solved: [],
      value_proposition: null,
      offers: [],
      pricing: [],
      locations: [],
      social_profiles: socialLinks.length > 0 ? socialLinks.map((s) => ({ platform: s.platform, url: s.url, source_url: s.source_url })) : [],
      case_studies: [],
      testimonials: [],
      contact_info: null,
      content_themes: titles.slice(0, 10).map((title) => ({ title, description: null, source_url: null })),
      business_signals: [],
      brand_voice: [],
      tone: null,
      competitors: [],
      confidence: 0.2,
      _partial: true,
      _partial_reason: reason,
      _partial_pages_analyzed: pages.length,
      _partial_titles: titles,
      _partial_headings: headings,
    } as any;
  }

  if (!needsMultiStage) {
    const prompt = buildWebsiteScanPrompt(pages, socialLinks, siteType);
    try {
      const raw = await provider.completeJson({ ...prompt, timeoutMs: SCAN_TIMEOUT_MS });
      const validation = validateAiOutput(websiteAnalysisSchema, raw);
      if (!validation.success) {
        // Save partial — don't fail the whole scan
        return { analysis: buildPartialAnalysis("LLM returned invalid JSON"), mode: "single-stage", partial: true };
      }
      return { analysis: validation.data as Record<string, any>, mode: "single-stage", partial: false };
    } catch (err: any) {
      console.error(`[LIB:ai:website-scanner] single-stage LLM failed: ${err?.message}`);
      return { analysis: buildPartialAnalysis(`LLM call failed: ${err?.message?.slice(0, 120)}`), mode: "single-stage", partial: true };
    }
  }

  const chunks = chunkCorpus(pages);
  const allFacts: Record<string, any>[] = [];
  const pagesUsed = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  let factExtractionFailed = false;
  for (const chunk of chunks) {
    const factsPrompt = buildWebsiteFactsPrompt(chunk, siteType);
    try {
      const rawFacts = await provider.completeJson({ ...factsPrompt, timeoutMs: SCAN_TIMEOUT_MS });
      const factsValidation = validateAiOutput(websiteFactsSchema, rawFacts);
      if (!factsValidation.success) {
        factExtractionFailed = true;
        break;
      }
      allFacts.push(...(factsValidation.data.facts as Record<string, any>[]));
    } catch (err: any) {
      console.error(`[LIB:ai:website-scanner] facts extraction failed: ${err?.message}`);
      factExtractionFailed = true;
      break;
    }
  }
  if (factExtractionFailed) {
    return { analysis: buildPartialAnalysis("LLM fact extraction timed out / failed"), mode: "multi-stage", partial: true };
  }
  const corpusCoverage = pagesUsed < pages.length ? { pages_used: pagesUsed, pages_total: pages.length } : null;

  const seenFacts = new Set<string>();
  const dedupedFacts = allFacts.filter((fact) => {
    const key = `${fact.category}:${String(fact.fact).slice(0, 120)}`;
    if (seenFacts.has(key)) return false;
    seenFacts.add(key);
    return true;
  });

  const synthesisPrompt = buildWebsiteSynthesisPrompt(
    dedupedFacts,
    socialLinks,
    siteType,
    corpusCoverage ? ` (coverage: ${corpusCoverage.pages_used}/${corpusCoverage.pages_total} pages analyzed)` : undefined
  );
  try {
    const rawAnalysis = await provider.completeJson({ ...synthesisPrompt, timeoutMs: SCAN_TIMEOUT_MS });
    const analysisValidation = validateAiOutput(websiteAnalysisSchema, rawAnalysis);
    if (!analysisValidation.success) {
      return { analysis: buildPartialAnalysis("LLM synthesis produced invalid JSON"), mode: `multi-stage (${chunks.length} chunks, ${dedupedFacts.length} facts)`, partial: true };
    }
    return { analysis: analysisValidation.data as Record<string, any>, mode: `multi-stage (${chunks.length} chunks, ${dedupedFacts.length} facts)`, partial: false };
  } catch (err: any) {
    console.error(`[LIB:ai:website-scanner] synthesis failed: ${err?.message}`);
    return { analysis: buildPartialAnalysis(`LLM synthesis failed: ${err?.message?.slice(0, 120)}`), mode: `multi-stage (${chunks.length} chunks, ${dedupedFacts.length} facts)`, partial: true };
  }
}

async function storeScanPages(supabase: any, scanId: string, userId: string, pages: any[]): Promise<void> {
  const rows = pages.map((page) => ({
    scan_id: scanId,
    user_id: userId,
    url: page.url,
    canonical_url: page.canonical_url ?? null,
    page_title: page.title ?? null,
    page_type: page.page_type ?? "other",
    depth: page.depth ?? 0,
    content_hash: page.content_hash ?? null,
    content:
      (page.text ?? "") +
      (typeof page.js_content === "string" && page.js_content
        ? `\n\n--- SITE CONTENT RECOVERED FROM JAVASCRIPT BUNDLES ---\n${page.js_content.slice(0, 30000)}`
        : ""),
    status: "crawled",
    http_status: page.http_status ?? null,
  }));
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await supabase.from("website_scan_pages").insert(batch);
    if (error) console.error(`[LIB:ai:website-scanner] failed to store pages batch: ${error.message}`);
  }
}

export async function runWebsiteScan(scanId: string, userId: string): Promise<void> {
  const supabase = adminClient();
  const { data: scan } = await supabase
    .from("website_scans")
    .select("*")
    .eq("id", scanId)
    .maybeSingle();

  if (!scan) return;

  try {
    await setScanStatus(supabase, scanId, "SCANNING");
    const crawl = await crawlWebsite(scan.url);

    if (crawl.pages.length === 0) {
      await setScanStatus(supabase, scanId, "FAILED", {
        error_message: crawl.error ?? "No useful public content found",
        pages_discovered: crawl.stats.discovered,
        pages_scanned: 0,
        completed_at: new Date().toISOString(),
      });
      return;
    }

    await setScanStatus(supabase, scanId, "EXTRACTING", {
      pages_discovered: crawl.stats.discovered,
      pages_scanned: crawl.stats.scanned,
    });

    await storeScanPages(supabase, scanId, userId, crawl.pages);

    await finalizeScanFromStoredPages(supabase, scanId, userId);
  } catch (error: any) {
    await setScanStatus(supabase, scanId, "FAILED", {
      error_message: error?.message ?? "Scan failed",
      completed_at: new Date().toISOString(),
    });
  }
}

export function detectSiteType(pages: { page_type: string }[]): string {
  const counts: Record<string, number> = {};
  for (const page of pages) {
    const type = page.page_type ?? "other";
    counts[type] = (counts[type] ?? 0) + 1;
  }
  const has = (type: string) => (counts[type] ?? 0) > 0;
  if (has("product") || has("collection") || has("category")) return "ecommerce";
  if (has("documentation") || has("reference") || has("docs")) return "documentation";
  if (has("blog") || has("article") || has("news")) return "content";
  if (has("portfolio") || has("case_study") || has("work")) return "portfolio";
  if (has("pricing") || has("services") || has("solution") || has("product")) return "business";
  return "business";
}

export async function finalizeScanFromStoredPages(
  supabase: any,
  scanId: string,
  userId: string
): Promise<void> {
  const { data: scan } = await supabase
    .from("website_scans")
    .select("*")
    .eq("id", scanId)
    .maybeSingle();
  if (!scan) return;

  try {
    const { data: pageRows, error: pageError } = await supabase
      .from("website_scan_pages")
      .select("*")
      .eq("scan_id", scanId)
      .eq("status", "crawled")
      .order("depth", { ascending: true });

    if (pageError) throw new Error(pageError.message);
    const pages = pageRows ?? [];
    if (pages.length === 0) {
      await setScanStatus(supabase, scanId, "FAILED", {
        error_message: "No page content available for analysis",
        completed_at: new Date().toISOString(),
      });
      return;
    }

    const renderedCount = pages.filter((page: any) => page.rendered === true).length;
    const wordCount = pages.reduce((sum: number, page: any) => sum + (page.word_count ?? 0), 0);
    await setScanStatus(supabase, scanId, "ANALYZING", {
      pages_rendered: renderedCount,
      pages_scanned: pages.length,
      pages_discovered: (scan.pages_discovered ?? 0) > 0 ? scan.pages_discovered : pages.length,
    });

    const provider = getActiveProvider();
    const siteType = detectSiteType(pages);
    const corpus = toCorpusPages(
      pages.map((page: any) => ({
        url: page.url,
        title: page.page_title ?? page.title ?? "",
        page_type: page.page_type ?? "other",
        headings: [],
        text: typeof page.content === "string" ? page.content : "",
      }))
    );
    const socialLinks: { platform: string; url: string; source_url: string }[] = [];
    const { analysis, mode, partial } = await analyzeWebsite(provider, corpus, socialLinks, siteType);

    const results = {
      ...analysis,
      scanned_url: scan.url,
      pages_crawled: pages.length,
      pages_discovered: scan.pages_discovered ?? pages.length,
      pages_rendered: renderedCount,
      site_type: siteType,
      word_count: wordCount,
      crawl_stats: {
        discovered: scan.pages_discovered ?? pages.length,
        scanned: pages.length,
        rendered: renderedCount,
        failed: (scan.results?.crawl_stats?.failed as number) ?? 0,
        robotsSkipped: (scan.results?.crawl_stats?.robotsSkipped as number) ?? 0,
        duplicates: (scan.results?.crawl_stats?.duplicates as number) ?? 0,
      },
      social_links: scan.results?.social_links ?? socialLinks,
      documents: scan.results?.documents ?? [],
      js_rendered: renderedCount > 0,
      model: provider.model,
      model_version: provider.modelVersion,
      prompt_version: WEBSITE_SCAN_PROMPT_VERSION,
      analysis_mode: mode,
      partial: partial === true,
    };

    let contextSyncError: string | null = null;
    let contextUpdated = false;
    try {
      contextUpdated = await syncBusinessContext(supabase, userId, results);
    } catch (error: any) {
      contextSyncError = error?.message ?? "unknown context sync error";
    }

    await setScanStatus(supabase, scanId, partial ? "PARTIAL" : "COMPLETED", {
      results,
      pages_crawled: pages.length,
      pages_discovered: scan.pages_discovered ?? pages.length,
      pages_rendered: renderedCount,
      error_message: partial ? "Partial scan — LLM timed out, see results._partial_reason" : null,
      context_synced_at: contextUpdated ? new Date().toISOString() : null,
      completed_at: new Date().toISOString(),
    });
  } catch (error: any) {
    await setScanStatus(supabase, scanId, "FAILED", {
      error_message: error?.message ?? "Analysis failed",
      completed_at: new Date().toISOString(),
    });
  }
}

async function syncBusinessContext(supabase: any, userId: string, results: Record<string, any>): Promise<boolean> {
  const updates: Record<string, any> = { updated_at: new Date().toISOString() };

  if (typeof results.business_name === "string" && results.business_name.trim()) {
    updates.business_name = results.business_name.trim();
  }
  if (typeof results.overview === "string" && results.overview.trim()) {
    // Combine overview + tagline + value_proposition into a rich description
    // so the AI replies carry the full business context, not just one snippet.
    const parts: string[] = [results.overview.trim()];
    if (typeof results.tagline === "string" && results.tagline.trim()) {
      parts.unshift(results.tagline.trim());
    }
    if (typeof results.value_proposition === "string" && results.value_proposition.trim()) {
      parts.push("Value proposition: " + results.value_proposition.trim());
    }
    updates.description = parts.join("\n\n").slice(0, 8000);
  }
  if (Array.isArray(results.services) && results.services.length > 0) {
    updates.services = results.services.map((s: Record<string, any>) => ({
      name: s.name,
      description: s.description ?? null,
    }));
  }
  if (Array.isArray(results.products) && results.products.length > 0) {
    updates.products = results.products.map((p: Record<string, any>) => ({
      name: p.name,
      description: p.description ?? null,
    }));
  }
  if (Array.isArray(results.target_customers) && results.target_customers.length > 0) {
    updates.target_audience = results.target_customers.map((t: Record<string, any>) => ({
      segment: t.segment,
      description: t.description ?? null,
      pain_points: t.pain_points ?? [],
    }));
  }
  if (Array.isArray(results.industries) && results.industries.length > 0) {
    updates.industries = results.industries;
  }
  if (Array.isArray(results.locations) && results.locations.length > 0) {
    updates.locations = results.locations;
  }
  if (results.offer && typeof results.offer === "object" && Object.keys(results.offer).length > 0) {
    updates.offer = results.offer;
  }
  if (typeof results.value_proposition === "string" && results.value_proposition.trim()) {
    updates.offer = { ...(updates.offer ?? {}), value_proposition: results.value_proposition.trim() };
  }
  if (Array.isArray(results.pricing) && results.pricing.length > 0) {
    updates.pricing = { items: results.pricing };
  }
  if (Array.isArray(results.brand_voice) && results.brand_voice.length > 0) {
    updates.brand_voice = results.brand_voice;
  }
  if (typeof results.tone === "string" && results.tone.trim()) {
    updates.tone = results.tone.trim();
  }

  if (Object.keys(updates).length <= 1) return false;

  const { data: existing } = await supabase
    .from("business_context")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("business_context").update(updates).eq("user_id", userId);
    if (error) throw new Error(`business_context update failed: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("business_context")
      .insert({ user_id: userId, ...updates })
      .select()
      .single();
    if (error) throw new Error(`business_context insert failed: ${error.message}`);
  }

  return true;
}
