import type { SocialEventInput, SocialProviderAdapter } from "./types";

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
const COMPOSIO_BASE = "https://backend.composio.dev/api/v3.1";

const TOOL_SLUGS: Record<string, string> = {
  READ_POSTS: "INSTAGRAM_GET_USER_MEDIA",
  READ_COMMENTS: "INSTAGRAM_GET_IG_MEDIA_COMMENTS",
  COMMENT_REPLY: "INSTAGRAM_REPLY_TO_COMMENT",
  CREATE_COMMENT: "INSTAGRAM_POST_IG_MEDIA_COMMENTS",
  PUBLISH: "INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH",
  SEND_MESSAGE: "INSTAGRAM_SEND_TEXT_MESSAGE",
  READ_MESSAGES: "INSTAGRAM_LIST_ALL_MESSAGES",
  GET_USER_INFO: "INSTAGRAM_GET_USER_INFO",
};

interface ComposioResponse {
  ok: boolean;
  status: number;
  data: any;
}

async function composioExecute(
  toolSlug: string,
  connectedAccountId: string,
  entityId: string,
  instruction: string
): Promise<ComposioResponse> {
  if (!COMPOSIO_API_KEY) {
    return { ok: false, status: 0, data: { error: "COMPOSIO_API_KEY not configured" } };
  }
  try {
    const response = await fetch(`${COMPOSIO_BASE}/tools/execute/${toolSlug}`, {
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

export const composioInstagramAdapter: SocialProviderAdapter = {
  provider: "instagram",

  async getAccountInfo(accountId: string, entityId: string = "databuks-workspace") {
    const res = await composioExecute(
      TOOL_SLUGS.GET_USER_INFO,
      accountId,
      entityId,
      "Get my Instagram account user info"
    );
    const info = res.data?.data ?? res.data ?? {};
    const successFlag = res.data?.successful ?? res.data?.data?.successful;
    if (process.env.DEBUG_COMPOSIO === "1") {
      console.log("[COMPOSIO_DEBUG] getAccountInfo res:", JSON.stringify(res).slice(0, 500));
    }
    if (!res.ok || info?.error || (successFlag !== undefined && successFlag !== true) || (successFlag === undefined && Object.keys(info).length === 0)) {
      return { valid: false, status: info?.error?.message ?? res.data?.error?.message ?? "execution_failed", accountId };
    }
    return {
      valid: true,
      status: "active",
      accountId,
      accountType: info.account_type ?? null,
      username: info.username ?? null,
      followers: info.followers_count ?? null,
    } as any;
  },

  async syncRecentEvents(accountId: string, entityId: string = "databuks-workspace", limit = 10): Promise<SocialEventInput[]> {
    const mediaRes = await composioExecute(
      TOOL_SLUGS.READ_POSTS,
      accountId,
      entityId,
      `List my most recent Instagram media posts (limit ${limit})`
    );
    if (!mediaRes.ok || (mediaRes.data?.successful ?? mediaRes.data?.data?.successful) !== true) return [];

    const media = mediaRes.data?.data ?? [];
    const mediaList = Array.isArray(media) ? media : Array.isArray(media?.data) ? media.data : [];
    const events: SocialEventInput[] = [];

    for (const item of mediaList.slice(0, 5)) {
      const mediaId = item?.id ?? item?.media_id ?? null;
      if (!mediaId) continue;
      const commentsRes = await composioExecute(
        TOOL_SLUGS.READ_COMMENTS,
        accountId,
        entityId,
        `Get comments on my Instagram media with id ${mediaId}`
      );
      if (!commentsRes.ok || (commentsRes.data?.successful ?? commentsRes.data?.data?.successful) !== true) continue;
      const comments = commentsRes.data?.data ?? [];
      for (const comment of Array.isArray(comments) ? comments : []) {
        const commentId = comment?.id ?? comment?.comment_id ?? null;
        if (!commentId) continue;
        events.push({
          provider: "instagram",
          account_id: accountId,
          external_event_id: `ig-comment-${commentId}`,
          event_type: "comment",
          author_id: comment?.user?.id ?? comment?.username ?? null,
          author_name: comment?.user?.username ?? comment?.username ?? null,
          post_id: mediaId,
          comment_id: commentId,
          content: comment?.text ?? comment?.content ?? null,
          url: null,
          timestamp: comment?.timestamp ?? null,
          raw_reference: comment,
        });
      }
    }
    return events;
  },

  async executeAction(action) {
    const toolSlug = TOOL_SLUGS[action.actionType];
    if (!toolSlug) {
      return {
        success: false,
        providerResponse: {},
        errorCode: "UNSUPPORTED_ACTION",
        errorMessage: `Instagram adapter does not support ${action.actionType}`,
      };
    }

    let instruction: string;
    switch (action.actionType) {
      case "COMMENT_REPLY":
        instruction = `Reply to the Instagram comment with comment id ${action.targetId ?? ""}: "${action.content ?? ""}"`;
        break;
      case "CREATE_COMMENT":
        instruction = `Post this comment on the Instagram media: "${action.content ?? ""}"`;
        break;
      case "SEND_MESSAGE":
        instruction = `Send this message to the Instagram user (target: ${action.targetId ?? ""}): "${action.content ?? ""}"`;
        break;
      case "PUBLISH":
        instruction = `Publish this as an Instagram post: "${action.content ?? ""}"`;
        break;
      default:
        instruction = action.content ?? "Execute the requested action";
    }

    const res = await composioExecute(toolSlug, action.accountId, action.entityId ?? "databuks-workspace", instruction);
    if (!res.ok) {
      return {
        success: false,
        providerResponse: res.data ?? {},
        errorCode: `COMPOSIO_HTTP_${res.status}`,
        errorMessage: res.data?.error?.message ?? `Composio tool ${toolSlug} failed (HTTP ${res.status})`,
      };
    }
    const successFlag = res.data?.successful ?? res.data?.data?.successful;
    const executed = res.data?.data ?? res.data ?? {};
    if (successFlag === false) {
      return {
        success: false,
        providerResponse: executed,
        errorCode: "PROVIDER_ERROR",
        errorMessage: executed?.error?.message ?? executed?.error ?? "Provider rejected the action",
      };
    }
    if (successFlag !== true) {
      return {
        success: false,
        providerResponse: res.data,
        errorCode: "PROVIDER_ERROR",
        errorMessage: res.data?.error?.message ?? "Provider execution returned no success",
      };
    }
    return { success: true, providerResponse: executed };
  },
};
