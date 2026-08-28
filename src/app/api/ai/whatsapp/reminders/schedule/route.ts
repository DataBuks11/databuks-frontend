import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * POST /api/ai/whatsapp/reminders/schedule
 * Body: { leadId, conversationId, remoteJid, sendAt, messageText }
 * Creates a pending reminder row that the cron route will fire at sendAt.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { leadId, conversationId, remoteJid, sendAt, messageText } = body ?? {};
    if (!remoteJid || !sendAt || !messageText) {
      return NextResponse.json(
        { error: "remoteJid, sendAt, messageText required" },
        { status: 400 }
      );
    }
    const sendAtIso = new Date(sendAt).toISOString();
    if (isNaN(Date.parse(sendAtIso))) {
      return NextResponse.json({ error: "sendAt must be a valid ISO date" }, { status: 400 });
    }
    if (new Date(sendAtIso).getTime() <= Date.now()) {
      return NextResponse.json({ error: "sendAt must be in the future" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("reminders")
      .insert({
        user_id: user.id,
        lead_id: leadId ?? null,
        conversation_id: conversationId ?? null,
        remote_jid: remoteJid,
        message_text: messageText,
        send_at: sendAtIso,
      })
      .select("id, send_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, reminder: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed" }, { status: 500 });
  }
}
