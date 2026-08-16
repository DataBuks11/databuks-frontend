import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { processSocialEvent } from "@/lib/social/processor";

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
  const userId = "7d219490-fc4a-4f83-83b9-c7356558b9de";
  const stamp = Date.now();

  beforeAll(async () => {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    expect(users?.users?.length ?? 0).toBeGreaterThan(0);
  });

  afterAll(async () => {
    try {
      await admin.from("social_events").delete().eq("user_id", userId).eq("provider", "test-provider");
    } catch {}
    try {
      await admin.from("social_lead_signals").delete().eq("user_id", userId).eq("provider", "test-provider");
    } catch {}
    try {
      await admin.from("social_actions").delete().eq("user_id", userId).eq("provider", "test-provider");
    } catch {}
  });

  it(
    "full pipeline: event -> classify -> lead signal -> PENDING reply action",
    async () => {
      const externalId = `test-comment-${stamp}`;

      const result = await processSocialEvent(admin, userId, {
        provider: "test-provider",
        account_id: "test-account",
        external_event_id: externalId,
        event_type: "comment",
        author_id: `test-author-${stamp}`,
        author_name: "Test Commenter",
        comment_id: `comment-${stamp}`,
        content: "Hi, we need a website for our shop. Can you DM the pricing?",
      });

      console.log("[E2E-social] result:", JSON.stringify({
        status: result.status,
        classification: result.classification ? {
          classification: result.classification.classification,
          intent_score: result.classification.intent_score,
          lead_score: result.classification.lead_score,
          recommended_action: result.classification.recommended_action,
          should_reply: result.classification.should_reply,
          reply_draft: result.classification.reply_draft,
        } : null,
        signalId: result.signalId,
        actionId: result.actionId,
      }));

      expect(result.status).toBe("PROCESSED");
      expect(result.signalId).toBeTruthy();
      expect(result.actionId).toBeTruthy();

      const { data: action } = await admin
        .from("social_actions")
        .select("status, action_type, content")
        .eq("id", result.actionId)
        .single();
      expect(action?.status).toBe("PENDING");
      expect(action?.action_type).toBe("COMMENT_REPLY");
      expect(action?.content).toBeTruthy();

      const duplicate = await processSocialEvent(admin, userId, {
        provider: "test-provider",
        account_id: "test-account",
        external_event_id: externalId,
        event_type: "comment",
        content: "Hi, we need a website for our shop. Can you DM the pricing?",
      });
      expect(duplicate.status).toBe("DUPLICATE");
    },
    300000
  );
});
