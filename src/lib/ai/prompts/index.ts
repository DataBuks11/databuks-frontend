import type { AiTaskType, BusinessContext, TaskContext } from "../types";

export const PROMPT_VERSIONS: Record<AiTaskType, string> = {
  ENRICH_LEAD: "1.3.0",
  QUALIFY_LEAD: "1.3.0",
  SCORE_LEAD: "1.3.0",
  ANALYZE_INTENT: "1.3.0",
  ANALYZE_URGENCY: "1.3.0",
  GENERATE_OUTREACH: "1.3.0",
  ANALYZE_REPLY: "1.3.0",
  DETECT_BUYING_SIGNAL: "1.3.0",
  DETECT_MEETING_INTENT: "1.3.0",
  GENERATE_FOLLOWUP: "1.3.0",
  SUMMARIZE_CONVERSATION: "1.3.0",
};

export const WEBSITE_SCAN_PROMPT_VERSION = "1.0.0";

const GLOBAL_RULES = [
  "You are the AI intelligence layer of a sales system. You do NOT decide what actions are allowed; a hard-coded Rule Engine decides. You only produce analysis and recommendations.",
  "Never fabricate information. Every claim about a lead or business must be supported by the provided context.",
  "Never invent intent, urgency, budget, statements, or evidence that is not present in the provided context.",
  "When evidence is insufficient, say so explicitly and score low confidence.",
  "Respond ONLY with a single valid JSON object matching the requested schema. No markdown, no commentary.",
  "All scores are integers from 0 to 100. Confidence is a number from 0 to 1.",
  "All boolean fields must be JSON booleans (true or false), never the strings \"true\" or \"false\".",
  "Every evidence item must have a source that is EXACTLY one of these values: website, instagram, facebook, whatsapp, telegram, linkedin, email, conversation, manual, unknown.",
  "Use 'conversation' for anything from the message history, 'manual' for user-provided lead notes/profile data, 'website' for website information, and 'unknown' when nothing else fits.",
  "If there is no evidence, return an empty evidence array.",
  "Do not fabricate customer intent or claim a meeting was requested when it was not.",
];

export function buildBusinessBlock(business: BusinessContext): string {
  const lines: string[] = ["BUSINESS CONTEXT:"];
  if (business.business_name) lines.push(`- Business name: ${business.business_name}`);
  if (business.description) lines.push(`- Description: ${business.description}`);
  if (business.products.length > 0) lines.push(`- Products: ${JSON.stringify(business.products)}`);
  if (business.services.length > 0) lines.push(`- Services: ${JSON.stringify(business.services)}`);
  if (business.target_audience.length > 0) lines.push(`- Target audience: ${JSON.stringify(business.target_audience)}`);
  if (Object.keys(business.ideal_customer_profile).length > 0) lines.push(`- ICP: ${JSON.stringify(business.ideal_customer_profile)}`);
  if (business.locations.length > 0) lines.push(`- Locations: ${business.locations.join(", ")}`);
  if (business.industries.length > 0) lines.push(`- Industries: ${business.industries.join(", ")}`);
  if (Object.keys(business.offer).length > 0) lines.push(`- Offer: ${JSON.stringify(business.offer)}`);
  if (Object.keys(business.pricing).length > 0) lines.push(`- Pricing: ${JSON.stringify(business.pricing)}`);
  if (business.brand_voice.length > 0) lines.push(`- Brand voice: ${business.brand_voice.join(", ")}`);
  if (business.tone) lines.push(`- Tone: ${business.tone}`);
  if (Object.keys(business.constraints).length > 0) lines.push(`- Constraints: ${JSON.stringify(business.constraints)}`);
  if (business.excluded_industries.length > 0) lines.push(`- Excluded industries: ${business.excluded_industries.join(", ")}`);
  if (business.excluded_lead_types.length > 0) lines.push(`- Excluded lead types: ${business.excluded_lead_types.join(", ")}`);
  if (business.preferred_channels.length > 0) lines.push(`- Preferred channels: ${business.preferred_channels.join(", ")}`);
  lines.push(`- Monthly meeting target: ${business.monthly_meeting_target}`);
  if (!business.available) {
    lines.push(`- IMPORTANT: business context is incomplete. Missing: ${business.missing_fields.join(", ")}. Do not assume values; mark affected outputs as unavailable.`);
  }
  return lines.join("\n");
}

