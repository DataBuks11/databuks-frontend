import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdapterForProvider } from "@/lib/social/adapters/registry";
import { processSocialEvent } from "@/lib/social/processor";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const provider = body.provider ?? "instagram";

    const { data: connection } = await supabase
      .from("social_connections")
      .select("connection_id")
      .eq("user_id", user.id)
      .eq("platform", provider)
      .eq("status", "connected")
      .maybeSingle();
    if (!connection?.connection_id) {
      return NextResponse.json({ error: "No connected account for this provider" }, { status: 400 });
    }

    const adapter = getAdapterForProvider(provider);
    if (!adapter) {
      return NextResponse.json({ error: "No adapter for provider" }, { status: 400 });
    }

    const events = await adapter.syncRecentEvents(connection.connection_id, user.id, body.limit ?? 10);

    const results = [];
    for (const event of events) {
      results.push(await processSocialEvent(supabase, user.id, event));
    }

    return NextResponse.json({
      pulled: events.length,
      ingested: results.filter((r) => r.status === "PROCESSED").length,
      duplicates: results.filter((r) => r.status === "DUPLICATE").length,
      results: results.map((r) => ({
        eventId: r.eventId,
        ingested: r.status === "PROCESSED",
        duplicate: r.status === "DUPLICATE",
        classification: r.classification ? {
          classification: r.classification.classification,
          intent_score: r.classification.intent_score,
          lead_score: r.classification.lead_score,
          recommended_action: r.classification.recommended_action,
        } : null,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
