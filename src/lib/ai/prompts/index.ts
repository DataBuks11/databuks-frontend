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
  GENERATE_WHATSAPP_REPLY: "1.2.0",
  CLASSIFY_SOCIAL_EVENT: "1.0.0",
  GENERATE_SOCIAL_REPLY: "1.0.0",
  GENERATE_SOCIAL_CONTENT: "1.0.0",
  ANALYZE_OPPORTUNITY: "1.0.0",
  ANALYZE_DISCOVERY: "1.0.0",
  GENERATE_NURTURE_REPLY: "1.0.0",
};

export const WEBSITE_SCAN_PROMPT_VERSION = "1.1.0";

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
  /** Cap response tokens — prevents large-default model 402-credit errors on
   *  OpenRouter when the user account has limited balance. */
  maxTokens?: number;
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
    case "GENERATE_WHATSAPP_REPLY":
      return buildWhatsAppReplyPrompt(ctx);
    default:
      return {
        system,
        user: `No prompt template defined for task type ${taskType}.`,
      };
  }
}
export function buildWebsiteScanPrompt(pages: { url: string; title: string; description?: string; text: string }[], socialLinks: { platform: string; url: string; source_url: string }[], siteType: string = "business"): PromptTemplate {
  const system = [
    "You are a website business intelligence analyzer.",
    "Analyze the crawled PUBLIC web content provided below and produce a structured business profile.",
    "Never fabricate information. Only include facts that are present in the crawled content.",
    "When information is not available, use null or an empty array. Do not guess.",
    "Adapt your analysis to the detected website type. Do not force agency/business categories onto content, blog, ecommerce or documentation sites. Only fill categories that the content genuinely supports.",
    "Some page text may be marked as recovered from JavaScript bundles: it is fragmentary but REAL site copy (headlines, offerings, pricing labels). Treat coherent phrases from it as genuine site content with medium confidence (0.5-0.75). Map offering names into products or services, and offering descriptions into pricing items where a price-like value is present.",
    "Fill every section you have genuine evidence for: products, services, target customers (who the site says it serves), industries, problems solved, value proposition (headline copy), offers, pricing, locations, testimonials (quoted statements), content themes (repeated substantive topics across pages), business signals, brand voice.",
    "Do not leave a section empty when the crawled content clearly supports it. Competitors have two tiers: (a) site-evidence competitors from comparison pages, 'vs'/'versus' pages, alternatives pages, explicit brand mentions, or outbound links to competing products; (b) industry-inference competitors — only if no (a) competitors exist, suggest 1-3 well-known players in the same industry based on general public knowledge, each with evidence_type 'industry_inference' and confidence <= 0.45. Never invent site-evidence; only (b) is allowed when (a) is empty.",
    "COMPETITORS: extract competitors ONLY from explicit site evidence: comparison pages, 'vs'/'versus' pages, alternatives pages, explicit competitor brand mentions, or outbound links to competing products. For each: name, website_url (when present on site), reason (why it is a competitor, from the site's own words), source_url (page found on), evidence_quote (verbatim), evidence_type ('comparison_page' | 'mentioned_on_website' | 'outbound_link'), confidence 0.6-0.9 when explicitly named by the site. FALLBACK: if NO site-evidence competitors exist, you may add up to 3 industry-inference competitors with evidence_type 'industry_inference', evidence_quote null, reason explaining why they are commonly considered a peer in the same industry, and confidence 0.25-0.45. Never guess competitor names when both tiers would be empty.",
    "Every important extracted item (services, products, target customers, problems, offers, pricing, case studies, testimonials, content themes, signals, contact info) must include its source_url (the page it was found on) and, where useful, a short evidence quote from the page text.",
    "Respond ONLY with a single valid JSON object matching the requested schema. No markdown, no commentary.",
    "All boolean fields must be JSON booleans (true or false). Confidence is a number from 0 to 1.",
    "confidence reflects how well the crawled content supports the overall profile.",
  ].join("\n");

  const pageBlocks = pages
    .map((page) => `--- PAGE: ${page.url}\nTITLE: ${page.title}\nDESCRIPTION: ${page.description ?? ""}\nTEXT:\n${page.text}`)
    .join("\n\n");

  const socialBlock =
    socialLinks.length > 0
      ? `SOCIAL LINKS FOUND:\n${socialLinks.map((s) => `- ${s.platform}: ${s.url} (found on ${s.source_url})`).join("\n")}`
      : "SOCIAL LINKS FOUND: none";

  const user = [
    `Task: build a business profile from the crawled website content. Detected website type: ${siteType}.`,
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
      competitors: [{ name: "string", website_url: "string or null", reason: "string or null", source_url: "string", evidence_quote: "string or null", evidence_type: "comparison_page|mentioned_on_website|outbound_link|industry_inference", confidence: 0.8 }],
      confidence: 0.8,
    }),
  ].join("\n\n");

  return { system, user, maxTokens: 3500 };
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

