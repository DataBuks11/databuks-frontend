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

const SINGLE_STAGE_MAX_CHARS = 90000;
const SINGLE_STAGE_MAX_PAGES = 60;
const FULL_CORPUS_MAX_CHARS = 500000;
const MAX_CHARS_PER_PAGE_IN_CORPUS = 10000;

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
  const chunks: CorpusPage[][] = [];
  let current: CorpusPage[] = [];
  let currentChars = 0;
  for (const page of pages) {
    if (currentChars + page.text.length > FULL_CORPUS_MAX_CHARS && current.length > 0) {
      break;
    }
    current.push(page);
    currentChars += page.text.length;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

async function analyzeWebsite(
  provider: ReturnType<typeof getActiveProvider>,
  pages: CorpusPage[],
  socialLinks: { platform: string; url: string; source_url: string }[],
  siteType: string = "business"
): Promise<{ analysis: Record<string, any>; mode: string }> {
  const totalChars = pages.reduce((sum, page) => sum + page.text.length, 0);
  const needsMultiStage = totalChars > SINGLE_STAGE_MAX_CHARS || pages.length > SINGLE_STAGE_MAX_PAGES;

  if (!needsMultiStage) {
    const prompt = buildWebsiteScanPrompt(pages, socialLinks, siteType);
    const raw = await provider.completeJson(prompt);
    const validation = validateAiOutput(websiteAnalysisSchema, raw);
    if (!validation.success) {
      throw new Error(`AI analysis produced invalid output: ${validation.issues.slice(0, 5).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    }
    return { analysis: validation.data as Record<string, any>, mode: "single-stage" };
  }

  const chunks = chunkCorpus(pages);
  const allFacts: Record<string, any>[] = [];
  const pagesUsed = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  for (const chunk of chunks) {
    const factsPrompt = buildWebsiteFactsPrompt(chunk, siteType);
    const rawFacts = await provider.completeJson(factsPrompt);
    const factsValidation = validateAiOutput(websiteFactsSchema, rawFacts);
    if (!factsValidation.success) {
      throw new Error(`Fact extraction produced invalid output: ${factsValidation.issues.slice(0, 5).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    }
    allFacts.push(...(factsValidation.data.facts as Record<string, any>[]));
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
  const rawAnalysis = await provider.completeJson(synthesisPrompt);
  const analysisValidation = validateAiOutput(websiteAnalysisSchema, rawAnalysis);
  if (!analysisValidation.success) {
    throw new Error(`Business synthesis produced invalid output: ${analysisValidation.issues.slice(0, 5).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }
  return { analysis: analysisValidation.data as Record<string, any>, mode: `multi-stage (${chunks.length} chunks, ${dedupedFacts.length} facts)` };
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
    const { analysis, mode } = await analyzeWebsite(provider, corpus, socialLinks, siteType);

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
      partial: false,
    };

    let contextSyncError: string | null = null;
    let contextUpdated = false;
    try {
      contextUpdated = await syncBusinessContext(supabase, userId, results);
    } catch (error: any) {
      contextSyncError = error?.message ?? "unknown context sync error";
    }

    await setScanStatus(supabase, scanId, "COMPLETED", {
      results,
      pages_crawled: pages.length,
      pages_discovered: scan.pages_discovered ?? pages.length,
      pages_rendered: renderedCount,
      error_message: null,
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
    updates.description = results.overview.trim();
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
