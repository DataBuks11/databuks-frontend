import type { AiTaskStatus, AiTaskType } from "../types";

export interface CreateAiTaskInput {
  userId: string;
  taskType: AiTaskType;
  leadId?: string | null;
  conversationId?: string | null;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
  priority?: number;
  model?: string;
}

export async function findTaskByIdempotencyKey(
  supabase: any,
  userId: string,
  idempotencyKey: string
): Promise<Record<string, any> | null> {
  const { data, error } = await supabase
    .from("ai_tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error && error.code !== "PGRST116") throw new Error(`Failed to lookup task: ${error.message}`);
  return data ?? null;
}

export async function createAiTask(
  supabase: any,
  input: CreateAiTaskInput
): Promise<{ task: Record<string, any>; replayed: boolean }> {
  if (input.idempotencyKey) {
    const existing = await findTaskByIdempotencyKey(supabase, input.userId, input.idempotencyKey);
    if (existing) return { task: existing, replayed: true };
  }

  const { data, error } = await supabase
    .from("ai_tasks")
    .insert({
      user_id: input.userId,
      lead_id: input.leadId ?? null,
      conversation_id: input.conversationId ?? null,
      task_type: input.taskType,
      priority: input.priority ?? 5,
      status: "QUEUED",
      input: input.payload ?? {},
      model: input.model ?? null,
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505" && input.idempotencyKey) {
      const existing = await findTaskByIdempotencyKey(supabase, input.userId, input.idempotencyKey);
      if (existing) return { task: existing, replayed: true };
    }
    throw new Error(`Failed to create AI task: ${error.message}`);
  }

  return { task: data, replayed: false };
}

export async function startAiTask(supabase: any, taskId: string, attempts: number): Promise<void> {
  const { error } = await supabase
    .from("ai_tasks")
    .update({
      status: "RUNNING",
      attempts,
      started_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", taskId);
  if (error) throw new Error(`Failed to start AI task: ${error.message}`);
}

export async function completeAiTask(
  supabase: any,
  taskId: string,
  output: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("ai_tasks")
    .update({
      status: "COMPLETED",
      output,
      completed_at: new Date().toISOString(),
    })
    .eq("id", taskId);
  if (error) throw new Error(`Failed to complete AI task: ${error.message}`);
}

export async function blockAiTask(supabase: any, taskId: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from("ai_tasks")
    .update({
      status: "BLOCKED",
      error_message: reason,
      completed_at: new Date().toISOString(),
    })
    .eq("id", taskId);
  if (error) throw new Error(`Failed to block AI task: ${error.message}`);
}

export async function failAiTask(supabase: any, taskId: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from("ai_tasks")
    .update({
      status: "FAILED",
      error_message: reason,
      completed_at: new Date().toISOString(),
    })
    .eq("id", taskId);
  if (error) throw new Error(`Failed to fail AI task: ${error.message}`);
}

export async function listAiTasks(
  supabase: any,
  userId: string,
  status?: string,
  limit = 50
): Promise<Record<string, any>[]> {
  let query = supabase
    .from("ai_tasks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status && status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to list AI tasks: ${error.message}`);
  return data ?? [];
}

export async function listAiDecisions(
  supabase: any,
  userId: string,
  taskType?: string,
  limit = 50
): Promise<Record<string, any>[]> {
  let query = supabase
    .from("ai_decisions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (taskType && taskType !== "all") query = query.eq("task_type", taskType);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to list AI decisions: ${error.message}`);
  return data ?? [];
}

export function isTerminalStatus(status: AiTaskStatus): boolean {
  return status === "COMPLETED" || status === "FAILED" || status === "BLOCKED";
}
