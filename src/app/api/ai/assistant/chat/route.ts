import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handleOwnerWhatsAppCommand } from "@/lib/ai/owner-assistant";

export const maxDuration = 60;

/**
 * POST /api/ai/assistant/chat
 * The website chatbot — same brain as the WhatsApp assistant, served over
 * HTTP for the logged-in user. Session-authenticated, answers from the
 * user's own data (leads, meetings, posts, approvals).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const message = String(body?.message ?? "").trim();
    if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });
    if (message.length > 1000) return NextResponse.json({ error: "message too long" }, { status: 400 });

    // The web chat IS the reply channel — no WhatsApp send needed.
    const noopSend = async () => {};
    const reply = await handleOwnerWhatsAppCommand(
      supabase,
      { userId: user.id, text: message, replyJid: "web" },
      { sendFn: noopSend }
    );

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error(`[API:ai/assistant/chat] ${err?.message}`);
    return NextResponse.json({ error: "Assistant failed" }, { status: 500 });
  }
}
