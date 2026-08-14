import { beforeEach, describe, expect, it } from "vitest";
import { transitionLead } from "@/lib/ai/funnel/service";
import { bookMeeting } from "@/lib/ai/meeting/engine";

const LEAD_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

function makeLead(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: LEAD_ID,
    user_id: USER_ID,
    name: "Jane Founder",
    company: "Acme Corp",
    email: "jane@acme.com",
    phone: null,
    industry: "SaaS",
    status: "new",
    funnel_stage: "DISCOVERED",
    opted_out: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeIntelligence(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    lead_id: LEAD_ID,
    user_id: USER_ID,
    icp_fit_score: 92,
    intent_score: 95,
    urgency_score: 88,
    buying_signal_score: 91,
    confidence: 0.91,
    evidence: [{ source: "conversation", signal: "requested_call" }],
    why_now: "Actively looking now",
    ...overrides,
  };
}

interface MockState {
  leads: Record<string, any>[];
  intelligence: Record<string, any>[];
  events: Record<string, any>[];
  meetings: Record<string, any>[];
}

function makeMockSupabase(state: MockState) {
  let pending: {
    table: string;
    filters: Record<string, any>[];
    selectCols: string;
    count: boolean;
    head: boolean;
    limit: number | null;
    orderCol: string | null;
    insertData: Record<string, any> | null;
    updateData: Record<string, any> | null;
  } = {
    table: "",
    filters: [],
    selectCols: "*",
    count: false,
    head: false,
    limit: null,
    orderCol: null,
    insertData: null,
    updateData: null,
  };

  function rowsFor(table: string): Record<string, any>[] {
    switch (table) {
      case "leads":
        return state.leads;
      case "lead_intelligence":
        return state.intelligence;
      case "funnel_events":
        return state.events;
      case "meetings":
        return state.meetings;
      default:
        return [];
    }
  }

  function matches(row: Record<string, any>, filter: Record<string, any>): boolean {
    if (filter.neq) return row[filter.col] !== filter.val;
    if (filter.vals) return filter.vals.includes(row[filter.col]);
    if (filter.gte) return new Date(row[filter.col]) >= new Date(filter.val);
    return row[filter.col] === filter.val;
  }

  function filteredRows(): Record<string, any>[] {
    return rowsFor(pending.table).filter((row) => pending.filters.every((f) => matches(row, f)));
  }

  function executePending(): { data: any; error: any; count?: number } {
    if (pending.insertData) {
      const data = pending.insertData;
      if (pending.table === "meetings" && data.idempotency_key) {
        const dupe = rowsFor("meetings").find(
          (m) => m.user_id === data.user_id && m.idempotency_key === data.idempotency_key
        );
        if (dupe) return { data: null, error: { code: "23505", message: "duplicate key" } };
      }
      const row = {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        created_at: new Date().toISOString(),
        ...data,
      };
      rowsFor(pending.table).push(row);
      return { data: row, error: null };
    }
    if (pending.updateData) {
      const rows = filteredRows();
      for (const row of rows) Object.assign(row, pending.updateData);
      return { data: rows.length > 0 ? rows[0] : null, error: rows.length === 0 ? { code: "PGRST116" } : null };
    }
    const rows = filteredRows();
    return pending.count
      ? { data: pending.head ? null : rows, count: rows.length, error: null }
      : { data: rows, error: null };
  }

  const mock: any = {
    state,
    from(table: string) {
      pending = {
        table,
        filters: [],
        selectCols: "*",
        count: false,
        head: false,
        limit: null,
        orderCol: null,
        insertData: null,
        updateData: null,
      };
      return mock;
    },
    select(cols?: string, opts?: Record<string, any>) {
      pending.selectCols = cols ?? "*";
      if (opts?.count) pending.count = true;
      if (opts?.head) pending.head = true;
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
      pending.filters.push({ col, vals });
      return mock;
    },
    gte(col: string, val: any) {
      pending.filters.push({ col, val, gte: true });
      return mock;
    },
    order(col: string) {
      pending.orderCol = col;
      return mock;
    },
    limit(n: number) {
      pending.limit = n;
      return mock;
    },
    maybeSingle() {
      const rows = filteredRows();
      return { data: rows.length > 0 ? rows[0] : null, error: null };
    },
    single() {
      return executePending();
    },
    then(resolve: (value: any) => void, reject?: (err: any) => void) {
      return Promise.resolve(executePending()).then(resolve, reject);
    },
  };
  return mock;
}

function makeState(leadOverrides: Record<string, any> = {}, intelligence?: Record<string, any> | null): MockState {
  return {
    leads: [makeLead(leadOverrides)],
    intelligence: intelligence === null ? [] : [makeIntelligence(intelligence)],
    events: [],
    meetings: [],
  };
}

