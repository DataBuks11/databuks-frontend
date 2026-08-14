import { describe, expect, it, vi, afterEach } from "vitest";
import { crawlWebsite, extractPageContent } from "@/lib/ai/website-scanner/crawler";
import { getCrawlConfig } from "@/lib/ai/website-scanner/crawler";
import { evaluateRules } from "@/lib/ai/rules";

function html(title: string, body: string, links: string[] = [], extraHead = "") {
  return `<!DOCTYPE html><html><head><title>${title}</title>${extraHead}</head><body>${body}${links.map((l) => `<a href="${l}">link</a>`).join("")}</body></html>`;
}

function jsShellHtml(scriptSrc: string): string {
  return `<!DOCTYPE html><html><head><title>DataBuks</title></head><body><div id="root"></div><script type="module" src="${scriptSrc}"></script></body></html>`;
}

function fetchMock(map: Record<string, { ok?: boolean; body: string; contentType?: string; status?: number }>) {
  return vi.fn(async (input: any) => {
    const url = typeof input === "string" ? input : input?.url;
    const key = Object.keys(map).find((k) => url === k);
    if (!key) throw new Error(`unexpected url ${url}`);
    const entry = map[key];
    if (entry.ok === false) {
      return new Response("", { status: entry.status ?? 404 });
    }
    return new Response(entry.body, {
      status: entry.status ?? 200,
      headers: { "content-type": entry.contentType ?? "text/html" },
    });
  });
}

const CROSS_HOST_SITEMAP = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://app-host.example/</loc></url>
<url><loc>https://app-host.example/services</loc></url>
<url><loc>https://app-host.example/pricing</loc></url>
</urlset>`;

describe("trusted sitemap hosts (custom-domain / CDN setups)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.WEBSITE_MAX_PAGES;
  });

  it("crawls sitemap URLs even when they live on a different host", async () => {
    const map: Record<string, any> = {
      "https://example.com/robots.txt": { body: "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml" },
      "https://example.com/sitemap.xml": { body: CROSS_HOST_SITEMAP },
      "https://example.com/": { body: html("Home", "<p>home page content here</p>") },
      "https://app-host.example/": { body: html("App Home", "<p>app home content</p>") },
      "https://app-host.example/services": { body: html("Services", "<p>we build custom software</p>") },
      "https://app-host.example/pricing": { body: html("Pricing", "<p>plans and pricing</p>") },
    };
    vi.stubGlobal("fetch", fetchMock(map));

    const result = await crawlWebsite("https://example.com");
    const urls = result.pages.map((p) => p.url);
    expect(urls).toContain("https://app-host.example/services");
    expect(urls).toContain("https://app-host.example/pricing");
    expect(result.stats.scanned).toBeGreaterThanOrEqual(3);
  });

  it("still rejects external links found on crawled pages", async () => {
    const map: Record<string, any> = {
      "https://example.com/robots.txt": { body: "" },
      "https://example.com/": { body: html("Home", "<p>home</p>", ["https://evil.example.com/phish", "https://other.example.com/x"]) },
    };
    vi.stubGlobal("fetch", fetchMock(map));

    const result = await crawlWebsite("https://example.com");
    const urls = result.pages.map((p) => p.url);
    expect(urls).not.toContain("https://evil.example.com/phish");
    expect(urls).not.toContain("https://other.example.com/x");
    expect(result.stats.externalRejected).toBeGreaterThanOrEqual(2);
  });
});

describe("JS-rendered site handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects a JS shell page", () => {
    const page = extractPageContent(jsShellHtml("/assets/app.js"), "https://example.com/", 200, 0, getCrawlConfig());
    expect(page.js_rendered).toBe(true);
    expect(page.text.length).toBeLessThan(400);
  });

  it("does not flag normal static pages as JS-rendered", () => {
    const page = extractPageContent(html("About", "<h1>About us</h1><p>We are a real company with real content on this page.</p>"), "https://example.com/about", 200, 0, getCrawlConfig());
    expect(page.js_rendered).toBe(false);
  });

  it("extracts real copy from JS bundles of an SPA shell", async () => {
    const mainBundle = `const routes={home:"/",services:"/services"};import("/assets/Services-abc12345.js");import("/assets/Pricing-def67890.js");var x=function(){};`;
    const servicesChunk = `const s={title:"App & Software Development",items:["Custom dashboards, management tools, CRM systems","Mobile apps for Android and iOS"]};export default s;`;
    const pricingChunk = `const p=["Business sites, landing pages, portfolio sites","Payment integrations"];export default p;`;
    const map: Record<string, any> = {
      "https://spa.example/robots.txt": { body: "" },
      "https://spa.example/": { body: jsShellHtml("/assets/main-Ab1Cd2Ef.js") },
      "https://spa.example/assets/main-Ab1Cd2Ef.js": { body: mainBundle, contentType: "application/javascript" },
      "https://spa.example/assets/Services-abc12345.js": { body: servicesChunk, contentType: "application/javascript" },
      "https://spa.example/assets/Pricing-def67890.js": { body: pricingChunk, contentType: "application/javascript" },
    };
    vi.stubGlobal("fetch", fetchMock(map));

    const result = await crawlWebsite("https://spa.example");
    expect(result.jsRendered).toBe(true);
    const home = result.pages.find((p) => p.url === "https://spa.example/");
    expect(home?.js_content).toBeTruthy();
    expect(home?.js_content).toContain("Custom dashboards");
    expect(home?.js_content).toContain("Business sites");
  });

  it("does not collapse distinct JS-shell routes via content dedupe", async () => {
    const map: Record<string, any> = {
      "https://spa.example/robots.txt": { body: "" },
      "https://spa.example/sitemap.xml": {
        body: `<?xml version="1.0"?><urlset><url><loc>https://spa.example/</loc></url><url><loc>https://spa.example/services</loc></url><url><loc>https://spa.example/pricing</loc></url></urlset>`,
        contentType: "application/xml",
      },
      "https://spa.example/": { body: jsShellHtml("/assets/main.js") },
      "https://spa.example/services": { body: jsShellHtml("/assets/main.js") },
      "https://spa.example/pricing": { body: jsShellHtml("/assets/main.js") },
    };
    vi.stubGlobal("fetch", fetchMock(map));

    const result = await crawlWebsite("https://spa.example");
    expect(result.pages.length).toBe(3);
    const urls = result.pages.map((p) => p.url);
    expect(urls).toContain("https://spa.example/services");
    expect(urls).toContain("https://spa.example/pricing");
  });
});

describe("WA_001 rate limit", () => {
  afterEach(() => {
    delete process.env.WA_HOURLY_REPLY_LIMIT;
  });

  it("is unlimited by default (no WA_HOURLY_REPLY_LIMIT set)", () => {
    const result = evaluateRules(["WA_001"], { aiReplyCountInWindow: 500, lead: { opted_out: false } });
    expect(result.allowed).toBe(true);
  });

  it("blocks above the limit when WA_HOURLY_REPLY_LIMIT is configured", () => {
    process.env.WA_HOURLY_REPLY_LIMIT = "30";
    const result = evaluateRules(["WA_001"], { aiReplyCountInWindow: 30, lead: { opted_out: false } });
    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("WA_001");
  });

  it("respects WA_HOURLY_REPLY_LIMIT env override", () => {
    process.env.WA_HOURLY_REPLY_LIMIT = "5";
    expect(evaluateRules(["WA_001"], { aiReplyCountInWindow: 4 }).allowed).toBe(true);
    expect(evaluateRules(["WA_001"], { aiReplyCountInWindow: 5 }).allowed).toBe(false);
  });
});
