import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { handleOwnerWhatsAppCommand } from "@/lib/ai/owner-assistant";

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(SB, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

// Mirror of the webhook's bound-user lookup (JID-normalized, last-10-digit match)
function normalizeJidPhone(jid: string): string {
  return String(jid).split("@")[0].split(":")[0].split(".")[0].replace(/\D/g, "");
}
function findBound(profiles: any[], senderJid: string) {
  const digits = normalizeJidPhone(senderJid);
  const last10 = digits.slice(-10);
  return (profiles ?? []).find((p: any) => {
    const pd = String(p.phone ?? "").replace(/\D/g, "");
    if (pd.length < 10) return false;
    return pd === digits || pd.endsWith(last10) || last10.endsWith(pd.slice(-10));
  });
}

describe.runIf(SERVICE.length > 20)("multi-tenant assistant binding - live", () => {
  it("binds via profiles.phone and serves the user's own assistant instantly", async () => {
    const EMAIL = `mt-${Date.now().toString().slice(-7)}@databuks-test.local`;
    const PHONE = "+91 98765 43210";
    const created = await fetch(`${SB}/auth/v1/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      body: JSON.stringify({ email: EMAIL, password: "Sm0keTest!123", email_confirm: true }),
    });
    const uid = (await created.json()).id as string;
    expect(uid).toBeTruthy();

    try {
      // user sets phone in Profile
      await admin.from("profiles").upsert({ id: uid, phone: PHONE, full_name: "MT Test" });

      // seed one lead so the assistant has real data
      await admin.from("leads").insert({ user_id: uid, name: "Bound User Lead", phone: "+919000009999", lead_score: 64, status: "new", funnel_stage: "QUALIFIED" });

      // webhook simulation: sender's phone → bound lookup (JID with device suffix!)
      const { data: profiles } = await admin.from("profiles").select("id, phone").not("phone", "is", null).limit(500);
      const senderJid = "919876543210.0:64@s.whatsapp.net"; // messy device-suffix format
      const bound = findBound(profiles ?? [], senderJid);
      expect(bound?.id).toBe(uid);

      // assistant serves the BOUND user
      const sent: string[] = [];
      await handleOwnerWhatsAppCommand(
        admin,
        { userId: bound.id, text: "kitni leads nikali", replyJid: senderJid },
        { sendFn: async (i) => { sent.push(i.message); } }
      );
      expect(sent.at(-1)).toContain("1 leads");
      expect(sent.at(-1)).toContain("1 nayi");

      // unbound number must NOT match anyone
      const noMatch = findBound(profiles ?? [], "9198123456789");
      expect(noMatch).toBeUndefined();
    } finally {
      await admin.from("leads").delete().eq("user_id", uid);
      await admin.from("profiles").delete().eq("id", uid);
      await fetch(`${SB}/auth/v1/admin/users/${uid}`, {
        method: "DELETE",
        headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
    }
  }, 120000);
});