describe("funnel transition service", () => {
  let state: MockState;
  beforeEach(() => {
    state = makeState();
  });

  it("executes a valid transition and logs a funnel event", async () => {
    const supabase = makeMockSupabase(state);
    const result = await transitionLead(supabase, {
      leadId: LEAD_ID,
      userId: USER_ID,
      toStage: "ENRICHED",
    });

    expect(result.allowed).toBe(true);
    expect(result.fromStage).toBe("DISCOVERED");
    expect(result.toStage).toBe("ENRICHED");
    expect(state.leads[0].funnel_stage).toBe("ENRICHED");
    expect(state.events.length).toBe(1);
    expect(state.events[0].event_type).toBe("STAGE_TRANSITION");
  });

  it("blocks invalid transitions and logs TRANSITION_BLOCKED", async () => {
    const supabase = makeMockSupabase(state);
    const result = await transitionLead(supabase, {
      leadId: LEAD_ID,
      userId: USER_ID,
      toStage: "MEETING_BOOKED",
    });

    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("FUNNEL_001");
    expect(state.leads[0].funnel_stage).toBe("DISCOVERED");
    expect(state.events[0].event_type).toBe("TRANSITION_BLOCKED");
  });

  it("blocks QUALIFIED when intelligence fails thresholds", async () => {
    state = makeState({ funnel_stage: "ENRICHED", status: "nurturing" }, { icp_fit_score: 10, intent_score: 20 });
    const supabase = makeMockSupabase(state);
    const result = await transitionLead(supabase, {
      leadId: LEAD_ID,
      userId: USER_ID,
      toStage: "QUALIFIED",
      intelligence: state.intelligence[0],
      qualificationDecision: "qualified",
    });

    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("LEAD_001");
    expect(state.leads[0].funnel_stage).toBe("ENRICHED");
  });

  it("treats same-stage transition as a no-op", async () => {
    state = makeState({ funnel_stage: "QUALIFIED", status: "qualified" }, null);
    const supabase = makeMockSupabase(state);
    const result = await transitionLead(supabase, {
      leadId: LEAD_ID,
      userId: USER_ID,
      toStage: "QUALIFIED",
      intelligence: state.intelligence[0],
      qualificationDecision: "qualified",
    });

    expect(result.allowed).toBe(true);
    expect(result.alreadyInStage).toBe(true);
    expect(state.events.length).toBe(0);
  });
});

describe("meeting engine", () => {
  it("books a meeting when intent, evidence and scheduling are valid", async () => {
    const state = makeState({ funnel_stage: "MEETING_INTENT" });
    const supabase = makeMockSupabase(state);
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    const result = await bookMeeting(supabase, {
      userId: USER_ID,
      leadId: LEAD_ID,
      scheduledAt: future,
      durationMinutes: 30,
      medium: "call",
      idempotencyKey: "meeting:test:1",
    });

    expect(result.allowed).toBe(true);
    expect(result.meeting).not.toBeNull();
    expect(result.meeting?.status).toBe("scheduled");
    expect(state.meetings.length).toBe(1);
    expect(state.leads[0].funnel_stage).toBe("MEETING_BOOKED");
  });

  it("blocks meeting booking when lead is not in MEETING_INTENT", async () => {
    const state = makeState({ funnel_stage: "CONVERSATION" });
    const supabase = makeMockSupabase(state);
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    const result = await bookMeeting(supabase, {
      userId: USER_ID,
      leadId: LEAD_ID,
      scheduledAt: future,
      durationMinutes: 30,
      medium: "call",
    });

    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("LEAD_013");
    expect(state.meetings.length).toBe(0);
  });

  it("blocks meeting booking without intent evidence", async () => {
    const state = makeState({ funnel_stage: "MEETING_INTENT" }, { evidence: [] });
    const supabase = makeMockSupabase(state);
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    const result = await bookMeeting(supabase, {
      userId: USER_ID,
      leadId: LEAD_ID,
      scheduledAt: future,
      durationMinutes: 30,
      medium: "call",
    });

    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("LEAD_020");
  });

  it("blocks meeting booking with a past scheduled time", async () => {
    const state = makeState({ funnel_stage: "MEETING_INTENT" });
    const supabase = makeMockSupabase(state);
    const past = new Date(Date.now() - 3600 * 1000).toISOString();

    const result = await bookMeeting(supabase, {
      userId: USER_ID,
      leadId: LEAD_ID,
      scheduledAt: past,
      durationMinutes: 30,
      medium: "call",
    });

    expect(result.allowed).toBe(false);
    expect(result.ruleId).toBe("LEAD_015");
  });

  it("replays idempotent booking without creating a second meeting", async () => {
    const state = makeState({ funnel_stage: "MEETING_INTENT" });
    const supabase = makeMockSupabase(state);
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const key = "meeting:test:idem";

    const first = await bookMeeting(supabase, {
      userId: USER_ID,
      leadId: LEAD_ID,
      scheduledAt: future,
      durationMinutes: 30,
      medium: "call",
      idempotencyKey: key,
    });
    expect(first.allowed).toBe(true);

    state.meetings[0].id = "existing-meeting-id";
    const second = await bookMeeting(supabase, {
      userId: USER_ID,
      leadId: LEAD_ID,
      scheduledAt: future,
      durationMinutes: 30,
      medium: "call",
      idempotencyKey: key,
    });

    expect(second.allowed).toBe(true);
    expect(state.meetings.length).toBe(1);
    expect(second.meeting?.id).toBe("existing-meeting-id");
  });
});
