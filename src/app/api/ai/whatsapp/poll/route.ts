import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pollOwnerWhatsAppCommands } from "@/lib/ai/whatsapp/owner-poll";

export const maxDuration = 120;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin credentials are not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * GET/POST /api/ai/whatsapp/poll
 * Processes unprocessed from-me (owner) WhatsApp messages through the
 * owner assistant. Auth: CRON_SECRET bearer, crawler/baileys key, or
 * x-api-key — same scheme as the other cron routes.
 */
async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const fallbackKey = process.env.CRAWLER_SERVICE_KEY || process.env.BAILEYS_API_KEY || "dev-key";
  const auth = request.headers.get("authorization") ?? "";
  const apiKey = request.headers.get("x-api-key") ?? "";
  const authorized =
    (cronSecret && auth === `Bearer ${cronSecret}`) ||
    apiKey === fallbackKey ||
    auth === `Bearer ${fallbackKey}`;
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = adminClient();
    const result = await pollOwnerWhatsAppCommands(supabase, { limit: 10 });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error(`[API:ai/whatsapp/poll] ${err?.message}`);
    return NextResponse.json({ error: "Poll failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
