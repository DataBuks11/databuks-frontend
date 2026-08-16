import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdapterForProvider } from "./adapters/registry";
import { capabilitySupports, getCapabilitiesForConnection } from "./capabilities";
import { idempotencyKey } from "../ai/utils/idempotency";

export interface ExecuteActionInput {
  userId: string;
  provider: string;
  actionType: string;
  targetId?: string | null;
  content?: string | null;
  aiDecisionId?: string | null;
  idempotencyKey?: string;
  requireApproval?: boolean;
}

export interface ExecuteActionResult {
  allowed: boolean;
  status: string;
  reason: string;
  errorCode?: string;
  errorMessage?: string;
  actionId?: string;
  providerResponse?: Record<string, any>;
}

const HOURLY_LIMITS: Record<string, number> = {
  COMMENT_REPLY: 30,
  CREATE_COMMENT: 30,
  SEND_MESSAGE: 60,
  PUBLISH: 6,
  LIKE: 60,
  FOLLOW: 20,
  UNFOLLOW: 20,
};

async function countActionsInWindow(supabase: SupabaseClient, userId: string, actionType: string, since: string): Promise<number> {
  const { count, error } = await supabase
    .from("social_actions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action_type", actionType)
    .gte("created_at", since);
  if (error) return 0;
  return count ?? 0;
}

export async function executeSocialAction(
  supabase: SupabaseClient,
  input: ExecuteActionInput
): Promise<ExecuteActionResult> {
  const key =
    input.idempotencyKey ??
    idempotencyKey("social", input.userId, input.provider, input.actionType, input.targetId ?? "none", (input.content ?? "").slice(0, 80));

  const { data: existing } = await supabase
    .from("social_actions")
    .select("id, status, provider_response, error_message")
    .eq("user_id", input.userId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (existing) {
    return {
      allowed: existing.status === "SUCCESS",
      status: existing.status,
      reason: `idempotent replay (${existing.status})`,
      actionId: existing.id,
      providerResponse: existing.provider_response ?? {},
      errorMessage: existing.error_message ?? undefined,
    };
  }

  const actionRow = {
    user_id: input.userId,
    provider: input.provider,
    account_id: null,
    action_type: input.actionType,
    target_id: input.targetId ?? null,
    content: input.content ?? null,
    status: "PENDING",
    ai_decision_id: input.aiDecisionId ?? null,
    idempotency_key: key,
  };
  const { data: created, error: createError } = await supabase
    .from("social_actions")
    .insert(actionRow)
    .select()
    .single();
  if (createError) {
    if (createError.code === "23505") {
      const { data: raced } = await supabase
        .from("social_actions")
        .select("*")
        .eq("user_id", input.userId)
        .eq("idempotency_key", key)
        .maybeSingle();
      if (raced) {
        return {
          allowed: raced.status === "SUCCESS",
          status: raced.status,
          reason: `idempotent replay (${raced.status})`,
          actionId: raced.id,
        };
      }
    }
    return { allowed: false, status: "FAILED", reason: createError.message, errorCode: "DB_ERROR" };
  }
  const actionId = created.id;

  if (input.requireApproval === true) {
    return {
      allowed: false,
      status: "PENDING",
      reason: "action queued for human approval",
      actionId,
    };
  }

  const { data: connection } = await supabase
    .from("social_connections")
    .select("*")
    .eq("user_id", input.userId)
    .eq("platform", input.provider)
    .eq("status", "connected")
    .maybeSingle();
  if (!connection) {
    await supabase
      .from("social_actions")
      .update({ status: "BLOCKED", error_code: "NO_CONNECTED_ACCOUNT", error_message: "No connected account for this provider" })
      .eq("id", actionId);
    return { allowed: false, status: "BLOCKED", reason: "no connected account", actionId, errorCode: "NO_CONNECTED_ACCOUNT" };
  }

  const capabilities = getCapabilitiesForConnection({
    platform: input.provider,
    status: connection.status,
    connection_id: connection.connection_id ?? null,
  });
  if (!capabilitySupports(capabilities, input.actionType)) {
    await supabase
      .from("social_actions")
      .update({ status: "BLOCKED", error_code: "ACTION_UNAVAILABLE", error_message: `${input.actionType} is not supported by this ${input.provider} connection` })
      .eq("id", actionId);
    return { allowed: false, status: "BLOCKED", reason: `${input.actionType} unsupported by this connection`, actionId, errorCode: "ACTION_UNAVAILABLE" };
  }

  const limit = HOURLY_LIMITS[input.actionType] ?? 30;
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const recent = await countActionsInWindow(supabase, input.userId, input.actionType, since);
  if (recent >= limit) {
    await supabase
      .from("social_actions")
      .update({ status: "BLOCKED", error_code: "RATE_LIMIT", error_message: `${input.actionType} hourly limit reached (${recent}/${limit})` })
      .eq("id", actionId);
    return { allowed: false, status: "BLOCKED", reason: "hourly rate limit reached", actionId, errorCode: "RATE_LIMIT" };
  }

  const adapter = getAdapterForProvider(input.provider);
  if (!adapter) {
    await supabase
      .from("social_actions")
      .update({ status: "BLOCKED", error_code: "NO_ADAPTER", error_message: `No adapter for provider ${input.provider}` })
      .eq("id", actionId);
    return { allowed: false, status: "BLOCKED", reason: "no provider adapter", actionId, errorCode: "NO_ADAPTER" };
  }

  await supabase
    .from("social_actions")
    .update({ status: "EXECUTING", account_id: connection.connection_id ?? null, executed_at: new Date().toISOString() })
    .eq("id", actionId);

  const result = await adapter.executeAction({
    actionType: input.actionType,
    accountId: connection.connection_id ?? input.userId,
    targetId: input.targetId ?? null,
    content: input.content ?? null,
  });

  if (result.success) {
    await supabase
      .from("social_actions")
      .update({ status: "SUCCESS", provider_response: result.providerResponse })
      .eq("id", actionId);
    return { allowed: true, status: "SUCCESS", reason: "provider executed action", actionId, providerResponse: result.providerResponse };
  }

  await supabase
    .from("social_actions")
    .update({
      status: "FAILED",
      provider_response: result.providerResponse,
      error_code: result.errorCode ?? "PROVIDER_ERROR",
      error_message: result.errorMessage ?? "provider rejected action",
    })
    .eq("id", actionId);
  return {
    allowed: false,
    status: "FAILED",
    reason: result.errorMessage ?? "provider rejected action",
    actionId,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    providerResponse: result.providerResponse,
  };
}

export async function approveSocialAction(
  supabase: SupabaseClient,
  userId: string,
  actionId: string
): Promise<ExecuteActionResult> {
  const { data: action } = await supabase
    .from("social_actions")
    .select("*")
    .eq("id", actionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!action) return { allowed: false, status: "FAILED", reason: "action not found" };
  if (action.status !== "PENDING") {
    return { allowed: false, status: action.status, reason: `action already ${action.status}` };
  }
  return executeSocialAction(supabase, {
    userId,
    provider: action.provider,
    actionType: action.action_type,
    targetId: action.target_id,
    content: action.content,
    aiDecisionId: action.ai_decision_id,
    idempotencyKey: action.idempotency_key ?? undefined,
  });
}
