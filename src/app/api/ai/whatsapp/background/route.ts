import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runBackgroundWhatsAppIntelligence } from "@/lib/ai/whatsapp/engine";

export const maxDuration = 60;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin credentials are not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest) {
  const expectedKey = process.env.BAILEYS_API_KEY || "dev-key";
  const providedKey = request.headers.get("x-api-key");
  if (providedKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const { userId, leadId, conversationId, messageId, text, meetingSignal } = body ?? {};

    if (!userId || !leadId || !conversationId || !messageId || typeof text !== "string") {
      return NextResponse.json({ error: "userId, leadId, conversationId, messageId and text required" }, { status: 400 });
    }

    const supabase = adminClient();
    after(async () => {
      try {
        await runBackgroundWhatsAppIntelligence(supabase, {
          userId,
          leadId,
          conversationId,
          messageId,
          text,
          meetingSignal: meetingSignal === true,
        });
      } catch (err: any) {
        console.error(`[API:ai/whatsapp/background] ${err?.message}`);
      }
    });

    return NextResponse.json({ accepted: true }, { status: 202 });
  } catch (err: any) {
    console.error(`[API:ai/whatsapp/background] ${err?.message}`);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
