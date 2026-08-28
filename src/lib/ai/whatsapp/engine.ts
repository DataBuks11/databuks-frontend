import type { SupabaseClient } from "@supabase/supabase-js";
import { runAiTask } from "../orchestrator";
import { transitionLead, recordFunnelEvent } from "../funnel/service";
import { evaluateRules, type RuleContext } from "../rules";
import { bookMeeting } from "../meeting/engine";
import { logAiDecision } from "../audit/log";
import { buildWhatsAppReplyContext } from "../context/whatsapp-context";
import { parseScheduleFromText } from "./schedule";
import { idempotencyKey } from "../utils/idempotency";

export interface WhatsAppInboundMessage {
  userId: string;
  remoteJid: string;
  messageId: string;
  text: string;
  timestamp?: string;
  pushName?: string;
  /** Optional media URL for image/video/document attachments */
  mediaUrl?: string;
  /** Media kind — "image" | "video" | "audio" | "document" | "sticker" */
  mediaType?: string;
}

export interface ProcessWhatsAppOptions {
  sendReply?: boolean;
  sendFn?: (input: { userId: string; jid: string; message: string }) => Promise<void>;
  presenceFn?: (input: { userId: string; jid: string; presence: string }) => Promise<void>;
}

export interface ProcessWhatsAppResult {
  processed: boolean;
  skippedReason?: string;
  leadId?: string;
  conversationId?: string;
  replySent: boolean;
  replyText?: string | null;
  decision?: {
    allowed: boolean;
    ruleId?: string;
    reason: string;
  };
  meetingIntentDetected?: boolean;
  meetingBooked?: boolean;
  meetingId?: string | null;
  latencyMs?: Record<string, number>;
}

export interface BackgroundIntelligenceInput {
  userId: string;
  leadId: string;
  conversationId: string;
  messageId: string;
  text: string;
  meetingSignal: boolean;
}

export function normalizeWhatsAppPhone(remoteJid: string): string | null {
  // Strip the @s.whatsapp.net or @c.us suffix
  const raw = remoteJid.replace(/@.*$/, "");
  const digits = raw.replace(/\D/g, "");
  const cleaned = digits.replace(/^0+/, "");
  if (cleaned.length < 8) return null;
  // Real international phone numbers are max 13 digits (country code + number)
  // E.g. +91 99999 99999 = 12 digits, +1 555 123 4567 = 11 digits
  // Anything 14+ digits is a WhatsApp internal/business ID
  if (cleaned.length <= 13) {
    return `+${cleaned}`;
  }
  // Internal WhatsApp IDs — store raw digits
  return cleaned;
}

export function isGroupJid(remoteJid: string): boolean {
  return /@g\.us$/i.test(remoteJid);
}

async function defaultSendReply(input: { userId: string; jid: string; message: string }): Promise<void> {
  const baseUrl = process.env.BAILEYS_SERVER_URL;
  const apiKey = process.env.BAILEYS_API_KEY;
  if (!baseUrl) {
    throw new Error("BAILEYS_SERVER_URL is not configured");
  }
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey || "dev-key",
    },
    body: JSON.stringify({ userId: input.userId, jid: input.jid, message: input.message }),
  });
  if (!response.ok) {
    throw new Error(`WhatsApp send failed (${response.status})`);
  }
}

