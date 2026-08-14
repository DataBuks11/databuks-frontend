import { describe, expect, it } from "vitest";
import { getActiveProvider } from "@/lib/ai/providers";
import { buildWhatsAppReplyPrompt } from "@/lib/ai/prompts";
import { validateAiOutput, whatsappReplySchema } from "@/lib/ai/schemas";
import type { BusinessContext, TaskContext } from "@/lib/ai/types";

const isConfigured =
  process.env.RUN_LIVE === "1" &&
  !!process.env.DEEPSEEK_API_KEY &&
  !process.env.DEEPSEEK_API_KEY.includes("placeholder");

const business: BusinessContext = {
  business_name: "DataBuks Technology Services",
  description: "Modern tech agency delivering custom websites, apps, software, automations and AI-powered solutions.",
  products: [],
  services: [
    { name: "Custom websites", description: "" },
    { name: "Mobile apps", description: "" },
    { name: "Automation", description: "" },
    { name: "AI solutions", description: "" },
  ],
  target_audience: [],
  ideal_customer_profile: {},
  locations: ["India"],
  industries: [],
  offer: {},
  pricing: {},
  brand_voice: [],
  tone: "casual",
  constraints: {},
  excluded_industries: [],
  excluded_lead_types: [],
  preferred_channels: ["whatsapp"],
  monthly_meeting_target: 20,
  available: true,
  missing_fields: [],
};

function makeContext(message: string, history: { sender: string; content: string }[] = []): TaskContext {
  return {
    business,
    lead: {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Jay Chheniya",
      company: null,
      email: null,
      phone: "223656244441296",
      industry: null,
      funnel_stage: "DISCOVERED",
      opted_out: false,
    },
    intelligence: null,
    conversation: { id: "22222222-2222-2222-2222-222222222222", contact_name: "Jay Chheniya", platform: "whatsapp" },
    messages: [...history, { sender: "user", content: message }],
    conversationSummary: null,
    duplicateExists: false,
    lastOutreachAt: null,
    outreachCountInWindow: 0,
  };
}

describe.skipIf(!isConfigured)("WhatsApp reply quality - live V4 Flash", () => {
  it("produces schema-valid natural replies for real message examples", async () => {
    const provider = getActiveProvider();
    const cases = [
      { message: "hii", expectMeeting: false },
      { message: "website banwana hai", expectMeeting: false },
      { message: "kitna cost aayega?", expectMeeting: false },
      {
        message: "can we talk tomorrow?",
        expectMeeting: true,
        history: [{ sender: "user", content: "I need an ecommerce website." }],
      },
      {
        message: "Already selling on Instagram.",
        expectMeeting: false,
        history: [
          { sender: "user", content: "I need an ecommerce website." },
          { sender: "ai", content: "Sure. Are you starting from scratch or already selling somewhere?" },
        ],
      },
    ];

    for (const testCase of cases) {
      const prompt = buildWhatsAppReplyPrompt(makeContext(testCase.message, testCase.history));
      const raw = await provider.completeJson(prompt);
      const validation = validateAiOutput(whatsappReplySchema, raw);
      expect(validation.success, JSON.stringify(validation.success ? {} : validation.issues.slice(0, 5))).toBe(true);
      if (validation.success) {
        console.log(`\n[USER] ${testCase.message}`);
        console.log(`[AI]   ${validation.data.reply}`);
        console.log(`[META] language=${validation.data.language} meeting_intent=${validation.data.meeting_intent} question=${validation.data.ask_one_question ?? "none"}`);
        if (testCase.expectMeeting) {
          expect(validation.data.meeting_intent).toBe(true);
        }
        expect(validation.data.reply.length).toBeLessThanOrEqual(400);
      }
    }
  }, 300000);
});
