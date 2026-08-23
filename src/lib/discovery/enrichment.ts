import * as cheerio from "cheerio";
import type { RawDiscoveryCandidate } from "./providers/types";
import type { NormalizedCandidate } from "./normalization";

// ─── Enriched Field (with provenance) ───────────────────────────────────────

export interface EnrichedField<T = string> {
  value: T;
  source_type: "website" | "directory" | "manual" | "unknown";
  source_url: string | null;
  retrieved_at: string;
  conflicting_values?: { value: T; source_url: string | null }[];
}

// ─── Social Links ────────────────────────────────────────────────────────────

export interface EnrichedSocialLinks {
  instagram: EnrichedField<string>[] | null;
  facebook: EnrichedField<string>[] | null;
  linkedin: EnrichedField<string>[] | null;
}

// ─── Enriched Business ──────────────────────────────────────────────────────

export interface EnrichedBusiness {
  phones: EnrichedField<string>[];
  emails: EnrichedField<string>[];
  addresses: EnrichedField<string>[];
  social_links: {
    instagram: EnrichedField<string> | null;
    facebook: EnrichedField<string> | null;
    linkedin: EnrichedField<string> | null;
  };
  whatsapp_available: boolean | null;
  /** Which pages were inspected during enrichment */
  pages_inspected: { url: string; status: number }[];
}

// ─── Phone / Email Normalization ────────────────────────────────────────────

export function normalizePhone(raw: string): string | null {
  const cleaned = raw.trim();
  // Strip formatting but keep leading +
  const digits = cleaned.replace(/[^\d+]/g, "");
  // Must have at least 8 digits to be a valid phone
  const digitOnly = digits.replace(/\+/g, "");
  if (digitOnly.length < 8 || digitOnly.length > 15) return null;
  // Precision guard: reject coordinate/ID-like numbers scraped from page
  // text (e.g. "33.0384615", "00000040"). A real rendered phone has a
  // separator (+, space, -, parentheses) AND a plausible subscriber length.
  const hasSeparator = /[+\s().-]/.test(cleaned.slice(1));
  const plausibleLength = digitOnly.length >= 10 && digitOnly.length <= 13;
  const e164 = digits.startsWith("+");
  if (e164) return plausibleLength ? cleaned : null;
  if (!hasSeparator || !plausibleLength) return null;
  return cleaned;
}

export function normalizeEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailPattern.test(trimmed)) return null;
  return trimmed;
}

// ─── Extraction Helpers ─────────────────────────────────────────────────────

const SOCIAL_PATTERNS: Record<string, RegExp> = {
  instagram: /instagram\.com\/(?!p\/|explore|accounts|reel|tv|stories)[a-zA-Z0-9_.]+/i,
  facebook: /facebook\.com\/(?!sharer|dialog|plugins|tr|profile\.php)[a-zA-Z0-9_.]+/i,
  linkedin: /linkedin\.com\/(company|in)\/[a-zA-Z0-9_-]+/i,
};

