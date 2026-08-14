import { describe, expect, it, vi, afterEach } from "vitest";
import {
  crawlWebsite,
  normalizeUrl,
  parseRobotsTxt,
  isRobotsAllowed,
  classifyPage,
  hashContent,
} from "@/lib/ai/website-scanner/crawler";

function html(title: string, body: string, links: string[] = [], meta = "") {
  return `<!DOCTYPE html><html><head><title>${title}</title>${meta}</head><body>${body}${links.map((l) => `<a href="${l}">link</a>`).join("")}</body></html>`;
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

const SITEMAP_XML = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://example.com/</loc></url>
<url><loc>https://example.com/services</loc></url>
<url><loc>https://example.com/pricing</loc></url>
<url><loc>https://example.com/case-studies</loc></url>
<url><loc>https://example.com/contact</loc></url>
<url><loc>https://example.com/deep/nested/page-one</loc></url>
<url><loc>https://example.com/deep/nested/page-two</loc></url>
<url><loc>https://example.com/blog/post-1</loc></url>
</urlset>`;

const SITEMAP_INDEX_XML = `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
<sitemap><loc>https://example.com/sitemap-posts.xml</loc></sitemap>
</sitemapindex>`;

describe("normalizeUrl", () => {
  it("strips fragments and trailing slashes", () => {
    expect(normalizeUrl("https://example.com/about/")).toBe("https://example.com/about");
    expect(normalizeUrl("https://example.com/about#section")).toBe("https://example.com/about");
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("removes tracking parameters", () => {
    const normalized = normalizeUrl("https://example.com/page?utm_source=x&utm_medium=y&keep=1");
    expect(normalized).toBe("https://example.com/page?keep=1");
  });

  it("keeps pagination parameters (safe variants)", () => {
    expect(normalizeUrl("https://example.com/blog?page=2")).toBe("https://example.com/blog?page=2");
  });

  it("rejects unsupported schemes", () => {
    expect(() => normalizeUrl("mailto:test@example.com")).toThrow(/Unsupported URL scheme/);
    expect(() => normalizeUrl("javascript:alert(1)")).toThrow(/Unsupported URL scheme/);
    expect(() => normalizeUrl("data:text/html,x")).toThrow(/Unsupported URL scheme/);
    expect(() => normalizeUrl("ftp://example.com")).toThrow(/Only http/);
  });
});

describe("classifyPage", () => {
  it("assigns business-critical types and priorities", () => {
    expect(classifyPage(new URL("https://example.com/pricing")).priority).toBeGreaterThan(
      classifyPage(new URL("https://example.com/blog/post")).priority
    );
    expect(classifyPage(new URL("https://example.com/pricing")).type).toBe("pricing");
    expect(classifyPage(new URL("https://example.com/services/seo")).type).toBe("services");
    expect(classifyPage(new URL("https://example.com/about")).type).toBe("about");
    expect(classifyPage(new URL("https://example.com/contact")).type).toBe("contact");
    expect(classifyPage(new URL("https://example.com/")).type).toBe("home");
  });
});

describe("hashContent", () => {
  it("is deterministic and differs for different content", () => {
    expect(hashContent("same text")).toBe(hashContent("same text"));
    expect(hashContent("text a")).not.toBe(hashContent("text b"));
  });
});

describe("parseRobotsTxt", () => {
  const robots = `User-agent: *
Disallow: /private/
Disallow: /admin
Allow: /private/public-page
User-agent: Googlebot
Disallow: /google-only-block
Sitemap: https://example.com/sitemap.xml`;

  it("parses disallow and allow rules for wildcard agent", () => {
    const rules = parseRobotsTxt(robots);
    expect(isRobotsAllowed(rules, "/private/secret")).toBe(false);
    expect(isRobotsAllowed(rules, "/private/public-page")).toBe(true);
    expect(isRobotsAllowed(rules, "/admin")).toBe(false);
    expect(isRobotsAllowed(rules, "/about")).toBe(true);
    expect(isRobotsAllowed(rules, "/google-only-block")).toBe(true);
  });

  it("returns allow-all when robots is null", () => {
    expect(isRobotsAllowed(null, "/anything")).toBe(true);
  });
});

