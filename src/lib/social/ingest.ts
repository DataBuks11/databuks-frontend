import type { SupabaseClient } from "@supabase/supabase-js";
import { runAiTask } from "../ai/orchestrator";
import { buildBusinessContext } from "../ai/context/business-context";
import { logAiDecision } from "../ai/audit/log";
import type { SocialEventInput } from "./adapters/types";

export async function ingestAndClassifySocialEvent(
  supabase: SupabaseClient,
  userId: string,
  event: SocialEventInput
): Promise<{ ingested: boolean; duplicate?: boolean; eventId?: string; classification?: Record<string, any> | null }> {
  const { data: existing } = await supabase
    .from("social_events")
    .select("id, processed")
    .eq("user_id", userId)
    .eq("provider", event.provider)
    .eq("external_event_id", String(event.external_event_id))
    .maybeSingle();
  if (existing) {
    return { ingested: false, duplicate: true, eventId: existing.id };
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
    })
    .select()
    .single();
  if (insertError) {
    return { ingested: false, eventId: undefined };
  }

  const content = typeof event.content === "string" ? event.content : "";
  let classification: Record<string, any> | null = null;

  if (content.trim().length > 0) {
    const business = await buildBusinessContext(supabase, userId);
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
    } as any;

    const result = await runAiTask(supabase, {
      userId,
      taskType: "CLASSIFY_SOCIAL_EVENT",
      payload: { external_event_id: String(event.external_event_id) },
      idempotencyKey: `social:classify:${userId}:${event.provider}:${String(event.external_event_id)}`,
      prebuiltContext: context,
    });

    if (result.status === "COMPLETED" && result.output) {
      classification = result.output;
      await supabase.from("social_lead_signals").insert({
        user_id: userId,
        provider: event.provider,
        account_id: event.account_id ?? null,
        event_id: created.id,
        signal_type: classification.classification ?? "unknown",
        intent_score: classification.intent_score ?? 0,
        lead_score: classification.lead_score ?? 0,
        sentiment: classification.sentiment ?? "neutral",
        evidence: { event: content.slice(0, 500), reason: classification.reason ?? null },
      });

      if (classification.recommended_action === "ESCALATE_TO_HUMAN") {
        await logAiDecision(supabase, {
          user_id: userId,
          task_type: "SOCIAL_ESCALATION",
          model: "deepseek-v4-flash",
          model_version: "v4-flash",
          prompt_version: "n/a",
          input_context: { event: content.slice(0, 300) },
          output: {},
          ai_decision: "escalate_to_human",
          rule_result: {},
          action: "ESCALATE_TO_HUMAN",
          action_status: "LOGGED",
        });
      }
    }
  }

  await supabase.from("social_events").update({ processed: true }).eq("id", created.id);
  return { ingested: true, eventId: created.id, classification };
}
