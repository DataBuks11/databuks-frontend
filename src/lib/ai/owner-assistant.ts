import { getActiveProvider } from "./providers";

/**
 * OWNER WHATSAPP ASSISTANT / COMMAND CENTER
 *
 * The business owner chats with their OWN WhatsApp number (self-chat) or a
 * designated owner device. Every command is answered from REAL Supabase data
 * — counts, lists, statuses, approvals — never fabricated.
 *
 * Supported (natural language, any language):
 *   - kitni leads nikali / leads list / relevant leads
 *   - business status kaisa hai
 *   - kitni meetings booked
 *   - kitni posts daali / content status
 *   - pending approvals (lead handoffs + content)
 *   - approve 1 / reject 2
 */

export interface OwnerCommandInput {
  userId: string;
  text: string;
  /** Where replies are sent — the owner's own chat JID */
  replyJid: string;
}

export interface OwnerAssistantDeps {
  sendFn?: (input: { userId: string; jid: string; message: string }) => Promise<void>;
}

type OwnerIntent =
  | "HELP"
  | "LEADS_COUNT"
  | "LEADS_LIST"
  | "RELEVANT_LEADS"
  | "BUSINESS_STATUS"
  | "MEETINGS"
  | "POSTS_STATUS"
  | "PENDING_APPROVALS"
  | "APPROVE"
  | "REJECT"
  | "OUTREACH_NOW"
  | "CHAT";

interface OwnerSnapshot {
  leadsTotal: number;
  leadsNew: number;
  leadsQualifiedStage: number;
  discoveredQualified: number;
  discoveredNeedsReview: number;
  meetingsScheduled: number;
  meetingsUpcoming: number;
  postsPublishedTotal: number;
  postsPublishedToday: number;
  postsDraft: number;
  postsScheduled: number;
  storiesPublished: number;
}

/** Per-user cache of the last numbered approval list shown, so
 *  "approve 2" resolves against what the owner actually saw. */
const pendingApprovalCache = new Map<string, PendingItem[]>();

interface PendingItem {
  kind: "handoff" | "content";
  id: string;
  label: string;
}

// ─── Snapshot ───────────────────────────────────────────────────────────────

async function countRows(supabase: any, table: string, filters: Record<string, any> = {}): Promise<number> {
  try {
    let query = supabase.from(table).select("id", { count: "exact", head: true });
    for (const [col, val] of Object.entries(filters)) {
      if (val === null) continue;
      if (Array.isArray(val)) query = query.in(col, val);
      else query = query.eq(col, val);
    }
    const { count, error } = await query;
    return error ? 0 : count ?? 0;
  } catch {
    return 0;
  }
}

function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function gatherOwnerSnapshot(supabase: any, userId: string): Promise<OwnerSnapshot> {
  const today = startOfTodayISO();
  const [
    leadsTotal,
    leadsNew,
    leadsQualifiedStage,
    discoveredQualified,
    meetingsScheduled,
    meetingsUpcoming,
    postsPublishedTotal,
    postsPublishedToday,
    postsDraft,
    postsScheduled,
    storiesPublished,
  ] = await Promise.all([
    countRows(supabase, "leads", { user_id: userId }),
    countRows(supabase, "leads", { user_id: userId, status: "new" }),
    countRows(supabase, "leads", { user_id: userId, funnel_stage: "QUALIFIED" }),
    (async () => {
      try {
        // quality gate lives in evidence JSONB — score threshold as proxy
        const { count } = await supabase
          .from("discovered_leads")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gte("lead_score", 60);
        return count ?? 0;
      } catch {
        return 0;
      }
    })(),
    countRows(supabase, "meetings", { user_id: userId, status: ["suggested", "scheduled", "confirmed"] }),
    (async () => {
      try {
        const { count } = await supabase
          .from("meetings")
          .select("id", { count: "exact", head: true })
          .in("status", ["scheduled", "confirmed"])
          .gte("scheduled_at", new Date().toISOString());
        return count ?? 0;
      } catch {
        return 0;
      }
    })(),
    countRows(supabase, "content", { user_id: userId, status: "published" }),
    (async () => {
      try {
        const { count } = await supabase
          .from("content")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "published")
          .gte("updated_at", today);
        return count ?? 0;
      } catch {
        return 0;
      }
    })(),
    countRows(supabase, "content", { user_id: userId, status: "draft" }),
    countRows(supabase, "content", { user_id: userId, status: "scheduled" }),
    countRows(supabase, "content", { user_id: userId, status: "published", type: ["story"] }),
  ]);

  return {
    leadsTotal,
    leadsNew,
    leadsQualifiedStage,
    discoveredQualified,
    discoveredNeedsReview: 0,
    meetingsScheduled,
    meetingsUpcoming,
    postsPublishedTotal,
    postsPublishedToday,
    postsDraft,
    postsScheduled,
    storiesPublished,
  };
}

