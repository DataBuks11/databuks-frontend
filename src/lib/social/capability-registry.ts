import type { SupabaseClient } from "@supabase/supabase-js";
import type { CapabilityStatus, SocialCapabilities } from "./capabilities";
import { getCapabilitiesForConnection, getWhatsAppCapabilities } from "./capabilities";

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
const COMPOSIO_BASE = "https://backend.composio.dev";

export interface PlatformCapabilityRecord {
  platform: string;
  account_id: string | null;
  provider: string;
  connected: boolean;
  capability_status: CapabilityStatus;
  capabilities: SocialCapabilities;
  last_verified_at: string | null;
  verified_capabilities: Record<string, any>;
}

/**
 * Sync platform capabilities to the database for a given platform.
 * Reads actual connection state and writes the resolved capabilities.
 */
export async function syncPlatformCapabilities(
  supabase: SupabaseClient,
  userId: string,
  platform: string
): Promise<PlatformCapabilityRecord> {
  const capabilities = await resolveCapabilities(supabase, userId, platform);

  const record = {
    user_id: userId,
    platform,
    account_id: capabilities.account_id,
    provider: capabilities.account_type === "baileys_session" ? "baileys" : "composio",
    connected: capabilities.token_status === "valid",
    can_read_posts: capabilities.can_read_posts,
    can_read_comments: capabilities.can_read_comments,
    can_read_media: capabilities.can_read_media,
    can_search_discovery: capabilities.can_search_discovery,
    can_read_messages: capabilities.can_read_messages,
    can_send_messages: capabilities.can_send_messages,
    can_reply_comments: capabilities.can_reply_comments,
    can_publish_posts: capabilities.can_publish,
    can_like: capabilities.can_react,
    can_follow: capabilities.can_follow,
    capability_status: capabilities.capability_status,
    verified_capabilities: { permissions: capabilities.permissions },
    last_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Upsert by (user_id, platform)
  const { data: existing } = await supabase
    .from("platform_capabilities")
    .select("id")
    .eq("user_id", userId)
    .eq("platform", platform)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("platform_capabilities")
      .update(record)
      .eq("id", existing.id);
  } else {
    await supabase
      .from("platform_capabilities")
      .insert(record);
  }

  return {
    platform,
    account_id: capabilities.account_id,
    provider: record.provider,
    connected: record.connected,
    capability_status: capabilities.capability_status,
    capabilities,
    last_verified_at: record.last_verified_at,
    verified_capabilities: record.verified_capabilities,
  };
}

/**
 * Get verified capabilities from DB, falling back to static defaults.
 */
export async function getVerifiedCapabilities(
  supabase: SupabaseClient,
  userId: string,
  platform: string
): Promise<PlatformCapabilityRecord> {
  const { data } = await supabase
    .from("platform_capabilities")
    .select("*")
    .eq("user_id", userId)
    .eq("platform", platform)
    .maybeSingle();

  if (data) {
    const capabilities = await resolveCapabilities(supabase, userId, platform);
    return {
      platform: data.platform,
      account_id: data.account_id,
      provider: data.provider,
      connected: data.connected,
      capability_status: data.capability_status,
      capabilities,
      last_verified_at: data.last_verified_at,
      verified_capabilities: data.verified_capabilities ?? {},
    };
  }

  // No DB record — resolve from connection state and return without persisting
  const capabilities = await resolveCapabilities(supabase, userId, platform);
  return {
    platform,
    account_id: capabilities.account_id,
    provider: capabilities.account_type === "baileys_session" ? "baileys" : "composio",
    connected: capabilities.token_status === "valid",
    capability_status: capabilities.capability_status,
    capabilities,
    last_verified_at: null,
    verified_capabilities: {},
  };
}

/**
 * Resolve capabilities for a platform from connection state.
 */
