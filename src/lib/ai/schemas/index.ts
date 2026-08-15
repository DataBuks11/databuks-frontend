import { z } from "zod";

export const SCORE_KEYS = [
  "icp_fit",
  "intent",
  "urgency",
  "buying_signal",
  "problem_severity",
  "timing",
  "reachability",
  "evidence_quality",
] as const;

const score = z.number().int().min(0).max(100);
const confidence = z.number().min(0).max(1);
const uuid = z.string().uuid();
const shortText = (max: number) => z.string().min(1).max(max);

export const evidenceItemSchema = z
  .object({
    source: z.enum([
      "website",
      "instagram",
      "facebook",
      "whatsapp",
      "telegram",
      "linkedin",
      "email",
      "conversation",
      "manual",
      "unknown",
    ]),
    signal: shortText(120),
    detail: z.string().max(500).optional(),
    quote: z.string().max(800).optional(),
  })
  .strict();

export const scoresSchema = z
  .object({
    icp_fit: score,
    intent: score,
    urgency: score,
    buying_signal: score,
    problem_severity: score,
    timing: score,
    reachability: score,
    evidence_quality: score,
  })
  .strict();

export const channelSchema = z.enum([
  "instagram",
  "facebook",
  "whatsapp",
  "telegram",
  "linkedin",
  "email",
]);

export const qualificationSchema = z
  .object({
    task: z.literal("lead_qualification"),
    lead_id: uuid,
    decision: z.enum(["qualified", "disqualified", "needs_more_data"]),
    scores: scoresSchema,
    confidence,
    why_now: z.string().max(1000),
    evidence: z.array(evidenceItemSchema).max(20),
    recommended_channel: channelSchema.nullable(),
    recommended_action: z.string().max(300).nullable(),
  })
  .strict();

export const enrichSchema = z
  .object({
    task: z.literal("lead_enrichment"),
    lead_id: uuid,
    company: z.string().max(200).nullable(),
    industry: z.string().max(200).nullable(),
    location: z.string().max(200).nullable(),
    website: z.string().max(500).nullable(),
    inferred_interest: z.string().max(500).nullable(),
    evidence: z.array(evidenceItemSchema).max(20),
    missing_data: z.array(shortText(100)).max(20),
    confidence,
  })
  .strict();

export const intentSchema = z
  .object({
    task: z.literal("intent_analysis"),
    lead_id: uuid,
    intent_score: score,
    signals: z.array(shortText(200)).max(20),
    summary: z.string().max(1000),
    confidence,
  })
  .strict();

export const urgencySchema = z
  .object({
    task: z.literal("urgency_analysis"),
    lead_id: uuid,
    urgency_score: score,
    time_signals: z.array(shortText(200)).max(20),
    reason: z.string().max(1000),
    confidence,
  })
  .strict();

export const buyingSignalSchema = z
  .object({
    task: z.literal("buying_signal_detection"),
    lead_id: uuid,
    buying_signal_score: score,
    signals: z.array(shortText(200)).max(20),
    evidence: z.array(evidenceItemSchema).max(20),
    confidence,
  })
  .strict();

export const outreachSchema = z
  .object({
    task: z.literal("outreach_generation"),
    lead_id: uuid,
    channel: channelSchema,
    subject: z.string().max(300).nullable(),
    body: z.string().min(1).max(2000),
    personalization_refs: z.array(shortText(300)).max(10),
    call_to_action: z.string().max(300).nullable(),
    tone: z.string().max(100),
    claims: z.array(shortText(300)).max(10),
  })
  .strict();

export const replyAnalysisSchema = z
  .object({
    task: z.literal("reply_analysis"),
    conversation_id: uuid,
    sentiment: z.enum(["positive", "neutral", "negative"]),
    intent_score: score,
    buying_signal_score: score,
    objections: z.array(shortText(300)).max(20),
    questions: z.array(shortText(300)).max(20),
    reply_required: z.boolean(),
    suggested_reply: z.string().max(1000).nullable(),
    meeting_intent: z.boolean(),
    meeting_intent_evidence: z.array(evidenceItemSchema).max(10),
    confidence,
  })
  .strict();

