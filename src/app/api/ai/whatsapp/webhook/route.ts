import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processIncomingWhatsAppMessage } from "@/lib/ai/whatsapp/engine";

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
    const userId = body?.userId;
    const message = body?.message;

    if (!userId || !message?.remoteJid || !message?.messageId || !message?.text) {
      return NextResponse.json({ error: "userId and message (remoteJid, messageId, text) required" }, { status: 400 });
    }

    if (message.fromMe === true) {
      return NextResponse.json({ processed: false, skippedReason: "outbound" });
    }

    const supabase = adminClient();
    const result = await processIncomingWhatsAppMessage(supabase, {
      userId,
      remoteJid: message.remoteJid,
      messageId: message.messageId,
      text: message.text,
      timestamp: message.timestamp ?? undefined,
      pushName: message.pushName ?? undefined,
    });

    if (result.processed && result.leadId && result.conversationId) {
      const backgroundUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}/api/ai/whatsapp/background`
        : "https://databuks-frontend.vercel.app/api/ai/whatsapp/background";
      const backgroundBody = {
        userId,
        leadId: result.leadId,
        conversationId: result.conversationId,
        messageId: message.messageId,
        text: message.text,
        meetingSignal: result.meetingIntentDetected === true,
      };
      after(async () => {
        try {
          await fetch(backgroundUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": expectedKey,
            },
            body: JSON.stringify(backgroundBody),
          });
        } catch (err: any) {
          console.error(`[API:ai/whatsapp/webhook] background trigger failed: ${err?.message}`);
        }
      });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error(`[API:ai/whatsapp/webhook] ${err?.message}`);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