export function buildWebsiteFactsPrompt(pages: CorpusPage[], siteType: string = "business"): PromptTemplate {
  const system = [
    "You extract verifiable business facts from crawled public website pages.",
    "Never fabricate. Every fact must come from the provided page content.",
    "Some page text may be recovered from JavaScript bundles: it is fragmentary but REAL site copy. Extract facts from coherent fragments (offering names, pricing labels, audience phrases) with medium confidence (0.5-0.75).",
    "Extract competitor facts (category 'competitor') ONLY from explicit evidence: comparison pages, 'vs' pages, alternatives pages, named competitor brands, or outbound links to competing products. fact = competitor name, evidence_quote = the site's exact words about them.",
    "Every fact must include its source_url and page_title from the provided pages.",
    "evidence_quote must be a short verbatim quote from the page text supporting the fact, or null when the fact is only inferred.",
    "Respond ONLY with a single valid JSON object matching the requested schema. No markdown, no commentary.",
    "All boolean fields must be JSON booleans. Confidence is a number from 0 to 1.",
  ].join("\n");

  const user = [
    `Task: extract business facts from the crawled pages below. Detected website type: ${siteType}.`,
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

  return { system, user, maxTokens: 2500 };
}

export function buildWebsiteSynthesisPrompt(
  facts: Record<string, any>[],
  socialLinks: { platform: string; url: string; source_url: string }[],
  siteType: string = "business",
  coverageNote?: string
): PromptTemplate {
  const system = [
    "You synthesize verified business facts into a structured business profile.",
    "Never fabricate. Only use the facts provided. If information is missing, use null or empty arrays.",
    "Adapt the profile to the detected website type. Do not force agency categories onto content, ecommerce or documentation sites.",
    "Fill every section you have facts for: products, services, target customers, industries, problems solved, value proposition, offers, pricing, locations, testimonials, content themes, business signals, brand voice. Do not leave a section empty when facts support it. Do not invent competitors.",
    "Build competitors ONLY from facts with category 'competitor'. Each competitor needs name, website_url (from the fact when available), reason, source_url, evidence_quote and evidence_type. If no competitor facts exist, competitors must be [].",
    "Each extracted item must keep its original source_url and evidence_quote from the facts it came from.",
    "Respond ONLY with a single valid JSON object matching the requested schema. No markdown, no commentary.",
    "All boolean fields must be JSON booleans. Confidence is a number from 0 to 1.",
  ].join("\n");

  const socialBlock =
    socialLinks.length > 0
      ? `SOCIAL LINKS FOUND:\n${socialLinks.map((s) => `- ${s.platform}: ${s.url} (found on ${s.source_url})`).join("\n")}`
      : "SOCIAL LINKS FOUND: none";

  const user = [
    `Task: synthesize the business profile from the verified facts below. Detected website type: ${siteType}.`,
    coverageNote ? `COVERAGE: ${coverageNote}` : "",
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
      competitors: [{ name: "string", website_url: "string or null", reason: "string or null", source_url: "string", evidence_quote: "string or null", evidence_type: "comparison_page|mentioned_on_website|outbound_link|industry_inference", confidence: 0.8 }],
      confidence: 0.8,
    }),
  ].join("\n\n");

  return { system, user, maxTokens: 3500 };
}

