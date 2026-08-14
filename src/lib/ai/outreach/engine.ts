import { evaluateRules, type RuleContext } from "../rules";
import { recordFunnelEvent } from "../funnel/service";
import { idempotencyKey } from "../utils/idempotency";
import { countOutreachInWindow, lastOutreachAtForLead } from "../utils/rate-limit";

export interface SendOutreachInput {
  userId: string;
  leadId: string;
  channel: string;
  message: string;
  idempotencyKey?: string;
}

export interface SendOutreachResult {
  allowed: boolean;
  ruleId?: string;
  reason: string;
  event?: Record<string, any> | null;
  replayed?: boolean;
}

export async function sendOutreach(supabase: any, input: SendOutreachInput): Promise<SendOutreachResult> {
  const effectiveKey =
    input.idempotencyKey ??
    idempotencyKey("outreach", input.userId, input.leadId, input.channel, input.message.slice(0, 120));

  const { data: existingEvent } = await supabase
    .from("funnel_events")
    .select("id")
    .eq("user_id", input.userId)
    .eq("event_type", "OUTREACH_SENT")
    .eq("idempotency_key", effectiveKey)
    .maybeSingle();
  if (existingEvent) {
    return { allowed: true, reason: "idempotent replay: outreach already sent", event: existingEvent, replayed: true };
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

  const [lastOutreachAt, outreachCountInWindow] = await Promise.all([
    lastOutreachAtForLead(supabase, input.userId, input.leadId),
    countOutreachInWindow(supabase, input.userId),
  ]);

  const ruleContext: RuleContext = {
    lead,
    channel: input.channel,
    message: input.message,
    lastOutreachAt,
    outreachCountInWindow,
    actionType: "outreach",
  };

  const ruleResult = evaluateRules(
    ["LEAD_003", "LEAD_009", "LEAD_010", "LEAD_011", "LEAD_012", "LEAD_013", "LEAD_016", "LEAD_017", "LEAD_018"],
    ruleContext
  );
  if (!ruleResult.allowed) {
    await recordFunnelEvent(supabase, {
      userId: input.userId,
      leadId: input.leadId,
      eventType: "OUTREACH_BLOCKED",
      fromStage: lead.funnel_stage ?? null,
      toStage: null,
      metadata: {
        ruleId: ruleResult.ruleId,
        reason: ruleResult.reason,
        checks: ruleResult.checks,
        channel: input.channel,
        idempotency_key: effectiveKey,
      },
    });
    return { allowed: false, ruleId: ruleResult.ruleId, reason: ruleResult.reason };
  }

  const event = await recordFunnelEvent(supabase, {
    userId: input.userId,
    leadId: input.leadId,
    eventType: "OUTREACH_SENT",
    fromStage: lead.funnel_stage ?? null,
    toStage: null,
    metadata: {
      channel: input.channel,
      checks: ruleResult.checks,
    },
    idempotencyKey: effectiveKey,
  });

  return { allowed: true, reason: "outreach sent", event };
}
