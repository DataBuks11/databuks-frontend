import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoveryAvailability, DiscoveryResult, OpportunityInput } from "./types";

export interface ChannelDiscoverySource {
  channel: "INSTAGRAM" | "FACEBOOK" | "LINKEDIN" | "WHATSAPP" | "EMAIL";
  connected: boolean;
  externalDiscoverySupported: boolean;
  reason: string;
}

export async function getDiscoveryAvailability(
  supabase: SupabaseClient,
  userId: string
): Promise<DiscoveryAvailability[]> {
  const { data: connections } = await supabase
    .from("social_connections")
    .select("platform, status, connection_id")
    .eq("user_id", userId);

  const byPlatform: Record<string, { connected: boolean; accountId: string | null }> = {};
  for (const connection of connections ?? []) {
    if (connection.status === "connected" && connection.connection_id) {
      byPlatform[connection.platform] = { connected: true, accountId: connection.connection_id };
    } else if (!byPlatform[connection.platform]) {
      byPlatform[connection.platform] = { connected: false, accountId: null };
    }
  }

  const { data: waSession } = await supabase
    .from("whatsapp_sessions")
    .select("connected")
    .eq("user_id", userId)
    .maybeSingle();

  const availability: DiscoveryAvailability[] = [];

  availability.push({
    channel: "INSTAGRAM",
    connected: byPlatform.instagram?.connected === true,
    discovery_supported: false,
    reason: byPlatform.instagram?.connected
      ? "Connected. Own-account comments/DMs supported; external public-content discovery not exposed by provider"
      : "No connected account",
  });

  availability.push({
    channel: "FACEBOOK",
    connected: byPlatform.facebook?.connected === true,
    discovery_supported: false,
    reason: byPlatform.facebook?.connected
      ? "Connected. Own-account activity supported; external page/group discovery not verified"
      : "No connected account",
  });

  availability.push({
    channel: "LINKEDIN",
    connected: byPlatform.linkedin?.connected === true,
    discovery_supported: false,
    reason: byPlatform.linkedin?.connected
      ? "Connected. Capabilities must be dynamically verified before discovery"
      : "Toolkit available in Composio, account not connected yet",
  });

  availability.push({
    channel: "WHATSAPP",
    connected: waSession?.connected === true,
    discovery_supported: false,
    reason: waSession?.connected === true
      ? "Connected. Inbound 1:1 pipeline active (no unsolicited outreach)"
      : "Session not connected",
  });

  availability.push({
    channel: "EMAIL",
    connected: false,
    discovery_supported: false,
    reason: "No email provider connected",
  });

  return availability;
}

export async function runDiscovery(
  supabase: SupabaseClient,
  userId: string
): Promise<DiscoveryResult> {
  const availability = await getDiscoveryAvailability(supabase, userId);
  const opportunities: OpportunityInput[] = [];

  for (const channel of availability) {
    if (!channel.connected || !channel.discovery_supported) continue;
    switch (channel.channel) {
      case "INSTAGRAM": {
        const { data: connection } = await supabase
          .from("social_connections")
          .select("connection_id")
          .eq("user_id", userId)
          .eq("platform", "instagram")
          .eq("status", "connected")
          .limit(1)
          .maybeSingle();
        if (connection?.connection_id) {
          try {
            const { getAdapterForProvider } = await import("../social/adapters/registry");
            const adapter = getAdapterForProvider("instagram");
            if (adapter) {
              const events = await adapter.syncRecentEvents(connection.connection_id, userId, 10);
              for (const event of events) {
                opportunities.push({
                  source: "INBOUND",
                  channel: "INSTAGRAM",
                  event_type: (event.event_type as any) ?? "COMMENT",
                  external_event_id: event.external_event_id,
                  actor_id: event.author_id ?? null,
                  actor_name: event.author_name ?? null,
                  content: event.content ?? null,
                  source_url: event.url ?? null,
                  timestamp: event.timestamp ?? null,
                  metadata: event.raw_reference ?? {},
                  idempotencyKey: `opportunity:instagram:${event.external_event_id}`,
                });
              }
            }
          } catch {}
        }
        break;
      }
      default:
        break;
    }
  }

  return { availability, opportunities };
}
