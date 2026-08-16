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
  permissions: string[];
  token_status: "unknown" | "valid" | "expired";
}

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
  permissions: [],
  token_status: "unknown",
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
        permissions: ["read_posts", "publish", "read_comments", "reply_comments", "read_messages", "send_messages"],
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
        permissions: ["read_posts", "publish", "read_comments", "reply_comments"],
      };
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
    default:
      return false;
  }
}
