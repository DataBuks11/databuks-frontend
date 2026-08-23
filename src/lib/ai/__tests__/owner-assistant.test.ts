import { describe, expect, it } from "vitest";
import { gatherOwnerSnapshot } from "@/lib/ai/owner-assistant";

function makeSupabase(overrides: Record<string, number> = {}) {
  const counts: Record<string, number> = {
    leads: 12,
    "leads:new": 4,
    "leads:QUALIFIED": 6,
    discovered: 9,
    meetings_active: 3,
    meetings_upcoming: 2,
    content_published: 15,
    content_today: 2,
    content_draft: 5,
    content_scheduled: 3,
    content_story: 1,
    ...overrides,
  };
  return {
    from(table: string) {
      const call = { table, filters: {} as Record<string, any>, gteField: null as string | null };
      const builder = {
        select(_cols: string, _opts?: any) { return builder; },
        eq(col: string, val: any) { call.filters[col] = val; if (col === "user_id") return builder; return builder; },
        in(col: string, vals: any[]) { call.filters[col] = vals; return builder; },
        gte(col: string, _v: any) { call.gteField = col; return builder; },
        ilike() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        then(resolve: any) {
          let n = 0;
          const key = `${call.table}:${call.filters.status ?? ""}`;
          if (call.table === "leads") n = call.filters.funnel_stage ? counts["leads:QUALIFIED"] : call.filters.status === "new" ? counts["leads:new"] : counts.leads;
          else if (call.table === "discovered_leads") n = counts.discovered;
          else if (call.table === "meetings") n = call.gteField ? counts.meetings_upcoming : counts.meetings_active;
          else if (call.table === "content") {
            if (call.gteField) n = counts.content_today;
            else if (call.filters.type) n = counts.content_story;
            else if (call.filters.status === "published") n = counts.content_published;
            else if (call.filters.status === "draft") n = counts.content_draft;
            else if (call.filters.status === "scheduled") n = counts.content_scheduled;
            else n = counts.content_published;
          }
          return Promise.resolve({ data: [], count: n, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
}

describe("owner assistant snapshot", () => {
  it("gathers real counts from every domain", async () => {
    const snap = await gatherOwnerSnapshot(makeSupabase(), "u1");
    expect(snap.leadsTotal).toBe(12);
    expect(snap.leadsNew).toBe(4);
    expect(snap.leadsQualifiedStage).toBe(6);
    expect(snap.discoveredQualified).toBe(9);
    expect(snap.meetingsScheduled).toBe(3);
    expect(snap.meetingsUpcoming).toBe(2);
    expect(snap.postsPublishedTotal).toBe(15);
    expect(snap.postsPublishedToday).toBe(2);
    expect(snap.postsDraft).toBe(5);
    expect(snap.postsScheduled).toBe(3);
    expect(snap.storiesPublished).toBe(1);
  });

  it("handles supabase errors as zero (never fabricates)", async () => {
    const broken = {
      from() {
        throw new Error("db down");
      },
    };
    const snap = await gatherOwnerSnapshot(broken, "u1");
    expect(snap.leadsTotal).toBe(0);
  });
});
