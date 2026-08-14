import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DeepSeekProvider } from "@/lib/ai/providers/deepseek";
import { buildPrompt } from "@/lib/ai/prompts";
import { TASK_DEFINITIONS } from "@/lib/ai/tasks/definitions";
import type { AiTaskType, BusinessContext, TaskContext } from "@/lib/ai/types";
import { validateAiOutput } from "@/lib/ai/schemas";

const API_KEY = process.env.DEEPSEEK_API_KEY ?? "";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const BASE_URL = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
const isConfigured =
  process.env.RUN_LIVE === "1" &&
  API_KEY.length > 10 &&
  !API_KEY.startsWith("placeholder") &&
  !API_KEY.includes("placeholder");

const sampleBusiness: BusinessContext = {
  business_name: "Northwind Digital",
  description: "B2B marketing automation platform for small service businesses.",
  products: [{ name: "Campaign Studio", description: "Automated social campaigns" }],
  services: [{ name: "Managed outreach", description: "Done-for-you lead generation" }],
  target_audience: [{ segment: "Agencies", description: "Marketing agencies 5-50 staff" }],
  ideal_customer_profile: { size: "5-50", budget: "marketing tooling" },
  locations: ["India"],
  industries: ["marketing", "SaaS"],
  offer: { summary: "Monthly managed plan" },
  pricing: { monthly: "custom" },
  brand_voice: ["professional", "concise"],
  tone: "friendly",
  constraints: {},
  excluded_industries: [],
  excluded_lead_types: [],
  preferred_channels: ["email", "whatsapp"],
  monthly_meeting_target: 20,
  available: true,
  missing_fields: [],
};

const LEAD_ID = "11111111-1111-1111-1111-111111111111";
const CONVERSATION_ID = "22222222-2222-2222-2222-222222222222";

const sampleContext: TaskContext = {
  business: sampleBusiness,
  lead: {
    id: LEAD_ID,
    name: "Priya Sharma",
    company: "Bluepeak Agency",
    email: "priya@bluepeak.example",
    phone: null,
    industry: "marketing",
    location: "Mumbai",
    notes: "Requested info about managed outreach via Instagram",
    funnel_stage: "OUTREACH_READY",
    opted_out: false,
  },
  intelligence: {
    icp_fit_score: 85,
    intent_score: 78,
    urgency_score: 70,
    confidence: 0.88,
    evidence: [{ source: "instagram", signal: "requested_pricing" }],
    why_now: "Agency hiring two new account managers",
  },
  conversation: {
    id: CONVERSATION_ID,
    contact_name: "Priya Sharma",
    platform: "instagram",
  },
  messages: [
    { sender: "ai", content: "Hi Priya, saw Bluepeak is expanding. Worth a quick chat about our managed outreach?" },
    { sender: "user", content: "Maybe. Can you show me how it works? When are you available?" },
  ],
  conversationSummary: null,
  duplicateExists: false,
  lastOutreachAt: null,
  outreachCountInWindow: 3,
};

describe.skipIf(!isConfigured)("DeepSeek V4 Flash - live API", () => {
  let provider: DeepSeekProvider;

  beforeAll(() => {
    provider = new DeepSeekProvider();
  });

  afterAll(() => {});

  it("provider exposes the correct model configuration", () => {
    expect(provider.model).toBe(MODEL);
    expect(provider.id).toBe("deepseek");
  });

  it("authenticates and completes a basic request", async () => {
    const out = await provider.completeJson({
      system: "Respond ONLY with valid JSON.",
      user: 'Return JSON: {"word": "ok", "n": 42}',
    });
    expect(out.word).toBe("ok");
    expect(out.n).toBe(42);
  });

  it("returns JSON even when the model wraps it in fences", async () => {
    const out = await provider.completeJson({
      system: "Respond ONLY with valid JSON.",
      user: 'Return a JSON object with a single field "status" set to "ready".',
    });
    expect(typeof out).toBe("object");
    expect(Object.keys(out).length).toBeGreaterThan(0);
  });

  it("returns a clean error when the API rejects the request (invalid key never logged)", async () => {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer invalid-test-key-000000",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    expect(response.ok).toBe(false);
    expect(response.status).toBeGreaterThanOrEqual(400);
    const text = await response.text();
    expect(text).not.toContain("invalid-test-key");
  });

  describe("task schema compatibility", () => {
    const tasks: AiTaskType[] = [
      "ENRICH_LEAD",
      "QUALIFY_LEAD",
      "SCORE_LEAD",
      "ANALYZE_INTENT",
      "ANALYZE_URGENCY",
      "GENERATE_OUTREACH",
      "ANALYZE_REPLY",
      "DETECT_BUYING_SIGNAL",
      "DETECT_MEETING_INTENT",
      "GENERATE_FOLLOWUP",
      "SUMMARIZE_CONVERSATION",
    ];

    for (const taskType of tasks) {
      it(`${taskType} produces schema-valid JSON`, async () => {
        const definition = TASK_DEFINITIONS[taskType];
        expect(definition).toBeDefined();

        const prompt = buildPrompt(taskType, sampleContext);
        const raw = await provider.completeJson(prompt);
        const validation = validateAiOutput(definition!.schema, raw);
        expect(validation.success, JSON.stringify(validation.success ? {} : validation.issues.slice(0, 5))).toBe(true);
      }, 120000);
    }
  });
});

describe.skipIf(isConfigured)("DeepSeek V4 Flash - skipped (no real key configured)", () => {
  it("placeholder", () => {
    expect(true).toBe(true);
  });
});