// ─── Data fetchers per intent ───────────────────────────────────────────────

async function fetchTopLeads(supabase: any, userId: string, limit = 5): Promise<{ name: string; score: number; stage: string }[]> {
  const { data } = await supabase
    .from("leads")
    .select("name, lead_score, funnel_stage")
    .eq("user_id", userId)
    .order("lead_score", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: any) => ({ name: r.name ?? "?", score: r.lead_score ?? 0, stage: r.funnel_stage ?? "" }));
}

async function fetchRelevantDiscovered(supabase: any, userId: string, limit = 5): Promise<{ name: string; score: number; gate: string }[]> {
  const { data } = await supabase
    .from("discovered_leads")
    .select("author_name, lead_score, evidence")
    .eq("user_id", userId)
    .gte("lead_score", 60)
    .order("lead_score", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: any) => ({
    name: r.author_name ?? "?",
    score: r.lead_score ?? 0,
    gate: r.evidence?.quality_gate ?? "",
  }));
}

async function fetchUpcomingMeetings(supabase: any, userId: string, limit = 5): Promise<{ lead: string; at: string | null; status: string }[]> {
  const { data } = await supabase
    .from("meetings")
    .select("scheduled_at, status, leads(name)")
    .eq("user_id", userId)
    .order("scheduled_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: any) => ({
    lead: r.leads?.name ?? "Lead",
    at: r.scheduled_at,
    status: r.status ?? "",
  }));
}

