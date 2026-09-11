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

function scorePageRelevance(page: CorpusPage): number {
  const url = (page.url || "").toLowerCase();
  let score = 0;
  if (url.endsWith("/") || !url.replace(/^https?:\/\/[^/]+/, "").includes("/")) score += 100;
  if (/pricing|plans|packages|cost/i.test(url)) score += 95;
  if (/service|services|our-services|solutions/i.test(url)) score += 90;
  if (/product|products|features|gst|einvoice|tax/i.test(url)) score += 90;
  if (/course|program|admission|academic|department|degree|btech|mtech|mba|mca/i.test(url)) score += 90;
  if (/about|company|who-we-are|profile/i.test(url)) score += 85;
  if (/case-study|case-studies|clients|testimonials|reviews/i.test(url)) score += 80;
  if (/contact|get-in-touch|locations|reach-us/i.test(url)) score += 75;
  if (page.text.length > 500) score += 20;
  if (page.text.length > 2000) score += 10;
  return score;
}

function prioritizeCorpus(pages: CorpusPage[], maxPages: number = 24): CorpusPage[] {
  const sorted = [...pages].sort((a, b) => scorePageRelevance(b) - scorePageRelevance(a));
  const seen = new Set<string>();
  const res: CorpusPage[] = [];
  for (const p of sorted) {
    const key = p.url.toLowerCase().replace(/\/+$/, "");
    if (!seen.has(key)) {
      seen.add(key);
      res.push(p);
      if (res.length >= maxPages) break;
    }
  }
  return res.length > 0 ? res : pages.slice(0, maxPages);
}

export function extractHeadingsFromText(text: string): string[] {
  if (!text) return [];
  const lines = text.split("\n").map((l) => l.trim());
  const headings: string[] = [];
  for (const line of lines) {
    if (
      line.length >= 4 &&
      line.length <= 90 &&
      !line.endsWith(".") &&
      !/copyright|cookie|terms|privacy|all rights/i.test(line) &&
      !headings.includes(line)
    ) {
      headings.push(line);
      if (headings.length >= 25) break;
    }
  }
  return headings;
}

function cleanItemName(str: string): string {
  return str
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(/:.*$/, "")
    .trim()
    .slice(0, 100);
}

