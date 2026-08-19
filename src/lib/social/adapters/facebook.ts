import type { SocialEventInput, SocialProviderAdapter } from "./types";

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
const COMPOSIO_BASE = "https://backend.composio.dev/api/v3.1";

const TOOL_SLUGS = {
  READ_POSTS: "FACEBOOK_GET_PAGE_POSTS",
  READ_COMMENTS: "FACEBOOK_GET_COMMENTS",
  COMMENT_REPLY: "FACEBOOK_CREATE_COMMENT",
  PUBLISH: "FACEBOOK_CREATE_POST",
  SEND_MESSAGE: "FACEBOOK_SEND_MESSAGE",
  GET_CURRENT_USER: "FACEBOOK_GET_CURRENT_USER",
} as const;

interface ComposioResponse { ok: boolean; status: number; data: any; }

async function execute(toolSlug: string, accountId: string, entityId: string, text: string): Promise<ComposioResponse> {
  if (!COMPOSIO_API_KEY) return { ok: false, status: 0, data: { error: "COMPOSIO_API_KEY not configured" } };
  try {
    const response = await fetch(`${COMPOSIO_BASE}/tools/execute/${toolSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": COMPOSIO_API_KEY },
      body: JSON.stringify({ connected_account_id: accountId, entity_id: entityId, text }),
    });
    let data: any = null;
    try { data = await response.json(); } catch { data = null; }
    return { ok: response.ok, status: response.status, data };
  } catch (error: any) {
    return { ok: false, status: 0, data: { error: error?.message ?? "network error" } };
  }
}

function succeeded(response: ComposioResponse) {
  return response.ok && (response.data?.successful ?? response.data?.data?.successful) === true;
}

function items(response: ComposioResponse): any[] {
  const data = response.data?.data ?? [];
  return Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
}

/** Facebook Page adapter. It never invokes Instagram tools or account semantics. */
export const composioFacebookAdapter: SocialProviderAdapter = {
  provider: "facebook",

  async getAccountInfo(accountId: string, entityId = "databuks-workspace") {
    const response = await execute(TOOL_SLUGS.GET_CURRENT_USER, accountId, entityId, "Get the connected Facebook Page account information");
    const info = response.data?.data ?? response.data ?? {};
    return succeeded(response) && !info?.error
      ? { valid: true, status: "active", accountId }
      : { valid: false, status: info?.error?.message ?? response.data?.error?.message ?? "execution_failed", accountId };
  },

  async syncRecentEvents(accountId: string, entityId = "databuks-workspace", limit = 10): Promise<SocialEventInput[]> {
    const postsResponse = await execute(TOOL_SLUGS.READ_POSTS, accountId, entityId, `List my most recent Facebook Page posts (limit ${limit})`);
    if (!succeeded(postsResponse)) return [];
    const events: SocialEventInput[] = [];
    for (const post of items(postsResponse).slice(0, 5)) {
      const postId = post?.id ?? post?.post_id ?? null;
      if (!postId) continue;
      const commentsResponse = await execute(TOOL_SLUGS.READ_COMMENTS, accountId, entityId, `Get comments on my Facebook Page post with id ${postId}`);
      if (!succeeded(commentsResponse)) continue;
      for (const comment of items(commentsResponse)) {
        const commentId = comment?.id ?? comment?.comment_id ?? null;
        if (!commentId) continue;
        events.push({
          provider: "facebook", account_id: accountId, external_event_id: `fb-comment-${commentId}`,
          event_type: "comment", author_id: comment?.from?.id ?? comment?.author?.id ?? null,
          author_name: comment?.from?.name ?? comment?.author?.name ?? null, post_id: postId, comment_id: commentId,
          content: comment?.message ?? comment?.text ?? comment?.content ?? null,
          url: comment?.permalink_url ?? post?.permalink_url ?? null,
          timestamp: comment?.created_time ?? comment?.timestamp ?? null, raw_reference: comment,
        });
      }
    }
    return events;
  },

  async executeAction(action) {
    const toolSlug = action.actionType === "COMMENT_REPLY" || action.actionType === "CREATE_COMMENT" ? TOOL_SLUGS.COMMENT_REPLY
      : action.actionType === "PUBLISH" || action.actionType === "PUBLISH_POST" ? TOOL_SLUGS.PUBLISH
      : action.actionType === "SEND_MESSAGE" ? TOOL_SLUGS.SEND_MESSAGE : null;
    if (!toolSlug) return { success: false, providerResponse: {}, errorCode: "UNSUPPORTED_ACTION", errorMessage: `Facebook adapter does not support ${action.actionType}` };
    const instruction = action.actionType === "SEND_MESSAGE"
      ? `Send this Facebook Page message to ${action.targetId ?? ""}: "${action.content ?? ""}"`
      : action.actionType === "COMMENT_REPLY" || action.actionType === "CREATE_COMMENT"
        ? `Reply to Facebook comment ${action.targetId ?? ""}: "${action.content ?? ""}"`
        : `Create this Facebook Page post: "${action.content ?? ""}"`;
    const response = await execute(toolSlug, action.accountId, action.entityId ?? "databuks-workspace", instruction);
    if (!succeeded(response)) return { success: false, providerResponse: response.data ?? {}, errorCode: `COMPOSIO_HTTP_${response.status}`, errorMessage: response.data?.error?.message ?? `Composio tool ${toolSlug} failed` };
    return { success: true, providerResponse: response.data?.data ?? response.data ?? {} };
  },
};