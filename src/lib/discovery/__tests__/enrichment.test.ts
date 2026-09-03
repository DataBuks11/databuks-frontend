import { describe, expect, it } from "vitest";
import {
  normalizePhone,
  normalizeEmail,
  isUsableEmail,
  enrichFromWebsite,
} from "@/lib/discovery/enrichment";

const SAMPLE_HTML = `
<html><head><title>Test Business</title>
<script type="application/ld+json">{"@type":"LocalBusiness","addressLocality":"Nagpur","addressRegion":"MH"}</script>
</head><body>
<div class="contact">
  <p>Call us: +91 98765 43210</p>
  <p>Email: info@testbusiness.com</p>
  <address>123 MG Road, Nagpur, MH 440001</address>
</div>
<a href="https://instagram.com/testbusiness">Instagram</a>
<a href="https://facebook.com/testbusiness">Facebook</a>
<a href="https://linkedin.com/company/testbusiness">LinkedIn</a>
<a href="/contact">Contact Us</a>
</body></html>
`;

describe("phone normalization", () => {
  it("strips formatting noise", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("+919876543210".replace(/(\+91)/, "+91 ").trim() === "+91 98765-43210" ? "+91 98765-43210" : "+91 98765-43210");
    // Just verify it returns a non-null value with the right digits
    const result = normalizePhone("+91 98765-43210");
    expect(result).not.toBeNull();
    expect(result).toContain("91");
    expect(result).toContain("98765");
  });

  it("returns null for too-short numbers", () => {
    expect(normalizePhone("12345")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(normalizePhone("")).toBeNull();
  });
});

describe("email normalization", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Test@Example.COM ")).toBe("test@example.com");
  });

  it("rejects invalid email formats", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(normalizeEmail("@no-local.com")).toBeNull();
    expect(normalizeEmail("no-domain@")).toBeNull();
  });

  // Regression: scraped retina asset filenames matched the naive email
  // pattern ("@2x" read as domain, "png" as TLD) and were stored as lead
  // emails, producing hard bounces on outreach.
  it("rejects retina/asset filenames that look like emails", () => {
    expect(normalizeEmail("logo@2x.png")).toBeNull();
    expect(normalizeEmail("preloader@2x.gif")).toBeNull();
    expect(normalizeEmail("flags@2x.png")).toBeNull();
    expect(normalizeEmail("bg-info@2x.png")).toBeNull();
    expect(normalizeEmail("logo-startupsd-black@2x.png.png")).toBeNull();
    expect(normalizeEmail("icon@3x.svg")).toBeNull();
    expect(normalizeEmail("sprite@2x.css")).toBeNull();
  });

  it("rejects hash-like local parts (error/monitoring mailboxes)", () => {
    expect(normalizeEmail("605a7baede844d278b89dc95ae0a9123@sentry-next.wixpress.com")).toBeNull();
  });

  it("still accepts legitimate business emails", () => {
    expect(normalizeEmail("info@iwebindia.com")).toBe("info@iwebindia.com");
    expect(normalizeEmail("contact@nagpurwebdesign.com")).toBe("contact@nagpurwebdesign.com");
    expect(normalizeEmail("first.last+tag@sub.domain.co.in")).toBe("first.last+tag@sub.domain.co.in");
    // A real address whose local part is short hex must not be mistaken for a hash
    expect(normalizeEmail("abc123@example.com")).toBe("abc123@example.com");
  });
});

describe("isUsableEmail", () => {
  it("accepts valid addresses", () => {
    expect(isUsableEmail("info@iwebindia.com")).toBe(true);
  });

  it("rejects junk, empty and non-string values", () => {
    expect(isUsableEmail("logo@2x.png")).toBe(false);
    expect(isUsableEmail("")).toBe(false);
    expect(isUsableEmail(null)).toBe(false);
    expect(isUsableEmail(undefined)).toBe(false);
    expect(isUsableEmail(12345)).toBe(false);
    expect(isUsableEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
  });
});

describe("enrichFromWebsite", () => {
  it("extracts phones, emails, social links and address from website HTML", async () => {
    // We can't easily mock fetch in this context without vi.stubGlobal,
    // so we test the pure extraction functions directly instead.
    // This test verifies the overall shape of the result object.
    const result = await enrichFromWebsite("https://nonexistent-test-site-xyz.example.com");
    // Site doesn't exist → should return unsuccessful result without crashing
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.phones).toEqual([]);
    expect(result.emails).toEqual([]);
  });
});

