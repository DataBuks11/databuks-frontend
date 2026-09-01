import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { processIncomingWhatsAppMessage } from "@/lib/ai/whatsapp/engine";

export const maxDuration = 60;

/** Dedup owner commands across Baileys reconnect/replay (per lambda instance). */
const seenOwnerMsgs = new Set<string>();

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

    if (!userId || !message?.remoteJid || !message?.messageId || (!message?.text && !message?.mediaUrl)) {
      return NextResponse.json({ error: "userId and message (remoteJid, messageId, text or mediaUrl) required" }, { status: 400 });
    }

    // ─── OWNER COMMAND CENTER ───
    // Messages the user sends to their own number ("message yourself") or
    // from a designated owner device are assistant commands — NOT leads.
    // Phone match uses the last 10 digits: WhatsApp JIDs sometimes carry
    // device suffixes (e.g. 918788606608.0:64) that break exact compares.
    const origin = message.origin ?? "lead";
    const ownerPhone = (process.env.OWNER_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
    // JID formats vary: "919876543210.0:64@s.whatsapp.net" carries device
    // suffixes before the @ — strip @, then :device, then .device parts.
    const inboundPhone = String(message.remoteJid).split("@")[0].split(":")[0].split(".")[0].replace(/\D/g, "");
    const samePhone =
      !!ownerPhone &&
      inboundPhone.length >= 10 &&
      ownerPhone.length >= 10 &&
      (inboundPhone === ownerPhone || inboundPhone.endsWith(ownerPhone.slice(-10)) || ownerPhone.endsWith(inboundPhone.slice(-10)));
    const isOwnerCommand = origin === "self" || origin === "owner_device" || samePhone;

    const supabase = adminClient();

    if (isOwnerCommand) {
      const dedupKey = `${userId}:${message.messageId}`;
      if (seenOwnerMsgs.has(dedupKey)) {
        return NextResponse.json({ processed: true, route: "owner_assistant", deduplicated: true });
      }
      seenOwnerMsgs.add(dedupKey);
      if (seenOwnerMsgs.size > 500) {
        // keep the set bounded — drop oldest half
        const it = seenOwnerMsgs.values();
        for (let i = 0; i < 250; i++) {
          const v = it.next();
          if (v.done) break;
          seenOwnerMsgs.delete(v.value);
        }
      }

      const replyJid = String(message.remoteJid).includes("@")
        ? message.remoteJid
        : `${inboundPhone}@s.whatsapp.net`;

      // Run synchronously — after() on Vercel delays up to 6 min
      try {
        await supabase
          .from("whatsapp_messages")
          .update({ processed: true })
          .eq("user_id", userId)
          .eq("message_id", message.messageId);

        // First: try to interpret the message as a post-approval reply
        // (yes / no / edit: ... / schedule: ...). If it matches, route the
        // decision to the right draft and send a confirmation back.
        let handledAsApproval = false;
        try {
          const { handleApprovalReply } = await import("@/lib/ai/content/approval-handler");
          const approval = await handleApprovalReply(supabase, userId, message.text ?? "");
          if (approval.status !== "not-approval") {
            const sendViaBaileys = async (msg: string) => {
              const baseUrl = process.env.BAILEYS_SERVER_URL;
              const apiKey = process.env.BAILEYS_API_KEY || "dev-key";
              if (!baseUrl) return;
              await fetch(`${baseUrl.replace(/\/+$/, "")}/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-api-key": apiKey },
                body: JSON.stringify({ userId, jid: replyJid, message: msg }),
              }).catch(() => {});
            };
            if (approval.status === "no-pending") {
              await sendViaBaileys("koi pending post nahi hai abhi.");
            } else {
              const ack =
                approval.status === "approved"
                  ? "approved ✓ ab post ready hai publish karne ke liye."
                  : approval.status === "rejected"
                    ? "rejected ✗ skip kar diya."
                    : approval.status === "edited"
                      ? "edit saved. naya version bhej raha hoon."
                      : `scheduled ✓ ${approval.topic} schedule ho gaya.`;
              await sendViaBaileys(`ok, ${ack}`);
            }
            handledAsApproval = true;
          }
        } catch (err: any) {
          console.error(`[API:ai/whatsapp/webhook] approval flow failed: ${err?.message}`);
        }

        // Default path: regular owner command (business status, leads, etc.)
        if (!handledAsApproval) {
          const { handleOwnerWhatsAppCommand } = await import("@/lib/ai/owner-assistant");
          await handleOwnerWhatsAppCommand(supabase, {
            userId,
            text: message.text,
            replyJid,
          });
        }
      } catch (err: any) {
        console.error(`[API:ai/whatsapp/webhook] owner command failed: ${err?.message}`);
      }
      return NextResponse.json({ processed: true, route: "owner_assistant" });
    }

    // ─── MULTI-TENANT ASSISTANT ───
    // The assistant number serves EVERY DataBuks user: if the sender's phone
    // is bound in their profile, this chat is THEIR personal assistant (their
    // data, instant reply). Unbound senders flow to the lead pipeline below.
    if (message.fromMe !== true) {
      const digits = inboundPhone;
      const last10 = digits.slice(-10);
      if (digits.length >= 10) {
        const { data: boundProfiles } = await supabase
          .from("profiles")
          .select("id, phone")
          .not("phone", "is", null)
          .limit(500);
        const bound = (boundProfiles ?? []).find((p: any) => {
          const pd = String(p.phone ?? "").replace(/\D/g, "");
          if (pd.length < 10) return false;
          return pd === digits || pd.endsWith(last10) || last10.endsWith(pd.slice(-10));
        });
        if (bound?.id) {
          const dedupKey = `bound:${bound.id}:${message.messageId}`;
          if (seenOwnerMsgs.has(dedupKey)) {
            return NextResponse.json({ processed: true, route: "bound_user_assistant", deduplicated: true });
          }
          seenOwnerMsgs.add(dedupKey);
          const boundUserId = bound.id;
          // Run synchronously — after() on Vercel delays up to 6 min
          try {
            const { handleOwnerWhatsAppCommand } = await import("@/lib/ai/owner-assistant");
            await handleOwnerWhatsAppCommand(supabase, {
              userId: boundUserId,
              text: message.text,
              replyJid: message.remoteJid,
            });
          } catch (err: any) {
            console.error(`[API:ai/whatsapp/webhook] bound assistant failed: ${err?.message}`);
          }
          return NextResponse.json({ processed: true, route: "bound_user_assistant", boundUser: boundUserId });
        }
      }
    }

    if (message.fromMe === true) {
      return NextResponse.json({ processed: false, skippedReason: "outbound" });
    }

    // ─── SKIP GROUP MESSAGES ───
    // AI should never auto-reply in group chats
    const jid = String(message.remoteJid ?? "");
    if (jid.includes("@g.us") || jid.includes("@broadcast")) {
      return NextResponse.json({ processed: false, skippedReason: "group_or_broadcast" });
    }

    // ─── PERSONAL CONTACTS FILTER ───
    // Check if sender is marked as personal contact — skip AI reply
    const senderDigits = jid.replace(/@.*$/, "").replace(/\D/g, "");
    try {
      const { data: personalContact } = await supabase
        .from("personal_contacts")
        .select("id")
        .eq("user_id", userId)
        .or(`jid.eq.${jid},phone.eq.${senderDigits}`)
        .limit(1)
        .maybeSingle();
      if (personalContact) {
        return NextResponse.json({ processed: false, skippedReason: "personal_contact" });
      }
    } catch {
      // Table may not exist yet — skip filter gracefully
    }

    const result = await processIncomingWhatsAppMessage(supabase, {
      userId,
      remoteJid: message.remoteJid,
      messageId: message.messageId,
      text: message.text,
      timestamp: message.timestamp ?? undefined,
      pushName: message.pushName ?? undefined,
      mediaType: message.type && message.type !== "text" ? message.type : undefined,
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
      // Run synchronously — after() on Vercel delays up to 6 min
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
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error(`[API:ai/whatsapp/webhook] ${err?.message}`);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

