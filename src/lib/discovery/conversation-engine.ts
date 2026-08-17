/**
 * Conversation Engine
 * Natural, human-like conversation handling for discovered leads.
 * Supports autonomous conversation before WhatsApp handoff.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationMessage } from "./types";
import { MAX_AUTONOMOUS_TURNS, COOLDOWN_HOURS_DEFAULT } from "./types";
import { detectMessageLoop, detectOptOut, detectNoResponse, setCooldown, hasReachedMaxTurns } from "./cooldown";
import { buildBusinessContext } from "../ai/context/business-context";
import { runAiTask } from "../ai/orchestrator";
import { idempotencyKey } from "../ai/utils/idempotency";

export interface ConversationResponse {
  status: "REPLIED" | "CLOSED" | "ESCALATED" | "COOLDOWN" | "MAX_TURNS" | "LOOP_DETECTED" | "OPT_OUT" | "FAILED";
  reply: string | null;
  stage_suggestion: string | null;
  close_reason: string | null;
  meeting_intent: boolean;
  escalation_required: boolean;
}

/**
 * Generate a natural conversation response for a discovered lead.
 */
export async function generateConversationResponse(
  supabase: SupabaseClient,
  userId: string,
  discoveredLeadId: string,
  incomingMessage: string,
  platform: string
): Promise<ConversationResponse> {
  // 1. Load discovered lead
  const { data: lead } = await supabase
    .from("discovered_leads")
    .select("*")
    .eq("id", discoveredLeadId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!lead) {
    return failResponse("discovered_lead_not_found");
  }

  // 2. Check max turns
  const maxTurns = await hasReachedMaxTurns(supabase, userId, discoveredLeadId);
  if (maxTurns) {
    return {
      status: "MAX_TURNS",
      reply: null,
      stage_suggestion: "WHATSAPP_HANDOFF",
      close_reason: "max_autonomous_turns_reached",
      meeting_intent: false,
      escalation_required: true,
    };
  }

  // 3. Load or create conversation thread
  let thread = await getOrCreateThread(supabase, userId, discoveredLeadId, platform);
  const messages: ConversationMessage[] = Array.isArray(thread.messages) ? thread.messages : [];

  // 4. Add incoming message to thread
  const userMessage: ConversationMessage = {
    role: "user",
    content: incomingMessage,
    timestamp: new Date().toISOString(),
    platform,
  };
  messages.push(userMessage);

  // 5. Check opt-out
  if (detectOptOut(messages)) {
    await updateThread(supabase, thread.id, messages);
    await supabase
      .from("discovered_leads")
      .update({
        conversation_stage: "CLOSED",
        closed_reason: "prospect_opted_out",
        last_message: incomingMessage,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", discoveredLeadId);
    return {
      status: "OPT_OUT",
      reply: null,
      stage_suggestion: "CLOSED",
      close_reason: "prospect_opted_out",
      meeting_intent: false,
      escalation_required: false,
    };
  }

  // 6. Build context for AI
  let business;
  try {
    business = await buildBusinessContext(supabase, userId);
  } catch {
    return failResponse("business_context_unavailable");
  }

  // Load lead memory
  let leadMemory: Record<string, any> | null = null;
  if (lead.lead_id) {
    const { data: memory } = await supabase
      .from("lead_conversation_memory")
      .select("*")
      .eq("lead_id", lead.lead_id)
      .eq("user_id", userId)
      .maybeSingle();
    leadMemory = memory;
  }

  // Extract previously asked questions
  const previousQuestions = extractPreviousQuestions(messages);

  const aiContext = {
    business,
    lead: null,
    intelligence: null,
    conversation: null,
    messages: [],
    conversationSummary: lead.conversation_summary ?? null,
    duplicateExists: false,
    lastOutreachAt: null,
    outreachCountInWindow: 0,
    nurtureConversation: {
      prospect_name: lead.author_name ?? lead.author_handle ?? null,
      detected_requirement: lead.detected_requirement ?? null,
      conversation_history: messages.slice(-10).map((m: ConversationMessage) => ({
        role: m.role,
        content: m.content,
      })),
      platform,
      lead_memory: leadMemory,
      previous_questions: previousQuestions,
    },
  } as any;

  // 7. Run AI
  const aiResult = await runAiTask(supabase, {
    userId,
    taskType: "GENERATE_NURTURE_REPLY",
    payload: { discovered_lead_id: discoveredLeadId },
    idempotencyKey: idempotencyKey(
      "nurture:reply",
      userId,
      discoveredLeadId,
      String(messages.length)
    ),
    prebuiltContext: aiContext,
  });

  if (aiResult.status !== "COMPLETED" || !aiResult.output) {
    return failResponse(`ai_failed: ${aiResult.error ?? "unknown"}`);
  }

  const output = aiResult.output as Record<string, any>;
  const reply = typeof output.reply === "string" ? output.reply.trim() : null;

  if (!reply || reply.length === 0) {
    return failResponse("empty_reply");
  }

  // 8. Loop detection
  if (detectMessageLoop(messages, reply)) {
    return {
      status: "LOOP_DETECTED",
      reply: null,
      stage_suggestion: "WHATSAPP_HANDOFF",
      close_reason: "conversation_loop_detected",
      meeting_intent: false,
      escalation_required: true,
    };
  }

  // 9. Add agent reply to thread
  const agentMessage: ConversationMessage = {
    role: "agent",
    content: reply,
    timestamp: new Date().toISOString(),
    platform,
  };
  messages.push(agentMessage);
  await updateThread(supabase, thread.id, messages, "agent");

  // 10. Update discovered lead state
  const stageSuggestion = output.conversation_stage_suggestion ?? lead.conversation_stage;
  const updates: Record<string, any> = {
    last_message: reply,
    last_message_at: new Date().toISOString(),
    total_messages: messages.length,
    updated_at: new Date().toISOString(),
  };

  if (output.prospect_disinterested === true) {
    updates.conversation_stage = "CLOSED";
    updates.closed_reason = output.close_reason ?? "prospect_not_interested";
    await setCooldown(supabase, userId, discoveredLeadId, COOLDOWN_HOURS_DEFAULT);
  } else if (stageSuggestion && stageSuggestion !== lead.conversation_stage) {
    updates.conversation_stage = stageSuggestion;
  }

  if (output.ask_one_question) {
    updates.conversation_summary = [
      lead.conversation_summary ?? "",
      `Q: ${output.ask_one_question}`,
    ].filter(Boolean).join("\n");
  }

  await supabase
    .from("discovered_leads")
    .update(updates)
    .eq("id", discoveredLeadId);

  // 11. Update lead memory if linked
  if (lead.lead_id && leadMemory) {
    const memoryUpdates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (output.ask_one_question) {
      const prev = Array.isArray(leadMemory.previous_questions)
        ? leadMemory.previous_questions
        : [];
      memoryUpdates.previous_questions = [...prev, output.ask_one_question].slice(-20);
    }
    if (output.used_business_fact) {
      memoryUpdates.conversation_summary = [
        leadMemory.conversation_summary ?? "",
        `Mentioned: ${output.used_business_fact}`,
      ].filter(Boolean).join("\n").slice(0, 2000);
    }
    await supabase
      .from("lead_conversation_memory")
      .update(memoryUpdates)
      .eq("lead_id", lead.lead_id)
      .eq("user_id", userId);
  }

  return {
    status: output.prospect_disinterested ? "CLOSED" : output.escalation_required ? "ESCALATED" : "REPLIED",
    reply,
    stage_suggestion: stageSuggestion,
    close_reason: output.close_reason ?? null,
    meeting_intent: output.meeting_intent_detected === true,
    escalation_required: output.escalation_required === true,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getOrCreateThread(
  supabase: SupabaseClient,
  userId: string,
  discoveredLeadId: string,
  platform: string
): Promise<any> {
  const { data: existing } = await supabase
    .from("conversation_threads")
    .select("*")
    .eq("user_id", userId)
    .eq("discovered_lead_id", discoveredLeadId)
    .eq("platform", platform)
    .maybeSingle();

  if (existing) return existing;

  const { data: created } = await supabase
    .from("conversation_threads")
    .insert({
      user_id: userId,
      discovered_lead_id: discoveredLeadId,
      platform,
      messages: [],
      total_messages: 0,
    })
    .select()
    .single();

  return created;
}

async function updateThread(
  supabase: SupabaseClient,
  threadId: string,
  messages: ConversationMessage[],
  lastSender?: "agent" | "user"
): Promise<void> {
  const updates: Record<string, any> = {
    messages,
    total_messages: messages.length,
    updated_at: new Date().toISOString(),
  };
  if (lastSender === "agent") {
    updates.last_agent_message_at = new Date().toISOString();
  } else if (lastSender === "user") {
    updates.last_user_message_at = new Date().toISOString();
  }

  // Check if max turns reached
  const agentCount = messages.filter((m) => m.role === "agent").length;
  if (agentCount >= MAX_AUTONOMOUS_TURNS) {
    updates.max_turns_reached = true;
  }

  await supabase
    .from("conversation_threads")
    .update(updates)
    .eq("id", threadId);
}

function extractPreviousQuestions(messages: ConversationMessage[]): string[] {
  const questions: string[] = [];
  for (const msg of messages) {
    if (msg.role !== "agent") continue;
    const sentences = msg.content.split(/[.?!]+/).map((s) => s.trim());
    for (const sentence of sentences) {
      if (sentence.endsWith("?") || sentence.includes("?")) {
        questions.push(sentence);
      }
    }
  }
  return questions.slice(-20);
}

function failResponse(reason: string): ConversationResponse {
  return {
    status: "FAILED",
    reply: null,
    stage_suggestion: null,
    close_reason: reason,
    meeting_intent: false,
    escalation_required: false,
  };
}
