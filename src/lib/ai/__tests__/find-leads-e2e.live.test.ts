import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { runFindLeads } from "@/lib/growth/orchestrator";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("placeholder") &&
  SERVICE_KEY.length > 10 &&
  !SERVICE_KEY.includes("placeholder") &&
  process.env.RUN_E2E === "1";

describe.skipIf(!isConfigured)("Find Leads - production E2E", () => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  it("runs full external lead discovery pipeline against production", async () => {
    const userId = "7d219490-fc4a-4f83-83b9-c7356558b9de";

    const result = await runFindLeads(admin, userId, { max_queries: 5, max_pages: 30 });

    console.log("[E2E-find-leads]", JSON.stringify(result));
    expect(["COMPLETED", "PARTIAL"]).toContain(result.status);
    expect(result.queries_generated).toBeGreaterThan(0);
    expect(result.canonical_businesses).toBeGreaterThan(0);

    const { data: leads } = await admin
      .from("discovered_leads")
      .select("id, author_name, source_platform")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    console.log("[E2E-find-leads] discovered_leads rows:", (leads ?? []).length);
  }, 600000);
});