export function buildWhatsAppReplyPrompt(ctx: TaskContext): PromptTemplate {
  // Compact system prompt — every line counts. Free models (MiniMax M3) are
  // sensitive to prompt size; a lean prompt = faster, more reliable replies.
  const system = [
    "You are the business owner personally replying on WhatsApp from your own phone. Real human, typing fast.",
    "Tone: lowercase often, no perfect punctuation, 1-2 lines max. Reply to the LAST thing only. No re-introductions.",
    "NEVER: 'Certainly!', 'Absolutely!', 'Great question!', 'We offer a wide range of', 'feel free to reach out', marketing language, formal sign-offs, explaining who you are when they messaged first.",
    "Language: mirror them exactly. English in → English out. Devanagari Hindi → Hindi. Hinglish → Hinglish. Never start in Hinglish unless they did.",
    "If you don't know pricing/timeline/availability: say 'send me the details' or 'what do you need exactly'.",
    "Match energy: casual in → casual out, formal in → slightly formal but still human.",
    "Meeting intent (true only when they clearly want to talk/call/demo): backed by evidence array of {source, signal, quote}.",
    "CRITICAL anti-hallucination rules: never invent IDs, passwords, account numbers, OTPs, ticket numbers, tracking IDs, employee names, client names, company registrations, or any concrete identifier. If the lead asks for credentials/account info that you don't actually have, say 'share your email, I'll send it' or 'check your email/SMS' — NEVER make up plausible-looking numbers. If asked for something you can't provide, route to a human (set meeting_intent=true if it would be helpful).",
    "Return ONLY a single valid JSON object. Booleans are JSON true/false, not strings.",
  ].join("\n");

  const user = [
    buildBusinessBlock(ctx.business),
    buildLeadBlock(ctx),
    buildConversationBlock(ctx),
    "Return JSON:",
    JSON.stringify({
      task: "whatsapp_reply",
      conversation_id: ctx.conversation?.id ?? "00000000-0000-0000-0000-000000000000",
      reply: "your short WhatsApp reply here",
      language: "english|hindi|hinglish|other",
      meeting_intent: false,
      meeting_intent_evidence: [{ source: "conversation", signal: "requested_call", quote: "can we talk tomorrow?" }],
      needs_clarification: false,
      ask_one_question: "string or null",
      used_business_fact: "string or null",
    }),
  ].join("\n\n");

  return { system, user };
}

