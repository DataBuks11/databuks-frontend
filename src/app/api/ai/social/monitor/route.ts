import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdapterForProvider } from "@/lib/social/adapters/registry";
import { processSocialEvent } from "@/lib/social/processor";

export const maxDuration = 120;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin credentials are not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!cronSecret && auth !== `Bearer ${process.env.CRAWLER_SERVICE_KEY || process.env.BAILEYS_API_KEY || "dev-key"}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, note: "Use POST for monitoring runs" });
}

export async function POST(request: NextRequest) {
  const expectedKey =
    process.env.CRAWLER_SERVICE_KEY || process.env.BAILEYS_API_KEY || "dev-key";
  const providedKey =
    request.headers.get("x-api-key") ??
    (request.headers.get("authorization")?.startsWith("Bearer ")
      ? request.headers.get("authorization")?.slice(7)
      : null);
  if (providedKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = adminClient();
  const { data: connections, error: connError } = await supabase
    .from("social_connections")
    .select("user_id, platform, connection_id")
    .eq("status", "connected")
    .eq("platform", "instagram");

  if (connError) {
    return NextResponse.json({ error: connError.message }, { status: 500 });
  }

  let pulled = 0;
  let processed = 0;
  let duplicates = 0;
  let proposed = 0;
  const errors: string[] = [];
  let discoveryBridged = 0;
  let discoveryModule: any = null;
  try {
    discoveryModule = await import("@/lib/discovery/pipeline");
  } catch { /* discovery module not available — skip bridge */ }

  for (const connection of connections ?? []) {
    const adapter = getAdapterForProvider(connection.platform);
    if (!adapter || !connection.connection_id) continue;
    try {
      const events = await adapter.syncRecentEvents(connection.connection_id, connection.user_id, 10);
      pulled += events.length;
      for (const event of events) {
        const result = await processSocialEvent(supabase, connection.user_id, event);
        if (result.status === "PROCESSED") processed += 1;
        if (result.status === "DUPLICATE") duplicates += 1;
        if (result.actionId) proposed += 1;

        // Bridge: if classification shows genuine intent, also feed into discovery pipeline
        if (
          discoveryModule &&
          result.status === "PROCESSED" &&
          result.classification &&
          (result.classification.intent_score ?? 0) >= 40 &&
          event.content &&
          event.content.trim().length > 0
        ) {
          try {
            await discoveryModule.processDiscoveredSignal(supabase, connection.user_id, {
              source_platform: connection.platform,
              source_url: event.url ?? null,
              source_content: event.content,
              source_content_type: event.event_type === "post" ? "post" : event.event_type === "message" ? "message" : "comment",
              external_author_id: event.author_id ?? null,
              author_name: event.author_name ?? null,
              author_handle: null,
              author_profile_url: null,
              parent_content: null,
              timestamp: event.timestamp ?? null,
              metadata: { source: "monitor_bridge", classification: result.classification },
              idempotency_key: `bridge:${connection.platform}:${event.external_event_id}`,
            });
            discoveryBridged++;
          } catch {
            // Discovery bridge failure should not break the existing monitor
          }
        }
      }
      await supabase
        .from("social_connections")
        .update({ last_sync: new Date().toISOString() })
        .eq("user_id", connection.user_id)
        .eq("connection_id", connection.connection_id);
    } catch (error: any) {
      errors.push(`${connection.platform}:${error?.message}`);
    }
  }

  return NextResponse.json({ pulled, processed, duplicates, proposed, discovery_bridged: discoveryBridged, errors });
}
