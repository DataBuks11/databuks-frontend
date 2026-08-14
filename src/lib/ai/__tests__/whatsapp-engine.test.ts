import { beforeEach, describe, expect, it, vi } from "vitest";

const { runAiTaskMock, bookMeetingMock } = vi.hoisted(() => ({
  runAiTaskMock: vi.fn(),
  bookMeetingMock: vi.fn(),
}));

vi.mock("@/lib/ai/orchestrator", () => ({
  runAiTask: runAiTaskMock,
}));

vi.mock("@/lib/ai/meeting/engine", () => ({
  bookMeeting: bookMeetingMock,
}));

import {
  processIncomingWhatsAppMessage,
  runBackgroundWhatsAppIntelligence,
} from "@/lib/ai/whatsapp/engine";

const USER_ID = "22222222-2222-2222-2222-222222222222";
const LEAD_ID = "11111111-1111-1111-1111-111111111111";

interface MockState {
  leads: Record<string, any>[];
  conversations: Record<string, any>[];
  messages: Record<string, any>[];
  intelligence: Record<string, any>[];
  funnelEvents: Record<string, any>[];
  decisions: Record<string, any>[];
  businessContext: Record<string, any>[];
  settings: Record<string, any>[];
  profiles: Record<string, any>[];
}

function makeState(leadOverrides: Record<string, any> = {}): MockState {
  return {
    leads: [
      {
        id: LEAD_ID,
        user_id: USER_ID,
        name: "Priya Sharma",
        company: "Bluepeak Agency",
        phone: "919000000001",
        email: null,
        industry: "marketing",
        funnel_stage: "CONTACTED",
        opted_out: false,
        status: "contacted",
        ...leadOverrides,
      },
    ],
    conversations: [],
    messages: [],
    intelligence: [
      {
        lead_id: LEAD_ID,
        user_id: USER_ID,
        icp_fit_score: 90,
        intent_score: 88,
        urgency_score: 75,
        buying_signal_score: 80,
        confidence: 0.9,
        evidence: [{ source: "conversation", signal: "requested_pricing" }],
        why_now: "Looking now",
      },
    ],
    funnelEvents: [],
    decisions: [],
    businessContext: [],
    settings: [],
    profiles: [],
  };
}

function makeMockSupabase(state: MockState) {
  let pending: any = null;

  function rowsFor(table: string): Record<string, any>[] {
    switch (table) {
      case "leads":
        return state.leads;
      case "conversations":
        return state.conversations;
      case "messages":
        return state.messages;
      case "lead_intelligence":
        return state.intelligence;
      case "funnel_events":
        return state.funnelEvents;
      case "ai_decisions":
        return state.decisions;
      case "business_context":
        return state.businessContext;
      case "workspace_settings":
        return state.settings;
      case "profiles":
        return state.profiles;
      default:
        return [];
    }
  }

  function matches(row: Record<string, any>, filter: Record<string, any>): boolean {
    if (filter.neq) return row[filter.col] !== filter.val;
    if (filter.gte) return new Date(row[filter.col] ?? 0) >= new Date(filter.val);
    if (filter.in) return filter.vals.includes(row[filter.col]);
    if (filter.ilike) {
      return String(row[filter.col] ?? "")
        .toLowerCase()
        .includes(String(filter.val).replace(/%/g, "").toLowerCase());
    }
    return row[filter.col] === filter.val;
  }

  function filtered(): Record<string, any>[] {
    return rowsFor(pending.table).filter((row) => pending.filters.every((f: any) => matches(row, f)));
  }

  function execute(): { data: any; error: any; count?: number } {
    if (pending.insertData) {
      const data = pending.insertData;
      if (pending.table === "messages" && data.idempotency_key) {
        const dupe = state.messages.find((m) => m.idempotency_key === data.idempotency_key);
        if (dupe) return { data: null, error: { code: "23505", message: "duplicate" } };
      }
      if (pending.table === "funnel_events" && data.idempotency_key) {
        const dupe = state.funnelEvents.find((e) => e.idempotency_key === data.idempotency_key);
        if (dupe) return { data: null, error: { code: "23505", message: "duplicate" } };
      }
      const row = { id: `id-${Math.random().toString(36).slice(2, 10)}`, created_at: new Date().toISOString(), ...data };
      rowsFor(pending.table).push(row);
      return { data: row, error: null };
    }
    if (pending.updateData) {
      const rows = filtered();
      for (const row of rows) Object.assign(row, pending.updateData);
      return { data: rows[0] ?? null, error: null };
    }
    const rows = filtered();
    if (pending.count) return { data: null, count: rows.length, error: null };
    return { data: rows, error: null };
  }

  const mock: any = {
    state,
    from(table: string) {
      pending = { table, filters: [], insertData: null, updateData: null, count: false };
      return mock;
    },
    select(_cols?: string, opts?: Record<string, any>) {
      if (opts?.count) pending.count = true;
      return mock;
    },
    insert(data: Record<string, any>) {
      pending.insertData = data;
      return mock;
    },
    update(data: Record<string, any>) {
      pending.updateData = data;
      return mock;
    },
    eq(col: string, val: any) {
      pending.filters.push({ col, val });
      return mock;
    },
    neq(col: string, val: any) {
      pending.filters.push({ col, val, neq: true });
      return mock;
    },
    in(col: string, vals: any[]) {
      pending.filters.push({ col, vals, in: true });
      return mock;
    },
    ilike(col: string, val: any) {
      pending.filters.push({ col, val, ilike: true });
      return mock;
    },
    gte(col: string, val: any) {
      pending.filters.push({ col, val, gte: true });
      return mock;
    },
    order() {
      return mock;
    },
    limit() {
      return mock;
    },
    maybeSingle() {
      const rows = filtered();
      return { data: rows[0] ?? null, error: null };
    },
    single() {
      const result = execute();
      if (!pending.insertData && !pending.updateData && Array.isArray(result.data)) {
        return { data: result.data[0] ?? null, error: null };
      }
      return result;
    },
    then(resolve: (value: any) => void, reject?: (err: any) => void) {
      return Promise.resolve(execute()).then(resolve, reject);
    },
  };
  return mock;
}