export function buildSocialEventPrompt(
  ctx: TaskContext,
  event: { content: string; author_name?: string | null; event_type: string },
  recentMessages?: { author_name?: string | null; content: string; at?: string | null }[]
): PromptTemplate {
  const system = [
    "You classify a single social media event (comment/message) for a business.",
    "Classify honestly from the content. Never invent intent or urgency that the words do not support.",
    "classification: pick EXACTLY ONE of the allowed enum values (no slashes, no combinations): general, question, pricing, pricing_interest, service_interest, purchase_intent, meeting_intent, support, support_request, complaint, escalate_to_human, spam, irrelevant, positive, neutral, negative, praise, compliment, partnership, competitor_related. Use pricing_interest or pricing for price questions, service_interest for service needs, purchase_intent for explicit buying, meeting_intent for call/meeting requests, support/support_request for help requests, complaint for serious complaints, spam for spam, irrelevant for unrelated chatter, general for plain greetings.",
    "lead_score: 0-100 evidence-based interest in the business offering. A pricing question or explicit need is strong; a vague compliment is weak; spam/irrelevant is ~0.",
    "recommended_action: REPLY for genuine engagement deserving a public reply. CREATE_LEAD when buying/service intent is clear. ASK_QUESTION when a clarification moves the conversation forward. ESCALATE_TO_HUMAN for angry customers, legal/payment disputes, or sensitive situations. IGNORE for spam/irrelevant.",
    "should_reply: true only when a reply is genuinely useful and safe. escalation_required: true when a human must handle it.",
    "reply_draft: a short, natural, brand-appropriate reply in the author's language. Never fabricate pricing, offers, or promises. Null when no reply is needed.",
    "Use the recent conversation (if provided) to avoid repeating questions the user already answered.",
    "Respond ONLY with a single valid JSON object matching the requested schema. No markdown. Booleans must be JSON booleans. Scores are integers 0-100. Confidence is 0-1.",
  ].join("\n");

  const recentBlock =
    recentMessages && recentMessages.length > 0
      ? `RECENT CONVERSATION WITH THIS AUTHOR (oldest first):\n${recentMessages
          .map((m) => `- ${m.author_name ?? "unknown"}: ${m.content}`)
          .join("\n")}`
      : "RECENT CONVERSATION: none";

  const user = [
    buildBusinessBlock(ctx.business),
    `SOCIAL EVENT TYPE: ${event.event_type}`,
    `AUTHOR: ${event.author_name ?? "unknown"}`,
    `CONTENT: ${event.content}`,
    recentBlock,
    "Return JSON:",
    JSON.stringify({
      task: "social_event_classification",
      classification: "question",
      intent_score: 70,
      lead_score: 65,
      sentiment: "positive",
      urgency: 50,
      recommended_action: "REPLY",
      should_reply: true,
      escalation_required: false,
      reply_draft: "string or null",
      reason: "short explanation",
      confidence: 0.9,
    }),
  ].join("\n\n");

  return { system, user };
}

export function buildSocialContentPrompt(ctx: TaskContext, request: { topic?: string | null; content_type: string }): PromptTemplate {
  const system = [
    "You generate social media content drafts for the business.",
    "Use the business context: services, brand voice, audience, themes. Never invent facts, statistics, client counts, pricing, or guarantees.",
    "Content must sound human and specific to this business - no generic marketing filler.",
    "If the requested topic is not supported by the business context, pick the closest real theme and note it in the topic.",
    "Respond ONLY with a single valid JSON object matching the requested schema. No markdown. Booleans must be JSON booleans. Confidence is 0-1.",
  ].join("\n");

  const user = [
    buildBusinessBlock(ctx.business),
    `REQUESTED CONTENT TYPE: ${request.content_type}${request.topic ? `\nREQUESTED TOPIC: ${request.topic}` : ""}`,
    "Return JSON:",
    JSON.stringify({
      task: "social_content_draft",
      content_type: request.content_type,
      topic: "string",
      caption: "string",
      hashtags: ["string"],
      cta: "string or null",
      hook: "string or null",
      platform_variants: { instagram: "string", linkedin: "string" },
      contains_unverified_claim: false,
      confidence: 0.9,
    }),
  ].join("\n\n");

  return { system, user };
}

export function buildSocialReplyPrompt(ctx: TaskContext, event: { content: string; author_name?: string | null; post_topic?: string | null }): PromptTemplate {
  const system = [
    "You write a public comment reply for a business owner. Short, natural, human.",
    "Never fabricate pricing, offers, timelines or promises. Never use: Certainly!, Absolutely!, We offer a wide range of.",
    "Match the commenter's language (English/Hindi/Hinglish). Max 2-3 short sentences. At most one question.",
    "Respond ONLY with a single valid JSON object matching the requested schema. No markdown. Booleans must be JSON booleans. Confidence is 0-1.",
  ].join("\n");

  const user = [
    buildBusinessBlock(ctx.business),
    `COMMENTER: ${event.author_name ?? "unknown"}`,
    event.post_topic ? `POST TOPIC: ${event.post_topic}` : "",
    `COMMENT: ${event.content}`,
    "Return JSON:",
    JSON.stringify({
      task: "social_reply",
      reply: "your short reply",
      tone: "friendly",
      language: "english",
      contains_claim: false,
      confidence: 0.9,
    }),
  ].join("\n\n");

  return { system, user };
}

