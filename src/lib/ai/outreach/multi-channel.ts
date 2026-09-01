import { getActiveProvider } from "../providers";
import { sendEmail } from "./email-adapter";

/**
 * MULTI-CHANNEL OUTREACH ORCHESTRATOR
 *
 * Picks discovered leads (lead-discovery cron, user-driven discovery,
 * find-leads in dashboard) and reaches out across ALL available channels:
 *   - WhatsApp  → Baileys (assistant number)
 *   - Instagram → Composio DM
 *   - Facebook  → Composio DM
 *   - LinkedIn  → Composio DM
 *   - Email     → Resend (with fallback no-op if not configured)
 *
 * The AI generates one opener per channel (platform tone: WhatsApp casual,
 * Instagram short, LinkedIn professional, Email subject + body). Each channel
 * is rate-limited and rule-gated; the lead is only contacted on channels
 * that the user actually has connected + where the lead exists.
 *
 * Replies flow back through the normal WhatsApp webhook (when the lead
 * replies on WhatsApp) or platform-specific webhooks (Composio handles
 * IG/FB/LinkedIn replies). The AI then continues the conversation
 * context-aware and books meetings when intent is clear.
 */

export interface MultiChannelCandidate {
  id: string;                  // discovered_leads.id
  user_id: string;
  author_name: string | null;
  author_handle: string | null;
  author_profile_url: string | null;
  source_platform: string;     // instagram | facebook | linkedin | twitter | newsletter | google_maps
  source_url: string | null;
  detected_requirement: string | null;
  business_context_match: string | null;
  lead_score: number;
  intent_score: number;
  relevance_score: number;
  evidence: any;               // JSONB blob from lead-discovery
  opportunity_id: string | null;
  lead_id: string | null;      // null if not promoted to leads table yet
  conversation_stage: string;  // DISCOVER | QUALIFY | CONVERSATION | etc.
  // Optional contact info that may be present after lead promotion
  phone: string | null;
  email: string | null;
  // Raw metadata from the discovery source (e.g. Google Maps place details)
  raw_metadata: {
    details_phone?: string | null;
    details_website?: string | null;
    place_id?: string | null;
    owner_hint?: string | null;
    [k: string]: any;
  } | null;
}

export interface ChannelSendResult {
  channel: "whatsapp" | "instagram" | "facebook" | "linkedin" | "email";
  ok: boolean;
  error?: string;
  skipped?: boolean;
  messageId?: string;
}

export interface MultiOutreachResult {
  leadId: string;              // discovered_leads.id
  authorName: string | null;
  userId: string;
  channels: ChannelSendResult[];
  anyOk: boolean;
}

interface BizContext {
  business_name: string;
  description: string;
  services: string[];
  tone: string;
}

async function fetchCandidateChannels(
  supabase: any,
  c: MultiChannelCandidate
): Promise<{
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  email: string | null;
}> {
  // The discovery orchestrator stores ACTUAL contact values under
  // evidence.contact_details (separate from the boolean flags under
  // evidence.why_this_lead.contacts_found). This function reads both.
  const cd = c.evidence?.contact_details ?? {};

  // 1. WhatsApp: from leads.phone (post-promotion) > evidence.contact_details.phone
  //    > raw_metadata.details_phone (from our backfill).
  let whatsapp: string | null = c.phone ?? null;
  if (!whatsapp && cd.phone) whatsapp = String(cd.phone);
  if (!whatsapp && c.raw_metadata?.details_phone) whatsapp = c.raw_metadata.details_phone as string;
  if (whatsapp) {
    const digits = String(whatsapp).replace(/\D/g, "");
    whatsapp = digits.length >= 10 ? digits : null;
  }
  // 2. Instagram
  let instagram: string | null = cd.instagram ?? null;
  if (!instagram && c.source_platform === "instagram") {
    instagram = c.author_handle ?? c.evidence?.instagram_handle ?? null;
  } else if (!instagram) {
    instagram = c.evidence?.instagram_handle ?? null;
  }
  // 3. Facebook
  let facebook: string | null = cd.facebook ?? null;
  if (!facebook && c.source_platform === "facebook") {
    facebook = c.author_profile_url ?? c.evidence?.facebook_handle ?? c.author_handle ?? null;
  } else if (!facebook) {
    facebook = c.evidence?.facebook_handle ?? c.author_profile_url ?? null;
  }
  // 4. LinkedIn
  let linkedin: string | null = cd.linkedin ?? null;
  if (!linkedin) {
    linkedin = c.evidence?.linkedin_handle ?? c.evidence?.linkedin_url ?? null;
  }
  // 5. Email
  let email: string | null = c.email ?? null;
  if (!email && cd.email) email = String(cd.email);
  if (!email) {
    const website: string | null = cd.website ?? c.evidence?.details_website ?? c.raw_metadata?.details_website ?? null;
    if (website) {
      const m = website.match(/[?&](?:email|to)=([\w.+-]+@[\w.-]+)/i);
      if (m) email = m[1];
    }
  }
  if (!email && c.lead_id) {
    const { data: lead } = await supabase
      .from("leads")
      .select("email")
      .eq("id", c.lead_id)
      .maybeSingle();
    email = lead?.email ?? null;
  }
  return { whatsapp, instagram, facebook, linkedin, email };
}

