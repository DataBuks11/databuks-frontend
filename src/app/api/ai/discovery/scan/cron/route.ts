import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 120;

/**
 * GET /api/ai/discovery/scan/cron — Vercel Cron handler for periodic discovery scanning.
 * Iterates all users with connected social accounts, runs the discovery scan pipeline.
 * Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  // Auth: Vercel Cron sends CRON_SECRET as Bearer token
  const cronSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!cronSecret) {
    const fallbackKey = process.env.CRAWLER_SERVICE_KEY || process.env.BAILEYS_API_KEY || "dev-key";
    if (auth !== `Bearer ${fallbackKey}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Find all users with at least one connected social account
  const { data: connections, error: connError } = await supabase
    .from("social_connections")
    .select("user_id, platform, connection_id")
    .eq("status", "connected");

  if (connError) {
    return NextResponse.json({ error: connError.message }, { status: 500 });
  }

  // Deduplicate by user_id — one scan per user
  const userMap = new Map<string, { user_id: string; platforms: string[] }>();
  for (const conn of connections ?? []) {
    if (!conn.user_id || !conn.connection_id) continue;
    const existing = userMap.get(conn.user_id);
    if (existing) {
      if (!existing.platforms.includes(conn.platform)) {
        existing.platforms.push(conn.platform);
      }
    } else {
      userMap.set(conn.user_id, { user_id: conn.user_id, platforms: [conn.platform] });
    }
  }

  // Also include WhatsApp sessions
  const { data: waSessions } = await supabase
    .from("whatsapp_sessions")
    .select("user_id, connected")
    .eq("connected", true);

  for (const session of waSessions ?? []) {
    if (!session.user_id) continue;
    const existing = userMap.get(session.user_id);
    if (existing) {
      if (!existing.platforms.includes("whatsapp")) {
        existing.platforms.push("whatsapp");
      }
    } else {
      userMap.set(session.user_id, { user_id: session.user_id, platforms: ["whatsapp"] });
    }
  }

  const { getAllPlatformCapabilities } = await import("@/lib/social/capability-registry");
  const { processDiscoveredSignal } = await import("@/lib/discovery/pipeline");
  const { getAdapterForProvider } = await import("@/lib/social/adapters/registry");

  const scanResults: Record<string, any> = {};
  let totalProcessed = 0;
  let totalIgnored = 0;
  let totalDuplicates = 0;
  let totalErrors = 0;

  for (const [userId, userInfo] of userMap) {
    const userResults: Record<string, any> = {};

    // Rate limit: check last scan time
    const { data: lastScan } = await supabase
      .from("platform_capabilities")
      .select("last_verified_at")
      .eq("user_id", userId)
      .order("last_verified_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastScan?.last_verified_at) {
      const lastScanTime = new Date(lastScan.last_verified_at).getTime();
      const hoursSince = (Date.now() - lastScanTime) / (1000 * 60 * 60);
      if (hoursSince < 5) {
        scanResults[userId] = { status: "rate_limited", hours_since_last: Math.round(hoursSince * 10) / 10 };
        continue;
      }
    }

    const capabilities = await getAllPlatformCapabilities(supabase, userId);

    for (const platform of userInfo.platforms) {
      const cap = capabilities.find((c) => c.platform === platform);

      // Skip platforms that aren't connected or lack read capabilities
      if (!cap || !cap.connected || cap.capability_status === "UNAVAILABLE") {
        userResults[platform] = {
          status: "skipped",
          reason: !cap ? "no_capability" : !cap.connected ? "not_connected" : "unavailable",
        };
        continue;
      }

      if (!cap.capabilities.can_read_posts && !cap.capabilities.can_read_comments && !cap.capabilities.can_read_messages) {
        userResults[platform] = { status: "skipped", reason: "no_read_capability" };
        continue;
      }

      const adapter = getAdapterForProvider(platform);
      if (!adapter) {
        userResults[platform] = { status: "skipped", reason: "no_adapter" };
        continue;
      }

      try {
        const events = await adapter.syncRecentEvents(cap.account_id ?? "", undefined, 10);

        let processed = 0;
        let ignored = 0;
        let duplicates = 0;

        for (const event of events) {
          // Skip group messages for WhatsApp
          if (platform === "whatsapp" && event.author_id?.endsWith("@g.us")) {
            ignored++;
            continue;
          }

          if (!event.content || event.content.trim().length === 0) {
            ignored++;
            continue;
          }

          try {
            const result = await processDiscoveredSignal(supabase, userId, {
              source_platform: platform as any,
              source_url: event.url ?? null,
              source_content: event.content,
              source_content_type: event.event_type === "post" ? "post" : event.event_type === "message" ? "message" : "comment",
              external_author_id: event.author_id ?? null,
              author_name: event.author_name ?? null,
              author_handle: null,
              author_profile_url: null,
              parent_content: null,
              timestamp: event.timestamp ?? null,
              metadata: { source: "cron_scan", raw_event_id: event.external_event_id },
              idempotency_key: `cron:${platform}:${event.external_event_id}`,
            });

            if (result.status === "CREATED") processed++;
            else if (result.status === "DUPLICATE") duplicates++;
            else ignored++;
          } catch {
            totalErrors++;
            ignored++;
          }
        }

        totalProcessed += processed;
        totalIgnored += ignored;
        totalDuplicates += duplicates;

        userResults[platform] = {
          status: "completed",
          events_found: events.length,
          processed,
          duplicates,
          ignored,
        };
      } catch (err: any) {
        totalErrors++;
        userResults[platform] = { status: "error", error: err.message };
      }
    }

    scanResults[userId] = userResults;
  }

  return NextResponse.json({
    scan_type: "cron",
    users_scanned: userMap.size,
    total_processed: totalProcessed,
    total_ignored: totalIgnored,
    total_duplicates: totalDuplicates,
    total_errors: totalErrors,
    results: scanResults,
  });
}
