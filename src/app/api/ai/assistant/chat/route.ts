import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handleOwnerWhatsAppCommand } from "@/lib/ai/owner-assistant";

export const maxDuration = 60;

/**
 * POST /api/ai/assistant/chat
 * The website chatbot — same brain as the WhatsApp assistant, served over
 * HTTP for the logged-in user. Session-authenticated, answers from the
 * user's own data (leads, meetings, posts, approvals).
 *
 * If the request body includes `sendToWhatsApp: true`, the user's message
 * is also routed through the real WhatsApp pipeline:
 *   - Stored in `conversations` + `messages` (tied to the user's bound phone)
 *   - Sent to Baileys so it lands on the lead's actual WhatsApp
 *   - The AI's reply is delivered back via Baileys too
 * This makes the dashboard widget a full WhatsApp test interface.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const message = String(body?.message ?? "").trim();
    const sendToWhatsApp = body?.sendToWhatsApp === true;
    const targetJid = typeof body?.targetJid === "string" ? body.targetJid : null;

    if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });
    if (message.length > 1000) return NextResponse.json({ error: "message too long" }, { status: 400 });

    // Default web-only: no WhatsApp send.
    let sendFn: (input: { userId: string; jid: string; message: string }) => Promise<void> = async () => {};

    if (sendToWhatsApp) {
      // Determine the destination JID. Priority:
      // 1. Explicit targetJid in body
      // 2. OWNER_WHATSAPP_NUMBER env var (Piyush's bound number)
      const ownerPhone = (process.env.OWNER_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
      const jid = targetJid
        ?? (ownerPhone.length >= 10 ? `${ownerPhone}@s.whatsapp.net` : null);
      if (jid) {
        const baseUrl = process.env.BAILEYS_SERVER_URL;
        const apiKey = process.env.BAILEYS_API_KEY || "dev-key";
        if (baseUrl) {
          // Real WhatsApp send: forward the AI reply via Baileys.
          sendFn = async ({ message: replyText }) => {
            const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-key": apiKey },
              body: JSON.stringify({ userId: user.id, jid, message: replyText }),
            });
            if (!res.ok) {
              const t = await res.text().catch(() => "");
              console.warn(`[API:ai/assistant/chat] Baileys send failed: ${res.status} ${t}`);
            }
          };
        }
      } else {
        console.warn(`[API:ai/assistant/chat] sendToWhatsApp requested but no jid resolvable`);
      }
    }

    const reply = await handleOwnerWhatsAppCommand(
      supabase,
      { userId: user.id, text: message, replyJid: sendToWhatsApp ? "whatsapp-test" : "web" },
      { sendFn }
    );

    return NextResponse.json({ reply, sentToWhatsApp: sendToWhatsApp && sendFn !== (async () => {}) });
  } catch (err: any) {
    console.error(`[API:ai/assistant/chat] ${err?.message}`);
    return NextResponse.json({ error: "Assistant failed" }, { status: 500 });
  }
}