async function resolveCapabilities(
  supabase: SupabaseClient,
  userId: string,
  platform: string
): Promise<SocialCapabilities> {
  if (platform === "whatsapp") {
    const { data: waSession } = await supabase
      .from("whatsapp_sessions")
      .select("connected, phone_number")
      .eq("user_id", userId)
      .maybeSingle();
    return getWhatsAppCapabilities(
      waSession?.connected === true,
      waSession?.phone_number ?? null
    );
  }

  const { data: connection } = await supabase
    .from("social_connections")
    .select("platform, status, connection_id")
    .eq("user_id", userId)
    .eq("platform", platform)
    .eq("status", "connected")
    .maybeSingle();

  if (!connection) {
    return getCapabilitiesForConnection({
      platform,
      status: "disconnected",
      connection_id: null,
    });
  }

  const base = getCapabilitiesForConnection({
    platform: connection.platform,
    status: connection.status,
    connection_id: connection.connection_id,
  });

  // For LinkedIn, dynamically verify capabilities when connected
  if (platform === "linkedin" && connection.status === "connected" && connection.connection_id) {
    return verifyLinkedInCapabilities(base, connection.connection_id);
  }

  return base;
}

/**
 * Dynamically inspect LinkedIn toolkit capabilities from Composio.
 * Only marks capabilities as available if the actual tools exist.
 */
async function verifyLinkedInCapabilities(
  base: SocialCapabilities,
  connectedAccountId: string
): Promise<SocialCapabilities> {
  if (!COMPOSIO_API_KEY) {
    return { ...base, capability_status: "SUPPORTED_BUT_NOT_VERIFIED" };
  }

  try {
    // Query Composio for available LinkedIn tools for this connected account
    const response = await fetch(
      `${COMPOSIO_BASE}/api/v3.1/tools?toolkit=linkedin&connected_account_id=${encodeURIComponent(connectedAccountId)}`,
      { headers: { "x-api-key": COMPOSIO_API_KEY } }
    );
    if (!response.ok) {
      return { ...base, capability_status: "SUPPORTED_BUT_NOT_VERIFIED" };
    }
    const data = await response.json();
    const tools = Array.isArray(data?.items) ? data.items : Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    const toolSlugs = new Set(tools.map((t: any) => (t?.slug ?? t?.name ?? "").toUpperCase()));

    // Map known LinkedIn tool slugs to capabilities
    const verified: SocialCapabilities = {
      ...base,
      can_read_posts: toolSlugs.has("LINKEDIN_GET_USER_POSTS") || toolSlugs.has("LINKEDIN_LIST_POSTS"),
      can_publish: toolSlugs.has("LINKEDIN_CREATE_POST") || toolSlugs.has("LINKEDIN_PUBLISH_POST"),
      can_read_comments: toolSlugs.has("LINKEDIN_GET_COMMENTS") || toolSlugs.has("LINKEDIN_LIST_COMMENTS"),
      can_reply_comments: toolSlugs.has("LINKEDIN_CREATE_COMMENT") || toolSlugs.has("LINKEDIN_REPLY_COMMENT"),
      can_read_messages: toolSlugs.has("LINKEDIN_GET_MESSAGES") || toolSlugs.has("LINKEDIN_LIST_MESSAGES"),
      can_send_messages: toolSlugs.has("LINKEDIN_SEND_MESSAGE"),
      can_search_discovery: toolSlugs.has("LINKEDIN_SEARCH_POSTS") || toolSlugs.has("LINKEDIN_SEARCH"),
      can_read_media: false,
      capability_status: "AVAILABLE",
      permissions: Array.from(toolSlugs) as string[],
    };

    return verified;
  } catch {
    return { ...base, capability_status: "SUPPORTED_BUT_NOT_VERIFIED" };
  }
}

/**
 * Get all platform capability summaries for a user.
 */
export async function getAllPlatformCapabilities(
  supabase: SupabaseClient,
  userId: string
): Promise<PlatformCapabilityRecord[]> {
  const platforms = ["instagram", "facebook", "linkedin", "whatsapp", "email"];
  const results: PlatformCapabilityRecord[] = [];

  for (const platform of platforms) {
    const cap = await getVerifiedCapabilities(supabase, userId, platform);
    results.push(cap);
  }

  return results;
}