/** Generic/non-profile Instagram URLs to reject (brand root, help pages). */
const INSTAGRAM_GENERIC = /^(instagram\.com)?\/?(#|$)/i;

/**
 * Normalize an Instagram URL into a clean profile link + handle.
 * Returns null for generic/invalid matches (instagram.com root, share links).
 */
export function normalizeInstagram(rawUrl: string | null | undefined): { url: string; handle: string } | null {
  if (!rawUrl) return null;
  try {
    let input = rawUrl.trim();
    // Scheme-less inputs ("instagram.com/handle") must become absolute,
    // otherwise new URL() treats them as relative paths.
    if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
    const parsed = new URL(input);
    if (!/instagram\.com$/i.test(parsed.hostname.replace(/^www\./, ""))) return null;
    const path = parsed.pathname.replace(/\/+$/, "");
    if (!path || INSTAGRAM_GENERIC.test(path)) return null;
    const handle = path.replace(/^\//, "").split("/")[0];
    if (!handle || handle.length < 2 || handle.length > 30) return null;
    // Reserved system paths are not profiles
    if (/^(p|reel|reels|tv|stories|explore|accounts|direct|about|legal)$/i.test(handle)) return null;
    return { url: `https://www.instagram.com/${handle}/`, handle };
  } catch {
    return null;
  }
}

/**
 * Extract the owner/founder name from JSON-LD (founder/owner/employee fields),
 * meta tags, or common footer patterns. Returns null when nothing credible.
 */
function extractOwnerName(html: string): string | null {
  try {
    const $ = cheerio.load(html);
    // 1. JSON-LD structured data (founder/owner/employee names)
    const scripts = $('script[type="application/ld+json"]').toArray();
    for (const el of scripts) {
      try {
        const data = JSON.parse($(el).text());
        const nodes = Array.isArray(data) ? data : [data, ...(data["@graph"] ?? [])];
        for (const node of nodes) {
          if (!node || typeof node !== "object") continue;
          for (const field of ["founder", "owner", "employees"]) {
            const v = node[field];
            const name = Array.isArray(v) ? v[0]?.name : v?.name;
            if (typeof name === "string" && name.trim().length > 2 && name.trim().length < 60 && /[a-zA-Z]/.test(name)) {
              return name.trim();
            }
          }
        }
      } catch {}
    }

    // 2. meta author
    const metaAuthor = ($('meta[name="author"]').attr("content") ?? "").trim();
    if (metaAuthor.length > 2 && metaAuthor.length < 60 && /[a-zA-Z]/.test(metaAuthor) && !/@|http|\.com/i.test(metaAuthor)) {
      return metaAuthor;
    }

    // 3. Common footer/about patterns: "Founded by X", "Owner: X"
    const text = $("body").text().replace(/\s+/g, " ");
    const patterns = [
      /(?:founded|owned|run|managed)\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/,
      /(?:owner|proprietor|founder|ceo|director)\s*[:\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/,
    ];
    for (const pattern of patterns) {
      const m = text.match(pattern);
      if (m?.[1] && m[1].length > 2 && m[1].length < 60) return m[1].trim();
    }

    return null;
  } catch {
    return null;
  }
}

function detectSocialLinks(html: string, pageUrl: string): {
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
} {
  const $ = cheerio.load(html);
  const found = { instagram: null as string | null, facebook: null as string | null, linkedin: null as string | null };

  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const absolute = new URL(href, pageUrl).toString();
      for (const [platform, pattern] of Object.entries(SOCIAL_PATTERNS)) {
        if (pattern.test(absolute) && !found[platform as keyof typeof found]) {
          // Instagram gets strict profile normalization — generic/share URLs rejected
          if (platform === "instagram") {
            const normalized = normalizeInstagram(absolute);
            if (normalized) found.instagram = normalized.url;
          } else {
            found[platform as keyof typeof found] = absolute;
          }
        }
      }
    } catch {}
  });

  return found;
}

function extractPhones(html: string): string[] {
  const text = cheerio.load(html).text();
  const pattern = /(?:\+\d{1,3}[\s-.]?)?\(?\d{2,5}\)?[\s-.]?\d{3}[\s-.]?\d{3,4}/g;
  const matches = [...new Set((text.match(pattern) ?? []).map(normalizePhone).filter(Boolean))] as string[];
  return matches.slice(0, 5);
}

function extractEmails(html: string): string[] {
  const matches = [...new Set(
    (html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [])
      .map(normalizeEmail)
      .filter(Boolean) as string[]
  )];
  return matches.slice(0, 3);
}

function extractAddress(html: string): string | null {
  const $ = cheerio.load(html);
  const addressEl = $('[itemprop="address"], .address, .location, address').first();
  if (addressEl.length > 0) {
    const addr = addressEl.text().replace(/\s+/g, " ").trim();
    if (addr && addr.length > 10 && addr.length < 300) return addr;
  }
  const jsonLdMatch = html.match(/"@type"\s*:\s*"(?:PostalAddress|LocalBusiness|Organization)"[\s\S]*?"address(?:Locality|Region)?"\s*:\s*"([^"]+)"/i);
  if (jsonLdMatch?.[1]) return jsonLdMatch[1];
  return null;
}

// ─── Website Enrichment ─────────────────────────────────────────────────────

export interface WebsiteEnrichmentResult {
  phones: string[];
  emails: string[];
  address: string | null;
  social_links: { instagram: string | null; facebook: string | null; linkedin: string | null };
  /** Verified Instagram profile handle (null when none/generic) */
  instagram_handle: string | null;
  /** Owner/founder name when credibly discoverable (JSON-LD, meta, footer) */
  owner_name: string | null;
  /** Visible page text (homepage + contact), for downstream requirement/urgency analysis */
  page_text: string;
  fetched_from: string;
  fetched_at: string;
  success: boolean;
  error: string | null;
}

async function fetchWebsiteHtml(url: string, timeoutMs = 15000): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DataBuksEnrichment/1.0)", Accept: "text/html" },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;
    const html = await response.text();
    return { html, finalUrl: response.url };
  } catch {
    return null;
  }
}

