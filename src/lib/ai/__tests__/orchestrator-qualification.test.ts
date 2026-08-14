import { beforeEach, describe, expect, it, vi } from "vitest";

const { completeJsonMock } = vi.hoisted(() => ({
  completeJsonMock: vi.fn(),
}));

vi.mock("@/lib/ai/providers", () => ({
  getActiveProvider: () => ({
    id: "deepseek",
    model: "deepseek-v4-flash",
    modelVersion: "v4-flash",
    completeJson: completeJsonMock,
  }),
}));

import { runAiTask } from "@/lib/ai/orchestrator";
import { TASK_DEFINITIONS } from "@/lib/ai/tasks/definitions";

const USER_ID = "22222222-2222-2222-2222-222222222222";
const LEAD_ID = "11111111-1111-1111-1111-111111111111";

interface State {
  leads: Record<string, any>[];
  intelligence: Record<string, any>[];
  tasks: Record<string, any>[];
  decisions: Record<string, any>[];
  events: Record<string, any>[];
  businessContext: Record<string, any>[];
  settings: Record<string, any>[];
  profiles: Record<string, any>[];
  conversations: Record<string, any>[];
  messages: Record<string, any>[];
}

function makeState(): State {
  return {
    leads: [
      {
        id: LEAD_ID,
        user_id: USER_ID,
        name: "Priya Sharma",
        company: "Bluepeak Agency",
        email: null,
        phone: "919000000001",
        industry: "marketing",
        lead_score: 0,
        status: "nurturing",
        funnel_stage: "ENRICHED",
        opted_out: false,
        notes: "Actively looking for managed outreach",
      },
    ],
    intelligence: [],
    tasks: [],
    decisions: [],
    events: [],
    businessContext: [],
    settings: [],
    profiles: [],
    conversations: [],
    messages: [],
  };
}

function makeMockSupabase(state: State) {
  let pending: any = null;

  function rowsFor(table: string): Record<string, any>[] {
    switch (table) {
      case "leads":
        return state.leads;
      case "lead_intelligence":
        return state.intelligence;
      case "ai_tasks":
        return state.tasks;
      case "ai_decisions":
        return state.decisions;
      case "funnel_events":
        return state.events;
      case "business_context":
        return state.businessContext;
      case "workspace_settings":
        return state.settings;
      case "profiles":
        return state.profiles;
      case "conversations":
        return state.conversations;
      case "messages":
        return state.messages;
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

function qualificationJson(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    task: "lead_qualification",
    lead_id: LEAD_ID,
    decision: "qualified",
    scores: {
      icp_fit: 90,
      intent: 85,
      urgency: 75,
      buying_signal: 80,
      problem_severity: 70,
      timing: 80,
      reachability: 90,
      evidence_quality: 75,
    },
    confidence: 0.9,
    why_now: "Actively looking for managed outreach now",
    evidence: [{ source: "conversation", signal: "requested_pricing" }],
    recommended_channel: "whatsapp",
    recommended_action: "continue conversation",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WhatsApp auto-qualification review: QUALIFIED is gated by deterministic rules", () => {
  it("QUALIFY_LEAD rules require the full deterministic threshold set for 'qualified' decisions", () => {
    const rulesFn = TASK_DEFINITIONS.QUALIFY_LEAD!.rules as (deps: any) => string[];
    const qualifiedRules = rulesFn({ validated: { decision: "qualified" } });
    expect(qualifiedRules).toEqual([
      "LEAD_001",
      "LEAD_002",
      "LEAD_003",
      "LEAD_005",
      "LEAD_006",
      "LEAD_007",
      "LEAD_008",
    ]);
    expect(rulesFn({ validated: { decision: "needs_more_data" } })).toEqual([]);
  });

  it("BLOCKS when the AI says qualified but scores are below deterministic thresholds", async () => {
    const state = makeState();
    const supabase = makeMockSupabase(state);
    completeJsonMock.mockResolvedValueOnce(
      qualificationJson({
        scores: { ...qualificationJson().scores, icp_fit: 30 },
        confidence: 0.3,
      })
    );

    const result = await runAiTask(supabase, {
      userId: USER_ID,
      taskType: "QUALIFY_LEAD",
      leadId: LEAD_ID,
      idempotencyKey: "test:qualify:blocked",
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.decision.ruleId).toBe("LEAD_001");
    expect(state.intelligence.length).toBe(0);
    expect(state.leads[0].funnel_stage).toBe("ENRICHED");
    expect(state.decisions.length).toBe(1);
    expect(state.decisions[0].action_status).toBe("BLOCKED");
  });

  it("qualifies and persists intelligence only when every rule passes", async () => {
    const state = makeState();
    const supabase = makeMockSupabase(state);
    completeJsonMock.mockResolvedValueOnce(qualificationJson());

    const result = await runAiTask(supabase, {
      userId: USER_ID,
      taskType: "QUALIFY_LEAD",
      leadId: LEAD_ID,
      idempotencyKey: "test:qualify:pass",
    });

    expect(result.status).toBe("COMPLETED");
    expect(state.intelligence.length).toBe(1);
    expect(state.intelligence[0].overall_score).toBeTypeOf("number");
    expect(state.leads[0].funnel_stage).toBe("QUALIFIED");
  });

  it("stores analysis but does NOT qualify when the AI says needs_more_data", async () => {
    const state = makeState();
    const supabase = makeMockSupabase(state);
    completeJsonMock.mockResolvedValueOnce(qualificationJson({ decision: "needs_more_data", confidence: 0.4 }));

    const result = await runAiTask(supabase, {
      userId: USER_ID,
      taskType: "QUALIFY_LEAD",
      leadId: LEAD_ID,
      idempotencyKey: "test:qualify:needs-data",
    });

    expect(result.status).toBe("COMPLETED");
    expect(state.intelligence.length).toBe(1);
    expect(state.leads[0].funnel_stage).toBe("ENRICHED");
  });
});
