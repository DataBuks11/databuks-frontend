import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { runWebsiteScan } from "@/lib/ai/website-scanner/scanner";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("placeholder") &&
  SERVICE_KEY.length > 10 &&
  !SERVICE_KEY.includes("placeholder") &&
  process.env.RUN_E2E === "1";

describe.skipIf(!isConfigured)("Website scanner - production E2E (test scan)", () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId = "";
  let scanId = "";
  let contextSnapshot: Record<string, any> | null = null;
  let contextExisted = false;

  beforeAll(async () => {
    const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (usersError || !users?.users?.length) throw new Error(`No auth users found: ${usersError?.message}`);
    userId = users.users[0].id;

    const { data: context } = await admin
      .from("business_context")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    contextSnapshot = context ?? null;
    contextExisted = !!context;

    const { data: scan, error } = await admin
      .from("website_scans")
      .insert({ user_id: userId, url: "https://databuks-frontend.vercel.app", status: "QUEUED" })
      .select()
      .single();
    if (error || !scan) throw new Error(`Failed to create scan row: ${error?.message}`);
    scanId = scan.id;
  });

  afterAll(async () => {
    try {
      await admin.from("website_scans").delete().eq("id", scanId);
    } catch {}
    if (contextExisted && contextSnapshot) {
      const { id, created_at, updated_at, ...rest } = contextSnapshot;
      try {
        await admin.from("business_context").update(rest).eq("user_id", userId);
      } catch {}
    } else {
      try {
        await admin.from("business_context").delete().eq("user_id", userId);
      } catch {}
    }
  });

  it(
    "scans a public website, stores structured results and syncs business context",
    async () => {
      expect(scanId).toBeTruthy();
      expect(userId).toBeTruthy();

      await runWebsiteScan(scanId, userId);

      const { data: scan } = await admin
        .from("website_scans")
        .select("*")
        .eq("id", scanId)
        .single();

      console.log("[E2E-scan] status:", scan.status, "| error:", scan.error_message ?? "none");
      expect(["COMPLETED", "PARTIAL"]).toContain(scan.status);
      expect(scan.pages_crawled).toBeGreaterThan(0);

      const results = scan.results ?? {};
      expect(results.task).toBe("website_analysis");
      expect(typeof results.confidence).toBe("number");
      expect(["string", "object"]).toContain(typeof results.overview);
      expect(Array.isArray(results.services)).toBe(true);
      expect(Array.isArray(results.business_signals)).toBe(true);
      console.log("[E2E-scan] model:", results.model, "| confidence:", results.confidence, "| pages:", results.pages_crawled);

      expect(scan.context_synced_at).not.toBeNull();

      const { data: context } = await admin
        .from("business_context")
        .select("business_name, description, services, products, industries, locations, brand_voice")
        .eq("user_id", userId)
        .maybeSingle();
      expect(context, "business_context must exist after scan").not.toBeNull();
      const ctx = context as Record<string, any>;
      expect(ctx.business_name).toBeTruthy();
      console.log("[E2E-scan] business context:", JSON.stringify({
        business_name: ctx.business_name,
        description: typeof ctx.description === "string" ? ctx.description.slice(0, 60) : null,
        services: Array.isArray(ctx.services) ? ctx.services.length : 0,
        industries: ctx.industries,
      }));
    },
    300000
  );
});
