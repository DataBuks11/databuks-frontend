import * as cheerio from "cheerio";

export interface CrawlConfig {
  maxPages: number;
  maxDepth: number;
  maxConcurrentRequests: number;
  requestTimeoutMs: number;
  totalTimeoutMs: number;
  maxBytesPerPage: number;
  maxSitemapFiles: number;
  allowSubdomains: boolean;
}

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function getCrawlConfig(): CrawlConfig {
  return {
    maxPages: envInt("WEBSITE_MAX_PAGES", 100),
    maxDepth: envInt("WEBSITE_MAX_DEPTH", 8),
    maxConcurrentRequests: envInt("WEBSITE_MAX_CONCURRENT", 3),
    requestTimeoutMs: envInt("WEBSITE_REQUEST_TIMEOUT_MS", 10000),
    totalTimeoutMs: envInt("WEBSITE_TOTAL_TIMEOUT_MS", 120000),
    maxBytesPerPage: envInt("WEBSITE_MAX_BYTES_PER_PAGE", 400000),
    maxSitemapFiles: envInt("WEBSITE_MAX_SITEMAP_FILES", 20),
    allowSubdomains: process.env.WEBSITE_ALLOW_SUBDOMAINS === "1",
  };
}

export interface CrawledPage {
  url: string;
  canonical_url: string | null;
  title: string;
  description: string;
  text: string;
  headings: string[];
  page_type: string;
  depth: number;
  content_hash: string;
  http_status: number;
  js_rendered: boolean;
  js_content: string | null;
}

export interface DiscoveredDocument {
  url: string;
  found_on: string;
}

export interface CrawlStats {
  discovered: number;
  scanned: number;
  failed: number;
  robotsSkipped: number;
  duplicates: number;
  depthLimited: number;
  externalRejected: number;
  assetSkipped: number;
  paginationSkipped: number;
}

export interface CrawlResult {
  url: string;
  pages: CrawledPage[];
  socialLinks: { platform: string; url: string; source_url: string }[];
  documents: DiscoveredDocument[];
  stats: CrawlStats;
  partial: boolean;
  error: string | null;
  jsRendered: boolean;
}

