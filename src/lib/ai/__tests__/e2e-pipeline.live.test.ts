import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { runAiTask } from "@/lib/ai/orchestrator";
import { transitionLead } from "@/lib/ai/funnel/service";
import { bookMeeting } from "@/lib/ai/meeting/engine";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("placeholder") &&
  SERVICE_KEY.length > 10 &&
  !SERVICE_KEY.includes("placeholder") &&
  process.env.RUN_E2E === "1";

describe.skipIf(!isConfigured)("DataBuks AI pipeline - production E2E (test lead)", () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const stamp = Date.now();
  let userId = "";
  let leadId = "";
  let conversationId = "";
  let createdBusinessContext = false;

  beforeAll(async () => {
    const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (usersError || !users?.users?.length) throw new Error(`No auth users found: ${usersError?.message}`);
    userId = users.users[0].id;

    const { data: existingContext } = await admin
      .from("business_context")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!existingContext) {
      const { error: ctxError } = await admin.from("business_context").insert({
        user_id: userId,
        business_name: "DataBuks",
        description: "AI-powered sales agent and social growth platform for agencies and service businesses.",
        products: [{ name: "AI Sales Agent", description: "Automated lead qualification and outreach" }],
        services: [
          { name: "Managed outreach", description: "Done-for-you prospect conversations" },
          { name: "Meeting booking", description: "Qualified sales meetings" },
        ],
        target_audience: [{ segment: "Marketing agencies", description: "Agencies with 5-50 staff" }],
        ideal_customer_profile: { type: "Marketing agency", size: "5-50 staff", need: "lead generation" },
        locations: ["India", "Global"],
        industries: ["marketing", "SaaS"],
        offer: { summary: "Managed AI sales pipeline with monthly plan" },
        pricing: { monthly: "custom" },
        brand_voice: ["professional", "concise", "friendly"],
        tone: "friendly",
        preferred_channels: ["instagram", "email", "whatsapp"],
        monthly_meeting_target: 20,
      });
      if (ctxError) throw new Error(`Failed to seed business context: ${ctxError.message}`);
      createdBusinessContext = true;
    }

    const { data: lead, error: leadError } = await admin
      .from("leads")
      .insert({
        user_id: userId,
        name: `E2E Test Lead ${stamp}`,
        company: "Brightlane Agency",
        email: `brightlane.e2e.${stamp}@gmail.com`,
        phone: `+91-90000-${String(stamp).slice(-5)}`,
        industry: "marketing",
        lead_score: 0,
        status: "new",
        location: "Pune",
        notes:
          "E2E pipeline test lead. Agency owner reached out via Instagram DMs. Actively looking for a managed outreach partner, asked for pricing and onboarding timeline, hiring two account managers this month.",
        funnel_stage: "DISCOVERED",
        opted_out: false,
      })
      .select()
      .single();
    if (leadError || !lead) throw new Error(`Failed to create test lead: ${leadError?.message}`);
    leadId = lead.id;

    const { data: conversation, error: convError } = await admin
      .from("conversations")
      .insert({
        user_id: userId,
        contact_name: `E2E Test Lead ${stamp}`,
        platform: "instagram",
        last_message: "Great, send me your availability for a call this week. I'd like to move forward.",
        status: "active",
        lead_id: leadId,
      })
      .select()
      .single();
    if (convError || !conversation) throw new Error(`Failed to create conversation: ${convError?.message}`);
    conversationId = conversation.id;

    const { error: msgError } = await admin.from("messages").insert([
      {
        conversation_id: conversationId,
        user_id: userId,
        content:
          "Hi! Saw your agency's campaign work. We're actively looking for a managed outreach partner right now - can you share pricing and how quickly we can start?",
        sender: "user",
      },
      {
        conversation_id: conversationId,
        user_id: userId,
        content: "Happy to. We onboard within a week and typically start outreach in the first month.",
        sender: "ai",
      },
      {
        conversation_id: conversationId,
        user_id: userId,
        content:
          "Great, send me your availability for a call this week. I'd like to move forward.",
        sender: "user",
      },
    ]);
    if (msgError) throw new Error(`Failed to seed messages: ${msgError.message}`);
  });

  afterAll(async () => {
    for (const table of ["meetings", "ai_tasks", "ai_decisions", "funnel_events", "lead_intelligence"]) {
      try {
        await admin.from(table).delete().eq("lead_id", leadId);
      } catch {}
    }
    try {
      await admin.from("conversations").delete().eq("id", conversationId);
    } catch {}
    try {
      await admin.from("leads").delete().eq("id", leadId);
    } catch {}
    if (createdBusinessContext) {
      try {
        await admin.from("business_context").delete().eq("user_id", userId);
      } catch {}
    }
  });

  it(
    "full pipeline: qualification -> intelligence -> rules -> conversation -> reply -> meeting intent -> meeting booked",
    async () => {
      expect(leadId).toBeTruthy();
      expect(userId).toBeTruthy();

      const qualification = await runAiTask(admin, {
        userId,
        taskType: "QUALIFY_LEAD",
        leadId,
        conversationId,
        idempotencyKey: `e2e:qualify:${stamp}`,
      });
      console.log("[E2E] qualification:", JSON.stringify({
        status: qualification.status,
        decision: qualification.output?.decision,
        scores: qualification.output?.scores,
        confidence: qualification.output?.confidence,
        reason: qualification.decision.reason,
      }));
      expect(qualification.status, qualification.error ?? qualification.decision.reason).toBe("COMPLETED");
      expect(qualification.output?.decision).toBe("qualified");
      expect(qualification.decision.allowed).toBe(true);

      const { data: intelligence } = await admin
        .from("lead_intelligence")
        .select("*")
        .eq("lead_id", leadId)
        .eq("user_id", userId)
        .maybeSingle();
      expect(intelligence, "lead_intelligence row must exist after qualification").not.toBeNull();
      expect(intelligence.overall_score).toBeTypeOf("number");
      expect(Array.isArray(intelligence.evidence)).toBe(true);

      const { data: decisions } = await admin
        .from("ai_decisions")
        .select("task_type, ai_decision, action_status")
        .eq("user_id", userId)
        .eq("lead_id", leadId)
        .eq("task_type", "QUALIFY_LEAD");
      expect((decisions ?? []).length).toBeGreaterThan(0);

      const { data: leadAfterQualify } = await admin
        .from("leads")
        .select("funnel_stage")
        .eq("id", leadId)
        .single();
      expect(leadAfterQualify?.funnel_stage).toBe("QUALIFIED");

      const prioritized = await transitionLead(admin, {
        leadId,
        userId,
        toStage: "PRIORITIZED",
        intelligence,
        qualificationDecision: "qualified",
      });
      expect(prioritized.allowed, prioritized.reason).toBe(true);

      const outreachReady = await transitionLead(admin, {
        leadId,
        userId,
        toStage: "OUTREACH_READY",
        intelligence,
      });
      expect(outreachReady.allowed, outreachReady.reason).toBe(true);

      const outreach = await runAiTask(admin, {
        userId,
        taskType: "GENERATE_OUTREACH",
        leadId,
        conversationId,
        payload: { channel: "instagram" },
        idempotencyKey: `e2e:outreach:${stamp}`,
      });
      console.log("[E2E] outreach:", JSON.stringify({
        status: outreach.status,
        channel: (outreach.output as any)?.channel,
        bodyPreview: typeof (outreach.output as any)?.body === "string" ? (outreach.output as any).body.slice(0, 120) : null,
        reason: outreach.decision.reason,
      }));
      expect(outreach.status, outreach.error ?? outreach.decision.reason).toBe("COMPLETED");
      expect(outreach.output?.body).toBeTruthy();

      const contacted = await transitionLead(admin, {
        leadId,
        userId,
        toStage: "CONTACTED",
        intelligence,
        eventType: "OUTREACH_ATTEMPTED",
        metadata: { channel: "instagram", test: true },
      });
      expect(contacted.allowed, contacted.reason).toBe(true);

      const reply = await runAiTask(admin, {
        userId,
        taskType: "ANALYZE_REPLY",
        conversationId,
        leadId,
        idempotencyKey: `e2e:reply:${stamp}`,
      });
      console.log("[E2E] reply:", JSON.stringify({
        status: reply.status,
        sentiment: reply.output?.sentiment,
        meetingIntent: reply.output?.meeting_intent,
        actionStatus: reply.decision.actionStatus,
      }));
      expect(reply.status, reply.error ?? reply.decision.reason).toBe("COMPLETED");
      expect(reply.output?.suggested_reply).toBeTruthy();

      const intent = await runAiTask(admin, {
        userId,
        taskType: "DETECT_MEETING_INTENT",
        conversationId,
        leadId,
        idempotencyKey: `e2e:intent:${stamp}`,
      });
      console.log("[E2E] meeting-intent:", JSON.stringify({
        status: intent.status,
        meetingIntent: intent.output?.meeting_intent,
        evidence: intent.output?.evidence,
        actionStatus: intent.decision.actionStatus,
      }));
      expect(intent.status, intent.error ?? intent.decision.reason).toBe("COMPLETED");
      expect(intent.output?.meeting_intent).toBe(true);

      const { data: leadAfterIntent } = await admin
        .from("leads")
        .select("funnel_stage")
        .eq("id", leadId)
        .single();
      expect(leadAfterIntent?.funnel_stage).toBe("MEETING_INTENT");

      const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
      const meeting = await bookMeeting(admin, {
        userId,
        leadId,
        conversationId,
        scheduledAt: future,
        durationMinutes: 30,
        medium: "call",
        notes: `E2E pipeline test ${stamp}`,
        idempotencyKey: `e2e:meeting:${stamp}`,
      });
      console.log("[E2E] meeting:", JSON.stringify({
        allowed: meeting.allowed,
        reason: meeting.reason,
        meetingStatus: meeting.meeting?.status,
      }));
      expect(meeting.allowed, meeting.reason).toBe(true);
      expect(meeting.meeting).not.toBeNull();

      const { data: leadFinal } = await admin
        .from("leads")
        .select("funnel_stage")
        .eq("id", leadId)
        .single();
      expect(leadFinal?.funnel_stage).toBe("MEETING_BOOKED");

      const { data: meetings } = await admin
        .from("meetings")
        .select("id, status")
        .eq("user_id", userId)
        .eq("lead_id", leadId);
      expect((meetings ?? []).length).toBeGreaterThanOrEqual(1);

      const { data: events } = await admin
        .from("funnel_events")
        .select("event_type")
        .eq("user_id", userId)
        .eq("lead_id", leadId);
      const eventTypes = (events ?? []).map((e: any) => e.event_type);
      expect(eventTypes).toContain("MEETING_BOOKED");
      expect(eventTypes).toContain("MEETING_INTENT_DETECTED");
      expect(eventTypes).toContain("LEAD_QUALIFIED");

      const { data: tasks } = await admin
        .from("ai_tasks")
        .select("task_type, status")
        .eq("user_id", userId)
        .eq("lead_id", leadId);
      const taskTypes = (tasks ?? []).map((t: any) => t.task_type);
      expect(taskTypes).toContain("QUALIFY_LEAD");
      expect(taskTypes).toContain("GENERATE_OUTREACH");
      expect(taskTypes).toContain("ANALYZE_REPLY");
      expect(taskTypes).toContain("DETECT_MEETING_INTENT");
    },
    420000
  );
});