async function defaultSendPresence(input: { userId: string; jid: string; presence: string }): Promise<void> {
  const baseUrl = process.env.BAILEYS_SERVER_URL;
  if (!baseUrl) return;
  const apiKey = process.env.BAILEYS_API_KEY;
  try {
    await fetch(`${baseUrl.replace(/\/+$/, "")}/presence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey || "dev-key",
      },
      body: JSON.stringify({ userId: input.userId, jid: input.jid, presence: input.presence }),
    });
  } catch {}
}

async function findOrCreateLead(supabase: SupabaseClient, userId: string, phone: string, pushName: string): Promise<Record<string, any>> {
  // Search with both formats — phone might be stored with or without + prefix
  const phoneDigits = phone.replace(/^\+/, "");
  const { data: existing } = await supabase
    .from("leads")
    .select("*")
    .eq("user_id", userId)
    .or(`phone.ilike.%${phoneDigits}%,phone.ilike.%${phone}%`)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("leads")
    .insert({
      user_id: userId,
      name: pushName || `WhatsApp ${phone.slice(-4)}`,
      phone,
      lead_score: 0,
      status: "new",
      funnel_stage: "DISCOVERED",
      opted_out: false,
      notes: "Created from inbound WhatsApp message",
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create lead: ${error.message}`);
  return created;
}

async function findOrCreateConversation(
  supabase: SupabaseClient,
  userId: string,
  leadId: string,
  pushName: string,
  lastMessage: string
): Promise<Record<string, any>> {
  const { data: existing } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .eq("lead_id", leadId)
    .eq("platform", "whatsapp")
    .maybeSingle();
  if (existing) {
    await supabase
      .from("conversations")
      .update({ last_message: lastMessage, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return existing;
  }
  const { data: created, error } = await supabase
    .from("conversations")
    .insert({
      user_id: userId,
      contact_name: pushName || "WhatsApp contact",
      platform: "whatsapp",
      lead_id: leadId,
      last_message: lastMessage,
      status: "active",
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create conversation: ${error.message}`);
  return created;
}

async function messageCountForConversation(supabase: SupabaseClient, conversationId: string, senderOnly?: string): Promise<number> {
  let query = supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);
  if (senderOnly) query = query.eq("sender", senderOnly);
  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

export async function processIncomingWhatsAppMessage(
  supabase: SupabaseClient,
  input: WhatsAppInboundMessage,
  options: ProcessWhatsAppOptions = {}
): Promise<ProcessWhatsAppResult> {
  const startedAt = Date.now();
  const timings: Record<string, number> = {};
  const mark = (stage: string, t: number) => {
    timings[stage] = t - startedAt;
  };

  const sendReply = options.sendReply ?? true;
  const sendFn = options.sendFn ?? defaultSendReply;
  const presenceFn = options.presenceFn ?? defaultSendPresence;

  if (isGroupJid(input.remoteJid)) {
    return { processed: false, skippedReason: "group_message", replySent: false };
  }

  const phone = normalizeWhatsAppPhone(input.remoteJid);
  if (!phone) return { processed: false, skippedReason: "invalid_jid", replySent: false };

  const inboundKey = idempotencyKey("wa:in", input.userId, input.messageId);
  const { data: existingInbound } = await supabase
    .from("messages")
    .select("id")
    .eq("user_id", input.userId)
    .eq("idempotency_key", inboundKey)
    .maybeSingle();
  if (existingInbound) {
    return { processed: false, skippedReason: "duplicate_message", replySent: false };
  }

  const lead = await findOrCreateLead(supabase, input.userId, phone, input.pushName ?? "");
  const conversation = await findOrCreateConversation(
    supabase,
    input.userId,
    lead.id,
    input.pushName ?? "",
    input.text
  );

  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    user_id: input.userId,
    content: input.text,
    sender: "user",
    idempotency_key: inboundKey,
  });
  if (insertError) {
    if (insertError.code === "23505") {
      return { processed: false, skippedReason: "duplicate_message", replySent: false };
    }
    throw new Error(`Failed to store message: ${insertError.message}`);
  }
  const persistedAt = Date.now();
  mark("ingestion", persistedAt);

  await recordFunnelEvent(supabase, {
    userId: input.userId,
    leadId: lead.id,
    eventType: "WHATSAPP_INBOUND",
    fromStage: lead.funnel_stage ?? null,
    toStage: null,
    metadata: { conversation_id: conversation.id, message_id: input.messageId },
  });

  let context: any;
  try {
    context = await buildWhatsAppReplyContext(supabase, {
      userId: input.userId,
      leadId: lead.id,
      conversationId: conversation.id,
      messageLimit: 20,
    });
  } catch (err: any) {
    console.error(`[LIB:ai:whatsapp] context build failed: ${err?.message}`);
    context = null;
  }
  mark("context_load", Date.now());

  // Always make sure the LLM has a minimal context, even if Supabase lookups
  // failed. Without this, a transient DB error silently drops the reply.
  if (!context) {
    context = {
      business: { business_name: null, available: false, missing_fields: [] },
      lead,
      conversation,
      messages: [],
      conversationSummary: null,
      duplicateExists: false,
      lastOutreachAt: null,
      outreachCountInWindow: 0,
    };
  } else {
    context.lead = lead;
    context.conversation = conversation;
  }

  let replyText: string | null = null;
  let meetingIntentDetected = false;
  let language = "other";

  try {
    await presenceFn({ userId: input.userId, jid: input.remoteJid, presence: "composing" });
  } catch {}

  if (context) {
    try {
      let replyTask = await runAiTask(supabase, {
        userId: input.userId,
        taskType: "GENERATE_WHATSAPP_REPLY",
        leadId: lead.id,
        conversationId: conversation.id,
        payload: { message: input.text },
        idempotencyKey: idempotencyKey("wa:reply", input.userId, input.messageId),
        prebuiltContext: context,
      });

      if (replyTask.status !== "COMPLETED") {
        try {
          replyTask = await runAiTask(supabase, {
            userId: input.userId,
            taskType: "GENERATE_WHATSAPP_REPLY",
            leadId: lead.id,
            conversationId: conversation.id,
            payload: { message: input.text },
            idempotencyKey: idempotencyKey("wa:reply:retry", input.userId, input.messageId),
            prebuiltContext: context,
          });
        } catch {}
      }
      mark("llm_complete", Date.now());
      if (replyTask.status === "COMPLETED") {
        replyText =
          typeof replyTask.output?.reply === "string" && replyTask.output.reply.trim() !== ""
            ? replyTask.output.reply.trim()
            : null;
        meetingIntentDetected = replyTask.output?.meeting_intent === true;
        language = typeof replyTask.output?.language === "string" ? replyTask.output.language : "other";
      }
    } catch (error: any) {
      console.error(`[LIB:ai:whatsapp] reply generation failed: ${error?.message}`);
    }
  }

  // ─── Fallback reply when the LLM failed both attempts ───
  // The LLM is the primary source. If the schema is too strict (MiniMax free
  // often returns loose JSON), or the call timed out, fall back to a safe
  // casual reply that USES THE LEAD'S ACTUAL MESSAGE so it doesn't look like
  // a canned reply and doesn't trip the duplicate-reply guard (WA_002).
  if (!replyText) {
    const trimmed = input.text.trim();
    const lang = /[\u0900-\u097F]/.test(trimmed) || /\b(kya|hai|nahi|kar|mera|bhai|yaar|karna|mujhe|hai\s*ky|haan|nahi)\b/i.test(trimmed)
      ? "hinglish"
      : "english";
    const leadName = String(lead.name ?? "").trim().split(/\s+/)[0] || "";
    const nameBit = leadName && leadName.toLowerCase() !== "whatsapp" && leadName.length > 1 ? ` ${leadName}` : "";
    // Echo a tiny bit of the lead's message so the reply is contextual and unique
    const echo = trimmed.length > 0 && trimmed.length <= 40 && /[a-zA-Z\u0900-\u097F]/.test(trimmed)
      ? ` re "${trimmed.slice(0, 30)}"`
      : "";
    if (lang === "hinglish") {
      replyText = echo
        ? `haan${nameBit}?${echo} — batao`
        : `haan${nameBit}, bol?`;
    } else {
      replyText = echo
        ? `yeah${nameBit}?${echo} — go on`
        : `yeah${nameBit}, what's up?`;
    }
    console.warn(`[LIB:ai:whatsapp] LLM did not return a valid reply — using fallback for message ${input.messageId}`);
  }

  // ─── Human takeover / double-send guard ───
  // Only block the AI reply if the owner JUST messaged this lead AFTER the
  // inbound we're processing (i.e. owner raced to reply manually). The previous
  // 30-minute blanket silence was too aggressive — it kept the AI from
  // continuing the conversation the owner wanted it to handle.
  const TWO_MIN_MS = 2 * 60 * 1000;
  const inboundIso = input.timestamp ?? new Date(startedAt).toISOString();
  // Strictly newer than inbound — use gte with +1ms because PostgREST has .gt
  // but we want the same semantics across the Supabase JS client + test mocks.
  const newerThanInbound = new Date(new Date(inboundIso).getTime() + 1).toISOString();
  const { data: raceManual } = await supabase
    .from("whatsapp_messages")
    .select("id, timestamp")
    .eq("user_id", input.userId)
    .eq("remote_jid", input.remoteJid)
    .eq("from_me", true)
    .gte("timestamp", newerThanInbound)
    .limit(1);
  let humanTakeover = (raceManual?.length ?? 0) > 0;

  // Fallback: if the inbound had no timestamp (older poller path), still hold
  // a very short window after the owner's most recent manual send so we don't
  // double-message.
  if (!humanTakeover && !input.timestamp) {
    const shortWindow = new Date(Date.now() - TWO_MIN_MS).toISOString();
    const { data: recentManual } = await supabase
      .from("whatsapp_messages")
      .select("id")
      .eq("user_id", input.userId)
      .eq("remote_jid", input.remoteJid)
      .eq("from_me", true)
      .gte("timestamp", shortWindow)
      .limit(1);
    humanTakeover = (recentManual?.length ?? 0) > 0;
  }

  if (!sendReply || !replyText || humanTakeover) {
    await markWhatsAppProcessed(supabase, input, null);
    if (humanTakeover) {
      try { await presenceFn({ userId: input.userId, jid: input.remoteJid, presence: "paused" }); } catch {}
      await recordFunnelEvent(supabase, {
        userId: input.userId,
        leadId: lead.id,
        eventType: "AI_REPLY_HELD",
        fromStage: lead.funnel_stage ?? null,
        toStage: null,
        metadata: { reason: "human_takeover_active", conversation_id: conversation.id },
      });
    }
    return {
      processed: true,
      leadId: lead.id,
      conversationId: conversation.id,
      replySent: false,
      replyText: null,
      decision: { allowed: true, reason: humanTakeover ? "human takeover active — AI stayed quiet" : "no reply generated" },
      meetingIntentDetected,
      latencyMs: timings,
    };
  }

  const rulesStartedAt = Date.now();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentAiReplies } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversation.id)
    .eq("sender", "ai")
    .gte("created_at", since);

  const { data: lastAiReply } = await supabase
    .from("messages")
    .select("content, created_at")
    .eq("conversation_id", conversation.id)
    .eq("sender", "ai")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const duplicateDetected =
    lastAiReply?.content === replyText &&
    new Date(lastAiReply.created_at).getTime() > Date.now() - 5 * 60 * 1000;

  const ruleContext: RuleContext = {
    lead,
    message: replyText,
    aiReplyCountInWindow: recentAiReplies ?? 0,
    duplicateReplyDetected: duplicateDetected,
  };
  const ruleResult = evaluateRules(["LEAD_010", "LEAD_016", "LEAD_018", "WA_001", "WA_002"], ruleContext);
  mark("rules_complete", Date.now());

  if (!ruleResult.allowed) {
    try {
      await presenceFn({ userId: input.userId, jid: input.remoteJid, presence: "paused" });
    } catch {}
    await markWhatsAppProcessed(supabase, input, null);
    await recordFunnelEvent(supabase, {
      userId: input.userId,
      leadId: lead.id,
      eventType: "WHATSAPP_REPLY_BLOCKED",
      fromStage: lead.funnel_stage ?? null,
      toStage: null,
      metadata: { ruleId: ruleResult.ruleId, reason: ruleResult.reason, conversation_id: conversation.id },
    });
    await logAiDecision(supabase, {
      user_id: input.userId,
      lead_id: lead.id,
      conversation_id: conversation.id,
      task_type: "SEND_WHATSAPP_REPLY",
      model: "deepseek-v4-flash",
      model_version: "v4-flash",
      prompt_version: "n/a",
      input_context: { reply_text: replyText, message_id: input.messageId, language, timings },
      output: {},
      ai_decision: "blocked",
      rule_result: ruleResult,
      action: "SEND_WHATSAPP_REPLY",
      action_status: "BLOCKED",
      error_code: ruleResult.ruleId ?? null,
      error_message: ruleResult.reason,
    });
    return {
      processed: true,
      leadId: lead.id,
      conversationId: conversation.id,
      replySent: false,
      replyText,
      decision: { allowed: false, ruleId: ruleResult.ruleId, reason: ruleResult.reason },
      meetingIntentDetected,
      latencyMs: timings,
    };
  }

  const sendStartedAt = Date.now();
  let sendError: string | null = null;
  try {
    await sendFn({ userId: input.userId, jid: input.remoteJid, message: replyText });
  } catch (error: any) {
    sendError = error?.message ?? "send failed";
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      await sendFn({ userId: input.userId, jid: input.remoteJid, message: replyText });
      sendError = null;
    } catch (retryError: any) {
      sendError = retryError?.message ?? "send failed";
    }
  }
  const sentAt = Date.now();
  mark("send_complete", sentAt);
  mark("total", sentAt);
  timings.llm = (timings.llm_complete ?? 0) - (timings.context_load ?? 0);
  timings.rules = (timings.rules_complete ?? 0) - (timings.llm_complete ?? 0);
  timings.send = sentAt - sendStartedAt;

  try {
    await presenceFn({ userId: input.userId, jid: input.remoteJid, presence: "paused" });
  } catch {}

  const outboundKey = idempotencyKey("wa:out", input.userId, input.messageId);
  if (!sendError) {
    const { data: existingOutbound } = await supabase
      .from("messages")
      .select("id")
      .eq("user_id", input.userId)
      .eq("idempotency_key", outboundKey)
      .maybeSingle();
    if (!existingOutbound) {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        user_id: input.userId,
        content: replyText,
        sender: "ai",
        idempotency_key: outboundKey,
      });
    }
    await supabase
      .from("conversations")
      .update({ last_message: replyText, updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    await recordFunnelEvent(supabase, {
      userId: input.userId,
      leadId: lead.id,
      eventType: "WHATSAPP_AI_REPLY",
      fromStage: lead.funnel_stage ?? null,
      toStage: null,
      metadata: { conversation_id: conversation.id, latency_ms: timings.total ?? 0, language },
      idempotencyKey: outboundKey,
    });
  }

  await markWhatsAppProcessed(supabase, input, sendError ? null : replyText);

  await logAiDecision(supabase, {
    user_id: input.userId,
    lead_id: lead.id,
    conversation_id: conversation.id,
    task_type: "SEND_WHATSAPP_REPLY",
    model: "deepseek-v4-flash",
    model_version: "v4-flash",
    prompt_version: "n/a",
    input_context: { reply_text: replyText, message_id: input.messageId, language, timings },
    output: sendError ? {} : { reply_text: replyText },
    ai_decision: sendError ? "send_failed" : "sent",
    rule_result: ruleResult,
    action: "SEND_WHATSAPP_REPLY",
    action_status: sendError ? "FAILED" : "SENT",
    error_code: sendError ? "WHATSAPP_SEND_ERROR" : null,
    error_message: sendError,
  });

  return {
    processed: true,
    leadId: lead.id,
    conversationId: conversation.id,
    replySent: !sendError,
    replyText,
    decision: {
      allowed: true,
      reason: sendError ? "reply generated but send failed" : "reply sent",
    },
    meetingIntentDetected,
    latencyMs: timings,
  };
}

