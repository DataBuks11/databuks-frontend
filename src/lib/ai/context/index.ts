import type { AiTaskInput, TaskContext } from "../types";
import { buildBusinessContext } from "./business-context";

const OUTREACH_EVENT_TYPES = ["OUTREACH_SENT", "OUTREACH_ATTEMPTED"];
const OUTREACH_WINDOW_HOURS = 24;

export async function buildTaskContext(
  supabase: any,
  input: AiTaskInput
): Promise<TaskContext> {
  const business = await buildBusinessContext(supabase, input.userId);

  let lead: Record<string, any> | null = null;
  let intelligence: Record<string, any> | null = null;
  let duplicateExists = false;
  let lastOutreachAt: string | null = null;
  let outreachCountInWindow = 0;

  if (input.leadId) {
    const [leadResult, intelligenceResult] = await Promise.all([
      supabase.from("leads").select("*").eq("id", input.leadId).eq("user_id", input.userId).maybeSingle(),
      supabase
        .from("lead_intelligence")
        .select("*")
        .eq("lead_id", input.leadId)
        .eq("user_id", input.userId)
        .maybeSingle(),
    ]);
    lead = leadResult.data ?? null;
    intelligence = intelligenceResult.data ?? null;

    if (lead) {
      const email = typeof lead.email === "string" && lead.email.trim() !== "" ? lead.email.trim() : null;
      const phone = typeof lead.phone === "string" && lead.phone.trim() !== "" ? lead.phone.trim() : null;

      if (email || phone) {
        const duplicateQuery = supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("user_id", input.userId)
          .neq("id", input.leadId);
        if (email) duplicateQuery.eq("email", email);
        else duplicateQuery.eq("phone", phone);
        const duplicateResult = await duplicateQuery;
        duplicateExists = (duplicateResult.count ?? 0) > 0;
      }
    }
  }

  const since = new Date(Date.now() - OUTREACH_WINDOW_HOURS * 3600 * 1000).toISOString();
  const outreachEvents = await supabase
    .from("funnel_events")
    .select("lead_id, created_at")
    .eq("user_id", input.userId)
    .in("event_type", OUTREACH_EVENT_TYPES)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (outreachEvents.data) {
    outreachCountInWindow = outreachEvents.data.length;
    if (input.leadId) {
      const own = outreachEvents.data.find((event: Record<string, any>) => event.lead_id === input.leadId);
      lastOutreachAt = own?.created_at ?? null;
    }
  }

  let conversation: Record<string, any> | null = null;
  let messages: Record<string, any>[] = [];
  let conversationSummary: string | null = null;

  if (input.conversationId) {
    const conversationResult = await supabase
      .from("conversations")
      .select("*")
      .eq("id", input.conversationId)
      .eq("user_id", input.userId)
      .maybeSingle();
    conversation = conversationResult.data ?? null;

    const messagesResult = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", input.conversationId)
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    messages = (messagesResult.data ?? []).reverse();

    const summaryResult = await supabase
      .from("ai_decisions")
      .select("output")
      .eq("user_id", input.userId)
      .eq("conversation_id", input.conversationId)
      .eq("task_type", "SUMMARIZE_CONVERSATION")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const summary = summaryResult.data?.output;
    if (summary && typeof summary.summary === "string" && summary.summary.trim() !== "") {
      conversationSummary = summary.summary.trim();
    }

    if (conversation?.lead_id && !input.leadId) {
      const linkedLead = await supabase
        .from("leads")
        .select("*")
        .eq("id", conversation.lead_id)
        .eq("user_id", input.userId)
        .maybeSingle();
      lead = linkedLead.data ?? null;
      if (linkedLead.data) {
        const linkedIntelligence = await supabase
          .from("lead_intelligence")
          .select("*")
          .eq("lead_id", linkedLead.data.id)
          .eq("user_id", input.userId)
          .maybeSingle();
        intelligence = linkedIntelligence.data ?? null;
      }
    }
  }

  return {
    business,
    lead,
    intelligence,
    conversation,
    messages,
    conversationSummary,
    duplicateExists,
    lastOutreachAt,
    outreachCountInWindow,
  };
}