async function fetchBizContext(supabase: any, userId: string): Promise<BizContext | null> {
  try {
    const { data: row } = await supabase
      .from("business_context")
      .select("business_name, description, services, tone")
      .eq("user_id", userId)
      .maybeSingle();
    if (!row) return null;
    return {
      business_name: row.business_name ?? "",
      description: row.description ?? "",
      services: Array.isArray(row.services) ? row.services.map((s: any) => s?.name).filter(Boolean) : [],
      tone: row.tone ?? "casual",
    };
  } catch {
    return null;
  }
}

async function generateOpeners(
  c: MultiChannelCandidate,
  biz: BizContext | null,
  channels: { whatsapp: boolean; instagram: boolean; facebook: boolean; linkedin: boolean; email: boolean }
): Promise<{ whatsapp?: string; instagram?: string; facebook?: string; linkedin?: string; emailSubject?: string; emailBody?: string }> {
  const provider = getActiveProvider();
  const sys = [
    "You are a personal sales assistant writing first-touch outreach on behalf of the business owner.",
    "Use ONLY facts present in the business context below. Never invent pricing, clients, capabilities, or past work.",
    "If you don't know a fact, say so honestly or just ask one short clarifying question.",
    "Tone: casual, lowercase often, no corporate language, no emojis unless the original post had one.",
    "Each channel has its own length and style:",
    "  - WhatsApp: 1-2 short lines, max ~200 chars, ends with one question",
    "  - Instagram: even shorter, 1 line, max ~150 chars, no question mark spam",
    "  - Facebook: friendly, 1-2 short sentences",
    "  - LinkedIn: more professional, 1 short paragraph, max 400 chars",
    "  - Email: subject line + 2-3 short paragraphs, professional but human",
    "Personalize using the lead's name/handle and their actual detected requirement.",
    "Return JSON with the requested channel fields only.",
  ].join("\n");

  const bizBlock = biz ? [
    `Business: ${biz.business_name || "DataBuks"}`,
    `Description: ${biz.description || "we help businesses with digital growth"}`,
    `Services: ${biz.services.join(", ") || "websites, AI features, automations"}`,
  ].join("\n") : "Business: DataBuks — we build websites, MVPs, AI features and automations for founders.";

  const leadBlock = [
    `Lead name: ${c.author_name ?? c.author_handle ?? "there"}`,
    `Lead handle: ${c.author_handle ?? "(unknown)"}`,
    `Source: ${c.source_platform}`,
    `Original post: ${(c.source_url ?? "").slice(0, 120)}`,
    `Detected requirement: ${c.detected_requirement ?? "(unspecified)"}`,
    `Why it matches our business: ${c.business_context_match ?? ""}`,
  ].join("\n");

  const wants: string[] = [];
  if (channels.whatsapp) wants.push("whatsapp");
  if (channels.instagram) wants.push("instagram");
  if (channels.facebook) wants.push("facebook");
  if (channels.linkedin) wants.push("linkedin");
  if (channels.email) wants.push("emailSubject, emailBody");

  const out: any = {};
  try {
    const raw = await provider.completeJson({
      system: sys,
      user: [bizBlock, leadBlock, `Channels to generate: ${wants.join(", ")}`, "Return JSON only."].join("\n\n"),
      temperature: 0.7,
      maxTokens: 500,
      timeoutMs: 25_000,
    });
    if (channels.whatsapp && typeof raw.whatsapp === "string") out.whatsapp = raw.whatsapp.trim();
    if (channels.instagram && typeof raw.instagram === "string") out.instagram = raw.instagram.trim();
    if (channels.facebook && typeof raw.facebook === "string") out.facebook = raw.facebook.trim();
    if (channels.linkedin && typeof raw.linkedin === "string") out.linkedin = raw.linkedin.trim();
    if (channels.email) {
      if (typeof raw.emailSubject === "string") out.emailSubject = raw.emailSubject.trim();
      if (typeof raw.emailBody === "string") out.emailBody = raw.emailBody.trim();
    }
  } catch (err: any) {
    console.warn(`[outreach-orchestrator] LLM opener generation failed: ${err?.message}`);
  }

  // Fallback templates if LLM didn't return
  const name = c.author_name ?? c.author_handle ?? "there";
  const req = c.detected_requirement ?? "your business needs";
  if (channels.whatsapp && !out.whatsapp) out.whatsapp = `hey ${name}, saw your post on ${c.source_platform} about ${req}. we actually do exactly that at DataBuks. want to chat 5 min?`;
  if (channels.instagram && !out.instagram) out.instagram = `hey ${name}, saw your post about ${req} — we build this stuff. interested?`;
  if (channels.facebook && !out.facebook) out.facebook = `hey ${name}, came across your post on ${req}. DataBuks does this — would love to chat if useful`;
  if (channels.linkedin && !out.linkedin) out.linkedin = `Hi ${name}, your post about ${req} caught my attention. At DataBuks we work on exactly this — websites, MVPs, AI features and automations. Worth a quick conversation?`;
  if (channels.email) {
    if (!out.emailSubject) out.emailSubject = `quick thought re: ${req}`;
    if (!out.emailBody) out.emailBody = `hi ${name},\n\nsaw your post on ${c.source_platform} about ${req}. we help founders with exactly this at DataBuks (websites, MVPs, AI features, automations).\n\nworth a 10 min call this week?\n\nthanks`;
  }
  return out;
}