export async function runBackgroundWhatsAppIntelligence(
  supabase: SupabaseClient,
  input: BackgroundIntelligenceInput
): Promise<void> {
  const { userId, leadId, conversationId, messageId, text, meetingSignal } = input;

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!lead) return;

  const messageCount = await messageCountForConversation(supabase, conversationId, "user");

  if (!lead.company && !lead.industry) {
    try {
      await runAiTask(supabase, {
        userId,
        taskType: "ENRICH_LEAD",
        leadId,
        conversationId,
        payload: { message: text },
        idempotencyKey: idempotencyKey("wa:enrich", userId, leadId, Math.floor(messageCount / 3)),
      });
    } catch {}
  }

  const { data: leadAfterEnrich } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  const leadNow = leadAfterEnrich ?? lead;

  if (leadNow.funnel_stage === "DISCOVERED") {
    try {
      await transitionLead(supabase, {
        leadId,
        userId,
        toStage: "ENRICHED",
        eventType: "INBOUND_MESSAGE",
        metadata: { channel: "whatsapp", conversation_id: conversationId },
      });
    } catch {}
  }

  const { data: leadAfterEnrichTransition } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();
  const stageNow = leadAfterEnrichTransition?.funnel_stage ?? leadNow.funnel_stage;

  if (stageNow === "DISCOVERED" || stageNow === "ENRICHED") {
    const inboundRule = evaluateRules(["LEAD_021"], {
      lead: leadAfterEnrichTransition ?? leadNow,
      inboundMessageCount: messageCount,
    });
    if (inboundRule.allowed) {
      try {
        const contacted = await transitionLead(supabase, {
          leadId,
          userId,
          toStage: "CONTACTED",
          inbound: true,
          eventType: "INBOUND_CONTACTED",
          metadata: {
            channel: "whatsapp",
            conversation_id: conversationId,
            ruleId: "LEAD_021",
            inbound_message_count: messageCount,
          },
        });
        if (contacted.allowed) {
          await transitionLead(supabase, {
            leadId,
            userId,
            toStage: "CONVERSATION",
            eventType: "INBOUND_CONVERSATION",
            metadata: { channel: "whatsapp", conversation_id: conversationId },
          });
        }
      } catch {}
    }
  }

  const { data: intelligence } = await supabase
    .from("lead_intelligence")
    .select("id")
    .eq("lead_id", leadId)
    .eq("user_id", userId)
    .maybeSingle();

  const advancedStages = ["QUALIFIED", "PRIORITIZED", "OUTREACH_READY", "CONTACTED", "CONVERSATION", "MEETING_INTENT", "MEETING_BOOKED", "MEETING_HELD", "WON"];
  const shouldRunQualification =
    !intelligence ||
    (!advancedStages.includes(leadNow.funnel_stage ?? "") && messageCount >= 3);

  let qualificationPassed = false;
  if (shouldRunQualification) {
    try {
      const result = await runAiTask(supabase, {
        userId,
        taskType: "QUALIFY_LEAD",
        leadId,
        conversationId,
        idempotencyKey: idempotencyKey("wa:qualify", userId, leadId, Math.floor(messageCount / 5)),
      });
      qualificationPassed =
        result.status === "COMPLETED" && result.output?.decision === "qualified";
    } catch {}
  }

  if (qualificationPassed) {
    const { data: freshIntelligence } = await supabase
      .from("lead_intelligence")
      .select("*")
      .eq("lead_id", leadId)
      .eq("user_id", userId)
      .maybeSingle();
    for (const nextStage of ["PRIORITIZED", "OUTREACH_READY", "CONTACTED"] as const) {
      try {
        const transition = await transitionLead(supabase, {
          leadId,
          userId,
          toStage: nextStage,
          intelligence: freshIntelligence,
          qualificationDecision: "qualified",
          eventType: nextStage === "CONTACTED" ? "CONTACTED_VIA_WHATSAPP" : "STAGE_TRANSITION",
          metadata: { channel: "whatsapp" },
        });
        if (!transition.allowed) break;
      } catch {
        break;
      }
    }
  }

  if (meetingSignal) {
    try {
      const intentTask = await runAiTask(supabase, {
        userId,
        taskType: "DETECT_MEETING_INTENT",
        conversationId,
        leadId,
        payload: {},
        idempotencyKey: idempotencyKey("wa:intent", userId, messageId),
      });

      if (intentTask.status === "COMPLETED" && intentTask.output?.meeting_intent === true) {
        const schedule = parseScheduleFromText(text);
        if (schedule && new Date(schedule.scheduledAt).getTime() > Date.now()) {
          await bookMeeting(supabase, {
            userId,
            leadId,
            conversationId,
            scheduledAt: schedule.scheduledAt,
            durationMinutes: schedule.durationMinutes,
            medium: "call",
            idempotencyKey: idempotencyKey("wa:meeting", userId, leadId, messageId),
          });
        }
      }
    } catch {}
  }

  if (messageCount > 0 && messageCount % 20 === 0) {
    try {
      await runAiTask(supabase, {
        userId,
        taskType: "SUMMARIZE_CONVERSATION",
        conversationId,
        leadId,
        idempotencyKey: idempotencyKey("wa:summary", userId, conversationId, messageCount),
      });
    } catch {}
  }
}

