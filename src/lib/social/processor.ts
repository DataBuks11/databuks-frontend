import type { SupabaseClient } from "@supabase/supabase-js";
import { runAiTask } from "../ai/orchestrator";
import { buildBusinessContext } from "../ai/context/business-context";
import { logAiDecision } from "../ai/audit/log";
import { idempotencyKey } from "../ai/utils/idempotency";
import type { SocialEventInput } from "./adapters/types";

export interface ProcessedEventResult {
  status: "PROCESSED" | "IGNORED" | "FAILED" | "DUPLICATE";
  eventId?: string;
  classification?: Record<string, any> | null;
  signalId?: string | null;
  actionId?: string | null;
  escalated?: boolean;
}

export async function getRecentEventsForAuthor(
  supabase: SupabaseClient,
  userId: string,
  provider: string,
  authorId: string | null,
  limit = 5
): Promise<{ author_name?: string | null; content: string; at?: string | null }[]> {
  if (!authorId) return [];
  let query = supabase
    .from("social_events")
    .select("author_name, content, created_at")
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("author_id", authorId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const { data } = await query;
  return (data ?? [])
    .reverse()
    .map((e: any) => ({ author_name: e.author_name ?? null, content: e.content ?? "", at: e.created_at ?? null }));
}

export async function processSocialEvent(
  supabase: SupabaseClient,
  userId: string,
  event: SocialEventInput
): Promise<ProcessedEventResult> {
  const { data: existing } = await supabase
    .from("social_events")
    .select("id, processing_status")
    .eq("user_id", userId)
    .eq("provider", event.provider)
    .eq("external_event_id", String(event.external_event_id))
    .maybeSingle();
  if (existing) {
    return { status: "DUPLICATE", eventId: existing.id };
  }

  const { data: created, error: insertError } = await supabase
    .from("social_events")
    .insert({
      user_id: userId,
      provider: event.provider,
      account_id: event.account_id ?? null,
      external_event_id: String(event.external_event_id),
      event_type: event.event_type ?? "comment",
      author_id: event.author_id ?? null,
      author_name: event.author_name ?? null,
      post_id: event.post_id ?? null,
      comment_id: event.comment_id ?? null,
      content: event.content ?? null,
      url: event.url ?? null,
      timestamp: event.timestamp ?? null,
      raw_reference: event.raw_reference ?? {},
      processing_status: "RECEIVED",
    })
    .select()
    .single();
  if (insertError) {
    return { status: "FAILED", eventId: undefined };
  }
  const eventId = created.id;
  const content = typeof event.content === "string" ? event.content : "";

  if (content.trim().length === 0) {
    await supabase.from("social_events").update({ processing_status: "IGNORED" }).eq("id", eventId);
    return { status: "IGNORED", eventId };
  }

  await supabase.from("social_events").update({ processing_status: "PROCESSING" }).eq("id", eventId);

  try {
    const business = await buildBusinessContext(supabase, userId);
    const recentMessages = await getRecentEventsForAuthor(
      supabase,
      userId,
      event.provider,
      event.author_id ?? null,
      5
    );
    const context = {
      business,
      lead: null,
      intelligence: null,
      conversation: null,
      messages: [],
      conversationSummary: null,
      duplicateExists: false,
      lastOutreachAt: null,
      outreachCountInWindow: 0,
      socialEvent: { content, author_name: event.author_name ?? null, event_type: event.event_type ?? "comment" },
      socialRecentMessages: recentMessages,
    } as any;

    const result = await runAiTask(supabase, {
      userId,
      taskType: "CLASSIFY_SOCIAL_EVENT",
      payload: { external_event_id: String(event.external_event_id) },
      idempotencyKey: idempotencyKey("social:classify", userId, event.provider, String(event.external_event_id)),
      prebuiltContext: context,
    });

    if (result.status !== "COMPLETED" || !result.output) {
      await supabase.from("social_events").update({ processing_status: "FAILED" }).eq("id", eventId);
      return { status: "FAILED", eventId };
    }

    const output = result.output as Record<string, any>;

    const { data: signal, error: signalError } = await supabase
      .from("social_lead_signals")
      .insert({
        user_id: userId,
        provider: event.provider,
        account_id: event.account_id ?? null,
        event_id: eventId,
        signal_type: output.classification ?? "unknown",
        intent_score: output.intent_score ?? 0,
        lead_score: output.lead_score ?? 0,
        sentiment: output.sentiment ?? "neutral",
        evidence: { event: content.slice(0, 500), reason: output.reason ?? null },
      })
      .select()
      .single();

    let actionId: string | null = null;
    let escalated = false;

    if (output.escalation_required === true || output.recommended_action === "ESCALATE_TO_HUMAN") {
      escalated = true;
      await logAiDecision(supabase, {
        user_id: userId,
        task_type: "SOCIAL_ESCALATION",
        model: "deepseek-v4-flash",
        model_version: "v4-flash",
        prompt_version: "n/a",
        input_context: { event: content.slice(0, 300), provider: event.provider },
        output: {},
        ai_decision: "escalate_to_human",
        rule_result: {},
        action: "ESCALATE_TO_HUMAN",
        action_status: "LOGGED",
      });
    }

    const shouldProposeAction =
      output.should_reply === true &&
      typeof output.reply_draft === "string" &&
      output.reply_draft.trim().length > 0 &&
      !escalated;

    if (shouldProposeAction) {
      const actionType = event.event_type === "message" ? "SEND_MESSAGE" : "COMMENT_REPLY";
      const targetId = event.event_type === "message" ? event.author_id ?? null : event.comment_id ?? event.post_id ?? null;
      const { data: action, error: actionError } = await supabase
        .from("social_actions")
        .insert({
          user_id: userId,
          provider: event.provider,
          account_id: event.account_id ?? null,
          action_type: actionType,
          target_id: targetId,
          content: output.reply_draft.trim(),
          status: "PENDING",
          ai_decision_id: result.taskId,
          idempotency_key: idempotencyKey("social:action", userId, event.provider, String(event.external_event_id)),
        })
        .select()
        .single();
      if (!actionError && action) actionId = action.id;
    }

    await supabase.from("social_events").update({ processing_status: "PROCESSED" }).eq("id", eventId);
    return {
      status: "PROCESSED",
      eventId,
      classification: output,
      signalId: signalError ? null : signal?.id ?? null,
      actionId,
      escalated,
    };
  } catch (error: any) {
    await supabase.from("social_events").update({ processing_status: "FAILED" }).eq("id", eventId);
    return { status: "FAILED", eventId, classification: null };
  }
}
