import { getAdapterForProvider } from "./adapters/registry";

/**
 * SCHEDULED CONTENT PUBLISHER
 *
 * Picks up content rows with status='scheduled' whose scheduled_date has
 * passed (or was never set) and publishes them through the platform adapter
 * (Composio) using the user's connected account. Successful publishes flip
 * status→published; failures record publish_error and stay scheduled so the
 * next run retries.
 */

export interface PublishResult {
  contentId: string;
  userId: string;
  title: string;
  platform: string;
  ok: boolean;
  error?: string;
}

interface ScheduledRow {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  type: string | null;
  platform: string | null;
}

async function findConnection(
  supabase: any,
  userId: string,
  platform: string
): Promise<string | null> {
  const { data } = await supabase
    .from("social_connections")
    .select("connection_id")
    .eq("user_id", userId)
    .eq("platform", platform)
    .eq("status", "connected")
    .not("connection_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.connection_id ?? null;
}

function buildCaption(row: ScheduledRow): string {
  return (row.body && row.body.trim()) || row.title || "";
}

/** Publish every due scheduled item across all users (or one user). */
export async function publishDueContent(
  supabase: any,
  opts: { userId?: string; limit?: number } = {}
): Promise<PublishResult[]> {
  const limit = opts.limit ?? 10;
  let query = supabase
    .from("content")
    .select("id, user_id, title, body, type, platform")
    .eq("status", "scheduled")
    .or(`scheduled_date.is.null,scheduled_date.lte.${new Date().toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (opts.userId) query = query.eq("user_id", opts.userId);

  const { data: rows, error } = await query;
  if (error) throw new Error(`content query failed: ${error.message}`);

  const results: PublishResult[] = [];

  for (const row of rows ?? []) {
    const base = {
      contentId: row.id,
      userId: row.user_id,
      title: row.title ?? "",
      platform: row.platform ?? "?",
    };
    try {
      const platform = String(row.platform ?? "").toLowerCase();
      const adapter = getAdapterForProvider(platform);
      if (!adapter) {
        results.push({ ...base, ok: false, error: `no_adapter_for_${platform}` });
        continue;
      }
      const connectionId = await findConnection(supabase, row.user_id, platform);
      if (!connectionId) {
        results.push({ ...base, ok: false, error: "no_connected_account" });
        continue;
      }
      const outcome = await adapter.executeAction({
        actionType: "PUBLISH",
        accountId: connectionId,
        content: buildCaption(row),
      });
      if (outcome.success) {
        await supabase
          .from("content")
          .update({ status: "published", published_at: new Date().toISOString(), publish_error: null, updated_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("user_id", row.user_id);
        results.push({ ...base, ok: true });
      } else {
        const msg = outcome.errorMessage ?? "publish_failed";
        await supabase
          .from("content")
          .update({ publish_error: msg.slice(0, 500), updated_at: new Date().toISOString() })
          .eq("id", row.id)
          .eq("user_id", row.user_id);
        results.push({ ...base, ok: false, error: msg });
      }
    } catch (err: any) {
      results.push({ ...base, ok: false, error: err?.message ?? "unknown_error" });
    }
  }

  return results;
}
