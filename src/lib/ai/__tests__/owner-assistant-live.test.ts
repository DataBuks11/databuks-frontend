import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { handleOwnerWhatsAppCommand } from "@/lib/ai/owner-assistant";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(SB, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

describe.runIf(SERVICE.length > 20)("owner assistant - live E2E", () => {
  it("answers every command domain from real data + executes approvals", async () => {
    const EMAIL = `oa-${Date.now().toString().slice(-7)}@databuks-test.local`;
    const created = await fetch(`${SB}/auth/v1/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      body: JSON.stringify({ email: EMAIL, password: "Sm0keTest!123", email_confirm: true }),
    });
    const uid = (await created.json()).id as string;
    expect(uid).toBeTruthy();

    try {
      await admin.from("leads").insert([
        { user_id: uid, name: "Ravi Hotel", phone: "+919000000001", lead_score: 78, status: "new", funnel_stage: "QUALIFIED" },
        { user_id: uid, name: "Sharma Clinic", phone: "+919000000002", lead_score: 55, status: "contacted", funnel_stage: "CONVERSATION" },
      ]);
      await admin.from("discovered_leads").insert({
        user_id: uid, source_platform: "google_maps", source_url: "https://x.test", source_content: "Test Biz",
        author_name: "Test Biz Nagpur", lead_score: 72, confidence: 0.7,
        evidence: { quality_gate: "QUALIFIED", geo_scope: "LOCAL" }, conversation_stage: "DISCOVER",
      });
      await admin.from("content").insert({ user_id: uid, title: "Diwali Offer Post", type: "post", platform: "instagram", status: "draft" });
      await admin.from("handoff_requests").insert({ user_id: uid, status: "PENDING", notes: "test" });

      const sent: string[] = [];
      const deps = { sendFn: async (i: any) => { sent.push(i.message); } };
      const call = (text: string) => handleOwnerWhatsAppCommand(admin, { userId: uid, text, replyJid: "x@s.whatsapp.net" }, deps);

      await call("business status kaisa hai");
      expect(sent.at(-1)).toMatch(/Leads: 2 total/);
      expect(sent.at(-1)).toMatch(/Relevant discovered: 1/);

      await call("kitni leads nikali");
      expect(sent.at(-1)).toMatch(/2 leads hain/);

      await call("relevant leads batao");
      expect(sent.at(-1)).toContain("Test Biz Nagpur");
      expect(sent.at(-1)).toContain("72pt");

      await call("pending approvals");
      expect(sent.at(-1)).toMatch(/Pending approvals:/);
      expect(sent.at(-1)).toMatch(/\[handoff\]|\[content\]/);

      await call("approve 1");
      // verify DB actually updated
      const { data: handoffs } = await admin.from("handoff_requests").select("status").eq("user_id", uid);
      const { data: drafts } = await admin.from("content").select("status").eq("user_id", uid);
      const approvedHandoff = (handoffs ?? []).some((h: any) => String(h.status).toUpperCase() === "APPROVED");
      const scheduledContent = (drafts ?? []).some((c: any) => c.status === "scheduled");
      expect(approvedHandoff || scheduledContent).toBe(true);

      await call("help");
      expect(sent.at(-1)).toMatch(/business assistant/i);
    } finally {
      for (const t of ["discovered_leads", "content", "handoff_requests", "leads"]) {
        await admin.from(t).delete().eq("user_id", uid);
      }
      await fetch(`${SB}/auth/v1/admin/users/${uid}`, {
        method: "DELETE",
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
    }
  }, 120000);
});
