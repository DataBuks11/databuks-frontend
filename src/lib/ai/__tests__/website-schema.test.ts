import { describe, expect, it } from "vitest";
import { websiteAnalysisSchema } from "@/lib/ai/schemas";

const validAnalysis = {
  task: "website_analysis",
  business_name: "Brightlane Agency",
  tagline: "Growth marketing for agencies",
  overview: "Brightlane helps agencies grow with managed outreach.",
  services: [
    {
      name: "Managed Outreach",
      description: "Done-for-you prospect conversations",
      source_url: "https://example.com/services",
      evidence: "We help marketing agencies close more clients with AI-assisted outreach.",
      confidence: 0.9,
    },
  ],
  products: [],
  target_customers: [
    {
      segment: "Marketing agencies",
      description: "Agencies with 5-50 staff",
      pain_points: ["low pipeline"],
      source_url: "https://example.com/",
      evidence: "marketing agencies",
      confidence: 0.8,
    },
  ],
  industries: ["marketing"],
  problems_solved: [
    {
      problem: "Low pipeline",
      solution: "Managed outreach",
      source_url: "https://example.com/services",
      evidence: "close more clients",
    },
  ],
  value_proposition: "AI-assisted outreach that closes more clients",
  offers: [
    {
      name: "Growth plan",
      description: "Monthly managed outreach",
      source_url: "https://example.com/services",
      evidence: "managed outreach",
    },
  ],
  pricing: [
    {
      item: "Growth plan",
      price: "$499/mo",
      source_url: "https://example.com/services",
      evidence: "pricing table",
    },
  ],
  locations: ["Remote"],
  social_profiles: [
    { platform: "instagram", url: "https://instagram.com/brightlane", source_url: "https://example.com/" },
  ],
  case_studies: [{ title: "Agency X", summary: "Grew pipeline", source_url: "https://example.com/cases" }],
  testimonials: [{ quote: "Great results", author: "Jane", source_url: "https://example.com/" }],
  contact_info: { email: "hello@brightlane.example", phone: null, address: null, source_url: "https://example.com/contact" },
  content_themes: [{ title: "Growth tips", description: "Weekly insights", source_url: "https://example.com/blog" }],
  business_signals: [{ signal: "Hiring now", evidence: "Careers page lists 5 roles", source_url: "https://example.com/careers" }],
  brand_voice: ["professional", "confident"],
  tone: "friendly",
  confidence: 0.85,
};

describe("websiteAnalysisSchema", () => {
  it("accepts a complete valid analysis", () => {
    expect(websiteAnalysisSchema.safeParse(validAnalysis).success).toBe(true);
  });

  it("accepts minimal analysis with empty arrays and nulls", () => {
    const minimal = {
      task: "website_analysis",
      business_name: null,
      tagline: null,
      overview: null,
      services: [],
      products: [],
      target_customers: [],
      industries: [],
      problems_solved: [],
      value_proposition: null,
      offers: [],
      pricing: [],
      locations: [],
      social_profiles: [],
      case_studies: [],
      testimonials: [],
      contact_info: null,
      content_themes: [],
      business_signals: [],
      brand_voice: [],
      tone: null,
      confidence: 0.1,
    };
    expect(websiteAnalysisSchema.safeParse(minimal).success).toBe(true);
  });

  it("rejects wrong task literal", () => {
    expect(websiteAnalysisSchema.safeParse({ ...validAnalysis, task: "other" }).success).toBe(false);
  });

  it("rejects confidence outside 0-1", () => {
    expect(websiteAnalysisSchema.safeParse({ ...validAnalysis, confidence: 1.5 }).success).toBe(false);
    expect(
      websiteAnalysisSchema.safeParse({
        ...validAnalysis,
        services: [{ ...validAnalysis.services[0], confidence: 2 }],
      }).success
    ).toBe(false);
  });

  it("rejects items without source_url evidence fields are optional", () => {
    const bad = {
      ...validAnalysis,
      services: [{ name: "Missing source", description: null, source_url: null, evidence: null, confidence: null }],
    };
    expect(websiteAnalysisSchema.safeParse(bad).success).toBe(true);
  });

  it("rejects fabricated extra fields", () => {
    expect(websiteAnalysisSchema.safeParse({ ...validAnalysis, invented: true }).success).toBe(false);
  });

  it("rejects non-boolean freeform types inside items", () => {
    const bad = {
      ...validAnalysis,
      services: [{ ...validAnalysis.services[0], name: 42 }],
    };
    expect(websiteAnalysisSchema.safeParse(bad).success).toBe(false);
  });
});
