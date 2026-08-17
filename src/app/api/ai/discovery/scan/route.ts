import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/ai/discovery/scan — Trigger a discovery scan cycle for connected platforms
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const platforms: string[] = Array.isArray(body.platforms)
      ? body.platforms
      : ["instagram", "facebook", "linkedin"];

    const { getAllPlatformCapabilities } = await import("@/lib/social/capability-registry");
    const { processDiscoveredSignal } = await import("@/lib/discovery/pipeline");
    const { getAdapterForProvider } = await import("@/lib/social/adapters/registry");

    const allCapabilities = await getAllPlatformCapabilities(supabase, user.id);
    const results: Record<string, any> = {};

    for (const platform of platforms) {
      const cap = allCapabilities.find((c) => c.platform === platform);
      if (!cap || !cap.connected || cap.capability_status === "UNAVAILABLE") {
        results[platform] = {
          status: "skipped",
          reason: !cap ? "no_capability_record" : !cap.connected ? "not_connected" : "unavailable",
          capability_status: cap?.capability_status ?? "UNAVAILABLE",
        };
        continue;
      }

      // Only sync if the platform supports reading posts
      if (!cap.capabilities.can_read_posts && !cap.capabilities.can_read_comments) {
        results[platform] = {
          status: "skipped",
          reason: "no_read_capability",
          capability_status: cap.capability_status,
        };
        continue;
      }

      try {
        const adapter = getAdapterForProvider(platform);
        if (!adapter) {
          results[platform] = { status: "skipped", reason: "no_adapter", capability_status: cap.capability_status };
          continue;
        }
        const events = await adapter.syncRecentEvents(
          cap.account_id ?? "",
          undefined,
          10
        );

        let processed = 0;
        let ignored = 0;
        let duplicates = 0;

        for (const event of events) {
          if (!event.content) {
            ignored++;
            continue;
          }

          const result = await processDiscoveredSignal(supabase, user.id, {
            source_platform: platform as any,
            source_url: event.url ?? null,
            source_content: event.content,
            source_content_type: event.event_type === "post" ? "post" : "comment",
            external_author_id: event.author_id ?? null,
            author_name: event.author_name ?? null,
            author_handle: null,
            author_profile_url: null,
            parent_content: null,
            timestamp: event.timestamp ?? null,
            metadata: { raw: event.raw_reference },
            idempotency_key: `scan:${platform}:${event.external_event_id}`,
          });

          if (result.status === "CREATED") processed++;
          else if (result.status === "DUPLICATE") duplicates++;
          else ignored++;
        }

        results[platform] = {
          status: "completed",
          events_found: events.length,
          processed,
          duplicates,
          ignored,
          capability_status: cap.capability_status,
        };
      } catch (err: any) {
        results[platform] = {
          status: "error",
          error: err.message,
          capability_status: cap.capability_status,
        };
      }
    }

    return NextResponse.json({ scan_results: results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
