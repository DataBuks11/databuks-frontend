export type CapabilityStatus =
  | "AVAILABLE"
  | "SUPPORTED_BUT_NOT_CONNECTED"
  | "SUPPORTED_BUT_NOT_VERIFIED"
  | "UNAVAILABLE";

export interface SocialCapabilities {
  provider: string;
  account_id: string | null;
  account_type: string;
  can_read_posts: boolean;
  can_publish: boolean;
  can_read_comments: boolean;
  can_reply_comments: boolean;
  can_read_messages: boolean;
  can_send_messages: boolean;
  can_react: boolean;
  can_follow: boolean;
  can_unfollow: boolean;
  can_read_followers: boolean;
  can_read_engagement: boolean;
  can_schedule: boolean;
  can_search_discovery: boolean;
  can_read_media: boolean;
  permissions: string[];
  token_status: "unknown" | "valid" | "expired";
  capability_status: CapabilityStatus;
}

export const ACTION_UNAVAILABLE_RESULT = {
  success: false,
  providerResponse: {},
  errorCode: "ACTION_UNAVAILABLE" as const,
  errorMessage: "This capability is not available for the current connection.",
};

export const DISCOVERY_UNAVAILABLE_RESULT = {
  success: false,
  providerResponse: {},
  errorCode: "DISCOVERY_UNAVAILABLE" as const,
  errorMessage: "Discovery is not supported by this provider connection.",
};

const EMPTY: SocialCapabilities = {
  provider: "",
  account_id: null,
  account_type: "unknown",
  can_read_posts: false,
  can_publish: false,
  can_read_comments: false,
  can_reply_comments: false,
  can_read_messages: false,
  can_send_messages: false,
  can_react: false,
  can_follow: false,
  can_unfollow: false,
  can_read_followers: false,
  can_read_engagement: false,
  can_schedule: false,
  can_search_discovery: false,
  can_read_media: false,
  permissions: [],
  token_status: "unknown",
  capability_status: "UNAVAILABLE",
};

export function getCapabilitiesForConnection(connection: {
  platform: string;
  status: string;
  connection_id?: string | null;
}): SocialCapabilities {
  const base: SocialCapabilities = {
    ...EMPTY,
    provider: connection.platform,
    account_id: connection.connection_id ?? null,
    account_type: connection.connection_id ? "composio_oauth" : "unknown",
    token_status: connection.status === "connected" ? "valid" : "expired",
  };

  const isConnected = connection.status === "connected" && !!connection.connection_id;

  switch (connection.platform) {
    case "instagram":
      return {
        ...base,
        can_read_posts: true,
        can_publish: true,
        can_read_comments: true,
        can_reply_comments: true,
        can_read_messages: true,
        can_send_messages: true,
        can_react: false,
        can_follow: false,
        can_unfollow: false,
        can_read_followers: false,
        can_read_engagement: false,
        can_schedule: false,
        can_search_discovery: false,
        can_read_media: true,
        permissions: ["read_posts", "publish", "read_comments", "reply_comments", "read_messages", "send_messages", "read_media"],
        capability_status: isConnected ? "AVAILABLE" : "SUPPORTED_BUT_NOT_CONNECTED",
      };
    case "facebook":
      return {
        ...base,
        can_read_posts: true,
        can_publish: true,
        can_read_comments: true,
        can_reply_comments: true,
        can_read_messages: false,
        can_send_messages: false,
        can_react: false,
        can_follow: false,
        can_unfollow: false,
        can_read_followers: false,
        can_read_engagement: false,
        can_schedule: false,
        can_search_discovery: false,
        can_read_media: false,
        permissions: ["read_posts", "publish", "read_comments", "reply_comments"],
        capability_status: isConnected ? "AVAILABLE" : "SUPPORTED_BUT_NOT_CONNECTED",
      };
    case "linkedin": {
      // LinkedIn toolkit is available in Composio but capabilities are
      // dynamically detected only after an account is actually connected.
      // All capabilities default to false until verified.
      const linkedinStatus: CapabilityStatus = isConnected
        ? "SUPPORTED_BUT_NOT_VERIFIED"
        : "SUPPORTED_BUT_NOT_CONNECTED";
      return {
        ...base,
        can_read_posts: false,
        can_publish: false,
        can_read_comments: false,
        can_reply_comments: false,
        can_read_messages: false,
        can_send_messages: false,
        can_react: false,
        can_follow: false,
        can_unfollow: false,
        can_read_followers: false,
        can_read_engagement: false,
        can_schedule: false,
        can_search_discovery: false,
        can_read_media: false,
        permissions: [],
        capability_status: linkedinStatus,
      };
    }
    default:
      return base;
  }
}

export function getWhatsAppCapabilities(connected: boolean, phone: string | null): SocialCapabilities {
  return {
    ...EMPTY,
    provider: "whatsapp",
    account_id: phone,
    account_type: "baileys_session",
    can_read_messages: connected,
    can_send_messages: connected,
    token_status: connected ? "valid" : "expired",
    permissions: connected ? ["read_messages", "send_messages"] : [],
    capability_status: connected ? "AVAILABLE" : "SUPPORTED_BUT_NOT_CONNECTED",
  };
}

export function capabilitySupports(
  capabilities: SocialCapabilities,
  actionType: string
): boolean {
  switch (actionType) {
    case "PUBLISH":
    case "PUBLISH_POST":
      return capabilities.can_publish;
    case "COMMENT_REPLY":
      return capabilities.can_reply_comments;
    case "READ_COMMENTS":
      return capabilities.can_read_comments;
    case "READ_POSTS":
      return capabilities.can_read_posts;
    case "SEND_MESSAGE":
      return capabilities.can_send_messages;
    case "READ_MESSAGES":
      return capabilities.can_read_messages;
    case "LIKE":
    case "REACT":
      return capabilities.can_react;
    case "FOLLOW":
      return capabilities.can_follow;
    case "UNFOLLOW":
      return capabilities.can_unfollow;
    case "SEARCH_DISCOVERY":
      return capabilities.can_search_discovery;
    case "READ_MEDIA":
      return capabilities.can_read_media;
    default:
      return false;
  }
}
