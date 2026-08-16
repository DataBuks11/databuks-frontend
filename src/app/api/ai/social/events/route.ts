import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/orchestrator";
import { buildBusinessContext } from "@/lib/ai/context/business-context";
import { logAiDecision } from "@/lib/ai/audit/log";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const event = body.event ?? body;
    if (!event?.provider || !event?.external_event_id) {
      return NextResponse.json({ error: "event.provider and event.external_event_id required" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("social_events")
      .select("id, processed")
      .eq("user_id", user.id)
      .eq("provider", event.provider)
      .eq("external_event_id", String(event.external_event_id))
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ingested: false, duplicate: true, eventId: existing.id });
    }

    const { data: created, error: insertError } = await supabase
      .from("social_events")
      .insert({
        user_id: user.id,
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
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const content = typeof event.content === "string" ? event.content : "";
    let classification: any = null;
    let replyAction: any = null;

    if (content.trim().length > 0) {
      const business = await buildBusinessContext(supabase, user.id);
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

      classification = await runAiTask(supabase, {
        userId: user.id,
        taskType: "CLASSIFY_SOCIAL_EVENT",
        payload: event,
        idempotencyKey: `social:classify:${user.id}:${event.provider}:${String(event.external_event_id)}`,
        prebuiltContext: context,
      });

      if (classification.status === "COMPLETED" && classification.output) {
        const output = classification.output;
        await supabase.from("social_lead_signals").insert({
          user_id: user.id,
          provider: event.provider,
          account_id: event.account_id ?? null,
          event_id: created.id,
          signal_type: output.classification ?? "unknown",
          intent_score: output.intent_score ?? 0,
          lead_score: output.lead_score ?? 0,
          sentiment: output.sentiment ?? "neutral",
          evidence: { event: content.slice(0, 500), reason: output.reason ?? null },
        });

        if (output.recommended_action === "REPLY" && output.reply_draft) {
          replyAction = output;
        } else if (output.recommended_action === "ESCALATE_TO_HUMAN") {
          await logAiDecision(supabase, {
            user_id: user.id,
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

    return NextResponse.json({
      ingested: true,
      eventId: created.id,
      classification: classification?.output ?? null,
      replyPending: replyAction != null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
