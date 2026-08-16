import { describe, expect, it } from "vitest";
import { getActiveProvider } from "@/lib/ai/providers";
import { buildSocialEventPrompt, buildSocialContentPrompt, buildSocialReplyPrompt } from "@/lib/ai/prompts";
import { validateAiOutput, socialEventClassificationSchema, socialReplySchema, socialContentDraftSchema } from "@/lib/ai/schemas";
import type { BusinessContext, TaskContext } from "@/lib/ai/types";

const isConfigured =
  process.env.RUN_LIVE === "1" &&
  !!process.env.DEEPSEEK_API_KEY &&
  !process.env.DEEPSEEK_API_KEY.includes("placeholder");

const business: BusinessContext = {
  business_name: "DataBuks",
  description: "Technology services agency - websites, apps, automations, AI.",
  products: [],
  services: [{ name: "Custom websites", description: "" }, { name: "Automation", description: "" }, { name: "AI agents", description: "" }],
  target_audience: [{ segment: "Founders and startups", description: "" }],
  ideal_customer_profile: {},
  locations: ["Nagpur", "India"],
  industries: [],
  offer: {},
  pricing: {},
  brand_voice: ["casual", "founder-friendly"],
  tone: "casual",
  constraints: {},
  excluded_industries: [],
  excluded_lead_types: [],
  preferred_channels: ["instagram"],
  monthly_meeting_target: 20,
  available: true,
  missing_fields: [],
};

function makeContext(): TaskContext {
  return {
    business,
    lead: null,
    intelligence: null,
    conversation: null,
    messages: [],
    conversationSummary: null,
    duplicateExists: false,
    lastOutreachAt: null,
    outreachCountInWindow: 0,
  };
}

describe.skipIf(!isConfigured)("Social AI tasks - live V4 Flash", () => {
  it("classifies social events with structured output", async () => {
    const provider = getActiveProvider();
    const cases: { content: string; expect: string | string[] }[] = [      { content: "How much does a website cost?", expect: "REPLY" },
      { content: "Nice post!", expect: "IGNORE" },
      { content: "We need exactly this for our store. Please DM me details.", expect: ["REPLY", "CREATE_LEAD"] },
      { content: "Click here to earn 10000/day", expect: "IGNORE" },
      { content: "Your service is a scam, I want a refund NOW", expect: "ESCALATE_TO_HUMAN" },
    ];

    for (const testCase of cases) {
      const prompt = buildSocialEventPrompt(makeContext(), { content: testCase.content, event_type: "comment" });
      const raw = await provider.completeJson(prompt);
      const validation = validateAiOutput(socialEventClassificationSchema, raw);
      expect(validation.success, JSON.stringify(validation.success ? {} : validation.issues.slice(0, 3))).toBe(true);
      if (!validation.success) continue;
      const out = validation.data;
      console.log(`\n[COMMENT] ${testCase.content}`);
      console.log(`[CLASS]   type=${out.classification} intent=${out.intent_score} lead=${out.lead_score} action=${out.recommended_action}`);
      if (out.reply_draft) console.log(`[DRAFT]   ${out.reply_draft}`);
      if (Array.isArray(testCase.expect)) { expect(testCase.expect).toContain(out.recommended_action); } else { expect(out.recommended_action).toBe(testCase.expect); }
    }
  }, 420000);

  it("generates honest social replies and content drafts", async () => {
    const provider = getActiveProvider();
    const replyPrompt = buildSocialReplyPrompt(makeContext(), { content: "Bhai website banwana hai, kitna time lagega?", author_name: "Rahul" });
    const replyRaw = await provider.completeJson(replyPrompt);
    const replyValidation = validateAiOutput(socialReplySchema, replyRaw);
    expect(replyValidation.success).toBe(true);
    if (replyValidation.success) {
      console.log(`\n[REPLY] ${replyValidation.data.reply}`);
      expect(replyValidation.data.contains_claim).toBe(false);
    }

    const contentPrompt = buildSocialContentPrompt(makeContext(), { content_type: "post", topic: "automation for small businesses" });
    const contentRaw = await provider.completeJson(contentPrompt);
    const contentValidation = validateAiOutput(socialContentDraftSchema, contentRaw);
    expect(contentValidation.success, JSON.stringify(contentValidation.success ? {} : contentValidation.issues.slice(0, 3))).toBe(true);
    if (contentValidation.success) {
      console.log(`\n[CONTENT] topic=${contentValidation.data.topic}`);
      console.log(`[CAPTION] ${contentValidation.data.caption.slice(0, 200)}`);
      console.log(`[TAGS] ${(contentValidation.data.hashtags ?? []).join(" ")}`);
    }
  }, 300000);
});
