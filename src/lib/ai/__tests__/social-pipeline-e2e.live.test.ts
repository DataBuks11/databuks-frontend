import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { runAiTask } from "@/lib/ai/orchestrator";
import { buildBusinessContext } from "@/lib/ai/context/business-context";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("placeholder") &&
  SERVICE_KEY.length > 10 &&
  !SERVICE_KEY.includes("placeholder") &&
  process.env.RUN_E2E === "1";

describe.skipIf(!isConfigured)("Social AI pipeline - production E2E (test event)", () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let userId = "";
  const createdIds: string[] = [];

  beforeAll(async () => {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    userId = users?.users?.[0]?.id ?? "";
    expect(userId).toBeTruthy();
  });

  afterAll(async () => {
    for (const id of createdIds) {
      try {
        await admin.from("social_events").delete().eq("id", id);
      } catch {}
    }
    try {
      await admin.from("social_lead_signals").delete().eq("user_id", userId).eq("provider", "test-provider");
    } catch {}
  });

  it(
    "ingests a comment event, classifies with V4 Flash and stores lead signals",
    async () => {
      const stamp = Date.now();
      const externalId = `test-comment-${stamp}`;
      const { data: event, error } = await admin
        .from("social_events")
        .insert({
          user_id: userId,
          provider: "test-provider",
          account_id: "test-account",
          external_event_id: externalId,
          event_type: "comment",
          author_name: "Test Commenter",
          content: "Hi, we need a website for our shop. Can you DM the pricing?",
        })
        .select()
        .single();
      expect(error).toBeNull();
      createdIds.push(event.id);

      const { data: dup } = await admin
        .from("social_events")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "test-provider")
        .eq("external_event_id", externalId)
        .maybeSingle();
      expect(dup).not.toBeNull();

      const business = await buildBusinessContext(admin, userId);
      const context = {
        business,
        lead: null,
        intelligence: null,
        conversation: null,
        messages: [],
        conversationSummary: null,
        duplicateExists: false,
        lastOutreachAt: null,
        outreachCountInWindow: 0,
        socialEvent: { content: event.content, author_name: event.author_name, event_type: "comment" },
      } as any;

      const classification = await runAiTask(admin, {
        userId,
        taskType: "CLASSIFY_SOCIAL_EVENT",
        payload: { external_event_id: externalId },
        idempotencyKey: `test:social:classify:${stamp}`,
        prebuiltContext: context,
      });

      expect(classification.status).toBe("COMPLETED");
      const output = classification.output ?? {};
      console.log("[E2E-social] classification:", JSON.stringify({
        classification: output.classification,
        intent_score: output.intent_score,
        lead_score: output.lead_score,
        recommended_action: output.recommended_action,
      }));
      expect(["pricing_interest", "service_interest", "question", "buying_intent"]).toContain(output.classification);

      const { data: signal, error: signalError } = await admin
        .from("social_lead_signals")
        .insert({
          user_id: userId,
          provider: "test-provider",
          account_id: "test-account",
          event_id: event.id,
          signal_type: output.classification ?? "unknown",
          intent_score: output.intent_score ?? 0,
          lead_score: output.lead_score ?? 0,
          sentiment: output.sentiment ?? "neutral",
          evidence: { reason: output.reason ?? null },
        })
        .select()
        .single();
      expect(signalError).toBeNull();
      console.log("[E2E-social] lead signal stored:", signal.id);
    },
    300000
  );
});
