import { beforeEach, describe, expect, it, vi } from "vitest";

const { runAiTaskMock } = vi.hoisted(() => ({ runAiTaskMock: vi.fn() }));
vi.mock("@/lib/ai/orchestrator", () => ({ runAiTask: runAiTaskMock }));
vi.mock("@/lib/ai/context/business-context", () => ({
  buildBusinessContext: vi.fn(async () => ({
    business_name: "DataBuks",
    description: "tech agency",
    products: [],
    services: [{ name: "Websites", description: "" }],
    target_audience: [],
    ideal_customer_profile: {},
    locations: [],
    industries: [],
    offer: {},
    pricing: {},
    brand_voice: [],
    tone: null,
    constraints: {},
    excluded_industries: [],
    excluded_lead_types: [],
    preferred_channels: [],
    monthly_meeting_target: 20,
    available: true,
    missing_fields: [],
  })),
}));

import { processSocialEvent, getRecentEventsForAuthor } from "@/lib/social/processor";

const USER_ID = "22222222-2222-2222-2222-222222222222";

function makeMockSupabase(state: any) {
  let pending: any = null;
  function rowsFor(table: string): Record<string, any>[] {
    switch (table) {
      case "social_events":
        return state.events;
      case "social_lead_signals":
        return state.signals;
      case "social_actions":
        return state.actions;
      case "ai_decisions":
        return state.decisions;
      default:
        return [];
    }
  }
  function matches(row: Record<string, any>, filter: Record<string, any>): boolean {
    return row[filter.col] === filter.val;
  }
  function filtered(): Record<string, any>[] {
    return rowsFor(pending.table).filter((row) => pending.filters.every((f: any) => matches(row, f)));
  }
  function execute(): { data: any; error: any } {
    if (pending.insertData) {
      const row = { id: `id-${Math.random().toString(36).slice(2, 10)}`, created_at: new Date().toISOString(), ...pending.insertData };
      rowsFor(pending.table).push(row);
      return { data: row, error: null };
    }
    if (pending.updateData) {
      const rows = filtered();
      for (const row of rows) Object.assign(row, pending.updateData);
      return { data: rows[0] ?? null, error: null };
    }
    let rows = filtered();
    if (pending.orderCol) {
      rows = [...rows].sort((a, b) => {
        const av = a[pending.orderCol];
        const bv = b[pending.orderCol];
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return pending.orderAsc ? cmp : -cmp;
      });
    }
    return { data: rows, error: null };
  }
  const mock: any = {
    state,
    from(table: string) {
      pending = { table, filters: [], insertData: null, updateData: null, orderCol: null, orderAsc: true };
      return mock;
    },
    select() {
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
    order(col: string, opts?: { ascending?: boolean }) {
      pending.orderCol = col;
      pending.orderAsc = opts?.ascending !== false;
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
    then(resolve: (v: any) => void, reject?: (e: any) => void) {
      return Promise.resolve(execute()).then(resolve, reject);
    },
  };
  return mock;
}

function makeState(): any {
  return { events: [], signals: [], actions: [], decisions: [] };
}

const baseEvent = {
  provider: "instagram",
  account_id: "ca_test",
  external_event_id: "ig-comment-1",
  event_type: "comment",
  author_id: "author-1",
  author_name: "Test User",
  comment_id: "comment-1",
  content: "How much does a website cost?",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("social event processor", () => {
  it("processes an event and proposes a PENDING reply action when should_reply", async () => {
    const state = makeState();
    const supabase = makeMockSupabase(state);
    runAiTaskMock.mockResolvedValueOnce({
      status: "COMPLETED",
      taskId: "task-1",
      output: {
        classification: "pricing",
        intent_score: 85,
        lead_score: 80,
        sentiment: "neutral",
        urgency: 60,
        recommended_action: "REPLY",
        should_reply: true,
        escalation_required: false,
        reply_draft: "Depends on what you need. DM us your project details!",
        reason: "price question",
        confidence: 0.9,
      },
    });

    const result = await processSocialEvent(supabase, USER_ID, baseEvent);

    expect(result.status).toBe("PROCESSED");
    expect(result.signalId).toBeTruthy();
    expect(result.actionId).toBeTruthy();
    expect(state.actions.length).toBe(1);
    expect(state.actions[0].status).toBe("PENDING");
    expect(state.actions[0].action_type).toBe("COMMENT_REPLY");
    expect(state.actions[0].content).toContain("Depends");
    expect(state.events[0].processing_status).toBe("PROCESSED");
  });

  it("is idempotent - duplicate events are ignored without side effects", async () => {
    const state = makeState();
    const supabase = makeMockSupabase(state);
    runAiTaskMock.mockResolvedValue({
      status: "COMPLETED",
      taskId: "t",
      output: {
        classification: "general",
        intent_score: 10,
        lead_score: 5,
        sentiment: "positive",
        urgency: 0,
        recommended_action: "IGNORE",
        should_reply: false,
        escalation_required: false,
        reply_draft: null,
        reason: "greeting",
        confidence: 0.9,
      },
    });

    await processSocialEvent(supabase, USER_ID, baseEvent);
    const second = await processSocialEvent(supabase, USER_ID, baseEvent);

    expect(second.status).toBe("DUPLICATE");
    expect(runAiTaskMock).toHaveBeenCalledTimes(1);
    expect(state.events.length).toBe(1);
    expect(state.signals.length).toBe(1);
  });

  it("escalates complaints to human without proposing an action", async () => {
    const state = makeState();
    const supabase = makeMockSupabase(state);
    runAiTaskMock.mockResolvedValueOnce({
      status: "COMPLETED",
      taskId: "t",
      output: {
        classification: "complaint",
        intent_score: 70,
        lead_score: 0,
        sentiment: "negative",
        urgency: 95,
        recommended_action: "ESCALATE_TO_HUMAN",
        should_reply: false,
        escalation_required: true,
        reply_draft: null,
        reason: "refund dispute",
        confidence: 0.9,
      },
    });

    const result = await processSocialEvent(supabase, USER_ID, {
      ...baseEvent,
      content: "Your service is a scam, I want my refund now",
    });

    expect(result.status).toBe("PROCESSED");
    expect(result.escalated).toBe(true);
    expect(result.actionId).toBeNull();
    expect(state.decisions.length).toBe(1);
    expect(state.decisions[0].ai_decision).toBe("escalate_to_human");
  });

  it("ignores empty-content events", async () => {
    const state = makeState();
    const supabase = makeMockSupabase(state);
    const result = await processSocialEvent(supabase, USER_ID, { ...baseEvent, content: "" });
    expect(result.status).toBe("IGNORED");
    expect(runAiTaskMock).not.toHaveBeenCalled();
    expect(state.events[0].processing_status).toBe("IGNORED");
  });

  it("fails gracefully when DeepSeek fails", async () => {
    const state = makeState();
    const supabase = makeMockSupabase(state);
    runAiTaskMock.mockResolvedValueOnce({ status: "FAILED", output: null });
    const result = await processSocialEvent(supabase, USER_ID, baseEvent);
    expect(result.status).toBe("FAILED");
    expect(state.events[0].processing_status).toBe("FAILED");
    expect(state.signals.length).toBe(0);
  });

  it("loads recent events for the same author only", async () => {
    const state = makeState();
    state.events.push(
      { id: "e1", user_id: USER_ID, provider: "instagram", author_id: "author-1", author_name: "A", content: "hi", created_at: "2026-08-15T00:00:00Z" },
      { id: "e2", user_id: USER_ID, provider: "instagram", author_id: "author-1", author_name: "A", content: "price?", created_at: "2026-08-15T00:01:00Z" },
      { id: "e3", user_id: USER_ID, provider: "instagram", author_id: "other", author_name: "B", content: "unrelated", created_at: "2026-08-15T00:02:00Z" }
    );
    const supabase = makeMockSupabase(state);
    const recent = await getRecentEventsForAuthor(supabase, USER_ID, "instagram", "author-1", 5);
    expect(recent.length).toBe(2);
    expect(recent[0].content).toBe("hi");
    expect(recent[1].content).toBe("price?");
  });
});
