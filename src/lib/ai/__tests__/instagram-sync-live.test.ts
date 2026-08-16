import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getAdapterForProvider } from "@/lib/social/adapters/registry";
import { ingestAndClassifySocialEvent } from "@/lib/social/ingest";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("placeholder") &&
  SERVICE_KEY.length > 10 &&
  !SERVICE_KEY.includes("placeholder") &&
  process.env.RUN_LIVE === "1";

describe.skipIf(!isConfigured)("Instagram adapter - real account sync (live)", () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let userId = "";

  beforeAll(async () => {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    userId = "7d219490-fc4a-4f83-83b9-c7356558b9de";
    expect(userId).toBeTruthy();
    expect(users?.users?.length ?? 0).toBeGreaterThan(0);
  });

  afterAll(async () => {
    try {
      await admin.from("social_lead_signals").delete().eq("user_id", userId).eq("provider", "instagram");
    } catch {}
    try {
      await admin.from("social_events").delete().eq("user_id", userId).eq("provider", "instagram");
    } catch {}
  });

  it(
    "pulls real Instagram media/comments and verifies the account",
    async () => {
      const { data: connection } = await admin
        .from("social_connections")
        .select("connection_id")
        .eq("user_id", userId)
        .eq("platform", "instagram")
        .eq("status", "connected")
        .limit(1)
        .maybeSingle();
      expect(connection?.connection_id).toBeTruthy();

      const adapter = getAdapterForProvider("instagram");
      expect(adapter).not.toBeNull();

      const accountInfo: any = await adapter!.getAccountInfo(connection?.connection_id ?? "", userId);
      console.log("[E2E-instagram] account:", JSON.stringify(accountInfo));
      expect(accountInfo.valid).toBe(true);

      const events = await adapter!.syncRecentEvents(connection?.connection_id ?? "", userId, 5);
      console.log(`[E2E-instagram] pulled ${events.length} events`);

      let ingested = 0;
      let classified = 0;
      for (const event of events) {
        const result = await ingestAndClassifySocialEvent(admin, userId, event);
        if (result.ingested) ingested += 1;
        if (result.classification) {
          classified += 1;
          console.log("[E2E-instagram] comment classified:", JSON.stringify({
            content: (event.content ?? "").slice(0, 60),
            classification: result.classification.classification,
            lead_score: result.classification.lead_score,
            action: result.classification.recommended_action,
          }));
        }
      }
      console.log(`[E2E-instagram] ingested=${ingested} classified=${classified}`);
      expect(accountInfo.valid).toBe(true);
    },
    420000
  );
});