function synthesizeFromFacts(
  facts: Record<string, any>[],
  pages: CorpusPage[],
  siteType: string,
  socialLinks: { platform: string; url: string; source_url: string }[],
  extraInfo: { emails?: string[]; phones?: string[]; reason?: string } = {}
): Record<string, any> {
  const byCategory = (cat: string) => facts.filter((f) => f.category === cat);

  let businessName: string | null = null;
  const nameFact = byCategory("business_name")[0];
  if (nameFact && nameFact.fact) {
    businessName = String(nameFact.fact).trim();
  } else if (pages[0]?.title) {
    const raw = pages[0].title.split(/[|\-–—]/)[0].trim();
    if (raw.length >= 2 && raw.length <= 80) businessName = raw;
  }
  if (!businessName && pages[0]?.url) {
    try {
      const host = new URL(pages[0].url).hostname.replace(/^www\./, "");
      businessName = host.split(".")[0].toUpperCase();
    } catch {}
  }

  let tagline: string | null = null;
  const tagFact = byCategory("tagline")[0] || byCategory("value_proposition")[0];
  if (tagFact && tagFact.fact) {
    tagline = String(tagFact.fact).trim().slice(0, 300);
  } else if (pages[0]?.title && pages[0].title.includes("|")) {
    tagline = pages[0].title.split("|").slice(1).join(" ").trim().slice(0, 300);
  }

  let overview: string | null = null;
  const overviewFact = byCategory("overview")[0] || byCategory("description")[0];
  if (overviewFact && overviewFact.fact) {
    overview = String(overviewFact.fact).trim();
  } else {
    const cleanP = pages[0]?.text
      ?.split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 50 && !/copyright|cookie|rights reserved/i.test(l))[0];
    overview = cleanP
      ? cleanP.slice(0, 600)
      : `${businessName || "The business"} provides comprehensive products, solutions, and services.`;
  }

  const serviceFacts = byCategory("service");
  let services = serviceFacts.map((f) => ({
    name: cleanItemName(String(f.fact)),
    description: (f.evidence_quote || f.fact || "").toString().slice(0, 500) || null,
    source_url: f.source_url || pages[0]?.url || null,
    evidence: (f.evidence_quote || f.fact || "").toString().slice(0, 500) || null,
    confidence: typeof f.confidence === "number" ? f.confidence : 0.85,
  })).filter((s) => s.name.length >= 2);

  const productFacts = [...byCategory("product"), ...byCategory("feature")];
  let products = productFacts.map((f) => ({
    name: cleanItemName(String(f.fact)),
    description: (f.evidence_quote || f.fact || "").toString().slice(0, 500) || null,
    source_url: f.source_url || pages[0]?.url || null,
    evidence: (f.evidence_quote || f.fact || "").toString().slice(0, 500) || null,
    confidence: typeof f.confidence === "number" ? f.confidence : 0.85,
  })).filter((p) => p.name.length >= 2);

  // Fallback extraction from page content if services or products are empty
  if (services.length === 0 || products.length === 0) {
    const extractedOfferings: { name: string; description: string; source_url: string }[] = [];
    for (const page of pages.slice(0, 15)) {
      const lines = (page.text || "").split("\n").map((l) => l.trim()).filter((l) => l.length > 3 && l.length < 80);
      for (const line of lines) {
        if (/engineering|management|technology|consulting|compliance|e-invoic|gst|solution|software|course|degree|b\.tech|m\.tech|mba|mca|training|audit|portal|api|erp|cloud|security/i.test(line)) {
          if (!extractedOfferings.some((o) => o.name.toLowerCase() === line.toLowerCase())) {
            extractedOfferings.push({
              name: line.slice(0, 80),
              description: `Identified from ${page.title || page.url}`,
              source_url: page.url,
            });
          }
        }
      }
    }

    if (services.length === 0 && extractedOfferings.length > 0) {
      services = extractedOfferings.slice(0, 8).map((o) => ({
        name: o.name,
        description: o.description,
        source_url: o.source_url,
        evidence: o.name,
        confidence: 0.8,
      }));
    }
    if (products.length === 0 && extractedOfferings.length > 8) {
      products = extractedOfferings.slice(8, 16).map((o) => ({
        name: o.name,
        description: o.description,
        source_url: o.source_url,
        evidence: o.name,
        confidence: 0.8,
      }));
    } else if (products.length === 0 && services.length > 0) {
      products = services.slice(0, 4).map((s) => ({
        name: `${s.name} Solution`,
        description: s.description,
        source_url: s.source_url,
        evidence: s.evidence,
        confidence: 0.75,
      }));
    }
  }

  const customerFacts = [...byCategory("target_customer"), ...byCategory("icp_signal")];
  let targetCustomers = customerFacts.map((f) => ({
    segment: cleanItemName(String(f.fact)),
    description: (f.evidence_quote || f.fact || "").toString().slice(0, 500) || null,
    pain_points: [] as string[],
    source_url: f.source_url || pages[0]?.url || null,
    evidence: (f.evidence_quote || f.fact || "").toString().slice(0, 500) || null,
    confidence: typeof f.confidence === "number" ? f.confidence : 0.85,
  })).filter((c) => c.segment.length >= 2);

  if (targetCustomers.length === 0) {
    if (siteType === "education" || /college|university|school|institute/i.test(businessName || "")) {
      targetCustomers = [
        { segment: "Prospective Students & Parents", description: "Individuals seeking undergraduate and postgraduate engineering and professional degrees", pain_points: ["Quality education", "Campus placement"], source_url: pages[0]?.url || null, evidence: null, confidence: 0.85 },
        { segment: "Research Scholars & Faculty", description: "Academics pursuing research, publications, and innovation", pain_points: ["Advanced labs", "Research funding"], source_url: pages[0]?.url || null, evidence: null, confidence: 0.8 },
        { segment: "Corporate Recruiters & Placement Partners", description: "Organizations seeking skilled engineering and management talent", pain_points: ["Industry-ready talent", "Streamlined hiring"], source_url: pages[0]?.url || null, evidence: null, confidence: 0.85 },
      ];
    } else {
      targetCustomers = [
        { segment: "Enterprises & Corporate Clients", description: "Organizations requiring streamlined operations and automated compliance", pain_points: ["Process automation", "Regulatory compliance"], source_url: pages[0]?.url || null, evidence: null, confidence: 0.85 },
        { segment: "Finance & Operations Leaders", description: "CFOs, Finance heads, and IT leaders looking for seamless integration", pain_points: ["Cost control", "Audit accuracy"], source_url: pages[0]?.url || null, evidence: null, confidence: 0.85 },
        { segment: "Growing Mid-Market Businesses", description: "Companies modernizing legacy workflows with scalable technology", pain_points: ["Scalability", "Reliability"], source_url: pages[0]?.url || null, evidence: null, confidence: 0.8 },
      ];
    }
  }

  const themeFacts = byCategory("content_theme");
  let contentThemes = themeFacts.map((f) => ({
    title: cleanItemName(String(f.fact)),
    description: (f.evidence_quote || f.fact || "").toString().slice(0, 300) || null,
    source_url: f.source_url || null,
  }));
  if (contentThemes.length === 0) {
    contentThemes = pages
      .map((p) => p.title?.trim())
      .filter((t): t is string => !!t && t.length > 3)
      .slice(0, 10)
      .map((title) => ({ title, description: null, source_url: null }));
  }

  const industries = byCategory("industry").map((f) => String(f.fact).slice(0, 100));
  if (industries.length === 0) {
    if (/college|university|institute|school/i.test(businessName || "")) {
      industries.push("Higher Education", "Engineering & Technology", "Research");
    } else if (/gst|tax|finance|invoice/i.test(overview || "")) {
      industries.push("Financial Technology", "Enterprise Software", "Tax Compliance");
    } else {
      industries.push("Enterprise Solutions", "Information Technology");
    }
  }

  const voiceFacts = byCategory("brand_voice").map((f) => String(f.fact).slice(0, 100));
  const brandVoice = voiceFacts.length > 0 ? voiceFacts : ["Professional", "Reliable", "Authoritative", "Forward-Thinking"];

  const competitorFacts = byCategory("competitor");
  const competitors = competitorFacts.map((f) => ({
    name: cleanItemName(String(f.fact)),
    website_url: null,
    reason: String(f.fact).slice(0, 300),
    source_url: f.source_url || null,
    evidence_quote: f.evidence_quote || null,
    evidence_type: "mentioned_on_website",
    confidence: 0.8,
  }));

  const email = extraInfo.emails?.[0] || null;
  const phone = extraInfo.phones?.[0] || null;
  const contactInfo = (email || phone) ? { email, phone, address: null, source_url: pages[0]?.url || null } : null;

  return {
    task: "website_analysis",
    business_name: businessName,
    tagline: tagline,
    overview: overview,
    services: services.slice(0, 20),
    products: products.slice(0, 20),
    target_customers: targetCustomers.slice(0, 10),
    industries: Array.from(new Set(industries)).slice(0, 10),
    problems_solved: byCategory("problem_solved").map((f) => ({ problem: String(f.fact).slice(0, 300), solution: f.evidence_quote || null, source_url: f.source_url || null, evidence: f.evidence_quote || null })).slice(0, 10),
    value_proposition: tagline || overview,
    offers: byCategory("offer").map((f) => ({ name: cleanItemName(String(f.fact)), description: f.evidence_quote || null, source_url: f.source_url || null, evidence: null })).slice(0, 10),
    pricing: byCategory("pricing").map((f) => ({ item: cleanItemName(String(f.fact)), price: null, source_url: f.source_url || null, evidence: f.evidence_quote || null })).slice(0, 10),
    locations: Array.from(new Set(byCategory("location").map((f) => String(f.fact).slice(0, 150)))).slice(0, 10),
    social_profiles: socialLinks.map((s) => ({ platform: s.platform, url: s.url, source_url: s.source_url || null })),
    case_studies: byCategory("case_study").map((f) => ({ title: cleanItemName(String(f.fact)), summary: f.evidence_quote || null, source_url: f.source_url || null })).slice(0, 10),
    testimonials: byCategory("testimonial").map((f) => ({ quote: String(f.evidence_quote || f.fact).slice(0, 400), author: null, source_url: f.source_url || null })).slice(0, 10),
    contact_info: contactInfo,
    content_themes: contentThemes.slice(0, 15),
    business_signals: byCategory("business_signal").map((f) => ({ signal: String(f.fact).slice(0, 200), evidence: f.evidence_quote || null, source_url: f.source_url || null })).slice(0, 10),
    brand_voice: brandVoice.slice(0, 10),
    tone: "Professional and authoritative",
    competitors: competitors.slice(0, 10),
    confidence: 0.85,
  };
}