const baseInput = {
  userId: USER_ID,
  remoteJid: "919000000001@s.whatsapp.net",
  messageId: "msg-001",
  text: "Yes, can you share how pricing works?",
  pushName: "Priya",
};

function mockWhatsAppReply(overrides: Record<string, any> = {}) {
  return {
    status: "COMPLETED",
    output: {
      task: "whatsapp_reply",
      conversation_id: "conv-1",
      reply: "Yeah sure. Depends a bit on what you need - what kind of site are you thinking?",
      language: "english",
      meeting_intent: false,
      meeting_intent_evidence: [],
      needs_clarification: true,
      ask_one_question: "What kind of site are you thinking?",
      used_business_fact: null,
      ...overrides,
    },
    decision: { allowed: true, actionStatus: "LOGGED" },
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  runAiTaskMock.mockImplementation(async (mockSupabase: any, input: any) => {
    switch (input.taskType) {
      case "GENERATE_WHATSAPP_REPLY":
        return mockWhatsAppReply();
      case "ENRICH_LEAD": {
        const message = (input.payload?.message ?? "") as string;
        const mentionsBusiness = /bluepeak/i.test(message);
        const lead = mockSupabase.state?.leads?.find((l: any) => l.id === input.leadId);
        if (lead && mentionsBusiness) {
          lead.company = "Bluepeak Agency";
          lead.industry = "marketing";
        }
        return {
          status: "COMPLETED",
          output: {
            task: "lead_enrichment",
            lead_id: input.leadId,
            company: mentionsBusiness ? "Bluepeak Agency" : null,
            industry: mentionsBusiness ? "marketing" : null,
            location: null,
            website: null,
            inferred_interest: null,
            evidence: mentionsBusiness ? [{ source: "conversation", signal: "self_introduced" }] : [],
            missing_data: [],
            confidence: mentionsBusiness ? 0.8 : 0.1,
          },
          decision: { allowed: true },
          error: null,
        };
      }
      case "QUALIFY_LEAD":
        return {
          status: "COMPLETED",
          output: {
            decision: "qualified",
            scores: { icp_fit: 90, intent: 85, urgency: 75, buying_signal: 80, problem_severity: 70, timing: 80, reachability: 90, evidence_quality: 75 },
            confidence: 0.85,
            why_now: "Looking now",
            evidence: [{ source: "conversation", signal: "requested_pricing" }],
          },
          decision: { allowed: true },
          error: null,
        };
      case "DETECT_MEETING_INTENT":
        return {
          status: "COMPLETED",
          output: {
            task: "meeting_intent_detection",
            conversation_id: input.conversationId,
            meeting_intent: true,
            confidence: 0.9,
            evidence: [{ source: "conversation", signal: "requested_call" }],
            suggested_next_step: "share availability",
          },
          decision: { allowed: true },
          error: null,
        };
      default:
        return { status: "COMPLETED", output: {}, decision: { allowed: true }, error: null };
    }
  });
  bookMeetingMock.mockResolvedValue({ allowed: true, meeting: { id: "meeting-1", status: "scheduled" } });
});

