import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin credentials are not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function sendViaBaileys(jid: string, message: string): Promise<void> {
  const baseUrl = process.env.BAILEYS_SERVER_URL;
  const apiKey = process.env.BAILEYS_API_KEY;
  if (!baseUrl) throw new Error("BAILEYS_SERVER_URL not configured");
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey || "dev-key" },
    body: JSON.stringify({ userId: process.env.OWNER_WHATSAPP_NUMBER?.slice(-10) ?? "reminder", jid, message }),
  });
  if (!res.ok) throw new Error(`Baileys send failed: ${res.status}`);
}

export async function GET(request: NextRequest) {
  const expectedKey =
    process.env.CRON_SECRET || process.env.CRAWLER_SERVICE_KEY || process.env.BAILEYS_API_KEY || "dev-key";
  const providedKey =
    request.headers.get("x-api-key") ??
    (request.headers.get("authorization")?.startsWith("Bearer ")
      ? request.headers.get("authorization")?.slice(7)
      : null);
  if (providedKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = adminClient();
    const now = new Date().toISOString();
    // Atomically claim due reminders so multiple cron runs don't double-send
    const { data: due, error } = await supabase
      .from("reminders")
      .select("id, user_id, remote_jid, message_text, send_at")
      .eq("status", "pending")
      .lte("send_at", now)
      .order("send_at", { ascending: true })
      .limit(20);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const r of due ?? []) {
      try {
        await sendViaBaileys(r.remote_jid, r.message_text);
        await supabase
          .from("reminders")
          .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", r.id);
        results.push({ id: r.id, ok: true });
      } catch (err: any) {
        await supabase
          .from("reminders")
          .update({ status: "failed", error_message: String(err?.message ?? "unknown"), updated_at: new Date().toISOString() })
          .eq("id", r.id);
        results.push({ id: r.id, ok: false, error: String(err?.message ?? "unknown") });
      }
    }
    return NextResponse.json({ ok: true, due: results.length, sent: results.filter((r) => r.ok).length, results });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed" }, { status: 500 });
  }
}
