import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processSocialEvent } from "@/lib/social/processor";

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

    const result = await processSocialEvent(supabase, user.id, {
      provider: event.provider,
      account_id: event.account_id ?? null,
      external_event_id: String(event.external_event_id),
      event_type: event.event_type ?? "comment",
      author_id: event.author_id ?? event.external_user_id ?? null,
      author_name: event.author_name ?? null,
      post_id: event.post_id ?? event.external_media_id ?? null,
      comment_id: event.comment_id ?? event.external_message_id ?? null,
      content: event.content ?? event.text ?? null,
      url: event.url ?? event.source_url ?? null,
      timestamp: event.timestamp ?? event.occurred_at ?? null,
      raw_reference: event.raw_reference ?? event.metadata ?? {},
    });

    return NextResponse.json({
      status: result.status,
      eventId: result.eventId ?? null,
      classification: result.classification
        ? {
            classification: result.classification.classification,
            intent_score: result.classification.intent_score,
            lead_score: result.classification.lead_score,
            recommended_action: result.classification.recommended_action,
            should_reply: result.classification.should_reply,
            escalation_required: result.classification.escalation_required,
            reply_draft: result.classification.reply_draft ?? null,
          }
        : null,
      signalId: result.signalId ?? null,
      actionId: result.actionId ?? null,
      escalated: result.escalated ?? false,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