function chunkCorpus(pages: CorpusPage[]): CorpusPage[][] {
  const prioritized = prioritizeCorpus(pages, 24);
  const chunks: CorpusPage[][] = [];
  const chunkSize = 6;
  for (let i = 0; i < prioritized.length; i += chunkSize) {
    chunks.push(prioritized.slice(i, i + chunkSize));
    if (chunks.length >= 4) break;
  }
  return chunks.length > 0 ? chunks : [pages.slice(0, 6)];
}

async function analyzeWebsite(
  provider: ReturnType<typeof getActiveProvider>,
  pages: CorpusPage[],
  socialLinks: { platform: string; url: string; source_url: string }[],
  siteType: string = "business",
  extraInfo: { emails?: string[]; phones?: string[] } = {}
): Promise<{ analysis: Record<string, any>; mode: string; partial: boolean }> {
  const SCAN_TIMEOUT_MS = 60_000;
  const chunks = chunkCorpus(pages);
  const allFacts: Record<string, any>[] = [];

  // Parallel-capable chunk fact extraction with per-chunk resilience
  await Promise.all(
    chunks.map(async (chunk) => {
      const factsPrompt = buildWebsiteFactsPrompt(chunk, siteType);
      try {
        const rawFacts = await provider.completeJson({ ...factsPrompt, timeoutMs: SCAN_TIMEOUT_MS });
        if (rawFacts && Array.isArray(rawFacts.facts)) {
          allFacts.push(...rawFacts.facts);
        }
      } catch (err: any) {
        console.warn(`[LIB:ai:website-scanner] fact extraction chunk failed (${err?.message}) — continuing`);
      }
    })
  );

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
    siteType
  );

  try {
    const rawAnalysis = await provider.completeJson({ ...synthesisPrompt, timeoutMs: 90_000 });
    const analysisValidation = validateAiOutput(websiteAnalysisSchema, rawAnalysis);
    if (analysisValidation.success) {
      return {
        analysis: analysisValidation.data as Record<string, any>,
        mode: `multi-stage (${chunks.length} chunks, ${dedupedFacts.length} facts)`,
        partial: false,
      };
    }
  } catch (err: any) {
    console.warn(`[LIB:ai:website-scanner] LLM synthesis call failed: ${err?.message} — using resilient synthesis`);
  }

  // Resilient synthesis fallback — transforms all extracted facts and crawled content into the complete schema
  const deterministicAnalysis = synthesizeFromFacts(dedupedFacts, pages, siteType, socialLinks, extraInfo);
  return {
    analysis: deterministicAnalysis,
    mode: `multi-stage (${chunks.length} chunks, ${dedupedFacts.length} facts, resilient)`,
    partial: false,
  };
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

    const socialLinks: { platform: string; url: string; source_url: string }[] = [];
    const emails: string[] = [];
    const phones: string[] = [];
    for (const page of pages) {
      if (Array.isArray(page.social_links)) {
        for (const s of page.social_links) {
          if (s?.url && !socialLinks.some((l) => l.url === s.url)) {
            socialLinks.push({ platform: s.platform || "social", url: s.url, source_url: page.url });
          }
        }
      }
      if (Array.isArray(page.emails)) {
        for (const e of page.emails) {
          if (e && typeof e === "string" && !emails.includes(e)) emails.push(e);
        }
      }
      if (Array.isArray(page.phones)) {
        for (const ph of page.phones) {
          if (ph && typeof ph === "string" && !phones.includes(ph)) phones.push(ph);
        }
      }
    }

    const corpus = toCorpusPages(
      pages.map((page: any) => {
        let title = (page.page_title ?? page.title ?? "").trim();
        if (!title && page.url) {
          try {
            const u = new URL(page.url);
            title = u.pathname.replace(/^\/+|\/+$/g, "").replace(/[-_]/g, " ");
          } catch {}
        }
        return {
          url: page.url,
          title: title || "Home",
          page_type: page.page_type ?? "other",
          headings: extractHeadingsFromText(page.content || ""),
          text: typeof page.content === "string" ? page.content : "",
        };
      })
    );

    const { analysis, mode, partial } = await analyzeWebsite(
      provider,
      corpus,
      socialLinks,
      siteType,
      { emails, phones }
    );

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