export function buildLeadBlock(ctx: TaskContext): string {
  const lead = ctx.lead;
  if (!lead) return "LEAD: not provided";
  const lines: string[] = ["LEAD:"];
  lines.push(`- id: ${lead.id}`);
  if (lead.name) lines.push(`- name: ${lead.name}`);
  if (lead.company) lines.push(`- company: ${lead.company}`);
  if (lead.email) lines.push(`- email: ${lead.email}`);
  if (lead.phone) lines.push(`- phone: ${lead.phone}`);
  if (lead.industry) lines.push(`- industry: ${lead.industry}`);
  if (lead.location) lines.push(`- location: ${lead.location}`);
  if (lead.notes) lines.push(`- notes: ${lead.notes}`);
  lines.push(`- funnel stage: ${lead.funnel_stage ?? "not set"}`);
  lines.push(`- opted out: ${lead.opted_out === true ? "yes" : "no"}`);
  if (ctx.intelligence) {
    lines.push("LEAD INTELLIGENCE (existing):");
    lines.push(`  ${JSON.stringify(ctx.intelligence)}`);
  }
  return lines.join("\n");
}

export function buildConversationBlock(ctx: TaskContext): string {
  const conversation = ctx.conversation;
  if (!conversation) return "CONVERSATION: not provided";
  const lines: string[] = [
    "CONVERSATION:",
    `- id: ${conversation.id}`,
    `- contact: ${conversation.contact_name ?? "unknown"}`,
    `- platform: ${conversation.platform ?? "unknown"}`,
  ];
  if (ctx.conversationSummary) {
    lines.push(`PREVIOUS CONVERSATION SUMMARY: ${ctx.conversationSummary}`);
  }
  if (ctx.messages.length > 0) {
    lines.push("MESSAGE HISTORY (oldest first):");
    for (const message of ctx.messages) {
      const sender = message.sender === "ai" ? "AI" : "CONTACT";
      lines.push(`- [${sender}] ${message.content}`);
    }
  } else {
    lines.push("MESSAGE HISTORY: empty");
  }
  return lines.join("\n");
}

export interface PromptTemplate {
  system: string;
  user: string;
}

