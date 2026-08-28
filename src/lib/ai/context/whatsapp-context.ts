import type { TaskContext } from "../types";
import { buildBusinessContext } from "./business-context";

export interface LightContextInput {
  userId: string;
  leadId: string;
  conversationId: string;
  messageLimit?: number;
}

export async function buildWhatsAppReplyContext(
  supabase: any,
  input: LightContextInput
): Promise<TaskContext | null> {
  const limit = input.messageLimit ?? 20;

  const [businessResult, messagesResult, summaryResult] = await Promise.all([
    buildBusinessContext(supabase, input.userId),
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", input.conversationId)
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("ai_decisions")
      .select("output")
      .eq("user_id", input.userId)
      .eq("conversation_id", input.conversationId)
      .eq("task_type", "SUMMARIZE_CONVERSATION")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let conversationSummary: string | null = null;
  const summary = summaryResult.data?.output;
  if (summary && typeof summary.summary === "string" && summary.summary.trim() !== "") {
    conversationSummary = summary.summary.trim();
  }

  return {
    business: businessResult,
    lead: null,
    intelligence: null,
    conversation: null,
    messages: (messagesResult.data ?? []).reverse(),
    conversationSummary,
    duplicateExists: false,
    lastOutreachAt: null,
    outreachCountInWindow: 0,
  };
}