async function markWhatsAppProcessed(
  supabase: SupabaseClient,
  input: WhatsAppInboundMessage,
  aiResponse: string | null
): Promise<void> {
  try {
    await supabase
      .from("whatsapp_messages")
      .update({ processed: true, ai_response: aiResponse })
      .eq("user_id", input.userId)
      .eq("message_id", input.messageId);
  } catch {}
}

export async function processPendingWhatsAppMessages(
  supabase: SupabaseClient,
  userId: string,
  options: ProcessWhatsAppOptions = {},
  limit = 10
): Promise<ProcessWhatsAppResult[]> {
  const { data: pending, error } = await supabase
    .from("whatsapp_messages")
    .select("*")
    .eq("user_id", userId)
    .eq("processed", false)
    .eq("from_me", false)
    .order("timestamp", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Failed to list pending messages: ${error.message}`);
  if (!pending || pending.length === 0) return [];

  const results: ProcessWhatsAppResult[] = [];
  for (const row of pending) {
    if (!row.message_id || !row.message_text) continue;
    const fast = await processIncomingWhatsAppMessage(
      supabase,
      {
        userId,
        remoteJid: row.remote_jid,
        messageId: row.message_id,
        text: row.message_text,
        timestamp: row.timestamp ?? undefined,
        pushName: row.push_name ?? undefined,
      },
      options
    );
    if (fast.processed && fast.leadId && fast.conversationId) {
      await runBackgroundWhatsAppIntelligence(supabase, {
        userId,
        leadId: fast.leadId,
        conversationId: fast.conversationId,
        messageId: row.message_id,
        text: row.message_text,
        meetingSignal: fast.meetingIntentDetected === true,
      });
    }
    results.push(fast);
  }
  return results;
}
