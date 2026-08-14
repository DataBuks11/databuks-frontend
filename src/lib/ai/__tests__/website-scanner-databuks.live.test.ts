import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { runWebsiteScan } from "@/lib/ai/website-scanner/scanner";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const TARGET_URL = process.env.WEBSITE_SCAN_E2E_URL || "https://databuks.org";
const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("placeholder") &&
  SERVICE_KEY.length > 10 &&
  !SERVICE_KEY.includes("placeholder") &&
  process.env.RUN_E2E === "1";

describe.skipIf(!isConfigured)("Website scanner - databuks.org production verification", () => {
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
      .insert({ user_id: userId, url: TARGET_URL, status: "QUEUED" })
      .select()
      .single();
    if (error || !scan) throw new Error(`Failed to create scan row: ${error?.message}`);
    scanId = scan.id;
  });

  afterAll(async () => {
    try {
      await admin.from("website_scan_pages").delete().eq("scan_id", scanId);
    } catch {}
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
    "discovers and scans multiple public pages of databuks.org",
    async () => {
      await runWebsiteScan(scanId, userId);

      const { data: scan } = await admin
        .from("website_scans")
        .select("*")
        .eq("id", scanId)
        .single();

      console.log("[E2E-databuks] status:", scan.status, "| error:", scan.error_message ?? "none");
      console.log("[E2E-databuks] discovered:", scan.pages_discovered, "| scanned:", scan.pages_scanned);
      console.log("[E2E-databuks] results:", JSON.stringify({
        js_rendered: scan.results?.js_rendered,
        crawl_stats: scan.results?.crawl_stats,
        analysis_mode: scan.results?.analysis_mode,
        confidence: scan.results?.confidence,
        business_name: scan.results?.business_name,
      }));

      expect(["COMPLETED", "PARTIAL"]).toContain(scan.status);
      expect(scan.pages_scanned).toBeGreaterThan(1);

      const { data: pages } = await admin
        .from("website_scan_pages")
        .select("url, page_type, depth, status")
        .eq("scan_id", scanId)
        .order("depth", { ascending: true });
      console.log("[E2E-databuks] page rows:", (pages ?? []).length);
      for (const page of pages ?? []) {
        console.log(`  [${page.depth}] ${page.page_type} ${page.url}`);
      }
      expect((pages ?? []).length).toBeGreaterThan(1);
      expect((pages ?? []).some((p: any) => p.page_type !== "home")).toBe(true);
    },
    420000
  );
});