export const meetingIntentSchema = z
  .object({
    task: z.literal("meeting_intent_detection"),
    conversation_id: uuid,
    meeting_intent: z.boolean(),
    confidence,
    evidence: z.array(evidenceItemSchema).max(20),
    suggested_next_step: z.string().max(500).nullable(),
  })
  .strict();

export const followupSchema = z
  .object({
    task: z.literal("followup_generation"),
    lead_id: uuid,
    conversation_id: uuid.nullable(),
    body: z.string().min(1).max(2000),
    reason: z.string().max(500),
    send_after_hours: z.number().min(0).max(24 * 30),
    tone: z.string().max(100),
  })
  .strict();

export const summarizeSchema = z
  .object({
    task: z.literal("conversation_summary"),
    conversation_id: uuid,
    summary: z.string().min(1).max(2000),
    key_points: z.array(shortText(500)).max(20),
    next_steps: z.array(shortText(500)).max(10),
    meeting_intent: z.boolean(),
    confidence,
  })
  .strict();

export const websiteScanItemSchema = z
  .object({
    name: z.string().min(1).max(300),
    description: z.string().max(2000).nullable(),
    source_url: z.string().max(500).nullable(),
    evidence: z.string().max(1000).nullable(),
    confidence: confidence.nullable(),
  })
  .strict();

export const websiteTargetCustomerSchema = z
  .object({
    segment: z.string().min(1).max(300),
    description: z.string().max(2000).nullable(),
    pain_points: z.array(z.string().min(1).max(300)).max(20),
    source_url: z.string().max(500).nullable(),
    evidence: z.string().max(1000).nullable(),
    confidence: confidence.nullable(),
  })
  .strict();

export const websiteProblemSchema = z
  .object({
    problem: z.string().min(1).max(500),
    solution: z.string().max(1000).nullable(),
    source_url: z.string().max(500).nullable(),
    evidence: z.string().max(1000).nullable(),
    confidence: confidence.nullable().optional(),
  })
  .strict();

export const websiteOfferSchema = z
  .object({
    name: z.string().min(1).max(300),
    description: z.string().max(1000).nullable(),
    source_url: z.string().max(500).nullable(),
    evidence: z.string().max(1000).nullable(),
    confidence: confidence.nullable().optional(),
  })
  .strict();

export const websitePricingSchema = z
  .object({
    item: z.string().min(1).max(300),
    price: z.string().max(300).nullable(),
    source_url: z.string().max(500).nullable(),
    evidence: z.string().max(1000).nullable(),
    confidence: confidence.nullable().optional(),
  })
  .strict();

export const websiteSocialProfileSchema = z
  .object({
    platform: z.string().min(1).max(50),
    url: z.string().max(500),
    source_url: z.string().max(500).nullable(),
  })
  .strict();

export const websiteCaseStudySchema = z
  .object({
    title: z.string().min(1).max(500),
    summary: z.string().max(1500).nullable(),
    source_url: z.string().max(500).nullable(),
    evidence: z.string().max(1000).nullable().optional(),
  })
  .strict();

export const websiteTestimonialSchema = z
  .object({
    quote: z.string().min(1).max(1500),
    author: z.string().max(300).nullable(),
    source_url: z.string().max(500).nullable(),
    evidence: z.string().max(1000).nullable().optional(),
  })
  .strict();

export const websiteContentThemeSchema = z
  .object({
    title: z.string().min(1).max(300),
    description: z.string().max(1000).nullable(),
    source_url: z.string().max(500).nullable(),
    evidence: z.string().max(1000).nullable().optional(),
  })
  .strict();

