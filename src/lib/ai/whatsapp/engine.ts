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
  const digits = remoteJid.replace(/\D/g, "");
  const cleaned = digits.replace(/^0+/, "");
  return cleaned.length >= 8 ? cleaned : null;
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
  const { data: existing } = await supabase
    .from("leads")
    .select("*")
    .eq("user_id", userId)
    .ilike("phone", `%${phone}%`)
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

async function messageCountForConversation(supabase: SupabaseClient, conversationId: string): Promise<number> {
  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);
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

  let context;
  try {
    context = await buildWhatsAppReplyContext(supabase, {
      userId: input.userId,
      leadId: lead.id,
      conversationId: conversation.id,
      messageLimit: 12,
    });
  } catch {
    context = null;
  }
  mark("context_load", Date.now());

  if (context) {
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

  if (!sendReply || !replyText) {
    await markWhatsAppProcessed(supabase, input, null);
    return {
      processed: true,
      leadId: lead.id,
      conversationId: conversation.id,
      replySent: false,
      replyText: null,
      decision: { allowed: true, reason: "no reply generated" },
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

  const messageCount = await messageCountForConversation(supabase, conversationId);

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