async function sendWhatsApp(
  userId: string,
  phone: string,
  message: string
): Promise<ChannelSendResult> {
  const baseUrl = process.env.BAILEYS_SERVER_URL;
  const apiKey = process.env.BAILEYS_API_KEY || "dev-key";
  if (!baseUrl) return { channel: "whatsapp", ok: false, error: "BAILEYS_SERVER_URL not set" };
  const jid = `${phone}@s.whatsapp.net`;
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ userId, jid, message }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { channel: "whatsapp", ok: false, error: `Baileys ${res.status}: ${t.slice(0, 120)}` };
    }
    return { channel: "whatsapp", ok: true };
  } catch (err: any) {
    return { channel: "whatsapp", ok: false, error: String(err?.message ?? err) };
  }
}

async function sendComposioDM(
  userId: string,
  platform: "instagram" | "facebook" | "linkedin",
  recipient: string,
  message: string
): Promise<ChannelSendResult> {
  // Try the same /send-message path as the social adapters do. The
  // adapter (Instagram/Facebook/LinkedIn) calls Composio via the
  // /api/ai/social/actions route. For multi-channel outreach we just need
  // any DM to fire; the action layer handles the rest.
  // We don't have a direct public API for "send DM to a handle" without
  // knowing the account_id, so we attempt via /api/ai/social/actions.
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const res = await fetch(`${baseUrl}/api/ai/social/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        provider: platform,
        action_type: "SEND_MESSAGE",
        account_id: recipient,
        targetId: recipient,
        content: message,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { channel: platform, ok: false, error: `actions ${res.status}: ${t.slice(0, 120)}` };
    }
    return { channel: platform, ok: true };
  } catch (err: any) {
    return { channel: platform, ok: false, error: String(err?.message ?? err) };
  }
}

/** Process a single discovered lead: figure out channels, send. */
export async function runMultiChannelOutreach(
  supabase: any,
  candidate: MultiChannelCandidate
): Promise<MultiOutreachResult> {
  // Rule: skip if lead_score is too low (not qualified)
  if (candidate.lead_score < 60) {
    return {
      leadId: candidate.id,
      authorName: candidate.author_name,
      userId: candidate.user_id,
      channels: [],
      anyOk: false,
    };
  }

  // Idempotency: skip if we've already outreached in the last 7 days
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: recentEvents } = await supabase
    .from("funnel_events")
    .select("id, created_at, metadata")
    .eq("user_id", candidate.user_id)
    .eq("event_type", "OUTREACH_SENT")
    .contains("metadata", { discovered_lead_id: candidate.id })
    .gte("created_at", weekAgo)
    .limit(1);
  if ((recentEvents ?? []).length > 0) {
    return {
      leadId: candidate.id,
      authorName: candidate.author_name,
      userId: candidate.user_id,
      channels: [],
      anyOk: false,
    };
  }

  const channelsAvail = await fetchCandidateChannels(supabase, candidate);
  const enabled = {
    whatsapp: !!channelsAvail.whatsapp,
    instagram: !!channelsAvail.instagram,
    facebook: !!channelsAvail.facebook,
    linkedin: !!channelsAvail.linkedin,
    email: !!channelsAvail.email,
  };
  if (!enabled.whatsapp && !enabled.instagram && !enabled.facebook && !enabled.linkedin && !enabled.email) {
    return {
      leadId: candidate.id,
      authorName: candidate.author_name,
      userId: candidate.user_id,
      channels: [],
      anyOk: false,
    };
  }

  const biz = await fetchBizContext(supabase, candidate.user_id);
  const openers = await generateOpeners(candidate, biz, enabled);

  const results: ChannelSendResult[] = [];
  const tasks: Promise<ChannelSendResult>[] = [];

  if (enabled.whatsapp && openers.whatsapp) {
    tasks.push(
      sendWhatsApp(candidate.user_id, channelsAvail.whatsapp!, openers.whatsapp).then(async (r) => {
        if (r.ok) {
          await recordOutreachEvent(supabase, candidate, "whatsapp");
        }
        return r;
      })
    );
  }
  if (enabled.instagram && openers.instagram) {
    tasks.push(
      sendComposioDM(candidate.user_id, "instagram", channelsAvail.instagram!, openers.instagram).then(async (r) => {
        if (r.ok) await recordOutreachEvent(supabase, candidate, "instagram");
        return r;
      })
    );
  }
  if (enabled.facebook && openers.facebook) {
    tasks.push(
      sendComposioDM(candidate.user_id, "facebook", channelsAvail.facebook!, openers.facebook).then(async (r) => {
        if (r.ok) await recordOutreachEvent(supabase, candidate, "facebook");
        return r;
      })
    );
  }
  if (enabled.linkedin && openers.linkedin) {
    tasks.push(
      sendComposioDM(candidate.user_id, "linkedin", channelsAvail.linkedin!, openers.linkedin).then(async (r) => {
        if (r.ok) await recordOutreachEvent(supabase, candidate, "linkedin");
        return r;
      })
    );
  }
  if (enabled.email && openers.emailBody) {
    tasks.push(
      (async () => {
        const r = await sendEmail({
          to: channelsAvail.email!,
          subject: openers.emailSubject ?? "quick thought",
          text: openers.emailBody!,
        });
        const result: ChannelSendResult = {
          channel: "email",
          ok: r.ok,
          messageId: r.messageId,
          error: r.error,
          skipped: r.skipped,
        };
        if (r.ok) await recordOutreachEvent(supabase, candidate, "email");
        return result;
      })()
    );
  }

  results.push(...(await Promise.all(tasks)));
  return {
    leadId: candidate.id,
    authorName: candidate.author_name,
    userId: candidate.user_id,
    channels: results,
    anyOk: results.some((r) => r.ok),
  };
}

async function recordOutreachEvent(
  supabase: any,
  candidate: MultiChannelCandidate,
  channel: string
) {
  try {
    await supabase.from("funnel_events").insert({
      user_id: candidate.user_id,
      event_type: "OUTREACH_SENT",
      from_stage: candidate.conversation_stage ?? "DISCOVER",
      to_stage: null,
      metadata: {
        discovered_lead_id: candidate.id,
        lead_id: candidate.lead_id,
        channel,
        score: candidate.lead_score,
      },
    });
    // Update discovered_leads stage to NURTURE if was DISCOVER
    if (candidate.conversation_stage === "DISCOVER") {
      await supabase
        .from("discovered_leads")
        .update({
          conversation_stage: "NURTURE",
          last_message_at: new Date().toISOString(),
          total_messages: 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", candidate.id);
    }
  } catch (err: any) {
    console.warn(`[outreach-orchestrator] failed to record event: ${err?.message}`);
  }
}

/** Fetch top discovered leads for the user and run multi-channel outreach. */
export async function runMultiChannelOutreachForUser(
  supabase: any,
  userId: string,
  opts: { limit?: number; minScore?: number } = {}
): Promise<{ processed: number; results: MultiOutreachResult[]; skipped: number; failed: number }> {
  const limit = opts.limit ?? 5;
  const minScore = opts.minScore ?? 60;

  const { data: candidates } = await supabase
    .from("discovered_leads")
    .select("id, user_id, author_name, author_handle, author_profile_url, source_platform, source_url, detected_requirement, business_context_match, lead_score, intent_score, relevance_score, evidence, conversation_stage, opportunity_id, lead_id, raw_metadata")
    .eq("user_id", userId)
    .in("conversation_stage", ["DISCOVER", "QUALIFY"])
    .gte("lead_score", minScore)
    .order("lead_score", { ascending: false })
    .limit(limit * 2);

  const results: MultiOutreachResult[] = [];
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const c of (candidates ?? []).slice(0, limit)) {
    const r = await runMultiChannelOutreach(supabase, c as MultiChannelCandidate);
    results.push(r);
    if (r.channels.length === 0) {
      skipped += 1;
    } else if (r.anyOk) {
      processed += 1;
    } else {
      failed += 1;
    }
  }
  return { processed, results, skipped, failed };
}