export function buildPrompt(taskType: AiTaskType, ctx: TaskContext): PromptTemplate {
  const system = GLOBAL_RULES.join("\n");
  switch (taskType) {
    case "ENRICH_LEAD":
      return {
        system,
        user: [
          "Task: enrich the lead with missing business information using only evidence present in context.",
          buildBusinessBlock(ctx.business),
          buildLeadBlock(ctx),
          "Return JSON: { task: \"lead_enrichment\", lead_id, company, industry, location, website, inferred_interest, evidence: [{source, signal, detail?}], missing_data: [string], confidence }.",
          "company, industry, location, website, inferred_interest must be null when they cannot be determined. Every filled field must have a matching evidence item.",
        ].join("\n\n"),
      };
    case "QUALIFY_LEAD":
      return {
        system,
        user: [
          "Task: qualify the lead for the sales funnel.",
          "Scoring guide: icp_fit (match with ICP), intent (interest in the offering), urgency (time pressure), buying_signal (purchase readiness), problem_severity (pain level), timing (suitability of now), reachability (usable contact), evidence_quality (quality of underlying evidence).",
          "decision is qualified ONLY when there is real evidence of fit and interest. Use disqualified for clear mismatch, needs_more_data when the picture is incomplete.",
          "why_now must explain why this lead is relevant NOW, based only on provided evidence. If no time-related evidence exists, state that none was found.",
          "Only use evidence items that are actually present in the context. Each item must cite its source.",
          buildBusinessBlock(ctx.business),
          buildLeadBlock(ctx),
          "Return JSON: { task: \"lead_qualification\", lead_id, decision: \"qualified\"|\"disqualified\"|\"needs_more_data\", scores: {icp_fit, intent, urgency, buying_signal, problem_severity, timing, reachability, evidence_quality}, confidence, why_now, evidence: [{source, signal, detail?}], recommended_channel, recommended_action }.",
          "recommended_channel must be one of: instagram, facebook, whatsapp, telegram, linkedin, email, or null.",
        ].join("\n\n"),
      };
    case "SCORE_LEAD":
      return {
        system,
        user: [
          "Task: score the lead across the standard scoring dimensions.",
          buildBusinessBlock(ctx.business),
          buildLeadBlock(ctx),
          "Return JSON: { task: \"lead_qualification\", lead_id, decision: \"qualified\"|\"disqualified\"|\"needs_more_data\", scores: {icp_fit, intent, urgency, buying_signal, problem_severity, timing, reachability, evidence_quality}, confidence, why_now, evidence: [{source, signal, detail?}], recommended_channel, recommended_action }.",
          "recommended_channel must be one of: instagram, facebook, whatsapp, telegram, linkedin, email, or null.",
        ].join("\n\n"),
      };
    case "ANALYZE_INTENT":
      return {
        system,
        user: [
          "Task: analyze the lead's demonstrated intent based on available evidence.",
          buildBusinessBlock(ctx.business),
          buildLeadBlock(ctx),
          buildConversationBlock(ctx),
          "Return JSON: { task: \"intent_analysis\", lead_id, intent_score, signals: [string], summary, confidence }.",
        ].join("\n\n"),
      };
    case "ANALYZE_URGENCY":
      return {
        system,
        user: [
          "Task: analyze the lead's urgency and timing pressure based on available evidence.",
          buildBusinessBlock(ctx.business),
          buildLeadBlock(ctx),
          buildConversationBlock(ctx),
          "Return JSON: { task: \"urgency_analysis\", lead_id, urgency_score, time_signals: [string], reason, confidence }.",
        ].join("\n\n"),
      };
    case "GENERATE_OUTREACH":
      return {
        system,
        user: [
          "Task: draft personalized outreach for the lead.",
          "The message must be concise, natural, non-spammy, and free of fake urgency or unsupported claims. Do not reference statistics, client counts, or guarantees that are not present in the business context.",
          "Do not claim the prospect requested contact unless the conversation history shows it.",
          buildBusinessBlock(ctx.business),
          buildLeadBlock(ctx),
          buildConversationBlock(ctx),
          "Return JSON: { task: \"outreach_generation\", lead_id, channel, subject, body, personalization_refs: [string], call_to_action, tone, claims: [string] }.",
          "channel must be one of: instagram, facebook, whatsapp, telegram, linkedin, email.",
          "claims must list any factual statements about the business used in the message; it must be empty when none are used.",
        ].join("\n\n"),
      };
    case "ANALYZE_REPLY":
      return {
        system,
        user: [
          "Task: analyze the latest reply from the contact.",
          "meeting_intent is true ONLY when the contact explicitly signals willingness to discuss, schedule, or speak (for example: \"can we discuss\", \"let's schedule\", \"when are you available\", \"I'd like to speak\"). Mild positivity is NOT meeting intent.",
          "meeting_intent_evidence must quote/paraphrase the actual message that demonstrates meeting intent. Never invent meeting intent.",
          "suggested_reply is a concise, natural, context-aware draft. It must not contain guarantees or fabricated claims. It must be null when no reply is needed.",
          buildBusinessBlock(ctx.business),
          buildLeadBlock(ctx),
          buildConversationBlock(ctx),
          "Return JSON: { task: \"reply_analysis\", conversation_id, sentiment: \"positive\"|\"neutral\"|\"negative\", intent_score, buying_signal_score, objections: [string], questions: [string], reply_required, suggested_reply, meeting_intent, meeting_intent_evidence: [{source, signal, detail?}], confidence }.",
        ].join("\n\n"),
      };
    case "DETECT_BUYING_SIGNAL":
      return {
        system,
        user: [
          "Task: detect buying signals in the lead's behavior and messages.",
          buildBusinessBlock(ctx.business),
          buildLeadBlock(ctx),
          buildConversationBlock(ctx),
          "Return JSON: { task: \"buying_signal_detection\", lead_id, buying_signal_score, signals: [string], evidence: [{source, signal, detail?}], confidence }.",
        ].join("\n\n"),
      };
    case "DETECT_MEETING_INTENT":
      return {
        system,
        user: [
          "Task: determine whether the contact has expressed meeting intent.",
          "meeting_intent is true ONLY when the contact explicitly signals willingness to discuss, schedule, or speak. Examples: \"Can we discuss this?\", \"Can you show me how it works?\", \"Let's schedule a call.\", \"When are you available?\", \"Send me your availability.\", \"I'd like to speak with someone.\"",
          "Vague friendliness, thanks, or simple questions are NOT meeting intent.",
          "evidence must quote/paraphrase the actual message(s) demonstrating the intent. Never invent meeting intent.",
          buildBusinessBlock(ctx.business),
          buildLeadBlock(ctx),
          buildConversationBlock(ctx),
          "Return JSON: { task: \"meeting_intent_detection\", conversation_id, meeting_intent, confidence, evidence: [{source, signal, detail?}], suggested_next_step }.",
        ].join("\n\n"),
      };
    case "GENERATE_FOLLOWUP":
      return {
        system,
        user: [
          "Task: draft a follow-up message based on the conversation so far. Do not restart from zero; reference actual context.",
          buildBusinessBlock(ctx.business),
          buildLeadBlock(ctx),
          buildConversationBlock(ctx),
          "Return JSON: { task: \"followup_generation\", lead_id, conversation_id, body, reason, send_after_hours, tone }.",
        ].join("\n\n"),
      };
    case "SUMMARIZE_CONVERSATION":
      return {
        system,
        user: [
          "Task: summarize the conversation and extract next steps.",
          buildBusinessBlock(ctx.business),
          buildLeadBlock(ctx),
          buildConversationBlock(ctx),
          "Return JSON: { task: \"conversation_summary\", conversation_id, summary, key_points: [string], next_steps: [string], meeting_intent, confidence }.",
        ].join("\n\n"),
      };
  }
}

