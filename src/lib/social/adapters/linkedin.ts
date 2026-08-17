import type { SocialEventInput, SocialProviderAdapter } from "./types";

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
const COMPOSIO_BASE = "https://backend.composio.dev";

// Cache of discovered LinkedIn tool slugs per connected account
const toolCache = new Map<string, { tools: Set<string>; at: number }>();
const TOOL_CACHE_TTL = 300_000; // 5 minutes

/**
 * Discover which LinkedIn tools are available for a connected account.
 * Returns an empty set if the account is not connected or tools can't be fetched.
 */
async function discoverLinkedInTools(connectedAccountId: string): Promise<Set<string>> {
  // Check cache first
  const cached = toolCache.get(connectedAccountId);
  if (cached && Date.now() - cached.at < TOOL_CACHE_TTL) {
    return cached.tools;
  }

  if (!COMPOSIO_API_KEY) return new Set();

  try {
    const response = await fetch(
      `${COMPOSIO_BASE}/api/v3.1/tools?toolkit=linkedin&connected_account_id=${encodeURIComponent(connectedAccountId)}`,
      { headers: { "x-api-key": COMPOSIO_API_KEY } }
    );
    if (!response.ok) return new Set();
    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    const tools = new Set<string>(items.map((t: any) => String(t?.slug ?? t?.name ?? "").toUpperCase()));
    toolCache.set(connectedAccountId, { tools, at: Date.now() });
    return tools;
  } catch {
    return new Set();
  }
}

/**
 * Execute a Composio tool for LinkedIn.
 */
