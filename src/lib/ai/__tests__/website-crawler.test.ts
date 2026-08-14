import { describe, expect, it, vi, afterEach } from "vitest";
import { crawlWebsite, normalizeUrl } from "@/lib/ai/website-scanner/crawler";

const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Brightlane Agency | Growth Marketing</title>
  <meta name="description" content="Brightlane helps agencies grow with managed outreach." />
</head>
<body>
  <h1>Managed Outreach for Agencies</h1>
  <p>We help marketing agencies close more clients with AI-assisted outreach.</p>
  <a href="/services">Our Services</a>
  <a href="https://brightlane.example/about">About us</a>
  <a href="https://facebook.com/brightlane">Facebook</a>
  <a href="https://www.instagram.com/brightlane/">Instagram</a>
  <a href="https://other-site.com/partner">Partner</a>
  <a href="https://brightlane.example/report.pdf">Report PDF</a>
</body>
</html>`;

function mockFetchSequence(responses: { url: string; ok: boolean; body: string; contentType?: string; status?: number }[]) {
  return vi.fn(async (input: any) => {
    const url = typeof input === "string" ? input : input?.url;
    const match = responses.find((r) => r.url === url);
    if (!match) throw new Error(`unexpected url ${url}`);
    if (!match.ok) {
      return new Response("", { status: match.status ?? 404 });
    }
    return new Response(match.body, {
      status: 200,
      headers: { "content-type": match.contentType ?? "text/html" },
    });
  });
}

describe("normalizeUrl", () => {
  it("adds https when missing", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com/");
    expect(normalizeUrl("  example.com  ")).toBe("https://example.com/");
  });

  it("keeps existing protocol", () => {
    expect(normalizeUrl("http://example.com")).toBe("http://example.com/");
  });

  it("rejects empty and invalid urls", () => {
    expect(() => normalizeUrl("")).toThrow(/required/);
    expect(() => normalizeUrl("not a url")).toThrow(/Invalid website URL/);
    expect(() => normalizeUrl("ftp://example.com")).toThrow(/Only http/);
  });
});

describe("crawlWebsite", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("crawls the homepage and extracts text, internal links and social links", async () => {
    const fetchMock = mockFetchSequence([
      { url: "https://example.com/", ok: true, body: SAMPLE_HTML.replaceAll("brightlane.example", "example.com") },
      { url: "https://example.com/services", ok: true, body: "<html><head><title>Services</title></head><body><p>Outreach services</p></body></html>" },
      { url: "https://example.com/about", ok: true, body: "<html><head><title>About</title></head><body><p>About us page</p></body></html>" },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await crawlWebsite("example.com");
    expect(result.error).toBeNull();
    expect(result.pages.length).toBeGreaterThanOrEqual(1);
    const home = result.pages.find((p) => p.url === "https://example.com/");
    expect(home).toBeDefined();
    expect(home?.title).toContain("Brightlane");
    expect(home?.description).toContain("managed outreach");
    expect(home?.text).toContain("close more clients");

    const crawledUrls = result.pages.map((p) => p.url);
    expect(crawledUrls).toContain("https://example.com/services");
    expect(crawledUrls).toContain("https://example.com/about");

    const platforms = result.socialLinks.map((s) => s.platform);
    expect(platforms).toContain("facebook");
    expect(platforms).toContain("instagram");
  });

  it("returns an error when the website is unavailable", async () => {
    const fetchMock = mockFetchSequence([
      { url: "https://down.example.com/", ok: false, body: "", status: 500 },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await crawlWebsite("down.example.com");
    expect(result.pages.length).toBe(0);
    expect(result.error).toMatch(/unavailable/i);
  });

  it("returns an error when the site is not HTML", async () => {
    const fetchMock = mockFetchSequence([
      { url: "https://file.example.com/", ok: true, body: "not html", contentType: "application/octet-stream" },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await crawlWebsite("file.example.com");
    expect(result.pages.length).toBe(0);
    expect(result.error).toMatch(/readable page/i);
  });

  it("does not follow external links or asset files", async () => {
    const fetchMock = mockFetchSequence([
      { url: "https://example.com/", ok: true, body: SAMPLE_HTML.replaceAll("brightlane.example", "example.com") },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const result = await crawlWebsite("example.com");
    const crawledUrls = result.pages.map((p) => p.url);
    expect(crawledUrls).not.toContain("https://other-site.com/partner");
    expect(crawledUrls).not.toContain("https://example.com/report.pdf");
    expect(result.socialLinks.map((s) => s.url)).toContain("https://facebook.com/brightlane");
  });
});