export function buildWebsiteScanPrompt(pages: { url: string; title: string; description?: string; text: string }[], socialLinks: { platform: string; url: string; source_url: string }[]): PromptTemplate {  const system = [
    "You are a website business intelligence analyzer.",
    "Analyze the crawled PUBLIC web content provided below and produce a structured business profile.",
    "Never fabricate information. Only include facts that are present in the crawled content.",
    "When information is not available, use null or an empty array. Do not guess.",
    "Every important extracted item (services, products, target customers, problems, offers, pricing, case studies, testimonials, content themes, signals, contact info) must include its source_url (the page it was found on) and, where useful, a short evidence quote from the page text.",
    "Respond ONLY with a single valid JSON object matching the requested schema. No markdown, no commentary.",
    "All boolean fields must be JSON booleans (true or false). Confidence is a number from 0 to 1.",
    "confidence reflects how well the crawled content supports the overall profile.",
  ].join("\n");

  const pageBlocks = pages
    .map((page) => `--- PAGE: ${page.url}\nTITLE: ${page.title}\nDESCRIPTION: ${page.description}\nTEXT:\n${page.text}`)
    .join("\n\n");

  const socialBlock =
    socialLinks.length > 0
      ? `SOCIAL LINKS FOUND:\n${socialLinks.map((s) => `- ${s.platform}: ${s.url} (found on ${s.source_url})`).join("\n")}`
      : "SOCIAL LINKS FOUND: none";

  const user = [
    "Task: build a business profile from the crawled website content.",
    socialBlock,
    "CRAWLED CONTENT:",
    pageBlocks,
    "Return JSON matching this exact structure:",
    JSON.stringify({
      task: "website_analysis",
      business_name: "string or null",
      tagline: "string or null",
      overview: "string or null",
      services: [{ name: "string", description: "string or null", source_url: "string", evidence: "string or null", confidence: 0.9 }],
      products: [{ name: "string", description: "string or null", source_url: "string", evidence: "string or null", confidence: 0.9 }],
      target_customers: [{ segment: "string", description: "string or null", pain_points: ["string"], source_url: "string", evidence: "string or null", confidence: 0.9 }],
      industries: ["string"],
      problems_solved: [{ problem: "string", solution: "string or null", source_url: "string", evidence: "string or null" }],
      value_proposition: "string or null",
      offers: [{ name: "string", description: "string or null", source_url: "string", evidence: "string or null" }],
      pricing: [{ item: "string", price: "string or null", source_url: "string", evidence: "string or null" }],
      locations: ["string"],
      social_profiles: [{ platform: "string", url: "string", source_url: "string or null" }],
      case_studies: [{ title: "string", summary: "string or null", source_url: "string" }],
      testimonials: [{ quote: "string", author: "string or null", source_url: "string" }],
      contact_info: "object: {email, phone, address, source_url} or null",
      content_themes: [{ title: "string", description: "string or null", source_url: "string" }],
      business_signals: [{ signal: "string", evidence: "string or null", source_url: "string" }],
      brand_voice: ["string"],
      tone: "string or null",
      confidence: 0.8,
    }),
  ].join("\n\n");

  return { system, user };
}

export interface CorpusPage {
  url: string;
  title: string;
  page_type: string;
  headings: string[];
  text: string;
}