export const websiteSignalSchema = z
  .object({
    signal: z.string().min(1).max(300),
    evidence: z.string().max(1000).nullable(),
    source_url: z.string().max(500).nullable(),
    confidence: confidence.nullable().optional(),
  })
  .strict();

export const websiteContactSchema = z
  .object({
    email: z.string().max(500).nullable(),
    phone: z.string().max(200).nullable(),
    address: z.string().max(1000).nullable(),
    source_url: z.string().max(500).nullable(),
  })
  .strict();

export const whatsappReplySchema = z
  .object({
    task: z.literal("whatsapp_reply"),
    conversation_id: uuid,
    reply: z.string().min(1).max(1200),
    language: z.enum(["english", "hindi", "hinglish", "other"]),
    meeting_intent: z.boolean(),
    meeting_intent_evidence: z.array(evidenceItemSchema).max(5),
    needs_clarification: z.boolean(),
    ask_one_question: z.string().max(300).nullable(),
    used_business_fact: z.string().max(300).nullable(),
  })
  .strict();

export const websiteAnalysisSchema = z
  .object({
    task: z.literal("website_analysis"),
    business_name: z.string().max(200).nullable(),
    tagline: z.string().max(500).nullable(),
    overview: z.string().max(2000).nullable(),
    services: z.array(websiteScanItemSchema).max(30),
    products: z.array(websiteScanItemSchema).max(30),
    target_customers: z.array(websiteTargetCustomerSchema).max(15),
    industries: z.array(z.string().min(1).max(200)).max(30),
    problems_solved: z.array(websiteProblemSchema).max(20),
    value_proposition: z.string().max(2000).nullable(),
    offers: z.array(websiteOfferSchema).max(20),
    pricing: z.array(websitePricingSchema).max(20),
    locations: z.array(z.string().min(1).max(300)).max(30),
    social_profiles: z.array(websiteSocialProfileSchema).max(20),
    case_studies: z.array(websiteCaseStudySchema).max(20),
    testimonials: z.array(websiteTestimonialSchema).max(30),
    contact_info: websiteContactSchema.nullable(),
    content_themes: z.array(websiteContentThemeSchema).max(30),
    business_signals: z.array(websiteSignalSchema).max(30),
    brand_voice: z.array(z.string().min(1).max(300)).max(20),
    tone: z.string().max(300).nullable(),
    confidence: confidence,
    hiring_signals: z.array(websiteSignalSchema).max(10).optional(),
    technology_signals: z.array(websiteSignalSchema).max(10).optional(),
    recent_announcements: z.array(websiteSignalSchema).max(10).optional(),
  })
  .strict();

export const websiteFactSchema = z
  .object({
    fact: z.string().min(1).max(1000),
    category: z.enum([
      "business_name",
      "description",
      "industry",
      "product",
      "service",
      "feature",
      "target_customer",
      "icp_signal",
      "problem_solved",
      "value_proposition",
      "offer",
      "pricing",
      "location",
      "case_study",
      "testimonial",
      "social_proof",
      "contact",
      "social_profile",
      "content_theme",
      "technology_signal",
      "hiring_signal",
      "announcement",
      "buying_signal",
      "business_maturity",
      "other",
    ]),
    source_url: z.string().max(500).nullable(),
    page_title: z.string().max(300).nullable(),
    evidence_quote: z.string().max(800).nullable(),
    confidence: confidence,
  })
  .strict();

export const websiteFactsSchema = z
  .object({
    task: z.literal("page_facts"),
    facts: z.array(websiteFactSchema).max(60),
    missing_info: z.array(z.string().min(1).max(300)).max(15),
  })
  .strict();

export function validateAiOutput<T extends z.ZodTypeAny>(
  schema: T,
  raw: unknown
): { success: true; data: z.infer<T> } | { success: false; issues: z.ZodIssue[] } {
  const result = schema.safeParse(raw);
  if (result.success) return result;
  return { success: false, issues: result.error.issues };
}