export function buildOpportunityAnalysisPrompt(
  ctx: TaskContext,
  opportunity: { content: string; channel: string; actor_name?: string | null; parent_content?: string | null }
): PromptTemplate {
  const system = [
    "You analyze a potential business opportunity signal for a business.",
    "Determine whether this signal is RELEVANT to the business context provided.",
    "relevance_score: 0-100 how well this person/content matches the business services, audience and industries. Generic compliments or unrelated entertainment are 0-20. Explicit needs matching services are 80-100.",
    "intent: pick EXACTLY ONE of the allowed enum values. Weak keyword-only mentions are NOT intent - require actual meaning.",
    "lead_score: 0-100 combined evidence-based lead strength (relevance + intent + urgency).",
    "should_engage: true only when relevance_score >= 60 AND intent indicates real interest/need. Do not engage spam or irrelevant content.",
    "detected_requirement: the person's actual need in their own words, or null if none exists.",
    "evidence: quote the actual words that support your scores (source=conversation for social content).",
    "recommended_next_action: IGNORE for irrelevant/spam, ENGAGE_COMMENT for a useful public reply, CREATE_LEAD for clear buying/service intent, QUALIFY when more questions are needed, BOOK_MEETING only for explicit meeting intent, HANDOFF_WHATSAPP when a qualified lead should move to WhatsApp, ESCALATE_TO_HUMAN for sensitive situations.",
    "Never fabricate intent, budget or urgency. Never invent requirements the words do not show.",
    "Respond ONLY with a single valid JSON object matching the requested schema. No markdown. Booleans must be JSON booleans. Scores are integers 0-100. Confidence is 0-1.",
  ].join("\n");

  const user = [
    buildBusinessBlock(ctx.business),
    `CHANNEL: ${opportunity.channel}`,
    `AUTHOR: ${opportunity.actor_name ?? "unknown"}`,
    opportunity.parent_content ? `PARENT CONTENT: ${opportunity.parent_content.slice(0, 800)}` : "",
    `SIGNAL CONTENT: ${opportunity.content}`,
    "Return JSON:",
    JSON.stringify({
      task: "opportunity_analysis",
      relevance_score: 70,
      intent: "SERVICE_INTEREST",
      intent_score: 70,
      urgency_score: 50,
      lead_score: 70,
      confidence: 0.9,
      detected_requirement: "string or null",
      evidence: [{ source: "conversation", signal: "explicit_need", quote: "their words" }],
      should_engage: true,
      recommended_next_action: "CREATE_LEAD",
      reason: "short explanation",
    }),
  ].join("\n\n");

  return { system, user };
}

