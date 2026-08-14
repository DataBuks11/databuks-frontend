import { describe, expect, it } from "vitest";
import { crawlWebsite } from "@/lib/ai/website-scanner/crawler";
import { getActiveProvider } from "@/lib/ai/providers";
import { buildWebsiteScanPrompt } from "@/lib/ai/prompts";
import { validateAiOutput, websiteAnalysisSchema } from "@/lib/ai/schemas";

const isConfigured =
  process.env.RUN_LIVE === "1" &&
  !!process.env.DEEPSEEK_API_KEY &&
  !process.env.DEEPSEEK_API_KEY.includes("placeholder");

describe.skipIf(!isConfigured)("Public web intelligence scanner - live", () => {
  it(
    "crawls a real public website and DeepSeek V4 Flash produces schema-valid analysis",
    async () => {
      const crawl = await crawlWebsite("https://example.com");
      expect(crawl.pages.length).toBeGreaterThan(0);

      const provider = getActiveProvider();
      expect(provider.model).toBe(process.env.DEEPSEEK_MODEL || "deepseek-v4-flash");

      const prompt = buildWebsiteScanPrompt(crawl.pages, crawl.socialLinks);
      const raw = await provider.completeJson(prompt);
      const validation = validateAiOutput(websiteAnalysisSchema, raw);
      expect(validation.success, JSON.stringify(validation.success ? {} : validation.issues.slice(0, 5))).toBe(true);
      if (validation.success) {
        expect(validation.data.task).toBe("website_analysis");
        expect(validation.data.confidence).toBeGreaterThanOrEqual(0);
        expect(validation.data.confidence).toBeLessThanOrEqual(1);
      }
    },
    180000
  );
});