async function composioLinkedInExecute(
  toolSlug: string,
  connectedAccountId: string,
  entityId: string,
  instruction: string
): Promise<{ ok: boolean; data: any }> {
  if (!COMPOSIO_API_KEY) {
    return { ok: false, data: { error: "COMPOSIO_API_KEY not configured" } };
  }
  try {
    const response = await fetch(`${COMPOSIO_BASE}/api/v3.1/tools/execute/${toolSlug}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": COMPOSIO_API_KEY,
      },
      body: JSON.stringify({
        connected_account_id: connectedAccountId,
        entity_id: entityId,
        text: instruction,
      }),
    });
    let data: any = null;
    try { data = await response.json(); } catch { data = null; }
    return { ok: response.ok, data };
  } catch (error: any) {
    return { ok: false, data: { error: error?.message ?? "network error" } };
  }
}

export const linkedinAdapter: SocialProviderAdapter = {
  provider: "linkedin",

  async getAccountInfo(accountId: string) {
    if (!COMPOSIO_API_KEY) {
      return { valid: false, status: "toolkit_available_account_not_connected", accountId };
    }
    try {
      const response = await fetch(
        `${COMPOSIO_BASE}/api/v3.1/connected_accounts?user_id=${encodeURIComponent(accountId)}`,
        { headers: { "x-api-key": COMPOSIO_API_KEY } }
      );
      if (!response.ok) {
        return { valid: false, status: "toolkit_available_account_not_connected", accountId };
      }
      const data = await response.json();
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      const active = items.find(
        (a: any) => a?.status === "ACTIVE" && a?.toolkit?.slug === "linkedin"
      );
      if (!active) {
        return { valid: false, status: "toolkit_available_account_not_connected", accountId };
      }

      // Discover available tools for this connection
      const tools = await discoverLinkedInTools(active.id);

      return {
        valid: true,
        status: "active",
        accountId: active.id,
        available_tools: Array.from(tools),
        tool_count: tools.size,
      } as any;
    } catch {
      return { valid: false, status: "toolkit_available_account_not_connected", accountId };
    }
  },

  async syncRecentEvents(accountId: string, entityId?: string, limit?: number): Promise<SocialEventInput[]> {
    // Only attempt if we have a connected account
    const tools = await discoverLinkedInTools(accountId);
    const readPostsTool = findTool(tools, ["LINKEDIN_GET_USER_POSTS", "LINKEDIN_LIST_POSTS", "LINKEDIN_GET_FEED"]);

    if (!readPostsTool) {
      // Cannot sync — tool not available
      return [];
    }

    try {
      const res = await composioLinkedInExecute(
        readPostsTool,
        accountId,
        entityId ?? "databuks-workspace",
        `List my most recent LinkedIn posts (limit ${limit ?? 10})`
      );

      if (!res.ok) return [];
      const successful = res.data?.successful ?? res.data?.data?.successful;
      if (successful !== true) return [];

      const posts = res.data?.data ?? [];
      const postList = Array.isArray(posts) ? posts : Array.isArray(posts?.data) ? posts.data : [];
      const events: SocialEventInput[] = [];

      for (const post of postList.slice(0, limit ?? 10)) {
        const postId = post?.id ?? post?.post_id ?? null;
        if (!postId) continue;
        events.push({
          provider: "linkedin",
          account_id: accountId,
          external_event_id: `li-post-${postId}`,
          event_type: "post",
          author_id: post?.author?.id ?? null,
          author_name: post?.author?.name ?? null,
          post_id: postId,
          content: post?.text ?? post?.content ?? null,
          url: post?.url ?? post?.permalink ?? null,
          timestamp: post?.created_at ?? post?.timestamp ?? null,
          raw_reference: post,
        });
      }

      return events;
    } catch {
      return [];
    }
  },

  async executeAction(action) {
    // Discover available tools
    const tools = await discoverLinkedInTools(action.accountId);
    if (tools.size === 0) {
      return {
        success: false,
        providerResponse: {},
        errorCode: "ACTION_UNAVAILABLE",
        errorMessage: "LinkedIn account is not connected or no tools are available. Connect an account to enable LinkedIn actions.",
      };
    }

    // Map action types to tool slugs
    let toolSlug: string | null = null;
    let instruction: string;

    switch (action.actionType) {
      case "PUBLISH":
      case "PUBLISH_POST":
        toolSlug = findTool(tools, ["LINKEDIN_CREATE_POST", "LINKEDIN_PUBLISH_POST"]);
        instruction = `Create a LinkedIn post: "${action.content ?? ""}"`;
        break;
      case "COMMENT_REPLY":
      case "CREATE_COMMENT":
        toolSlug = findTool(tools, ["LINKEDIN_CREATE_COMMENT", "LINKEDIN_REPLY_COMMENT"]);
        instruction = `Reply to LinkedIn comment ${action.targetId ?? ""}: "${action.content ?? ""}"`;
        break;
      case "SEND_MESSAGE":
        toolSlug = findTool(tools, ["LINKEDIN_SEND_MESSAGE"]);
        instruction = `Send a LinkedIn message to ${action.targetId ?? ""}: "${action.content ?? ""}"`;
        break;
      case "READ_POSTS":
        toolSlug = findTool(tools, ["LINKEDIN_GET_USER_POSTS", "LINKEDIN_LIST_POSTS"]);
        instruction = "List my recent LinkedIn posts";
        break;
      case "READ_COMMENTS":
        toolSlug = findTool(tools, ["LINKEDIN_GET_COMMENTS", "LINKEDIN_LIST_COMMENTS"]);
        instruction = `Get comments on LinkedIn post ${action.targetId ?? ""}`;
        break;
      default:
        instruction = action.content ?? "Execute the requested action";
    }

    if (!toolSlug) {
      return {
        success: false,
        providerResponse: { available_tools: Array.from(tools) },
        errorCode: "ACTION_UNAVAILABLE",
        errorMessage: `LinkedIn does not support ${action.actionType}. Available tools: ${Array.from(tools).join(", ")}`,
      };
    }

    const res = await composioLinkedInExecute(
      toolSlug,
      action.accountId,
      action.entityId ?? "databuks-workspace",
      instruction
    );

    if (!res.ok) {
      return {
        success: false,
        providerResponse: res.data ?? {},
        errorCode: `COMPOSIO_HTTP_ERROR`,
        errorMessage: res.data?.error?.message ?? "LinkedIn action failed",
      };
    }

    const successful = res.data?.successful ?? res.data?.data?.successful;
    if (successful !== true) {
      return {
        success: false,
        providerResponse: res.data ?? {},
        errorCode: "PROVIDER_ERROR",
        errorMessage: res.data?.error?.message ?? "LinkedIn provider rejected the action",
      };
    }

    return {
      success: true,
      providerResponse: res.data?.data ?? res.data ?? {},
    };
  },
};

/**
 * Find the first matching tool slug from a priority-ordered list.
 */
function findTool(availableTools: Set<string>, candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (availableTools.has(candidate)) return candidate;
  }
  return null;
}