export function buildDiscoveryAnalysisPrompt(
  ctx: TaskContext,
  discovery: { content: string; platform: string; author_name?: string | null; parent_content?: string | null; content_type?: string | null }
): PromptTemplate {
  const system = [
    "You analyze a potential lead discovery signal for a business.",
    "Your job is to determine whether this content/person is RELEVANT to the business and represents a genuine business opportunity.",
    "",
    "=== STRONG SIGNALS (score 60-100) ===",
    "- Explicit requirement: 'I need a website', 'looking for social media management', 'we need automation'",
    "- Pricing inquiry: 'how much does it cost?', 'what are your rates?', 'budget for this project'",
    "- Vendor/agency search: 'looking for an agency', 'who can build this?', 'recommend a developer'",
    "- Business growth problem: 'our leads are dropping', 'we need more customers', 'marketing isn\\'t working'",
    "- Urgency/timeline: 'need this done by next month', 'ASAP', 'urgent requirement'",
    "- Actively comparing: 'which is better', 'comparing options', 'shortlisting agencies'",
    "- Direct fit with business services (website, AI, social media, automation, CRM, lead generation)",
    "",
    "=== WEAK SIGNALS (score 0-20, do NOT trigger engagement) ===",
    "- Generic compliments: 'nice', 'great', 'awesome', 'love it', '🔥', '👏', 'amazing post'",
    "- Generic greetings: 'hello', 'hi', 'hey', 'good morning'",
    "- Social engagement only: likes, follows, shares without any content",
    "- Vague business keywords without context: 'marketing', 'digital', 'growth' used casually",
    "- Entertainment/memes/unrelated content",
    "- Self-promotion: someone promoting their own services",
    "- Spam/bot patterns: repeated messages, links-only, template messages",
    "",
    "=== SCORING RULES ===",
    "relevance_score: 0-100 how well this person/content matches the business services, audience and industries.",
    "intent_score: 0-100 how strong is the buying/interest signal. Generic comments = 0-10. Explicit need = 70-100.",
    "urgency_score: 0-100 how time-sensitive is the need. No timeline = 0-20. Explicit deadline = 70-100.",
    "lead_score: computed from above. Only score >= 40 should be considered a potential lead.",
    "confidence: 0-1 how confident you are in your analysis.",
    "",
    "intent: pick EXACTLY ONE: SERVICE_INTEREST, PRICING_INQUIRY, VENDOR_SEARCH, PROBLEM_STATEMENT, COMPARISON, GENERAL_INQUIRY, SOCIAL_ENGAGEMENT, SPAM, IRRELEVANT",
    "signals: list specific signals detected (EXPLICIT_REQUIREMENT, BUYING_INTENT, VENDOR_SEARCH, PRICING_INQUIRY, URGENCY, BUSINESS_PROBLEM, etc.)",
    "detected_requirement: the person's actual need IN THEIR OWN WORDS, or null if none.",
    "business_context_match: explain how this matches the business's services/audience/ICP, or null.",
    "evidence: quote the EXACT words from the content that support your scores. source=conversation for social content.",
    "should_engage: true ONLY when relevance_score >= 60 AND intent indicates real interest/need.",
    "",
    "CRITICAL: No evidence = no lead. Never fabricate intent, budget, urgency, or requirements.",
    "If someone just said 'nice post' or 'hello', that is NOT a lead. Score it 0-10 and set should_engage=false.",
    "Respond ONLY with a single valid JSON object. No markdown. Booleans must be JSON booleans. Scores are integers 0-100. Confidence is 0-1.",
  ].join("\n");

  const user = [
    buildBusinessBlock(ctx.business),
    `PLATFORM: ${discovery.platform}`,
    `CONTENT TYPE: ${discovery.content_type ?? "unknown"}`,
    `AUTHOR: ${discovery.author_name ?? "unknown"}`,
    discovery.parent_content ? `PARENT CONTENT (what they're responding to): ${discovery.parent_content.slice(0, 800)}` : "",
    `SIGNAL CONTENT: ${discovery.content}`,
    "Return JSON:",
    JSON.stringify({
      task: "discovery_analysis",
      relevance_score: 70,
      intent: "SERVICE_INTEREST",
      intent_score: 70,
      urgency_score: 50,
      lead_score: 70,
      confidence: 0.9,
      detected_requirement: "string or null",
      business_context_match: "string or null",
      signals: ["EXPLICIT_REQUIREMENT"],
      evidence: [{ source: "conversation", signal: "explicit_need", quote: "their exact words" }],
      should_engage: true,
      recommended_next_action: "CREATE_LEAD",
      reason: "short explanation",
    }),
  ].join("\n\n");

  return { system, user };
}