function buildCorpusBlock(pages: CorpusPage[]): string {
  return pages
    .map((page) => {
      const headingBlock = page.headings.length > 0 ? `HEADINGS: ${page.headings.join(" | ")}\n` : "";
      return `--- PAGE: ${page.url}\nTYPE: ${page.page_type}\nTITLE: ${page.title}\n${headingBlock}TEXT:\n${page.text}`;
    })
    .join("\n\n");
}

export function buildWebsiteFactsPrompt(pages: CorpusPage[]): PromptTemplate {
  const system = [
    "You extract verifiable business facts from crawled public website pages.",
    "Never fabricate. Every fact must come from the provided page content.",
    "Every fact must include its source_url and page_title from the provided pages.",
    "evidence_quote must be a short verbatim quote from the page text supporting the fact, or null when the fact is only inferred.",
    "Respond ONLY with a single valid JSON object matching the requested schema. No markdown, no commentary.",
    "All boolean fields must be JSON booleans. Confidence is a number from 0 to 1.",
  ].join("\n");

  const user = [
    "Task: extract business facts from the crawled pages below.",
    buildCorpusBlock(pages),
    "Return JSON:",
    JSON.stringify({
      task: "page_facts",
      facts: [
        {
          fact: "string",
          category: "business_name|description|industry|product|service|feature|target_customer|icp_signal|problem_solved|value_proposition|offer|pricing|location|case_study|testimonial|social_proof|contact|social_profile|content_theme|technology_signal|hiring_signal|announcement|buying_signal|business_maturity|other",
          source_url: "string or null",
          page_title: "string or null",
          evidence_quote: "string or null",
          confidence: 0.9,
        },
      ],
      missing_info: ["string"],
    }),
  ].join("\n\n");

  return { system, user };
}

export function buildWebsiteSynthesisPrompt(
  facts: Record<string, any>[],
  socialLinks: { platform: string; url: string; source_url: string }[]
): PromptTemplate {
  const system = [
    "You synthesize verified business facts into a structured business profile.",
    "Never fabricate. Only use the facts provided. If information is missing, use null or empty arrays.",
    "Each extracted item must keep its original source_url and evidence_quote from the facts it came from.",
    "Respond ONLY with a single valid JSON object matching the requested schema. No markdown, no commentary.",
    "All boolean fields must be JSON booleans. Confidence is a number from 0 to 1.",
  ].join("\n");

  const socialBlock =
    socialLinks.length > 0
      ? `SOCIAL LINKS FOUND:\n${socialLinks.map((s) => `- ${s.platform}: ${s.url} (found on ${s.source_url})`).join("\n")}`
      : "SOCIAL LINKS FOUND: none";

  const user = [
    "Task: synthesize the business profile from the verified facts below.",
    socialBlock,
    "VERIFIED FACTS:",
    facts
      .map(
        (f) =>
          `- [${f.category}] ${f.fact}\n  source: ${f.source_url ?? "unknown"} | page: ${f.page_title ?? "unknown"} | quote: ${f.evidence_quote ?? "none"} | confidence: ${f.confidence ?? "?"}`
      )
      .join("\n"),
    "Return JSON:",
    JSON.stringify({
      task: "website_analysis",
      business_name: "string or null",
      tagline: "string or null",
      overview: "string or null",
      services: [{ name: "string", description: "string or null", source_url: "string", evidence: "string or null", confidence: 0.9 }],
      products: [{ name: "string", description: "string or null", source_url: "string", evidence: "string or null", confidence: 0.9 }],
      target_customers: [{ segment: "string", description: "string or null", pain_points: ["string"], source_url: "string", evidence: "string or null", confidence: 0.9 }],
      industries: ["string"],
      problems_solved: [{ problem: "string", solution: "string or null", source_url: "string", evidence: "string or null" }],
      value_proposition: "string or null",
      offers: [{ name: "string", description: "string or null", source_url: "string", evidence: "string or null" }],
      pricing: [{ item: "string", price: "string or null", source_url: "string", evidence: "string or null" }],
      locations: ["string"],
      social_profiles: [{ platform: "string", url: "string", source_url: "string or null" }],
      case_studies: [{ title: "string", summary: "string or null", source_url: "string" }],
      testimonials: [{ quote: "string", author: "string or null", source_url: "string" }],
      contact_info: "object: {email, phone, address, source_url} or null",
      content_themes: [{ title: "string", description: "string or null", source_url: "string" }],
      business_signals: [{ signal: "string", evidence: "string or null", source_url: "string" }],
      brand_voice: ["string"],
      tone: "string or null",
      confidence: 0.8,
    }),
  ].join("\n\n");

  return { system, user };
}