describe("WhatsApp fast reply path", () => {
  it("sends a natural reply via sendFn and logs events", async () => {
    const state = makeState();
    const supabase = makeMockSupabase(state);
    const sendFn = vi.fn(async () => {});

    const result = await processIncomingWhatsAppMessage(supabase, baseInput, { sendFn });

    expect(result.processed).toBe(true);
    expect(result.replySent).toBe(true);
    expect(result.replyText).toContain("what kind of site");
    expect(result.latencyMs).toBeDefined();
    expect(sendFn).toHaveBeenCalledWith({
      userId: USER_ID,
      jid: "919000000001@s.whatsapp.net",
      message: expect.stringContaining("what kind of site"),
    });
    expect(state.messages.filter((m) => m.sender === "user").length).toBe(1);
    expect(state.messages.filter((m) => m.sender === "ai").length).toBe(1);
    expect(state.funnelEvents.some((e) => e.event_type === "WHATSAPP_AI_REPLY")).toBe(true);
    expect(state.decisions.some((d) => d.task_type === "SEND_WHATSAPP_REPLY" && d.action_status === "SENT")).toBe(true);
  });

  it("greeting fast path: one LLM call only, no qualification/enrichment before reply", async () => {
    const state = makeState();
    const supabase = makeMockSupabase(state);
    const sendFn = vi.fn(async () => {});

    runAiTaskMock.mockResolvedValueOnce(
      mockWhatsAppReply({ reply: "Hey! What's up? What are you looking to get done?" })
    );

    await processIncomingWhatsAppMessage(
      supabase,
      { ...baseInput, messageId: "greet-1", text: "hii" },
      { sendFn }
    );

    const taskTypes = runAiTaskMock.mock.calls.map((call: any[]) => call[1].taskType);
    expect(taskTypes).toEqual(["GENERATE_WHATSAPP_REPLY"]);
    expect(taskTypes).not.toContain("QUALIFY_LEAD");
    expect(taskTypes).not.toContain("ENRICH_LEAD");
    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: duplicate webhook retries do not send twice", async () => {
    const state = makeState();
    const supabase = makeMockSupabase(state);
    const sendFn = vi.fn(async () => {});

    const first = await processIncomingWhatsAppMessage(supabase, baseInput, { sendFn });
    expect(first.replySent).toBe(true);

    const second = await processIncomingWhatsAppMessage(supabase, baseInput, { sendFn });
    expect(second.processed).toBe(false);
    expect(second.skippedReason).toBe("duplicate_message");
    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it("blocks reply for opted-out leads (LEAD_010)", async () => {
    const state = makeState({ opted_out: true });
    const supabase = makeMockSupabase(state);
    const sendFn = vi.fn(async () => {});

    const result = await processIncomingWhatsAppMessage(supabase, baseInput, { sendFn });

    expect(result.replySent).toBe(false);
    expect(result.decision?.allowed).toBe(false);
    expect(result.decision?.ruleId).toBe("LEAD_010");
    expect(sendFn).not.toHaveBeenCalled();
    expect(state.funnelEvents.some((e) => e.event_type === "WHATSAPP_REPLY_BLOCKED")).toBe(true);
  });

  it("blocks reply when WA_HOURLY_REPLY_LIMIT is configured and reached (WA_001)", async () => {
    process.env.WA_HOURLY_REPLY_LIMIT = "30";
    const state = makeState();
    for (let i = 0; i < 30; i++) {
      state.messages.push({
        id: `ai-${i}`,
        conversation_id: "conv-existing",
        user_id: USER_ID,
        content: `reply ${i}`,
        sender: "ai",
        created_at: new Date().toISOString(),
      });
    }
    state.conversations.push({
      id: "conv-existing",
      user_id: USER_ID,
      lead_id: LEAD_ID,
      platform: "whatsapp",
      contact_name: "Priya",
    });
    const supabase = makeMockSupabase(state);
    const sendFn = vi.fn(async () => {});

    const result = await processIncomingWhatsAppMessage(supabase, baseInput, { sendFn });

    expect(result.replySent).toBe(false);
    expect(result.decision?.ruleId).toBe("WA_001");
    expect(sendFn).not.toHaveBeenCalled();
    delete process.env.WA_HOURLY_REPLY_LIMIT;
  });

  it("unlimited by default: many recent replies still allow a new reply", async () => {
    const state = makeState();
    for (let i = 0; i < 120; i++) {
      state.messages.push({
        id: `ai-${i}`,
        conversation_id: "conv-existing",
        user_id: USER_ID,
        content: `reply ${i}`,
        sender: "ai",
        created_at: new Date().toISOString(),
      });
    }
    state.conversations.push({
      id: "conv-existing",
      user_id: USER_ID,
      lead_id: LEAD_ID,
      platform: "whatsapp",
      contact_name: "Priya",
    });
    const supabase = makeMockSupabase(state);
    const sendFn = vi.fn(async () => {});

    const result = await processIncomingWhatsAppMessage(supabase, baseInput, { sendFn });

    expect(result.replySent).toBe(true);
    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it("marks send failure without crashing when sendFn throws", async () => {
    const state = makeState();
    const supabase = makeMockSupabase(state);
    const sendFn = vi.fn(async () => {
      throw new Error("BAILEYS_SERVER_URL is not configured");
    });

    const result = await processIncomingWhatsAppMessage(supabase, baseInput, { sendFn });

    expect(result.processed).toBe(true);
    expect(result.replySent).toBe(false);
    expect(result.decision?.reason).toContain("send failed");
    expect(state.decisions.some((d) => d.task_type === "SEND_WHATSAPP_REPLY" && d.action_status === "FAILED")).toBe(true);
  });

  it("qualification block in background does NOT block the conversational reply", async () => {
    const state = makeState({ funnel_stage: "ENRICHED", status: "nurturing" });
    const supabase = makeMockSupabase(state);
    const sendFn = vi.fn(async () => {});

    runAiTaskMock.mockImplementation(async (mockSupabase: any, input: any) => {
      if (input.taskType === "GENERATE_WHATSAPP_REPLY") return mockWhatsAppReply();
      if (input.taskType === "QUALIFY_LEAD") {
        return {
          status: "BLOCKED",
          output: {
            decision: "qualified",
            scores: { icp_fit: 30, intent: 20, urgency: 10, buying_signal: 10, problem_severity: 10, timing: 10, reachability: 10, evidence_quality: 10 },
            confidence: 0.2,
            why_now: "",
            evidence: [],
          },
          decision: { allowed: false, ruleId: "LEAD_001" },
          error: null,
        };
      }
      return { status: "COMPLETED", output: {}, decision: { allowed: true }, error: null };
    });

    const fast = await processIncomingWhatsAppMessage(supabase, baseInput, { sendFn });
    expect(fast.replySent).toBe(true);

    await runBackgroundWhatsAppIntelligence(supabase, {
      userId: USER_ID,
      leadId: LEAD_ID,
      conversationId: fast.conversationId!,
      messageId: baseInput.messageId,
      text: baseInput.text,
      meetingSignal: false,
    });

    expect(state.leads[0].funnel_stage).toBe("ENRICHED");
    expect(state.decisions.some((d) => d.task_type === "SEND_WHATSAPP_REPLY" && d.action_status === "SENT")).toBe(true);
  });
});

describe("WhatsApp background intelligence path", () => {
  it("enriches and transitions a lead with business info to ENRICHED", async () => {
    const state = makeState();
    state.leads = [];
    const supabase = makeMockSupabase(state);
    const sendFn = vi.fn(async () => {});

    const fast = await processIncomingWhatsAppMessage(
      supabase,
      {
        ...baseInput,
        messageId: "bg-1",
        text: "Hi, this is Priya from Bluepeak Agency, a marketing firm. How does pricing work?",
      },
      { sendFn }
    );
    expect(state.leads[0].funnel_stage).toBe("DISCOVERED");

    await runBackgroundWhatsAppIntelligence(supabase, {
      userId: USER_ID,
      leadId: fast.leadId!,
      conversationId: fast.conversationId!,
      messageId: "bg-1",
      text: "Hi, this is Priya from Bluepeak Agency, a marketing firm. How does pricing work?",
      meetingSignal: false,
    });

    expect(state.leads[0].company).toBe("Bluepeak Agency");
    expect(state.leads[0].funnel_stage).toBe("ENRICHED");
  });

  it("LEAD_002 blocks ENRICHED in background when no business info is available", async () => {
    const state = makeState();
    state.leads = [];
    state.intelligence = [];
    const supabase = makeMockSupabase(state);
    const sendFn = vi.fn(async () => {});

    const fast = await processIncomingWhatsAppMessage(supabase, baseInput, { sendFn });

    await runBackgroundWhatsAppIntelligence(supabase, {
      userId: USER_ID,
      leadId: fast.leadId!,
      conversationId: fast.conversationId!,
      messageId: baseInput.messageId,
      text: baseInput.text,
      meetingSignal: false,
    });

    expect(state.leads[0].funnel_stage).toBe("DISCOVERED");
    const blockedEvent = state.funnelEvents.find((e) => e.event_type === "TRANSITION_BLOCKED");
    expect(blockedEvent?.metadata?.ruleId).toBe("LEAD_002");
  });

  it("qualification in background advances funnel only when rules pass", async () => {
    const state = makeState({ funnel_stage: "QUALIFIED", status: "qualified" });
    const supabase = makeMockSupabase(state);
    const sendFn = vi.fn(async () => {});

    const fast = await processIncomingWhatsAppMessage(supabase, baseInput, { sendFn });

    await runBackgroundWhatsAppIntelligence(supabase, {
      userId: USER_ID,
      leadId: LEAD_ID,
      conversationId: fast.conversationId!,
      messageId: baseInput.messageId,
      text: baseInput.text,
      meetingSignal: false,
    });

    expect(["QUALIFIED", "PRIORITIZED", "OUTREACH_READY", "CONTACTED"]).toContain(state.leads[0].funnel_stage);
  });

  it("books a meeting when fast path flags meeting intent, idempotently", async () => {
    const state = makeState({ funnel_stage: "MEETING_INTENT" });
    const supabase = makeMockSupabase(state);
    const sendFn = vi.fn(async () => {});

    runAiTaskMock.mockImplementation(async (mockSupabase: any, input: any) => {
      if (input.taskType === "GENERATE_WHATSAPP_REPLY") {
        return mockWhatsAppReply({
          meeting_intent: true,
          meeting_intent_evidence: [{ source: "conversation", signal: "requested_call" }],
          reply: "Yeah sure, tomorrow at 3pm works. Let me confirm.",
        });
      }
      if (input.taskType === "DETECT_MEETING_INTENT") {
        return {
          status: "COMPLETED",
          output: { meeting_intent: true, confidence: 0.9, evidence: [{ source: "conversation", signal: "requested_call" }] },
          decision: { allowed: true },
          error: null,
        };
      }
      return { status: "COMPLETED", output: {}, decision: { allowed: true }, error: null };
    });

    const meetingInput = { ...baseInput, messageId: "msg-meeting", text: "Great, let's do tomorrow at 3pm" };
    const fast = await processIncomingWhatsAppMessage(supabase, meetingInput, { sendFn });

    expect(fast.meetingIntentDetected).toBe(true);
    expect(bookMeetingMock).not.toHaveBeenCalled();

    await runBackgroundWhatsAppIntelligence(supabase, {
      userId: USER_ID,
      leadId: LEAD_ID,
      conversationId: fast.conversationId!,
      messageId: meetingInput.messageId,
      text: meetingInput.text,
      meetingSignal: true,
    });

    expect(bookMeetingMock).toHaveBeenCalledTimes(1);
    const bookingArgs = bookMeetingMock.mock.calls[0][1];
    expect(bookingArgs.idempotencyKey).toContain("wa:meeting");
    expect(new Date(bookingArgs.scheduledAt).getTime()).toBeGreaterThan(Date.now());

    const retry = await processIncomingWhatsAppMessage(supabase, meetingInput, { sendFn });
    expect(retry.processed).toBe(false);
    expect(bookMeetingMock).toHaveBeenCalledTimes(1);
  });

  it("needs_more_data qualification keeps conversation going without qualifying", async () => {
    const state = makeState({ funnel_stage: "ENRICHED", status: "nurturing" });
    const supabase = makeMockSupabase(state);
    const sendFn = vi.fn(async () => {});

    runAiTaskMock.mockImplementation(async (mockSupabase: any, input: any) => {
      if (input.taskType === "GENERATE_WHATSAPP_REPLY") return mockWhatsAppReply();
      if (input.taskType === "QUALIFY_LEAD") {
        return {
          status: "COMPLETED",
          output: { decision: "needs_more_data", scores: { icp_fit: 50, intent: 70, urgency: 40, buying_signal: 40, problem_severity: 30, timing: 40, reachability: 60, evidence_quality: 30 }, confidence: 0.4, why_now: "", evidence: [] },
          decision: { allowed: true },
          error: null,
        };
      }
      return { status: "COMPLETED", output: {}, decision: { allowed: true }, error: null };
    });

    const fast = await processIncomingWhatsAppMessage(supabase, baseInput, { sendFn });
    expect(fast.replySent).toBe(true);

    await runBackgroundWhatsAppIntelligence(supabase, {
      userId: USER_ID,
      leadId: LEAD_ID,
      conversationId: fast.conversationId!,
      messageId: baseInput.messageId,
      text: baseInput.text,
      meetingSignal: false,
    });

    expect(state.leads[0].funnel_stage).toBe("ENRICHED");
  });
});
