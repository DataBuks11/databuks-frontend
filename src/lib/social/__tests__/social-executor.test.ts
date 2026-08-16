import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeSocialAction } from "@/lib/social/executor";
import { capabilitySupports, getCapabilitiesForConnection, getWhatsAppCapabilities } from "@/lib/social/capabilities";

const USER_ID = "22222222-2222-2222-2222-222222222222";

function makeMockSupabase(state: any) {
  let pending: any = null;
  function rowsFor(table: string): Record<string, any>[] {
    switch (table) {
      case "social_actions":
        return state.actions;
      case "social_connections":
        return state.connections;
      default:
        return [];
    }
  }
  function matches(row: Record<string, any>, filter: Record<string, any>): boolean {
    if (filter.gte) return new Date(row[filter.col] ?? 0) >= new Date(filter.val);
    return row[filter.col] === filter.val;
  }
  function filtered(): Record<string, any>[] {
    return rowsFor(pending.table).filter((row) => pending.filters.every((f: any) => matches(row, f)));
  }
  function execute(): { data: any; error: any; count?: number } {
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
    select(_c?: string, opts?: Record<string, any>) {
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
    gte(col: string, val: any) {
      pending.filters.push({ col, val, gte: true });
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

function makeState(connected = true): any {
  return {
    actions: [] as any[],
    connections: connected
      ? [{ id: "conn-1", user_id: USER_ID, platform: "instagram", status: "connected", connection_id: "ca_test123" }]
      : ([] as any[]),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("capability registry", () => {
  it("instagram connection exposes publishing and comment capabilities", () => {
    const caps = getCapabilitiesForConnection({ platform: "instagram", status: "connected", connection_id: "ca_x" });
    expect(caps.can_publish).toBe(true);
    expect(caps.can_reply_comments).toBe(true);
    expect(caps.can_send_messages).toBe(true);
    expect(caps.can_follow).toBe(false);
    expect(caps.token_status).toBe("valid");
  });

  it("disconnected accounts are marked expired", () => {
    const caps = getCapabilitiesForConnection({ platform: "instagram", status: "disconnected", connection_id: "ca_x" });
    expect(caps.token_status).toBe("expired");
  });

  it("whatsapp capabilities depend on session state", () => {
    expect(getWhatsAppCapabilities(true, "9187").can_send_messages).toBe(true);
    expect(getWhatsAppCapabilities(false, null).can_send_messages).toBe(false);
  });

  it("capabilitySupports maps action types", () => {
    const caps = getCapabilitiesForConnection({ platform: "instagram", status: "connected", connection_id: "ca_x" });
    expect(capabilitySupports(caps, "PUBLISH")).toBe(true);
    expect(capabilitySupports(caps, "COMMENT_REPLY")).toBe(true);
    expect(capabilitySupports(caps, "FOLLOW")).toBe(false);
    expect(capabilitySupports(caps, "UNKNOWN_ACTION")).toBe(false);
  });
});

describe("social action executor", () => {
  it("queues PENDING when approval is required", async () => {
    const state = makeState();
    const supabase = makeMockSupabase(state);
    const result = await executeSocialAction(supabase, {
      userId: USER_ID,
      provider: "instagram",
      actionType: "COMMENT_REPLY",
      targetId: "comment-1",
      content: "Thanks for asking!",
      requireApproval: true,
    });
    expect(result.status).toBe("PENDING");
    expect(result.allowed).toBe(false);
    expect(state.actions.length).toBe(1);
  });

  it("blocks unsupported capabilities with ACTION_UNAVAILABLE", async () => {
    const state = makeState();
    const supabase = makeMockSupabase(state);
    const result = await executeSocialAction(supabase, {
      userId: USER_ID,
      provider: "instagram",
      actionType: "FOLLOW",
      targetId: "user-1",
      requireApproval: false,
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.errorCode).toBe("ACTION_UNAVAILABLE");
    expect(state.actions[0].status).toBe("BLOCKED");
  });

  it("blocks when no connected account exists", async () => {
    const state = makeState(false);
    const supabase = makeMockSupabase(state);
    const result = await executeSocialAction(supabase, {
      userId: USER_ID,
      provider: "instagram",
      actionType: "COMMENT_REPLY",
      targetId: "c1",
      content: "hi",
      requireApproval: false,
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.errorCode).toBe("NO_CONNECTED_ACCOUNT");
  });

  it("is idempotent for duplicate keys", async () => {
    const state = makeState();
    const supabase = makeMockSupabase(state);
    const key = "social:test:key";
    const first = await executeSocialAction(supabase, {
      userId: USER_ID,
      provider: "instagram",
      actionType: "COMMENT_REPLY",
      targetId: "c1",
      content: "hi",
      requireApproval: true,
      idempotencyKey: key,
    });
    expect(first.status).toBe("PENDING");
    const second = await executeSocialAction(supabase, {
      userId: USER_ID,
      provider: "instagram",
      actionType: "COMMENT_REPLY",
      targetId: "c1",
      content: "hi",
      requireApproval: true,
      idempotencyKey: key,
    });
    expect(second.status).toBe("PENDING");
    expect(second.reason).toContain("replay");
    expect(state.actions.length).toBe(1);
  });

  it("enforces hourly rate limits", async () => {
    const state = makeState();
    for (let i = 0; i < 30; i++) {
      state.actions.push({
        id: `a-${i}`,
        user_id: USER_ID,
        action_type: "COMMENT_REPLY",
        created_at: new Date().toISOString(),
      });
    }
    const supabase = makeMockSupabase(state);
    const result = await executeSocialAction(supabase, {
      userId: USER_ID,
      provider: "instagram",
      actionType: "COMMENT_REPLY",
      targetId: "c2",
      content: "hi",
      requireApproval: false,
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.errorCode).toBe("RATE_LIMIT");
  });
});
