import type { SupabaseClient } from "@supabase/supabase-js";
import { runAiTask } from "../orchestrator";
import { transitionLead, recordFunnelEvent } from "../funnel/service";
import { evaluateRules, type RuleContext } from "../rules";
import { bookMeeting } from "../meeting/engine";
import { logAiDecision } from "../audit/log";
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
  meetingBooked?: boolean;
  meetingId?: string | null;
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
  const sendReply = options.sendReply ?? true;
  const sendFn = options.sendFn ?? defaultSendReply;

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

  await recordFunnelEvent(supabase, {
    userId: input.userId,
    leadId: lead.id,
    eventType: "WHATSAPP_INBOUND",
    fromStage: lead.funnel_stage ?? null,
    toStage: null,
    metadata: { conversation_id: conversation.id, message_id: input.messageId },
  });

  const messageCount = await messageCountForConversation(supabase, conversation.id);

  if (!lead.company && !lead.industry) {
    try {
      const bucket = Math.floor(messageCount / 3);
      await runAiTask(supabase, {
        userId: input.userId,
        taskType: "ENRICH_LEAD",
        leadId: lead.id,
        conversationId: conversation.id,
        payload: { message: input.text },
        idempotencyKey: idempotencyKey("wa:enrich", input.userId, lead.id, bucket),
      });
    } catch {}
  }

  const { data: leadAfterEnrich } = await supabase
    .from("leads")
    .select("*")
    .eq("id", lead.id)
    .maybeSingle();
  const leadNow = leadAfterEnrich ?? lead;

  if (leadNow.funnel_stage === "DISCOVERED") {
    try {
      await transitionLead(supabase, {
        leadId: leadNow.id,
        userId: input.userId,
        toStage: "ENRICHED",
        eventType: "INBOUND_MESSAGE",
        metadata: { channel: "whatsapp", conversation_id: conversation.id },
      });
    } catch {}
  }

  const { data: intelligence } = await supabase
    .from("lead_intelligence")
    .select("id, updated_at")
    .eq("lead_id", lead.id)
    .eq("user_id", input.userId)
    .maybeSingle();

  const wasAlreadyQualified =
    leadNow.funnel_stage === "QUALIFIED" ||
    leadNow.funnel_stage === "PRIORITIZED" ||
    leadNow.funnel_stage === "OUTREACH_READY" ||
    leadNow.funnel_stage === "CONTACTED" ||
    leadNow.funnel_stage === "CONVERSATION";

  const shouldRunQualificationAnalysis =
    !intelligence ||
    (!wasAlreadyQualified && messageCount >= 3);

  let qualificationPassed = false;

  if (shouldRunQualificationAnalysis) {
    try {
      const bucket = Math.floor(messageCount / 5);
      const qualificationResult = await runAiTask(supabase, {
        userId: input.userId,
        taskType: "QUALIFY_LEAD",
        leadId: lead.id,
        conversationId: conversation.id,
        idempotencyKey: idempotencyKey("wa:qualify", input.userId, lead.id, bucket),
      });
      qualificationPassed =
        qualificationResult.status === "COMPLETED" &&
        qualificationResult.output?.decision === "qualified";
    } catch {}
  }

  const { data: leadAfterQualify } = await supabase
    .from("leads")
    .select("*")
    .eq("id", lead.id)
    .single();

  const canAdvanceFunnel = wasAlreadyQualified || qualificationPassed;

  if (canAdvanceFunnel && leadAfterQualify?.funnel_stage === "QUALIFIED") {
    const { data: freshIntelligence } = await supabase
      .from("lead_intelligence")
      .select("*")
      .eq("lead_id", lead.id)
      .eq("user_id", input.userId)
      .maybeSingle();
    for (const nextStage of ["PRIORITIZED", "OUTREACH_READY", "CONTACTED"] as const) {
      try {
        const transition = await transitionLead(supabase, {
          leadId: lead.id,
          userId: input.userId,
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

  if (messageCount > 0 && messageCount % 20 === 0) {
    try {
      await runAiTask(supabase, {
        userId: input.userId,
        taskType: "SUMMARIZE_CONVERSATION",
        conversationId: conversation.id,
        leadId: lead.id,
        idempotencyKey: idempotencyKey("wa:summary", input.userId, conversation.id, messageCount),
      });
    } catch {}
  }

  const analysis = await runAiTask(supabase, {
    userId: input.userId,
    taskType: "ANALYZE_REPLY",
    conversationId: conversation.id,
    leadId: lead.id,
    payload: { message: input.text },
    idempotencyKey: idempotencyKey("wa:analyze", input.userId, input.messageId),
  });

  const meetingIntentDetected = analysis.output?.meeting_intent === true;
  let meetingBooked = false;
  let meetingId: string | null = null;

  if (meetingIntentDetected) {
    const intentTask = await runAiTask(supabase, {
      userId: input.userId,
      taskType: "DETECT_MEETING_INTENT",
      conversationId: conversation.id,
      leadId: lead.id,
      payload: {},
      idempotencyKey: idempotencyKey("wa:intent", input.userId, input.messageId),
    });

    if (intentTask.status === "COMPLETED" && intentTask.output?.meeting_intent === true) {
      const schedule = parseScheduleFromText(input.text);
      if (schedule && new Date(schedule.scheduledAt).getTime() > Date.now()) {
        const booking = await bookMeeting(supabase, {
          userId: input.userId,
          leadId: lead.id,
          conversationId: conversation.id,
          scheduledAt: schedule.scheduledAt,
          durationMinutes: schedule.durationMinutes,
          medium: "call",
          idempotencyKey: idempotencyKey("wa:meeting", input.userId, lead.id, input.messageId),
        });
        meetingBooked = booking.allowed;
        meetingId = booking.meeting?.id ?? null;
      }
    }
  }

  const replyRequired = analysis.output?.reply_required !== false;
  const replyText: string | null =
    typeof analysis.output?.suggested_reply === "string" && analysis.output.suggested_reply.trim() !== ""
      ? analysis.output.suggested_reply.trim()
      : null;

  if (!sendReply || !replyRequired || !replyText) {
    await markWhatsAppProcessed(supabase, input, null);
    return {
      processed: true,
      leadId: lead.id,
      conversationId: conversation.id,
      replySent: false,
      replyText: replyText,
      decision: { allowed: true, reason: "no reply required" },
      meetingBooked,
      meetingId,
    };
  }

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
    lead: leadAfterQualify ?? leadNow,
    message: replyText,
    aiReplyCountInWindow: recentAiReplies ?? 0,
    duplicateReplyDetected: duplicateDetected,
  };
  const ruleResult = evaluateRules(["LEAD_010", "LEAD_016", "LEAD_018", "WA_001", "WA_002"], ruleContext);

  if (!ruleResult.allowed) {
    await markWhatsAppProcessed(supabase, input, null);
    await logAiDecision(supabase, {
      user_id: input.userId,
      lead_id: lead.id,
      conversation_id: conversation.id,
      task_type: "SEND_WHATSAPP_REPLY",
      model: "deepseek-v4-flash",
      model_version: "v4-flash",
      prompt_version: "n/a",
      input_context: { reply_text: replyText, message_id: input.messageId },
      output: {},
      ai_decision: "blocked",
      rule_result: ruleResult,
      action: "SEND_WHATSAPP_REPLY",
      action_status: "BLOCKED",
      error_code: ruleResult.ruleId ?? null,
      error_message: ruleResult.reason,
    });
    await recordFunnelEvent(supabase, {
      userId: input.userId,
      leadId: lead.id,
      eventType: "WHATSAPP_REPLY_BLOCKED",
      fromStage: leadAfterQualify?.funnel_stage ?? null,
      toStage: null,
      metadata: { ruleId: ruleResult.ruleId, reason: ruleResult.reason, conversation_id: conversation.id },
    });
    return {
      processed: true,
      leadId: lead.id,
      conversationId: conversation.id,
      replySent: false,
      replyText,
      decision: { allowed: false, ruleId: ruleResult.ruleId, reason: ruleResult.reason },
      meetingBooked,
      meetingId,
    };
  }

  try {
    await sendFn({ userId: input.userId, jid: input.remoteJid, message: replyText });
  } catch (error: any) {
    await markWhatsAppProcessed(supabase, input, replyText);
    await logAiDecision(supabase, {
      user_id: input.userId,
      lead_id: lead.id,
      conversation_id: conversation.id,
      task_type: "SEND_WHATSAPP_REPLY",
      model: "deepseek-v4-flash",
      model_version: "v4-flash",
      prompt_version: "n/a",
      input_context: { reply_text: replyText, message_id: input.messageId },
      output: {},
      ai_decision: "send_failed",
      rule_result: ruleResult,
      action: "SEND_WHATSAPP_REPLY",
      action_status: "FAILED",
      error_code: "WHATSAPP_SEND_ERROR",
      error_message: error?.message ?? "send failed",
    });
    return {
      processed: true,
      leadId: lead.id,
      conversationId: conversation.id,
      replySent: false,
      replyText,
      decision: { allowed: true, reason: "reply generated but send failed" },
      meetingBooked,
      meetingId,
    };
  }

  const outboundKey = idempotencyKey("wa:out", input.userId, input.messageId);
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

  await markWhatsAppProcessed(supabase, input, replyText);

  await recordFunnelEvent(supabase, {
    userId: input.userId,
    leadId: lead.id,
    eventType: "WHATSAPP_AI_REPLY",
    fromStage: leadAfterQualify?.funnel_stage ?? null,
    toStage: null,
    metadata: { conversation_id: conversation.id, ruleId: null },
    idempotencyKey: outboundKey,
  });

  await logAiDecision(supabase, {
    user_id: input.userId,
    lead_id: lead.id,
    conversation_id: conversation.id,
    task_type: "SEND_WHATSAPP_REPLY",
    model: "deepseek-v4-flash",
    model_version: "v4-flash",
    prompt_version: "n/a",
    input_context: { reply_text: replyText, message_id: input.messageId },
    output: { reply_text: replyText },
    ai_decision: "sent",
    rule_result: ruleResult,
    action: "SEND_WHATSAPP_REPLY",
    action_status: "SENT",
  });

  return {
    processed: true,
    leadId: lead.id,
    conversationId: conversation.id,
    replySent: true,
    replyText,
    decision: { allowed: true, reason: "reply sent" },
    meetingBooked,
    meetingId,
  };
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
    const result = await processIncomingWhatsAppMessage(
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
    results.push(result);
  }
  return results;
}