export function buildNurtureReplyPrompt(
  ctx: TaskContext,
  conversation: {
    prospect_name: string | null;
    detected_requirement: string | null;
    conversation_history: Array<{ role: string; content: string }>;
    platform: string;
    lead_memory: Record<string, any> | null;
    previous_questions: string[];
  }
): PromptTemplate {
  const system = [
    "You are generating a natural conversation reply for a business.",
    "Your goal is to have a genuine, useful conversation — NOT dump a sales pitch.",
    "",
    "=== CONVERSATION RULES (MANDATORY) ===",
    "- Understand exactly what the person said before replying.",
    "- Answer ONLY what is necessary. Don't over-explain.",
    "- Ask at most ONE useful follow-up question when needed.",
    "- NEVER ask multiple questions in a single message.",
    "- NEVER force a meeting. NEVER create fake urgency.",
    "- NEVER use: 'Certainly!', 'Absolutely!', 'I'd be happy to!', 'We offer a wide range of', 'Let me help you with that'.",
    "- NEVER mention: 'lead', 'qualification', 'scoring', 'AI', 'pipeline', 'CRM', 'funnel', or any internal system terms.",
    "- NEVER pretend to be a human. You represent the business, not a fake person.",
    "- If the prospect writes in Hindi/Hinglish, reply in the SAME language naturally.",
    "- If the prospect writes in English, reply in English.",
    "- Max 2-4 short sentences. Sound like a real person texting, not a corporate chatbot.",
    "- Do NOT repeat questions already asked in conversation history or previous_questions.",
    "- If the person is clearly not interested, politely acknowledge and suggest closing. Set prospect_disinterested=true.",
    "- If the person shows genuine interest, continue qualification naturally.",
    "- If the person wants a meeting, set meeting_intent_detected=true and move toward handoff.",
    "- Stop when the person says: 'not interested', 'stop', 'don't message me', 'nahi chahiye', 'no thanks'.",
    "- Respect opt-out IMMEDIATELY. Never argue with a rejection.",
    "- Keep conversations SHORT unless the prospect is actively engaged and asking questions.",
    "",
    "IMPORTANT: Review previous_questions and conversation history to avoid repeating anything.",
    "Respond ONLY with a single valid JSON object. No markdown.",
  ].join("\n");

  const historyBlock = conversation.conversation_history.length > 0
    ? `CONVERSATION HISTORY:\n${conversation.conversation_history
        .slice(-10)
        .map((m) => `${m.role === "agent" ? "AGENT" : "PROSPECT"}: ${m.content}`)
        .join("\n")}`
    : "CONVERSATION HISTORY: This is the first message.";

  const memoryBlock = conversation.lead_memory
    ? `LEAD MEMORY:\n${JSON.stringify(conversation.lead_memory)}`
    : "LEAD MEMORY: none";

  const prevQuestionsBlock = conversation.previous_questions.length > 0
    ? `ALREADY ASKED QUESTIONS (DO NOT repeat these):\n${conversation.previous_questions.join("\n")}`
    : "";

  const user = [
    buildBusinessBlock(ctx.business),
    `PLATFORM: ${conversation.platform}`,
    `PROSPECT: ${conversation.prospect_name ?? "unknown"}`,
    conversation.detected_requirement
      ? `DETECTED REQUIREMENT: ${conversation.detected_requirement}`
      : "",
    historyBlock,
    memoryBlock,
    prevQuestionsBlock,
    "Return JSON:",
    JSON.stringify({
      task: "nurture_reply",
      reply: "your natural reply",
      language: "english",
      tone: "friendly",
      meeting_intent_detected: false,
      interest_confirmed: false,
      prospect_disinterested: false,
      needs_clarification: false,
      ask_one_question: "string or null",
      used_business_fact: "string or null",
      escalation_required: false,
      conversation_stage_suggestion: "CONVERSATION",
      close_reason: null,
      confidence: 0.9,
    }),
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, user };
}
