import { evaluateRules, type RuleContext } from "../rules";
import { transitionLead } from "../funnel/service";

export interface BookMeetingInput {
  userId: string;
  leadId: string;
  conversationId?: string | null;
  scheduledAt: string;
  durationMinutes: number;
  medium: string;
  location?: string | null;
  notes?: string | null;
  idempotencyKey?: string;
}

export interface BookMeetingResult {
  allowed: boolean;
  ruleId?: string;
  reason: string;
  meeting?: Record<string, any> | null;
  transition?: Record<string, any> | null;
}

export async function bookMeeting(supabase: any, input: BookMeetingInput): Promise<BookMeetingResult> {
  if (input.idempotencyKey) {
    const { data: existingMeeting } = await supabase
      .from("meetings")
      .select("*")
      .eq("user_id", input.userId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (existingMeeting) {
      return {
        allowed: true,
        reason: "idempotent replay: meeting already booked",
        meeting: existingMeeting,
      };
    }
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", input.leadId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (leadError || !lead) {
    throw new Error(`Lead not found: ${leadError?.message ?? input.leadId}`);
  }

  const intelligenceResult = await supabase
    .from("lead_intelligence")
    .select("*")
    .eq("lead_id", input.leadId)
    .eq("user_id", input.userId)
    .maybeSingle();
  const intelligence = intelligenceResult.data ?? null;

  const intentEvidence = Array.isArray(intelligence?.evidence) ? intelligence.evidence : [];

  const ruleContext: RuleContext = {
    lead,
    intelligence,
    meetingIntent: true,
    meetingIntentEvidence: intentEvidence,
    scheduledAt: input.scheduledAt,
    durationMinutes: input.durationMinutes,
    actionType: "meeting_booking",
  };

  const ruleResult = evaluateRules(["LEAD_013", "LEAD_014", "LEAD_015", "LEAD_020"], ruleContext);
  if (!ruleResult.allowed) {
    return { allowed: false, ruleId: ruleResult.ruleId, reason: ruleResult.reason };
  }

  const insertPayload: Record<string, any> = {
    user_id: input.userId,
    lead_id: input.leadId,
    conversation_id: input.conversationId ?? null,
    status: "scheduled",
    scheduled_at: input.scheduledAt,
    duration_minutes: input.durationMinutes,
    medium: input.medium,
    location: input.location ?? null,
    notes: input.notes ?? null,
    idempotency_key: input.idempotencyKey ?? null,
  };

  const { data: meeting, error: insertError } = await supabase
    .from("meetings")
    .insert(insertPayload)
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505" && input.idempotencyKey) {
      const { data: existing } = await supabase
        .from("meetings")
        .select("*")
        .eq("user_id", input.userId)
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (existing) {
        return { allowed: true, reason: "idempotent replay: meeting already booked", meeting: existing };
      }
    }
    throw new Error(`Failed to book meeting: ${insertError.message}`);
  }

  let transition: Record<string, any> | null = null;
  try {
    transition = await transitionLead(supabase, {
      leadId: input.leadId,
      userId: input.userId,
      toStage: "MEETING_BOOKED",
      intelligence,
      meetingIntent: true,
      meetingIntentEvidence: intentEvidence,
      scheduledAt: input.scheduledAt,
      durationMinutes: input.durationMinutes,
      eventType: "MEETING_BOOKED",
      metadata: { meeting_id: meeting.id, medium: input.medium },
      actionType: "meeting_booking",
    });
  } catch (error: any) {
    console.error(`[LIB:ai:meeting] transition after booking failed: ${error.message}`);
  }

  // Owner approval ping (best-effort, never blocks the booking).
  void notifyOwnerMeetingBooked(supabase, {
    userId: input.userId,
    leadName: (lead as any)?.name ?? (lead as any)?.author_name ?? null,
    company: (lead as any)?.company ?? null,
    scheduledAt: input.scheduledAt,
    medium: input.medium,
  });

  return { allowed: true, reason: "meeting booked", meeting, transition };
}

/**
 * Owner approval ping: the moment a meeting is booked, WhatsApp the owner
 * on the PERSONAL number with lead + slot + context, so THEY decide what
 * happens next (confirm / cancel / reschedule via dashboard or reply).
 * Best-effort — booking never fails because a notification failed.
 */
export async function notifyOwnerMeetingBooked(
  supabase: any,
  input: { userId: string; leadName?: string | null; company?: string | null; scheduledAt?: string | null; medium?: string | null }
): Promise<void> {
  try {
    const { resolveUserJid, sendViaBaileys } = await import("@/lib/whatsapp/jid-utils");
    const jid = await resolveUserJid(supabase, input.userId);
    if (!jid) return;
    const when = input.scheduledAt ? new Date(input.scheduledAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "slot pending";
    await sendViaBaileys({
      userId: input.userId,
      jid,
      slot: "personal",
      message:
        `🎯 Meeting tak laaya hoon!\n` +
        `Lead: ${input.leadName ?? "unknown"}${input.company ? ` (${input.company})` : ""}\n` +
        `Slot: ${when}${input.medium ? ` via ${input.medium}` : ""}\n\n` +
        `Aage kya karna hai, tum batao — Dashboard → Meetings me confirm/cancel/reschedule karo, ya yahan "meetings" likh ke list dekho.`,
    });
  } catch (err: any) {
    console.error(`[LIB:ai:meeting] owner approval ping failed: ${err?.message}`);
  }
}

export async function listMeetings(
  supabase: any,
  userId: string,
  status?: string,
  limit = 50
): Promise<Record<string, any>[]> {
  let query = supabase
    .from("meetings")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status && status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to list meetings: ${error.message}`);
  return data ?? [];
}

export async function updateMeetingStatus(
  supabase: any,
  input: {
    userId: string;
    meetingId: string;
    status: string;
  }
): Promise<Record<string, any>> {
  const { data: meeting, error: meetingError } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", input.meetingId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (meetingError || !meeting) {
    throw new Error(`Meeting not found: ${meetingError?.message ?? input.meetingId}`);
  }

  const updates: Record<string, any> = {
    status: input.status,
    updated_at: new Date().toISOString(),
  };
  if (input.status === "confirmed") updates.confirmed_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("meetings")
    .update(updates)
    .eq("id", input.meetingId)
    .eq("user_id", input.userId)
    .select()
    .single();
  if (error) throw new Error(`Failed to update meeting: ${error.message}`);

  if (input.status === "held") {
    try {
      await transitionLead(supabase, {
        leadId: meeting.lead_id,
        userId: input.userId,
        toStage: "MEETING_HELD",
        eventType: "MEETING_HELD",
        metadata: { meeting_id: input.meetingId },
      });
    } catch (transitionError: any) {
      console.error(`[LIB:ai:meeting] transition after meeting held failed: ${transitionError.message}`);
    }
  }

  return data;
}
