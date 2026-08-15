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
  business_name: "DataBuks",
  description: "Technology services agency in Nagpur - websites, apps, automations, AI.",
  products: [],
  services: [
    { name: "Custom websites", description: "" },
    { name: "Mobile apps", description: "" },
    { name: "Automation", description: "" },
    { name: "AI agents", description: "" },
  ],
  target_audience: [{ segment: "Founders and startups", description: "" }],
  ideal_customer_profile: {},
  locations: ["Nagpur", "India"],
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
      name: "Rahul",
      company: null,
      email: null,
      phone: "919876543210",
      industry: null,
      funnel_stage: "CONVERSATION",
      opted_out: false,
    },
    intelligence: null,
    conversation: { id: "22222222-2222-2222-2222-222222222222", contact_name: "Rahul", platform: "whatsapp" },
    messages: [...history, { sender: "user", content: message }],
    conversationSummary: null,
    duplicateExists: false,
    lastOutreachAt: null,
    outreachCountInWindow: 0,
  };
}

describe.skipIf(!isConfigured)("WhatsApp human response - finalization cases (live V4 Flash)", () => {
  it("produces schema-valid, human, context-aware replies", async () => {
    const provider = getActiveProvider();
    const cases = [
      { label: "greeting-hinglish", message: "hii bhai", check: (r: any) => r.language === "hinglish" || r.language === "english" },
      { label: "slang-price", message: "kitna padega?", check: (r: any) => !/\d{2,}\s?(rs|₹|k)/i.test(r.reply) },
      { label: "fragmented", message: "website banna tha", check: (r: any) => r.reply.length <= 400 },
      {
        label: "context-memory",
        message: "woh 2000 ka kya karna tha?",
        history: [
          { sender: "user", content: "2000 wala group mein daalna tha" },
          { sender: "ai", content: "Haan, group automation wala kaam. Batao kya add karna hai usme?" },
        ],
        check: (r: any) => /2000|group/i.test(r.reply),
      },
      {
        label: "long-gap-context",
        message: "toh woh membership ka feature ban jayega?",
        history: [
          { sender: "user", content: "mujhe membership wala feature chahiye" },
          { sender: "ai", content: "Got it. Subscription type membership, ya ek baar ka access?" },
          { sender: "user", content: "monthly subscription, automatic renew" },
        ],
        check: (r: any) => /membership|subscription|renew/i.test(r.reply),
      },
      { label: "meeting-schedule", message: "kal 3 baje call kar lete hain?", check: (r: any) => r.meeting_intent === true },
      { label: "no-brochure-dump", message: "what services do you offer?", check: (r: any) => r.reply.length <= 400 && !/we offer a wide range/i.test(r.reply) && !/Certainly|Absolutely/i.test(r.reply) },
    ];

    for (const testCase of cases) {
      const prompt = buildWhatsAppReplyPrompt(makeContext(testCase.message, testCase.history));
      const raw = await provider.completeJson(prompt);
      const validation = validateAiOutput(whatsappReplySchema, raw);
      expect(validation.success, `${testCase.label}: ${JSON.stringify(validation.success ? {} : validation.issues.slice(0, 3))}`).toBe(true);
      if (!validation.success) continue;
      const reply = validation.data;
      console.log(`\n[${testCase.label}]`);
      console.log(`  USER: ${testCase.message}`);
      console.log(`  AI:   ${reply.reply}`);
      console.log(`  META: lang=${reply.language} meeting=${reply.meeting_intent} question=${reply.ask_one_question ?? "none"}`);
      expect(testCase.check(reply), `${testCase.label} reply check failed`).toBe(true);
      expect(reply.reply.length).toBeLessThanOrEqual(400);
      expect(/(?:Certainly!|Absolutely!|Great question!|I'd be happy to assist)/i.test(reply.reply)).toBe(false);
    }
  }, 420000);
});
