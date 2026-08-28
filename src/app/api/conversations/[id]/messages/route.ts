import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (convError || !conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: messages, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ messages: messages || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("id, platform, remote_jid, lead_id, contact_name")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (convError || !conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await request.json();
    const content = String(body.content ?? "").trim();
    if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });

    // Insert the outbound message into the conversation
    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: id,
        user_id: user.id,
        content,
        sender: body.sender || "user",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await supabase
      .from("conversations")
      .update({
        last_message: content,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // If this is a WhatsApp conversation, actually send the message via Baileys.
    // The lead's phone is the destination; remote_jid is preferred if stored.
    let whatsappSent = false;
    if (conv.platform === "whatsapp" || conv.platform === "WhatsApp") {
      try {
        let jid = conv.remote_jid;
        // Fallback: look up lead's phone
        if (!jid && conv.lead_id) {
          const { data: lead } = await supabase
            .from("leads")
            .select("phone")
            .eq("id", conv.lead_id)
            .maybeSingle();
          if (lead?.phone) {
            const digits = String(lead.phone).replace(/\D/g, "");
            jid = digits.length >= 10 ? `${digits}@s.whatsapp.net` : null;
          }
        }
        // Fallback: look up most recent whatsapp_message for this user
        if (!jid) {
          const { data: recent } = await supabase
            .from("whatsapp_messages")
            .select("remote_jid")
            .eq("user_id", user.id)
            .order("timestamp", { ascending: false })
            .limit(1)
            .maybeSingle();
          jid = recent?.remote_jid ?? null;
        }
        if (jid) {
          const baseUrl = process.env.BAILEYS_SERVER_URL;
          const apiKey = process.env.BAILEYS_API_KEY || "dev-key";
          if (baseUrl) {
            const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-key": apiKey },
              body: JSON.stringify({ userId: user.id, jid, message: content }),
            });
            whatsappSent = res.ok;
            if (!res.ok) {
              const txt = await res.text().catch(() => "");
              console.warn(`[API:conversations/messages] Baileys send failed: ${res.status} ${txt}`);
            }
          }
        } else {
          console.warn(`[API:conversations/messages] no jid resolvable for conversation ${id}`);
        }
      } catch (err: any) {
        console.error(`[API:conversations/messages] Baileys send error: ${err?.message}`);
      }
    }

    return NextResponse.json({ ...data, whatsapp_sent: whatsappSent }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