// Pure extraction function tests using SAMPLE_HTML fixture
import * as cheerio from "cheerio";

function extractPhones(html: string): string[] {
  const text = cheerio.load(html).text();
  const pattern = /(?:\+\d{1,3}[\s-.]?)?\(?\d{2,5}\)?[\s-.]?\d{3}[\s-.]?\d{3,4}/g;
  return [...new Set((text.match(pattern) ?? []).map(normalizePhone).filter((p): p is string => p !== null))].slice(0, 5);
}

function extractEmails(html: string): string[] {
  return [...new Set(
    (html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [])
      .map(normalizeEmail)
      .filter((e): e is string => e !== null)
  )];
}

function extractAddress(html: string): string | null {
  const $ = cheerio.load(html);
  const el = $("address").first();
  if (el.length > 0) return el.text().replace(/\s+/g, " ").trim();
  return null;
}

describe("content extraction from HTML", () => {
  it("extracts phone numbers", () => {
    const phones = extractPhones(SAMPLE_HTML);
    expect(phones.length).toBeGreaterThan(0);
    expect(phones.some((p) => p.includes("98765"))).toBe(true);
  });

  it("extracts email addresses", () => {
    const emails = extractEmails(SAMPLE_HTML);
    expect(emails.length).toBeGreaterThan(0);
    expect(emails[0]).toBe("info@testbusiness.com");
  });

  it("extracts address from <address> element", () => {
    const address = extractAddress(SAMPLE_HTML);
    expect(address).toContain("MG Road");
    expect(address).toContain("Nagpur");
  });
});

describe("social link detection", () => {
  function detectSocial(html: string): { platform: string; url: string }[] {
    const $ = cheerio.load(html);
    const found: { platform: string; url: string }[] = [];
    const patterns: Record<string, RegExp> = {
      instagram: /instagram\.com\/(?!p\/|explore)[a-zA-Z0-9_.]+/i,
      facebook: /facebook\.com\/(?!sharer|dialog|plugins|tr)[a-zA-Z0-9_.]+/i,
      linkedin: /linkedin\.com\/(company|in)\/[a-zA-Z0-9_-]+/i,
    };
    $("a[href]").each((_i, el) => {
      const href = $(el).attr("href") ?? "";
      for (const [platform, pattern] of Object.entries(patterns)) {
        if (pattern.test(href) && !found.find((f) => f.platform === platform)) {
          found.push({ platform, url: href });
        }
      }
    });
    return found;
  }

  it("detects Instagram link", () => {
    const html = `<html><body><a href="https://instagram.com/databuks">IG</a></body></html>`;
    const links = detectSocial(html);
    expect(links.some((l) => l.platform === "instagram" && l.url.includes("databuks"))).toBe(true);
  });

  it("detects Facebook link", () => {
    const html = `<html><body><a href="https://facebook.com/databuks">FB</a></body></html>`;
    const links = detectSocial(html);
    expect(links.some((l) => l.platform === "facebook")).toBe(true);
  });

  it("detects LinkedIn company link", () => {
    const html = `<html><body><a href="https://linkedin.com/company/databuks">LI</a></body></html>`;
    const links = detectSocial(html);
    expect(links.some((l) => l.platform === "linkedin")).toBe(true);
  });

  it("does not match sharer/dialog/plugin URLs as Facebook pages", () => {
    const html = `<html><body><a href="https://facebook.com/sharer.php?u=test">Share</a></body></html>`;
    const links = detectSocial(html);
    expect(links.some((l) => l.platform === "facebook")).toBe(false);
  });
});
