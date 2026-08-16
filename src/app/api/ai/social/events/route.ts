import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ingestAndClassifySocialEvent } from "@/lib/social/ingest";

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

    const result = await ingestAndClassifySocialEvent(supabase, user.id, {
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
    });

    return NextResponse.json({
      ingested: result.ingested,
      duplicate: result.duplicate ?? false,
      eventId: result.eventId ?? null,
      classification: result.classification ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