const SOCIAL_PATTERNS: { platform: string; patterns: RegExp[] }[] = [
  { platform: "facebook", patterns: [/facebook\.com\//i] },
  { platform: "instagram", patterns: [/instagram\.com\//i] },
  { platform: "linkedin", patterns: [/linkedin\.com\/(company|in)\//i] },
  { platform: "twitter", patterns: [/(twitter|x)\.com\//i] },
  { platform: "youtube", patterns: [/youtube\.com\//i] },
  { platform: "whatsapp", patterns: [/wa\.me\//i] },
  { platform: "telegram", patterns: [/t\.me\//i] },
];

const ASSET_EXTENSIONS = /\.(jpg|jpeg|png|webp|gif|svg|ico|css|js|mp4|mp3|zip|woff2?|ttf|otf)(\?.*)?$/i;
const PDF_EXTENSION = /\.pdf(\?.*)?$/i;
const IGNORED_SCHEMES = /^(mailto|tel|javascript|data|file):/i;

const PATH_KEYWORDS: { pattern: RegExp; type: string; priority: number }[] = [
  { pattern: /^\/$/i, type: "home", priority: 100 },
  { pattern: /pricing|plans|packages/i, type: "pricing", priority: 95 },
  { pattern: /services|service\//i, type: "services", priority: 90 },
  { pattern: /products|product\//i, type: "products", priority: 90 },
  { pattern: /solutions/i, type: "solutions", priority: 85 },
  { pattern: /features/i, type: "features", priority: 85 },
  { pattern: /about|about-us|company|team/i, type: "about", priority: 80 },
  { pattern: /case-stud|case_stud|portfolio|work\b/i, type: "case_studies", priority: 78 },
  { pattern: /customers|clients|testimonials|reviews/i, type: "testimonials", priority: 78 },
  { pattern: /industries/i, type: "industries", priority: 76 },
  { pattern: /contact|get-in-touch|book.*call|schedule/i, type: "contact", priority: 75 },
  { pattern: /faq|frequently-asked/i, type: "faq", priority: 70 },
  { pattern: /blog|articles|insights|resources/i, type: "blog", priority: 60 },
  { pattern: /careers|jobs|hiring/i, type: "careers", priority: 60 },
  { pattern: /partners|integrations|compare/i, type: "other", priority: 55 },
];

export function classifyPage(url: URL): { type: string; priority: number } {
  const path = url.pathname === "/" ? "/" : url.pathname.toLowerCase();
  for (const keyword of PATH_KEYWORDS) {
    if (keyword.pattern.test(path)) return { type: keyword.type, priority: keyword.priority };
  }
  return { type: "other", priority: 30 };
}

export function normalizeUrl(raw: string): string {
  const value = raw.trim();
  if (!value) throw new Error("Website URL is required");
  if (IGNORED_SCHEMES.test(value)) throw new Error("Unsupported URL scheme");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error("Invalid website URL");
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Only http/https URLs are supported");
  parsed.hash = "";
  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }
  const utmKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "ref"];
  for (const key of utmKeys) parsed.searchParams.delete(key);
  return parsed.toString();
}

export function hashContent(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

function isPaginationUrl(url: URL): boolean {
  return (
    url.searchParams.has("page") ||
    url.searchParams.has("paged") ||
    /\/page\/\d+/i.test(url.pathname)
  );
}

interface RobotsRules {
  disallow: string[];
  allow: string[];
}

function matchesRule(rules: string[], path: string): boolean {
  for (const rule of rules) {
    const escaped = rule.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
    if (new RegExp(`^${escaped}`).test(path)) return true;
  }
  return false;
}

export function parseRobotsTxt(content: string): RobotsRules {
  const disallow: string[] = [];
  const allow: string[] = [];
  let currentAgent = "*";
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const lower = line.toLowerCase();
    if (lower.startsWith("user-agent:")) {
      currentAgent = line.slice(line.indexOf(":") + 1).trim().toLowerCase();
      continue;
    }
    if (currentAgent !== "*" && currentAgent !== "databuksbot") continue;
    if (lower.startsWith("disallow:")) {
      const value = line.slice(line.indexOf(":") + 1).trim();
      if (value) disallow.push(value);
    } else if (lower.startsWith("allow:")) {
      const value = line.slice(line.indexOf(":") + 1).trim();
      if (value) allow.push(value);
    }
  }
  return { disallow: disallow.map((d) => d), allow: allow.map((a) => a) };
}

export function isRobotsAllowed(robots: RobotsRules | null, pathWithQuery: string): boolean {
  if (!robots) return true;
  const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  if (matchesRule(robots.allow, path)) return true;
  return !matchesRule(robots.disallow, path);
}

interface QueueItem {
  url: string;
  depth: number;
  priority: number;
}

function pushUnique(queue: QueueItem[], seen: Set<string>, item: QueueItem) {
  if (seen.has(item.url)) return;
  seen.add(item.url);
  queue.push(item);
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DataBuksScanner/2.0; +https://databuks-frontend.vercel.app)",
        Accept: "text/html,application/xhtml+xml,application/xml",
      },
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error("TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function sameHost(base: URL, candidate: URL): boolean {
  const baseHost = base.hostname.replace(/^www\./, "");
  const candidateHost = candidate.hostname.replace(/^www\./, "");
  return baseHost === candidateHost;
}

function isSubdomain(base: URL, candidate: URL): boolean {
  const baseHost = base.hostname.replace(/^www\./, "");
  const candidateHost = candidate.hostname.replace(/^www\./, "");
  return candidateHost.endsWith(`.${baseHost}`);
}

function allowedDomain(base: URL, candidate: URL, config: CrawlConfig): boolean {
  if (sameHost(base, candidate)) return true;
  return config.allowSubdomains && isSubdomain(base, candidate);
}

function stripBoilerplate($: cheerio.CheerioAPI): void {
  $("script, style, noscript, iframe, svg, head, form, footer, nav").remove();
  $('[class*="cookie" i], [id*="cookie" i], [class*="consent" i], [id*="consent" i], [class*="banner" i]').remove();
  $('aside, [class*="sidebar" i]').remove();
  $("[role=navigation], [aria-hidden=true]").remove();
}

export function extractPageContent(html: string, url: string, httpStatus: number, depth: number, config: CrawlConfig): CrawledPage {
  const $ = cheerio.load(html);
  const title = $("title").first().text().replace(/\s+/g, " ").trim();
  const description = $('meta[name="description"]').attr("content")?.replace(/\s+/g, " ").trim() ?? "";
  const canonical = $('link[rel="canonical"]').attr("href") ?? null;

  const headings: string[] = [];
  $("h1, h2, h3").each((_i, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text && text.length <= 300) headings.push(text);
  });

  const scriptCount = $("script[src]").length;
  const linkCount = $("a[href]").length;

  stripBoilerplate($);
  let text = $("body").text().replace(/\s+/g, " ").trim();
  if (text.length > config.maxBytesPerPage) text = text.slice(0, config.maxBytesPerPage);

  const jsRendered = scriptCount > 0 && text.length < 400 && headings.length === 0 && linkCount < 8;

  const parsed = new URL(url);
  const { type } = classifyPage(parsed);

  return {
    url,
    canonical_url: canonical,
    title,
    description,
    text,
    headings: headings.slice(0, 40),
    page_type: type,
    depth,
    content_hash: hashContent(text),
    http_status: httpStatus,
    js_rendered: jsRendered,
    js_content: null,
  };
}

function extractLinks($: cheerio.CheerioAPI, base: URL, pageUrl: string): string[] {
  const links: string[] = [];
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (IGNORED_SCHEMES.test(href.trim())) return;
    try {
      const resolved = new URL(href, pageUrl);
      if (!/^https?:$/.test(resolved.protocol)) return;
      resolved.hash = "";
      links.push(resolved.toString());
    } catch {}
  });
  return [...new Set(links)];
}

const JS_CHUNK_PATTERN = /["']\/?(?:\.\/)?(?:assets\/)?([A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.js)["']/g;
const JS_STRING_PATTERN = /"((?:[^"\\]|\\.){20,500})"/g;
const JS_CODE_NOISE = /^(?:function|const|var|return|https?:\/\/|\.css|\.js|M\d|\d|import|export|[A-Za-z0-9._/-]+\(|.{0,3}\})/;

function looksLikeCopy(text: string): boolean {
  if (text.length < 20 || text.length > 500) return false;
  if (!/[a-zA-Z]/.test(text)) return false;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return wordCount >= 2 && JS_CODE_NOISE.test(text) === false && !/^[{}()[\]<>;,=+*/]+$/.test(text);
}

async function extractJsBundleContent(html: string, pageUrl: string, config: CrawlConfig): Promise<string | null> {
  try {
    const $ = cheerio.load(html);
    const scriptSrcs: string[] = [];
    $("script[src]").each((_i, el) => {
      const src = $(el).attr("src");
      if (!src) return;
      try {
        const resolved = new URL(src, pageUrl).toString();
        if (!ASSET_EXTENSIONS.test(resolved) || resolved.includes(".js")) scriptSrcs.push(resolved);
      } catch {}
    });

    if (scriptSrcs.length === 0) return null;

    const bundleTexts: string[] = [];
    for (const src of scriptSrcs.slice(0, 2)) {
      try {
        const response = await fetchWithTimeout(src, config.requestTimeoutMs);
        if (!response.ok) continue;
        const js = await response.text();
        if (js.length > config.maxBytesPerPage * 8) continue;
        bundleTexts.push(js);
      } catch {}
    }
    if (bundleTexts.length === 0) return null;

    const chunkSrcs = new Set<string>();
    for (const bundle of bundleTexts) {
      let match: RegExpExecArray | null;
      JS_CHUNK_PATTERN.lastIndex = 0;
      while ((match = JS_CHUNK_PATTERN.exec(bundle)) !== null && chunkSrcs.size < 8) {
        const chunkPath = match[1];
        try {
          chunkSrcs.add(new URL(`/assets/${chunkPath}`, pageUrl).toString());
        } catch {}
      }
    }

    for (const chunkSrc of [...chunkSrcs].slice(0, 8)) {
      try {
        const response = await fetchWithTimeout(chunkSrc, config.requestTimeoutMs);
        if (!response.ok) continue;
        bundleTexts.push(await response.text());
      } catch {}
    }

    const strings = new Set<string>();
    for (const bundle of bundleTexts) {
      let match: RegExpExecArray | null;
      JS_STRING_PATTERN.lastIndex = 0;
      while ((match = JS_STRING_PATTERN.exec(bundle)) !== null) {
        const decoded = match[1]
          .replace(/\\n/g, " ")
          .replace(/\\"/g, '"')
          .replace(/\\u([0-9a-fA-F]{4})/g, (_m, code) => String.fromCharCode(parseInt(code, 16)))
          .replace(/\\(.)/g, "$1")
          .trim();
        if (looksLikeCopy(decoded)) strings.add(decoded);
        if (strings.size >= 120) break;
      }
    }

    if (strings.size === 0) return null;
    return [...strings].join("\n").slice(0, 30000);
  } catch {
    return null;
  }
}

async function parseSitemapUrls(xml: string): Promise<string[]> {
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls: string[] = [];
  $("url > loc, urlset > url > loc").each((_i, el) => {
    const loc = $(el).text().trim();
    if (loc) urls.push(loc);
  });
  if (urls.length === 0) {
    $("loc").each((_i, el) => {
      const loc = $(el).text().trim();
      if (loc) urls.push(loc);
    });
  }
  return urls;
}

async function discoverSitemaps(
  base: URL,
  robots: RobotsRules | null,
  config: CrawlConfig,
  log: (msg: string) => void
): Promise<string[]> {
  const sitemapUrls: string[] = [];

  const robotsDoc = await fetchWithTimeout(`${base.protocol}//${base.host}/robots.txt`, config.requestTimeoutMs).catch(() => null);
  if (robotsDoc && robotsDoc.ok) {
    const robotsText = await robotsDoc.text();
    for (const line of robotsText.split(/\r?\n/)) {
      const match = line.match(/^sitemap:\s*(.+)/i);
      if (match) sitemapUrls.push(match[1].trim());
    }
  }

  for (const candidate of [`${base.protocol}//${base.host}/sitemap.xml`, `${base.protocol}//${base.host}/sitemap_index.xml`]) {
    if (!sitemapUrls.includes(candidate)) sitemapUrls.push(candidate);
  }

  const discovered: string[] = [];
  const visitedSitemaps = new Set<string>();

  for (let index = 0; index < sitemapUrls.length && visitedSitemaps.size < config.maxSitemapFiles; index++) {
    const sitemapUrl = sitemapUrls[index];
    if (visitedSitemaps.has(sitemapUrl)) continue;
    visitedSitemaps.add(sitemapUrl);
    try {
      const response = await fetchWithTimeout(sitemapUrl, config.requestTimeoutMs);
      if (!response.ok) continue;
      const xml = await response.text();
      const locs = await parseSitemapUrls(xml);
      for (const loc of locs) {
        try {
          const parsed = new URL(loc);
          if (parsed.pathname.toLowerCase().endsWith(".xml")) {
            if (!visitedSitemaps.has(parsed.toString()) && !sitemapUrls.includes(parsed.toString())) {
              sitemapUrls.push(parsed.toString());
            }
            continue;
          }
          discovered.push(parsed.toString());
        } catch {}
      }
      log(`sitemap ${sitemapUrl}: ${locs.length} urls`);
    } catch {}
  }

  return [...new Set(discovered)];
}

export async function crawlWebsite(rawUrl: string): Promise<CrawlResult> {
  const config = getCrawlConfig();
  const log: (msg: string) => void = (msg) => {
    console.log(`[LIB:ai:crawler] ${msg}`);
  };
  let baseUrl: URL;
  try {
    baseUrl = new URL(normalizeUrl(rawUrl));
  } catch (error: any) {
    return {
      url: rawUrl,
      pages: [],
      socialLinks: [],
      documents: [],
      stats: { discovered: 0, scanned: 0, failed: 0, robotsSkipped: 0, duplicates: 0, depthLimited: 0, externalRejected: 0, assetSkipped: 0, paginationSkipped: 0 },
      partial: false,
      error: error.message,
      jsRendered: false,
    };
  }

  const startedAt = Date.now();
  const stats: CrawlStats = { discovered: 0, scanned: 0, failed: 0, robotsSkipped: 0, duplicates: 0, depthLimited: 0, externalRejected: 0, assetSkipped: 0, paginationSkipped: 0 };
  const pages: CrawledPage[] = [];
  const socialLinks: { platform: string; url: string; source_url: string }[] = [];
  const documents: DiscoveredDocument[] = [];
  const seenHashes = new Map<string, string>();
  const queued = new Set<string>();
  const queue: QueueItem[] = [];
  let partial = false;
  let robots: RobotsRules | null = null;
  let homepageError: string | null = null;
  let jsRendered = false;
  let jsContentExtracted = false;

  try {
    const robotsResponse = await fetchWithTimeout(`${baseUrl.protocol}//${baseUrl.host}/robots.txt`, config.requestTimeoutMs);
    if (robotsResponse.ok) {
      robots = parseRobotsTxt(await robotsResponse.text());
    }
  } catch {}

  let sitemapUrls: string[] = [];
  try {
    sitemapUrls = await discoverSitemaps(baseUrl, robots, config, log);
  } catch {}

  const homePriority = classifyPage(baseUrl).priority;
  queued.add(baseUrl.toString());
  queue.push({ url: baseUrl.toString(), depth: 0, priority: homePriority });

  const paginationCounts = new Map<string, number>();
  let nextPageOrder = 1;

  const enqueue = (rawUrl: string, depth: number, options?: { sitemapPriority?: number; trustedSitemap?: boolean }) => {
    let normalized: string;
    try {
      normalized = normalizeUrl(rawUrl);
    } catch {
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(normalized);
    } catch {
      return;
    }
    if (IGNORED_SCHEMES.test(normalized)) return;
    if (!allowedDomain(baseUrl, parsed, config) && !options?.trustedSitemap) {
      stats.externalRejected += 1;
      return;
    }
    if (PDF_EXTENSION.test(parsed.pathname)) {
      documents.push({ url: normalized, found_on: rawUrl });
      return;
    }
    if (ASSET_EXTENSIONS.test(parsed.pathname)) {
      stats.assetSkipped += 1;
      return;
    }

    const paginationKey = `${parsed.hostname}${parsed.pathname}`;
    if (isPaginationUrl(parsed)) {
      const count = paginationCounts.get(paginationKey) ?? 0;
      if (count >= 5) {
        stats.paginationSkipped += 1;
        return;
      }
      paginationCounts.set(paginationKey, count + 1);
    }

    if (queued.has(normalized)) return;
    if (robots && !isRobotsAllowed(robots, `${parsed.pathname}${parsed.search}`)) {
      stats.robotsSkipped += 1;
      return;
    }
    queued.add(normalized);
    const { priority } = classifyPage(parsed);
    queue.push({
      url: normalized,
      depth,
      priority: (options?.sitemapPriority ?? priority) + (nextPageOrder++ % 5),
    });
    stats.discovered += 1;
  };

  for (const sitemapUrl of sitemapUrls) {
    enqueue(sitemapUrl, 2, { sitemapPriority: 20, trustedSitemap: true });
  }

  while (queue.length > 0 && pages.length < config.maxPages) {
    if (Date.now() - startedAt > config.totalTimeoutMs) {
      partial = true;
      break;
    }
    queue.sort((a, b) => b.priority - a.priority);
    const batch = queue.splice(0, config.maxConcurrentRequests);

    const results = await Promise.all(
      batch.map(async (item) => {
        if (item.depth > config.maxDepth) {
          stats.depthLimited += 1;
          return null;
        }
        try {
          const response = await fetchWithTimeout(item.url, config.requestTimeoutMs);
          if (!response.ok) {
            stats.failed += 1;
            if (item.url === baseUrl.toString() && !homepageError) {
              homepageError = `Website unavailable (HTTP ${response.status})`;
            }
            return null;
          }
          const contentType = response.headers.get("content-type") ?? "";
          if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
            stats.failed += 1;
            if (item.url === baseUrl.toString() && !homepageError) {
              homepageError = "Website did not return a readable page";
            }
            return null;
          }
          const html = await response.text();
          if (html.length > config.maxBytesPerPage * 4) {
            stats.failed += 1;
            return null;
          }
          return { item, html, status: response.status };
        } catch {
          stats.failed += 1;
          if (item.url === baseUrl.toString() && !homepageError) {
            homepageError = "Website unavailable (network error)";
          }
          return null;
        }
      })
    );

    for (const fetched of results) {
      if (!fetched) continue;
      const { item, html, status } = fetched;

      const page = extractPageContent(html, item.url, status, item.depth, config);
      if (page.js_rendered) jsRendered = true;

      if (!page.js_rendered) {
        const dedupeKey = page.content_hash;
        if (seenHashes.has(dedupeKey)) {
          stats.duplicates += 1;
          continue;
        }
        seenHashes.set(dedupeKey, page.url);
      }

      if (page.js_rendered && !jsContentExtracted) {
        jsContentExtracted = true;
        const jsContent = await extractJsBundleContent(html, item.url, config);
        if (jsContent) page.js_content = jsContent;
      }
      pages.push(page);
      stats.scanned += 1;

      const $ = cheerio.load(html);
      for (const { platform, patterns } of SOCIAL_PATTERNS) {
        $("a[href]").each((_i, el) => {
          const href = $(el).attr("href");
          if (!href) return;
          for (const pattern of patterns) {
            if (pattern.test(href)) {
              socialLinks.push({ platform, url: href, source_url: item.url });
              break;
            }
          }
        });
      }

      for (const link of extractLinks($, baseUrl, item.url)) {
        enqueue(link, item.depth + 1);
      }
    }
  }

  if (queue.length > 0) partial = true;

  log(`crawl complete: discovered=${stats.discovered} scanned=${stats.scanned} failed=${stats.failed} robotsSkipped=${stats.robotsSkipped} duplicates=${stats.duplicates} externalRejected=${stats.externalRejected} jsRendered=${jsRendered}`);

  if (pages.length === 0) {
    return {
      url: baseUrl.toString(),
      pages,
      socialLinks: [],
      documents: [],
      stats,
      partial,
      error: homepageError ?? "No useful public content found",
      jsRendered,
    };
  }

  return {
    url: baseUrl.toString(),
    pages,
    socialLinks: [...new Map(socialLinks.map((s) => [s.url, s])).values()],
    documents: [...new Map(documents.map((d) => [d.url, d])).values()],
    stats,
    partial,
    error: null,
    jsRendered,
  };
}
