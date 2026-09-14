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
    // Baileys sends { userId: <raw uuid>, slot, message }. Older payloads
    // may carry an already-scoped key — normalize to raw id + slot.
    const rawId = body?.userId;
    const message = body?.message;
    let userId = typeof rawId === "string" ? rawId : null;
    let slot: "business" | "personal" = body?.slot === "personal" ? "personal" : "business";
    if (userId) {
      const m = userId.match(/^(biz|business|personal)__(.+)$/);
      if (m) {
        slot = m[1] === "personal" ? "personal" : "business";
        userId = m[2];
      }
    }

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
    // Server-resolved sender phone (LID→PN mapping) wins when present —
    // a reply to "<lid>@s.whatsapp.net" would vanish.
    const serverPhone = String((message as any)?.senderPhone ?? "").replace(/\D/g, "");
    // JID formats vary: "919876543210.0:64@s.whatsapp.net" carries device
    // suffixes before the @ — strip @, then :device, then .device parts.
    const jidPhone = String(message.remoteJid).split("@")[0].split(":")[0].split(".")[0].replace(/\D/g, "");
    const inboundPhone = serverPhone.length >= 10 ? serverPhone : jidPhone;
    // Server-declared own number (most reliable — straight from the socket).
    const serverOwn = String(body?.ownPhone ?? "").replace(/\D/g, "");
    const matchLast10 = (a: string, b: string) =>
      !!a && !!b && a.length >= 10 && b.length >= 10 &&
      (a === b || a.endsWith(b.slice(-10)) || b.endsWith(a.slice(-10)));
    const samePhone = matchLast10(inboundPhone, ownerPhone);
    const isSelfNumber =
      message.fromMe === true && (matchLast10(inboundPhone, serverOwn) || (slot === "personal" && matchLast10(inboundPhone, ownerPhone)));
    const isOwnerCommand = origin === "self" || origin === "owner_device" || samePhone || isSelfNumber;

    const supabase = adminClient();

    if (isOwnerCommand) {
      const dedupKey = `${userId}:${message.messageId}`;
      if (seenOwnerMsgs.has(dedupKey)) {
        return NextResponse.json({ processed: true, route: "owner_assistant", deduplicated: true });
      }
      // Poll-cron guard: owner-poll may have claimed this command first
      // (it marks processed=true). Don't reply twice.
      try {
        const { data: existing } = await supabase
          .from("whatsapp_messages")
          .select("id, processed")
          .eq("user_id", userId)
          .eq("message_id", message.messageId)
          .maybeSingle();
        if (existing?.processed) {
          seenOwnerMsgs.add(dedupKey);
          return NextResponse.json({ processed: true, route: "owner_assistant", deduplicated: true });
        }
      } catch {}
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

      // Reply JID: owner self-chat messages arrive from a linked-device LID
      // ("...@lid") — Baileys can only SEND to @s.whatsapp.net phone JIDs,
      // so replying to a @lid JID silently fails. Always reply to the real
      // phone JID instead (sender is the owner by definition in this path).
      const ownerPhoneEnv = (process.env.OWNER_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
      const remoteIsLid = /@lid$/i.test(String(message.remoteJid));
      const replyPhone =
        ownerPhoneEnv.length >= 10
          ? ownerPhoneEnv
          : inboundPhone.replace(/\D/g, "");
      const replyJid = remoteIsLid
        ? `${replyPhone}@s.whatsapp.net`
        : String(message.remoteJid).includes("@")
          ? message.remoteJid
          : `${replyPhone}@s.whatsapp.net`;

      // Run synchronously — after() on Vercel delays up to 6 min
      try {
        await supabase
          .from("whatsapp_messages")
          .update({ processed: true })
          .eq("user_id", userId)
          .eq("message_id", message.messageId);

        const { routeOwnerMessage } = await import("@/lib/ai/whatsapp/owner-router");
        await routeOwnerMessage(supabase, {
          userId,
          text: message.text,
          replyJid,
        });
      } catch (err: any) {
        console.error(`[API:ai/whatsapp/webhook] owner command failed: ${err?.message}`);
      }
      return NextResponse.json({ processed: true, route: "owner_assistant" });
    }

    // ─── PERSONAL SLOT: owner's own number ───
    // Non-owner inbound here = personal contacts chatting on the owner's
    // private number. Always a casual personal reply, NEVER the business
    // lead pipeline (koi pitch nahi, koi lead capture nahi).
    if (slot === "personal" && !isOwnerCommand && message.fromMe !== true) {
      const jid = String(message.remoteJid ?? "");
      if (!jid.includes("@g.us") && !jid.includes("@broadcast") && !jid.includes("@newsletter")) {
        try {
          const { sendViaBaileys } = await import("@/lib/whatsapp/jid-utils");
          const { handlePersonalChat } = await import("@/lib/ai/owner-personal");
          // Prefer the resolved phone JID — @lid remotes can't receive sends.
          const senderDigits = inboundPhone.replace(/\D/g, "");
          const trimmed = (message.text || "").trim();
          const lower = trimmed.toLowerCase();
          let reply: string;
          if (/^(hi+|hlo+|hlw+|hello+|hey+|heyy*|namaste|yo+|sup)\b/i.test(lower)) {
            const firstName = message.pushName ? ` ${(String(message.pushName).split(" ")[0])}` : "";
            reply = `hey${firstName}! kya haal hai?`;
          } else if (/^(ok|theek hai|hmm|haan|sure|chalo|done|cool|alright)\b/i.test(lower)) {
            reply = "👍";
          } else {
            reply = await handlePersonalChat({ supabase, userId, messageText: trimmed, isSticky: true });
          }
          // Resolved phone JID preferred — raw @lid remotes can't receive sends.
          const replyJid = senderDigits.length >= 10
            ? `${senderDigits}@s.whatsapp.net`
            : message.remoteJid;
          await sendViaBaileys({ userId, jid: replyJid, message: reply, slot: "personal" });
          return NextResponse.json({ processed: true, route: "personal_slot_assistant", replySent: true });
        } catch (err: any) {
          console.error(`[API:ai/whatsapp/webhook] personal slot reply failed: ${err?.message}`);
        }
      } else {
        return NextResponse.json({ processed: false, skippedReason: "group_or_broadcast" });
      }
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
            const { routeOwnerMessage } = await import("@/lib/ai/whatsapp/owner-router");
            // @lid JIDs can't receive outbound sends — rewrite to the bound
            // user's real phone JID so the reply actually delivers.
            const boundReplyJid = /@lid$/i.test(String(message.remoteJid))
              ? `${String(bound.phone ?? "").replace(/\D/g, "")}@s.whatsapp.net`
              : message.remoteJid;
            await routeOwnerMessage(supabase, {
              userId: boundUserId,
              text: message.text,
              replyJid: boundReplyJid,
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

    // ─── SKIP GROUP/CHANNEL MESSAGES ───
    // AI should never auto-reply in group chats or broadcast channels
    const jid = String(message.remoteJid ?? "");
    if (jid.includes("@g.us") || jid.includes("@broadcast") || jid.includes("@newsletter")) {
      return NextResponse.json({ processed: false, skippedReason: "group_or_broadcast" });
    }

    // ─── PERSONAL CONTACTS / PERSONAL ASSISTANT ROUTING ───
    // If sender is a personal contact or the account is in personal mode,
    // send an instant friendly personal AI reply instead of skipping or pitching.
    const senderDigits = jid.replace(/@.*$/, "").replace(/\D/g, "");
    let isPersonalContact = false;
    let personalContactName = message.pushName || "";
    try {
      const { data: personalContact } = await supabase
        .from("personal_contacts")
        .select("id, name")
        .eq("user_id", userId)
        .or(`jid.eq.${jid},phone.eq.${senderDigits}`)
        .limit(1)
        .maybeSingle();
      if (personalContact) {
        isPersonalContact = true;
        if (personalContact.name) personalContactName = personalContact.name;
      }
    } catch {
      // Table may not exist yet — skip gracefully
    }

    const { isUserInPersonalMode } = await import("@/lib/ai/owner-personal");
    const inPersonalMode = isPersonalContact || (await isUserInPersonalMode(supabase, userId));

    if (inPersonalMode) {
      try {
        const { sendViaBaileys } = await import("@/lib/whatsapp/jid-utils");
        const { handlePersonalChat } = await import("@/lib/ai/owner-personal");

        const trimmed = (message.text || "").trim();
        const lower = trimmed.toLowerCase();

        let reply: string;
        // Fast-path greetings & casual reactions for sub-second latency
        if (/^(hi+|hlo+|hlw+|hello+|hey+|heyy*|namaste|yo+|sup)\b/i.test(lower)) {
          const firstName = personalContactName ? ` ${(personalContactName.split(" ")[0])}` : "";
          reply = `hey${firstName}! kya haal hai?`;
        } else if (/^(kaisa hai|kaise ho|kaisi ho|how are you|sab theek|kya chal raha hai)\b/i.test(lower)) {
          reply = "sab badhiya! aap batao, kaisa chal raha hai?";
        } else if (/^(ok|theek hai|hmm|haan|sure|chalo|done|cool|alright)\b/i.test(lower)) {
          reply = "👍";
        } else {
          reply = await handlePersonalChat({
            supabase,
            userId,
            messageText: trimmed,
            isSticky: true,
          });
        }

        const replyJid = inboundPhone.length >= 10
          ? `${inboundPhone}@s.whatsapp.net`
          : message.remoteJid;

        await sendViaBaileys({ userId, jid: replyJid, message: reply, slot });

        try {
          await supabase.from("whatsapp_messages").insert({
            user_id: userId,
            remote_jid: replyJid,
            message_id: message.messageId,
            text: message.text,
            from_me: false,
            timestamp: new Date().toISOString(),
            processed: true,
          });
        } catch {}

        return NextResponse.json({
          processed: true,
          route: isPersonalContact ? "personal_contact_assistant" : "personal_mode_assistant",
          replySent: true,
          replyText: reply,
        });
      } catch (err: any) {
        console.error(`[API:ai/whatsapp/webhook] personal reply failed: ${err?.message}`);
      }
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