function extractContactPageUrl(html: string, baseUrl: string): string | null {
  try {
    const $ = cheerio.load(html);
    let contactUrl: string | null = null;
    $("a[href]").each((_i, el) => {
      const href = $(el).attr("href") ?? "";
      const text = $(el).text().toLowerCase();
      if (/contact/i.test(href) || /contact/i.test(text)) {
        contactUrl = new URL(href, baseUrl).toString();
        return false;
      }
    });
    return contactUrl;
  } catch {
    return null;
  }
}

export async function enrichFromWebsite(
  websiteUrl: string,
  existingCandidate?: NormalizedCandidate
): Promise<WebsiteEnrichmentResult> {
  const emptyResult: WebsiteEnrichmentResult = {
    phones: [], emails: [], address: null,
    social_links: { instagram: null, facebook: null, linkedin: null },
    instagram_handle: null,
    owner_name: null,
    page_text: "",
    fetched_from: websiteUrl, fetched_at: new Date().toISOString(),
    success: false, error: null,
  };

  const homepage = await fetchWebsiteHtml(websiteUrl);
  if (!homepage) {
    return { ...emptyResult, error: "Website unreachable" };
  }

  const allPhones: string[] = [];
  const allEmails: string[] = [];
  let allSocial = { instagram: null as string | null, facebook: null as string | null, linkedin: null as string | null };
  let address: string | null = null;

  // Extract from homepage
  const homePhones = extractPhones(homepage.html);
  const homeEmails = extractEmails(homepage.html);
  const homeSocial = detectSocialLinks(homepage.html, homepage.finalUrl);
  const homeAddress = extractAddress(homepage.html);
  const pageTextParts: string[] = [extractVisibleText(homepage.html)];
  let ownerName = extractOwnerName(homepage.html);

  allPhones.push(...homePhones);
  allEmails.push(...homeEmails);
  if (homeSocial.instagram) allSocial.instagram = homeSocial.instagram;
  if (homeSocial.facebook) allSocial.facebook = homeSocial.facebook;
  if (homeSocial.linkedin) allSocial.linkedin = homeSocial.linkedin;
  if (!address && homeAddress) address = homeAddress;

  // Try contact + about pages for more data
  const contactUrl = extractContactPageUrl(homepage.html, homepage.finalUrl);
  if (contactUrl && isSafeUrl(contactUrl)) {
    const contactPage = await fetchWebsiteHtml(contactUrl);
    if (contactPage) {
      const contactPhones = extractPhones(contactPage.html);
      const contactEmails = extractEmails(contactPage.html);
      const contactSocial = detectSocialLinks(contactPage.html, contactUrl);
      for (const p of contactPhones) if (!allPhones.includes(p)) allPhones.push(p);
      for (const e of contactEmails) if (!allEmails.includes(e)) allEmails.push(e);
      if (!allSocial.instagram && contactSocial.instagram) allSocial.instagram = contactSocial.instagram;
      if (!allSocial.facebook && contactSocial.facebook) allSocial.facebook = contactSocial.facebook;
      if (!allSocial.linkedin && contactSocial.linkedin) allSocial.linkedin = contactSocial.linkedin;
      if (!address) address = extractAddress(contactPage.html);
      if (!ownerName) ownerName = extractOwnerName(contactPage.html);
      pageTextParts.push(extractVisibleText(contactPage.html));
    }
  }

  void existingCandidate;

  const igNormalized = normalizeInstagram(allSocial.instagram);

  return {
    phones: [...new Set(allPhones)].slice(0, 5),
    emails: [...new Set(allEmails)].slice(0, 3),
    address,
    social_links: {
      instagram: igNormalized?.url ?? null,
      facebook: allSocial.facebook,
      linkedin: allSocial.linkedin,
    },
    instagram_handle: igNormalized?.handle ?? null,
    owner_name: ownerName,
    page_text: pageTextParts.join(" ").replace(/\s+/g, " ").trim().slice(0, 6000),
    fetched_from: homepage.finalUrl,
    fetched_at: new Date().toISOString(),
    success: true,
    error: null,
  };
}

/** Strip tags/scripts and keep readable text for evidence analysis */
function extractVisibleText(html: string): string {
  try {
    const $ = cheerio.load(html);
    $("script, style, noscript, svg").remove();
    const title = $("title").first().text() ?? "";
    const meta = $('meta[name="description"]').attr("content") ?? "";
    const body = $("body").text() ?? "";
    return `${title} ${meta} ${body}`.replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(host)) return false;
    if (host.includes("metadata")) return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      const parts = host.split(".").map(Number);
      if (parts[0] === 127 || parts[0] === 10 || parts[0] === 0 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 169 && parts[1] === 254)) return false;
    }
    return true;
  } catch {
    return false;
  }
}
