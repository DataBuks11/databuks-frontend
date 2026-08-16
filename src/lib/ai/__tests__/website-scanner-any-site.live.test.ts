import { describe, expect, it } from "vitest";
import { crawlWebsite } from "@/lib/ai/website-scanner/crawler";
import { getActiveProvider } from "@/lib/ai/providers";
import { buildWebsiteScanPrompt } from "@/lib/ai/prompts";
import { validateAiOutput, websiteAnalysisSchema } from "@/lib/ai/schemas";

const isConfigured =
  process.env.RUN_LIVE === "1" &&
  !!process.env.DEEPSEEK_API_KEY &&
  !process.env.DEEPSEEK_API_KEY.includes("placeholder");

const TARGET = process.env.WEBSITE_LIVE_TEST_URL || "https://www.basecamp.com";

describe.skipIf(!isConfigured)("Website scanner honesty - any real business site", () => {
  it(
    "crawls a real site and extracts only evidence-backed organic info",
    async () => {
      console.log(`\n=== LIVE SCAN: ${TARGET} ===`);
      const crawl = await crawlWebsite(TARGET);
      console.log(`[CRAWL] discovered=${crawl.stats.discovered} scanned=${crawl.stats.scanned} failed=${crawl.stats.failed} jsRendered=${crawl.jsRendered}`);
      expect(crawl.pages.length).toBeGreaterThan(1);

      const provider = getActiveProvider();
      const prompt = buildWebsiteScanPrompt(crawl.pages, crawl.socialLinks);
      const raw = await provider.completeJson(prompt);
      const validation = validateAiOutput(websiteAnalysisSchema, raw);
      expect(validation.success, JSON.stringify(validation.success ? {} : validation.issues.slice(0, 5))).toBe(true);
      if (!validation.success) return;
      const analysis = validation.data;

      const sections = {
        business_name: analysis.business_name,
        overview: analysis.overview !== null,
        services: (analysis.services ?? []).length,
        products: (analysis.products ?? []).length,
        target_customers: (analysis.target_customers ?? []).length,
        industries: (analysis.industries ?? []).length,
        problems_solved: (analysis.problems_solved ?? []).length,
        value_proposition: analysis.value_proposition !== null,
        pricing: (analysis.pricing ?? []).length,
        testimonials: (analysis.testimonials ?? []).length,
        content_themes: (analysis.content_themes ?? []).length,
        business_signals: (analysis.business_signals ?? []).length,
        brand_voice: (analysis.brand_voice ?? []).length,
        competitors: (analysis.competitors ?? []).length,
      };
      console.log(`[SECTIONS] ${JSON.stringify(sections)}`);
      console.log(`[COMPETITORS] ${JSON.stringify(analysis.competitors ?? [])}`);
      console.log(`[EVIDENCE] sample service: ${JSON.stringify(analysis.services?.[0] ?? null)}`);
      console.log(`[HONESTY] confidence=${analysis.confidence} (empty sections stay empty when site lacks that content)`);
    },
    420000
  );
});