describe("crawlWebsite - discovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("discovers deep pages from sitemap.xml that are not homepage-linked", async () => {
    const map: Record<string, any> = {
      "https://example.com/robots.txt": { body: "User-agent: *\nDisallow:\nSitemap: https://example.com/sitemap.xml" },
      "https://example.com/sitemap.xml": { body: SITEMAP_XML },
      "https://example.com/": { body: html("Home", "<p>home content</p>", []) },
      "https://example.com/services": { body: html("Services", "<p>services content</p>") },
      "https://example.com/pricing": { body: html("Pricing", "<p>pricing content</p>") },
      "https://example.com/case-studies": { body: html("Cases", "<p>case studies</p>") },
      "https://example.com/contact": { body: html("Contact", "<p>contact us</p>") },
      "https://example.com/deep/nested/page-one": { body: html("Deep One", "<p>deep content one</p>") },
      "https://example.com/deep/nested/page-two": { body: html("Deep Two", "<p>deep content two</p>") },
      "https://example.com/blog/post-1": { body: html("Post", "<p>blog post</p>") },
    };
    vi.stubGlobal("fetch", fetchMock(map));

    const result = await crawlWebsite("https://example.com");
    const urls = result.pages.map((p) => p.url);
    expect(urls).toContain("https://example.com/deep/nested/page-one");
    expect(urls).toContain("https://example.com/deep/nested/page-two");
    expect(urls).toContain("https://example.com/pricing");
    expect(result.stats.scanned).toBeGreaterThanOrEqual(6);
  });

  it("processes sitemap_index.xml child sitemaps", async () => {
    const pagesSitemap = `<?xml version="1.0"?><urlset><url><loc>https://example.com/</loc></url><url><loc>https://example.com/products</loc></url></urlset>`;
    const postsSitemap = `<?xml version="1.0"?><urlset><url><loc>https://example.com/blog/one</loc></url><url><loc>https://example.com/blog/two</loc></url></urlset>`;
    const map: Record<string, any> = {
      "https://example.com/robots.txt": { body: "" },
      "https://example.com/sitemap.xml": { body: SITEMAP_INDEX_XML },
      "https://example.com/sitemap_index.xml": { body: SITEMAP_INDEX_XML },
      "https://example.com/sitemap-pages.xml": { body: pagesSitemap },
      "https://example.com/sitemap-posts.xml": { body: postsSitemap },
      "https://example.com/": { body: html("Home", "<p>home</p>") },
      "https://example.com/products": { body: html("Products", "<p>products</p>") },
      "https://example.com/blog/one": { body: html("Blog 1", "<p>post one</p>") },
      "https://example.com/blog/two": { body: html("Blog 2", "<p>post two</p>") },
    };
    vi.stubGlobal("fetch", fetchMock(map));

    const result = await crawlWebsite("https://example.com");
    const urls = result.pages.map((p) => p.url);
    expect(urls).toContain("https://example.com/products");
    expect(urls).toContain("https://example.com/blog/two");
  });

  it("respects robots.txt disallow rules", async () => {
    const map: Record<string, any> = {
      "https://example.com/robots.txt": { body: "User-agent: *\nDisallow: /private/\nDisallow: /admin\nSitemap: https://example.com/sitemap.xml" },
      "https://example.com/sitemap.xml": {
        body: `<?xml version="1.0"?><urlset><url><loc>https://example.com/</loc></url><url><loc>https://example.com/private/secret</loc></url><url><loc>https://example.com/about</loc></url></urlset>`,
      },
      "https://example.com/": { body: html("Home", "<p>home</p>") },
      "https://example.com/about": { body: html("About", "<p>about</p>") },
    };
    vi.stubGlobal("fetch", fetchMock(map));

    const result = await crawlWebsite("https://example.com");
    const urls = result.pages.map((p) => p.url);
    expect(urls).not.toContain("https://example.com/private/secret");
    expect(urls).toContain("https://example.com/about");
    expect(result.stats.robotsSkipped).toBeGreaterThanOrEqual(1);
  });

  it("caps pagination variants per path", async () => {
    const map: Record<string, any> = {
      "https://example.com/robots.txt": { body: "" },
      "https://example.com/": {
        body: html("Home", "<p>home</p>", [
          "/blog?page=1",
          "/blog?page=2",
          "/blog?page=3",
          "/blog?page=4",
          "/blog?page=5",
          "/blog?page=6",
          "/blog?page=7",
        ]),
      },
    };
    for (let i = 1; i <= 7; i++) {
      map[`https://example.com/blog?page=${i}`] = { body: html(`Blog ${i}`, `<p>post page ${i}</p>`) };
    }
    vi.stubGlobal("fetch", fetchMock(map));

    const result = await crawlWebsite("https://example.com");
    const blogPages = result.pages.filter((p) => p.url.includes("blog?page="));
    expect(blogPages.length).toBeLessThanOrEqual(5);
  });

  it("dedupes identical content across URLs", async () => {
    const sameContent = "<p>exactly the same page content</p>";
    const map: Record<string, any> = {
      "https://example.com/robots.txt": { body: "" },
      "https://example.com/": { body: html("Home", sameContent, ["/a", "/b"]) },
      "https://example.com/a": { body: html("A", sameContent) },
      "https://example.com/b": { body: html("B", sameContent) },
    };
    vi.stubGlobal("fetch", fetchMock(map));

    const result = await crawlWebsite("https://example.com");
    expect(result.stats.duplicates).toBe(1);
    expect(result.pages.length).toBe(2);
  });

  it("records PDFs as discovered documents instead of crawling them", async () => {
    const map: Record<string, any> = {
      "https://example.com/robots.txt": { body: "" },
      "https://example.com/": {
        body: html("Home", "<p>home</p>", ["/brochure.pdf", "/pricing.pdf", "/logo.png"]),
      },
    };
    vi.stubGlobal("fetch", fetchMock(map));

    const result = await crawlWebsite("https://example.com");
    const documentUrls = result.documents.map((d) => d.url);
    expect(documentUrls).toContain("https://example.com/brochure.pdf");
    expect(documentUrls).toContain("https://example.com/pricing.pdf");
    expect(result.pages.length).toBe(1);
  });

  it("enforces configurable page limits without uncontrolled crawling", async () => {
    process.env.WEBSITE_MAX_PAGES = "10";
    const map: Record<string, any> = { "https://example.com/robots.txt": { body: "" } };
    map["https://example.com/"] = {
      body: html(
        "Home",
        "<p>home</p>",
        Array.from({ length: 30 }, (_, i) => `/page-${i}`)
      ),
    };
    for (let i = 0; i < 30; i++) {
      map[`https://example.com/page-${i}`] = { body: html(`Page ${i}`, `<p>content ${i}</p>`) };
    }
    vi.stubGlobal("fetch", fetchMock(map));

    const result = await crawlWebsite("https://example.com");
    expect(result.pages.length).toBeLessThanOrEqual(10);
    delete process.env.WEBSITE_MAX_PAGES;
  });

  it("does not crawl external domains or subdomains by default", async () => {
    const map: Record<string, any> = {
      "https://example.com/robots.txt": { body: "" },
      "https://example.com/": {
        body: html("Home", "<p>home</p>", ["https://other.com/page", "https://blog.example.com/post"]),
      },
    };
    vi.stubGlobal("fetch", fetchMock(map));

    const result = await crawlWebsite("https://example.com");
    const urls = result.pages.map((p) => p.url);
    expect(urls).not.toContain("https://other.com/page");
    expect(urls).not.toContain("https://blog.example.com/post");
  });

  it("extracts canonical url, headings and page type", async () => {
    const map: Record<string, any> = {
      "https://example.com/robots.txt": { body: "" },
      "https://example.com/": {
        body: html(
          "Pricing | Example",
          "<h1>Plans</h1><h2>Starter</h2><p>From $49/mo</p>",
          [],
          '<link rel="canonical" href="https://example.com/pricing">'
        ),
      },
    };
    vi.stubGlobal("fetch", fetchMock(map));

    const result = await crawlWebsite("https://example.com");
    expect(result.pages[0].canonical_url).toBe("https://example.com/pricing");
    expect(result.pages[0].headings).toContain("Plans");
    expect(result.pages[0].page_type).toBe("home");
  });
});
