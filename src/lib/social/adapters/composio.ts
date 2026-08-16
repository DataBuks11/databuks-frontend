import type { SocialEventInput, SocialProviderAdapter } from "./types";

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
const COMPOSIO_BASE = "https://backend.composio.dev";

interface ComposioResponse {
  ok: boolean;
  status: number;
  data: any;
}

async function composioRequest(path: string, method: "GET" | "POST", body?: Record<string, any>): Promise<ComposioResponse> {
  if (!COMPOSIO_API_KEY) {
    return { ok: false, status: 0, data: { error: "COMPOSIO_API_KEY not configured" } };
  }
  try {
    const response = await fetch(`${COMPOSIO_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": COMPOSIO_API_KEY,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let data: any = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error: any) {
    return { ok: false, status: 0, data: { error: error?.message ?? "network error" } };
  }
}

const ACTION_NAMES: Record<string, string> = {
  READ_POSTS: "INSTAGRAM_LIST_POSTS",
  READ_COMMENTS: "INSTAGRAM_GET_COMMENTS",
  COMMENT_REPLY: "INSTAGRAM_REPLY_COMMENT",
  CREATE_COMMENT: "INSTAGRAM_CREATE_COMMENT",
  PUBLISH: "INSTAGRAM_CREATE_MEDIA_POST",
  SEND_MESSAGE: "INSTAGRAM_SEND_MESSAGE",
  READ_MESSAGES: "INSTAGRAM_LIST_MESSAGES",
};

export const composioInstagramAdapter: SocialProviderAdapter = {
  provider: "instagram",

  async getAccountInfo(accountId: string) {
    const res = await composioRequest(`/api/v3.1/connected_accounts?user_id=${accountId}`, "GET");
    if (!res.ok) return { valid: false, status: "unavailable", accountId };
    const items = Array.isArray(res.data?.items) ? res.data.items : Array.isArray(res.data) ? res.data : [];
    const active = items.find((a: any) => a?.status === "ACTIVE" && a?.toolkit?.slug === "instagram");
    return {
      valid: !!active,
      status: active?.status ?? "not_found",
      accountId: active?.id ?? accountId,
    };
  },

  async syncRecentEvents(accountId: string, limit = 25): Promise<SocialEventInput[]> {
    const res = await composioRequest(
      `/api/v3/actions/${encodeURIComponent(ACTION_NAMES.READ_COMMENTS)}/execute`,
      "POST",
      { connectedAccountId: accountId, input: { limit } }
    );
    if (!res.ok || !res.data?.successful) {
      return [];
    }
    const comments = Array.isArray(res.data.data) ? res.data.data : [];
    const events: SocialEventInput[] = [];
    for (const comment of comments.slice(0, limit)) {
      const raw = typeof comment === "string" ? { text: comment } : comment;
      events.push({
        provider: "instagram",
        account_id: accountId,
        external_event_id: String(raw?.id ?? `ig-comment-${events.length}`),
        event_type: "comment",
        author_id: raw?.user?.id ?? raw?.username ?? null,
        author_name: raw?.user?.username ?? null,
        comment_id: raw?.id ?? null,
        post_id: raw?.media?.id ?? null,
        content: raw?.text ?? null,
        url: raw?.permalink ?? null,
        timestamp: raw?.timestamp ?? null,
        raw_reference: raw,
      });
    }
    return events;
  },

  async executeAction(action) {
    const actionName = ACTION_NAMES[action.actionType];
    if (!actionName) {
      return {
        success: false,
        providerResponse: {},
        errorCode: "UNSUPPORTED_ACTION",
        errorMessage: `Instagram adapter does not support ${action.actionType}`,
      };
    }
    const input: Record<string, any> = {};
    if (action.targetId) input.targetId = action.targetId;
    if (action.content) input.text = action.content;
    const res = await composioRequest(
      `/api/v3/actions/${encodeURIComponent(actionName)}/execute`,
      "POST",
      { connectedAccountId: action.accountId, input }
    );
    if (!res.ok) {
      return {
        success: false,
        providerResponse: res.data ?? {},
        errorCode: `COMPOSIO_HTTP_${res.status}`,
        errorMessage:
          res.data?.message ?? res.data?.error ?? `Composio action ${actionName} failed (HTTP ${res.status})`,
      };
    }
    if (res.data?.successful === false) {
      return {
        success: false,
        providerResponse: res.data,
        errorCode: "PROVIDER_ERROR",
        errorMessage: res.data?.error ?? "Provider rejected the action",
      };
    }
    return { success: true, providerResponse: res.data ?? {} };
  },
};