async function fetchPendingApprovals(supabase: any, userId: string): Promise<PendingItem[]> {
  const items: PendingItem[] = [];
  const { data: handoffs } = await supabase
    .from("handoff_requests")
    .select("id, lead_id, created_at")
    .eq("user_id", userId)
    .ilike("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);
  for (const h of handoffs ?? []) {
    items.push({ kind: "handoff", id: h.id, label: `AI handoff request (${String(h.id).slice(0, 8)})` });
  }
  const { data: drafts } = await supabase
    .from("content")
    .select("id, title, platform")
    .eq("user_id", userId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(5);
  for (const c of drafts ?? []) {
    items.push({ kind: "content", id: c.id, label: `${c.title ?? "Untitled"} (${c.platform ?? "?"} draft)` });
  }
  return items;
}

// ─── Intent detection (deterministic first, LLM fallback) ───────────────────

const KEYWORD_INTENTS: { pattern: RegExp; intent: OwnerIntent }[] = [
  { pattern: /\b(approve|ok kar|confirm kar)\b.*\d|\bapprove\b\s*\d+/i, intent: "APPROVE" },
  { pattern: /\b(reject|cancel|mat karo|nahi karna)\b\s*\d+|\breject\b/i, intent: "REJECT" },
  { pattern: /\b(pending|approval|approvals)\b/i, intent: "PENDING_APPROVALS" },
  { pattern: /\b(meeting|meeting[s]? booked|call scheduled)\b/i, intent: "MEETINGS" },
  { pattern: /\b(relevant|best|top).*(lead)|\blead.*(relevant|best|top)\b/i, intent: "RELEVANT_LEADS" },
  { pattern: /\b(leads? list|lead list|kaun[si]e? leads|konsi nikali|show leads|leads batao)\b/i, intent: "LEADS_LIST" },
  { pattern: /\b(kitni leads?|leads? count|how many leads)\b/i, intent: "LEADS_COUNT" },
  { pattern: /\b(post|posts|story|stories|content|instagram)\b/i, intent: "POSTS_STATUS" },
  { pattern: /\b(status|business kaisa|kaisa hai|kya haal|summary|overview|report|hisab|how (is|are) (things|business))\b/i, intent: "BUSINESS_STATUS" },
  { pattern: /\b(help|kya kar sakte|commands?)\b/i, intent: "HELP" },
  { pattern: /\b(outreach|contact leads|message leads|start outreach|baat kar unhe|msg kar|leads se baat|run outreach|outreach chalao)\b/i, intent: "OUTREACH_NOW" },
];

/** Greetings/smalltalk skip the LLM entirely for instant replies. */
const GREETING_PATTERN =
  /^\s*(hi+|hello+|hey+|hlw+|hlo+|namaste|namaskar|salam|yo|sup|good\s*(morning|evening|afternoon|night)|kaise? ho|kya haal|hii+|heyy+)\b[\s!.,]*$/i;

function detectIntent(text: string): { intent: OwnerIntent; itemNumber: number | null } {
  // Fast path: pure greetings/smalltalk — instant snapshot reply, no LLM
  if (GREETING_PATTERN.test(text)) {
    return { intent: "CHAT", itemNumber: null };
  }
  for (const { pattern, intent } of KEYWORD_INTENTS) {
    if (pattern.test(text)) {
      const numMatch = text.match(/\b(\d{1,2})\b/);
      return { intent, itemNumber: numMatch ? parseInt(numMatch[1], 10) : null };
    }
  }
  return { intent: "CHAT", itemNumber: null };
}

async function llmIntent(text: string): Promise<OwnerIntent> {
  try {
    const provider = getActiveProvider();
    const out = await provider.completeJson({
      system:
        'You map a business owner\'s WhatsApp message to ONE command intent. Allowed: HELP, LEADS_COUNT, LEADS_LIST, RELEVANT_LEADS, BUSINESS_STATUS, MEETINGS, POSTS_STATUS, PENDING_APPROVALS, APPROVE, REJECT, CHAT. Approve/reject ONLY when they clearly confirm/deny an item. Respond {"intent":"..."} only.',
      user: text.slice(0, 300),
      temperature: 0,
      maxTokens: 200,
      reasoningEffort: "low",
    });
    const allowed: OwnerIntent[] = ["HELP", "LEADS_COUNT", "LEADS_LIST", "RELEVANT_LEADS", "BUSINESS_STATUS", "MEETINGS", "POSTS_STATUS", "PENDING_APPROVALS", "APPROVE", "REJECT", "CHAT"];
    const intent = String(out?.intent ?? "CHAT").toUpperCase() as OwnerIntent;
    return allowed.includes(intent) ? intent : "CHAT";
  } catch {
    return "CHAT";
  }
}

// ─── Language: English default, adapts to the user's message ────────────────

type Lang = "en" | "hinglish";

const HINGLISH_MARKERS =
  /\b(kya|hai|hain|nahi|nahin|kar|karo|karna|karke|kitni|kitne|kitna|bata|batao|bhej|bhejo|kaisa|kaisi|kaise|mera|meri|mere|mujhe|apna|apni|acha|accha|thik|theek|bolo|dekh|kaun|kaunsi|pooch|puch|chahiye|mila|mila|hua|ho|gaya|bhai|yaar|abhi|jaldi|nikali|nikale|dikhao|dikha)\b/i;

function detectLang(text: string): Lang {
  if (/[\u0900-\u097F]/.test(text)) return "hinglish"; // Devanagari
  return HINGLISH_MARKERS.test(text) ? "hinglish" : "en";
}

function pick(lang: Lang, en: string, hi: string): string {
  return lang === "hinglish" ? hi : en;
}

// ─── Main handler ───────────────────────────────────────────────────────────

export async function handleOwnerWhatsAppCommand(
  supabase: any,
  input: OwnerCommandInput,
  deps: OwnerAssistantDeps = {}
): Promise<string> {
  const { userId, text } = input;
  const lang = detectLang(text);
  const isGreeting = GREETING_PATTERN.test(text);
  let { intent, itemNumber } = detectIntent(text);

  // Greetings skip the LLM entirely — instant snapshot reply.
  if (intent === "CHAT" && !isGreeting) intent = await llmIntent(text);

  // ─── Greeting fast-path: no LLM, no fallback delay ───
  // When the owner just says "hi" / "hey" / etc., the snapshot is a much
  // better reply than "yeah, what's up?" because it actually carries useful
  // data about leads / meetings / posts. Static, fast (<500ms).
  if (isGreeting && intent === "CHAT") {
    const snapshot = await gatherOwnerSnapshot(supabase, userId);
    return pick(lang,
      `hey 👋 here's where things stand right now:\n` +
        `• Leads: ${snapshot.leadsTotal} total, ${snapshot.leadsNew} new, ${snapshot.leadsQualifiedStage} qualified\n` +
        `• Meetings: ${snapshot.meetingsScheduled} booked, ${snapshot.meetingsUpcoming} upcoming\n` +
        `• Content: ${snapshot.postsPublishedToday} posted today, ${snapshot.postsDraft} drafts, ${snapshot.postsScheduled} scheduled\n` +
        `Anything specific you want to dig into? "help" lists all commands.`,
      `hey 👋 abhi ye chal raha hai:\n` +
        `• Leads: ${snapshot.leadsTotal} total, ${snapshot.leadsNew} nayi, ${snapshot.leadsQualifiedStage} qualified\n` +
        `• Meetings: ${snapshot.meetingsScheduled} booked, ${snapshot.meetingsUpcoming} upcoming\n` +
        `• Content: ${snapshot.postsPublishedToday} aaj post hue, ${snapshot.postsDraft} drafts, ${snapshot.postsScheduled} scheduled\n` +
        `Kuch specific jaanna hai? "help" me saare commands hain.`
    );
  }

  const snapshot = await gatherOwnerSnapshot(supabase, userId);
  let reply: string;

  switch (intent) {
    case "HELP":
      reply = pick(lang,
        [
          "I'm your business assistant. Ask me:",
          "• how many leads we got",
          "• leads list / relevant leads",
          "• business status",
          "• meetings booked",
          "• posts/stories status",
          "• approvals (then: approve 1 / reject 2)",
          "• run outreach (start multi-channel outreach to top leads)",
        ].join("\n"),
        [
          "Main tera business assistant hoon. Ye sab pooch sakta hai:",
          "• kitni leads nikali",
          "• leads list / relevant leads",
          "• business status",
          "• meetings booked",
          "• posts/stories status",
          "• approvals (phir: approve 1 / reject 2)",
          "• outreach chalao (top leads ko multi-channel msg bhejo)",
        ].join("\n")
      );
      break;

    case "LEADS_COUNT":
      reply = pick(lang,
        `${snapshot.leadsTotal} leads so far — ${snapshot.leadsNew} new, ${snapshot.leadsQualifiedStage} qualified.${snapshot.discoveredQualified ? ` Discovery found ${snapshot.discoveredQualified} relevant (60+).` : ""}`,
        `Abhi tak ${snapshot.leadsTotal} leads hain — ${snapshot.leadsNew} nayi, ${snapshot.leadsQualifiedStage} qualified stage pe.${snapshot.discoveredQualified ? ` Discovery se ${snapshot.discoveredQualified} relevant (60+) mili hain.` : ""}`
      );
      break;

    case "LEADS_LIST": {
      const rows = await fetchTopLeads(supabase, userId);
      reply = pick(lang, "Top leads", "Top leads") + "\n" + (rows.length === 0
        ? pick(lang, "Nothing found yet.", "Abhi kuch nahi mila.")
        : rows.map((r, i) => `${i + 1}. ${r.name} — ${r.score}pt · ${r.stage}`).join("\n"));
      break;
    }

    case "RELEVANT_LEADS": {
      const rows = await fetchRelevantDiscovered(supabase, userId);
      reply = pick(lang, "Relevant discovered leads", "Relevant discovered leads") + "\n" + (rows.length === 0
        ? pick(lang, "Nothing found yet.", "Abhi kuch nahi mila.")
        : rows.map((r, i) => `${i + 1}. ${r.name} — ${r.score}pt${r.gate ? ` · ${r.gate}` : ""}`).join("\n"));
      break;
    }

    case "BUSINESS_STATUS":
      reply = pick(lang,
        `Business snapshot:\nLeads: ${snapshot.leadsTotal} total, ${snapshot.leadsNew} new, ${snapshot.leadsQualifiedStage} qualified\nRelevant discovered: ${snapshot.discoveredQualified}\nMeetings: ${snapshot.meetingsScheduled} booked, ${snapshot.meetingsUpcoming} upcoming\nContent: ${snapshot.postsPublishedToday} posted today (${snapshot.postsPublishedTotal} total), ${snapshot.postsDraft} drafts, ${snapshot.postsScheduled} scheduled, ${snapshot.storiesPublished} stories`,
        `Business snapshot:\nLeads: ${snapshot.leadsTotal} total, ${snapshot.leadsNew} new, ${snapshot.leadsQualifiedStage} qualified\nRelevant discovered: ${snapshot.discoveredQualified}\nMeetings: ${snapshot.meetingsScheduled} booked, ${snapshot.meetingsUpcoming} upcoming\nContent: ${snapshot.postsPublishedToday} aaj post hue (${snapshot.postsPublishedTotal} total), ${snapshot.postsDraft} draft, ${snapshot.postsScheduled} scheduled, ${snapshot.storiesPublished} stories`
      );
      break;

    case "MEETINGS": {
      const rows = await fetchUpcomingMeetings(supabase, userId);
      reply = pick(lang,
        `Meetings: ${snapshot.meetingsScheduled} booked, ${snapshot.meetingsUpcoming} upcoming.`,
        `Meetings: ${snapshot.meetingsScheduled} booked, ${snapshot.meetingsUpcoming} upcoming.`
      ) + (rows.length ? `\n` + rows.map((r, i) => `${i + 1}. ${r.lead} — ${r.at ? new Date(r.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : r.status}`).join("\n") : "");
      break;
    }

    case "POSTS_STATUS":
      reply = pick(lang,
        `Content: ${snapshot.postsPublishedToday} posted today (${snapshot.postsPublishedTotal} total). ${snapshot.postsDraft} drafts, ${snapshot.postsScheduled} scheduled, ${snapshot.storiesPublished} stories published.`,
        `Content: aaj ${snapshot.postsPublishedToday} post gaya (total ${snapshot.postsPublishedTotal}). ${snapshot.postsDraft} draft, ${snapshot.postsScheduled} scheduled, ${snapshot.storiesPublished} stories published.`
      );
      break;

    case "PENDING_APPROVALS": {
      const items = await fetchPendingApprovals(supabase, userId);
      pendingApprovalCache.set(userId, items);
      reply =
        items.length === 0
          ? pick(lang, "No pending approvals right now.", "Koi pending approval nahi hai.")
          : [
              pick(lang, "Pending approvals:", "Pending approvals:"),
              ...items.map((it, i) => `${i + 1}. [${it.kind}] ${it.label}`),
              "",
              pick(lang, `Reply "approve 1" or "reject 2".`, `"approve 1" ya "reject 2" bolo.`),
            ].join("\n");
      break;
    }

    case "APPROVE":
    case "REJECT": {
      const items = pendingApprovalCache.get(userId) ?? [];
      if (items.length === 0) {
        reply = pick(lang,
          "Ask for pending approvals first, then approve/reject by number.",
          "Pehle pending approvals pooch, phir number bol ke approve/reject kar.");
        break;
      }
      if (!itemNumber || itemNumber < 1 || itemNumber > items.length) {
        reply = pick(lang,
          `Which item? Pick 1-${items.length}.`,
          `Kaunsa item? 1-${items.length} me se number bol.`);
        break;
      }
      const item = items[itemNumber - 1];
      if (item.kind === "handoff") {
        const status = intent === "APPROVE" ? "APPROVED" : "REJECTED";
        const { error } = await supabase
          .from("handoff_requests")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("id", item.id)
          .eq("user_id", userId);
        reply = error
          ? pick(lang, `Update failed: ${error.message}`, `Update fail hua: ${error.message}`)
          : pick(lang, `${intent === "APPROVE" ? "Approved" : "Rejected"} ✓ ${item.label}`, `${intent === "APPROVE" ? "Approved" : "Rejected"} ✓ ${item.label}`);
      } else {
        const { error } = await supabase
          .from("content")
          .update({ status: "scheduled", updated_at: new Date().toISOString() })
          .eq("id", item.id)
          .eq("user_id", userId);
        reply = error
          ? pick(lang, `Update failed: ${error.message}`, `Update fail hua: ${error.message}`)
          : pick(lang, `Post scheduled ✓ ${item.label}`, `Post scheduled ✓ ${item.label}`);
      }
      items.splice(itemNumber - 1, 1);
      pendingApprovalCache.set(userId, items);
      break;
    }

    case "OUTREACH_NOW": {
      // Trigger the multi-channel outreach orchestrator synchronously and
      // return a human-readable summary. The orchestrator is rate-limited
      // via the rule engine and 7-day cooldown per lead, so re-running is
      // safe. We wrap the whole batch in a 3-min overall ceiling.
      try {
        const { runMultiChannelOutreachForUser } = await import(
          "./outreach/multi-channel"
        );
        const timeoutMs = 180_000;
        const result = await Promise.race([
          runMultiChannelOutreachForUser(supabase, userId, { limit: 3 }),
          new Promise<{ processed: number; results: any[]; skipped: number; failed: number }>((_, reject) =>
            setTimeout(() => reject(new Error(`outreach took >${Math.round(timeoutMs / 1000)}s, giving up`)), timeoutMs)
          ),
        ]);
        if (result.processed === 0 && result.skipped > 0) {
          reply = pick(lang,
            "no contact info in the top leads (no phone/email/IG/FB/LinkedIn). discovery needs to capture those — try re-running discovery or check if the source is google_maps (no contact fields).",
            "top leads me koi phone/email/IG/FB/LinkedIn nahi mila. discovery ko ye fields capture karne chahiye — re-run karo ya check karo source google_maps to nahi hai"
          );
        } else if (result.processed > 0) {
          const channelSummary = result.results
            .flatMap((r) => r.channels)
            .filter((c) => c.ok)
            .map((c) => c.channel)
            .join(", ");
          reply = pick(lang,
            `done. ${result.processed} leads contacted${channelSummary ? ` via ${channelSummary}` : ""}. ${result.failed} failed, ${result.skipped} skipped.`,
            `ho gaya. ${result.processed} leads se baat ki${channelSummary ? ` (${channelSummary})` : ""}. ${result.failed} fail, ${result.skipped} skip.`
          );
        } else {
          reply = pick(lang,
            `outreach run complete. ${result.failed} failed, ${result.skipped} skipped (no contact info).`,
            `outreach chala. ${result.failed} fail, ${result.skipped} skip (no contact info).`
          );
        }
      } catch (err: any) {
        reply = pick(lang,
          `outreach failed: ${err?.message ?? "unknown"}`,
          `outreach fail: ${err?.message ?? "unknown"}`
        );
      }
      break;
    }

    case "CHAT":
    default: {
      // Use LLM for genuinely conversational / free-form questions,
      // grounding the answer in the real business snapshot so nothing
      // is fabricated. Falls back to the static snapshot if LLM fails.
      try {
        const provider = getActiveProvider();
        const ctx = [
          `Business snapshot (real data):`,
          `- Leads: ${snapshot.leadsTotal} total, ${snapshot.leadsNew} new, ${snapshot.leadsQualifiedStage} qualified`,
          `- Relevant discovered: ${snapshot.discoveredQualified}`,
          `- Meetings: ${snapshot.meetingsScheduled} booked, ${snapshot.meetingsUpcoming} upcoming`,
          `- Content: ${snapshot.postsPublishedTotal} posts total, ${snapshot.postsPublishedToday} today, ${snapshot.postsDraft} drafts`,
        ].join("\n");
          const out = await provider.completeJson({
            system: [
              "You are the business owner's personal WhatsApp assistant.",
              "You can answer in two modes:",
              "  1) BUSINESS mode: data-aware replies about leads, meetings, posts, content",
              "  2) PERSONAL mode: casual chat, general questions, friendly banter",
              "Match the user's tone. If they ask business questions, use the data below. Otherwise, just chat normally.",
              "",
              "CRITICAL ANTI-HALLUCINATION RULES (apply to BOTH modes):",
              "- NEVER invent IDs, passwords, account numbers, OTPs, employee names, client names, ticket numbers, or any concrete identifier",
              "- If asked for credentials, account info, or anything you don't actually have: say 'share your email, I'll send it' or 'check your email'",
              "- If asked for company registration, GSTIN, license, etc.: say 'I don't have that handy, share your email'",
              "- When user asks 'what is your business': answer with the actual name (DataBuks) and a short description, don't invent fake data",
              "- When user asks 'who are you': say 'your business assistant' — don't fake a name/email/phone",
              "",
              "HUMAN TEXTING RULES:",
              "- Write like a real person casually texting — short sentences, natural flow",
              "- Use lowercase naturally, don't capitalize everything perfectly",
              "- NO bullet points, NO numbered lists, NO markdown formatting",
              "- NO corporate language like 'I can assist you with', 'Here's what I found', 'Let me help you'",
              "- Use natural filler words sometimes — 'hmm', 'well', 'honestly', 'btw'",
              "- Keep it SHORT — 1-3 sentences max, like a real text message",
              "- If they ask in Hinglish, reply in Hinglish like a friend would",
              "- NEVER use emojis excessively — one or none is fine",
              "- Don't repeat the question back to them",
              "",
              "If they ask about business data, use ONLY these real numbers:",
              ctx,
              "",
              "If they ask something outside your knowledge, just say you're not sure and suggest checking it out.",
              "Available commands they can ask: business status, leads count, leads list, relevant leads, meetings, posts status, pending approvals, run outreach, post banao (generate post drafts).",
              "",
              `Respond as JSON: {"reply": "your casual human-like text message here"}`,
            ].join("\n"),
            user: text,
            temperature: 0.6,
          maxTokens: 500,
        });
        reply = String(out?.reply ?? "").trim();
        if (!reply) throw new Error("empty reply");
      } catch {
        // Fallback: static snapshot
        reply = pick(lang,
          `Snapshot: ${snapshot.leadsTotal} leads (${snapshot.leadsNew} new), ${snapshot.discoveredQualified} relevant discovered, ${snapshot.meetingsScheduled} meetings, ${snapshot.postsPublishedTotal} posts published. Ask something specific — "help" lists all commands.`,
          `Snapshot: ${snapshot.leadsTotal} leads (${snapshot.leadsNew} new), ${snapshot.discoveredQualified} relevant discovered, ${snapshot.meetingsScheduled} meetings, ${snapshot.postsPublishedTotal} posts published. Kuch specific pooch — "help" me saare commands hain.`);
      }
      break;
    }
  }

  const sendFn = deps.sendFn ?? defaultSend;
  try {
    await sendFn({ userId, jid: input.replyJid, message: reply });
  } catch (err: any) {
    console.error(`[owner-assistant] send failed: ${err?.message}`);
  }
  return reply;
}

function defaultSend(input: { userId: string; jid: string; message: string }): Promise<void> {
  const baseUrl = process.env.BAILEYS_SERVER_URL;
  if (!baseUrl) return Promise.reject(new Error("BAILEYS_SERVER_URL not configured"));
  return fetch(`${baseUrl.replace(/\/+$/, "")}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.BAILEYS_API_KEY || "dev-key" },
    body: JSON.stringify(input),
  }).then(async (res) => {
    if (!res.ok) throw new Error(`WhatsApp send failed (${res.status})`);
  });
}
