/**
 * OWNER / BOUND-USER MESSAGE ROUTER
 *
 * Central routing for messages from the owner (or any user bound to the
 * assistant number). Order of precedence:
 *   1. Post-approval replies  ("yes" / "no" / "edit: ..." / "schedule: ...")
 *   2. Conversational flows   ("post banao", "outreach chalao", counts)
 *   3. Personal/business mode keywords ("personal", "back to business")
 *   4. Owner command center   (business status, leads, meetings, ...)
 *
 * Used by the WhatsApp webhook for both the owner path and the bound-user
 * path so behaviour is identical.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendViaBaileys, resolveUserJid } from "@/lib/whatsapp/jid-utils";

/** After a post is rejected, generate one replacement draft and push it to
 *  the owner's WhatsApp so the pipeline keeps moving instead of stalling. */
async function generateReplacementPost(
  supabase: SupabaseClient,
  userId: string,
  replyJid: string
): Promise<string | null> {
  try {
    const { generateDailyPostsForUser } = await import("@/lib/ai/content/daily-generator");
    const { pushDailyPostsToWhatsApp } = await import("@/lib/ai/content/push-whatsapp");
    const result = await generateDailyPostsForUser(supabase, userId, { maxPosts: 1 });
    if (result.count === 0 || result.posts.length === 0) {
      return "replacement generate nahi ho paya (business context check karo).";
    }
    const baseUrl = process.env.BAILEYS_SERVER_URL;
    const jid = replyJid || (await resolveUserJid(supabase, userId));
    if (baseUrl && jid) {
      await pushDailyPostsToWhatsApp(
        baseUrl,
        process.env.BAILEYS_API_KEY || "dev-key",
        userId,
        jid,
        result.posts
      );
      return null; // replacement already pushed as a normal review message
    }
    return "replacement ready hai par WhatsApp send nahi ho paya (Baileys URL missing).";
  } catch (err: any) {
    console.error(`[owner-router] replacement gen failed: ${err?.message}`);
    return "replacement generate karte waqt error aaya, dobara try karo.";
  }
}

export async function routeOwnerMessage(
  supabase: SupabaseClient,
  input: { userId: string; text: string | null | undefined; replyJid: string }
): Promise<{ handled: boolean }> {
  const { userId, text, replyJid } = input;
  const txt = text ?? "";

  try {
    const { handleApprovalReply } = await import("@/lib/ai/content/approval-handler");
    const approval = await handleApprovalReply(supabase, userId, txt);
    if (approval.status !== "not-approval") {
      if (approval.status === "no-pending") {
        await sendViaBaileys({ userId, jid: replyJid, message: "koi pending post nahi hai abhi." });
        return { handled: true };
      }
      const ack =
        approval.status === "approved"
          ? "approved ✓ ab post publish hone ke liye queue mein hai."
          : approval.status === "rejected"
            ? "rejected ✗ skip kar diya. replacement bana raha hoon..."
            : approval.status === "edited"
              ? "edit saved. naya version bhej raha hoon."
              : `scheduled ✓ ${(approval as any).topic ?? ""} schedule ho gaya.`;
      await sendViaBaileys({ userId, jid: replyJid, message: ack });
      // Replacement post for rejected drafts
      if (approval.status === "rejected") {
        const replacementMsg = await generateReplacementPost(supabase, userId, replyJid);
        if (replacementMsg) {
          await sendViaBaileys({ userId, jid: replyJid, message: replacementMsg });
        }
      }
      return { handled: true };
    }
  } catch (err: any) {
    console.error(`[owner-router] approval flow failed: ${err?.message}`);
  }

  try {
    const { handleFlowMessage } = await import("@/lib/ai/owner-flows");
    const flowResult = await handleFlowMessage(supabase, userId, txt);
    if (flowResult) {
      await sendViaBaileys({ userId, jid: replyJid, message: flowResult.text });
      return { handled: true };
    }
  } catch (err: any) {
    console.error(`[owner-router] owner flow failed: ${err?.message}`);
  }

  const { isUserInPersonalMode, handlePersonalChat } = await import("@/lib/ai/owner-personal");
  const lower = txt.toLowerCase();
  const personalTriggers = /\b(personal|off record|chill mode|as a friend|not business|just chat|normal chat|back to personal)\b/i;
  const businessTriggers = /\b(back to business|business mode|back to work|back to databuks)\b/i;
  const isPersonal = personalTriggers.test(lower) && !businessTriggers.test(lower);
  const wasPersonal = await isUserInPersonalMode(supabase, userId);

  if (isPersonal || wasPersonal) {
    try {
      const reply = await handlePersonalChat({
        supabase,
        userId,
        messageText: txt,
        isSticky: wasPersonal && !isPersonal === false,
      });
      await sendViaBaileys({ userId, jid: replyJid, message: reply });
      if (businessTriggers.test(lower)) {
        await sendViaBaileys({ userId, jid: replyJid, message: "ok business mode on. ab data-aware replies dunga." });
      }
    } catch (err: any) {
      console.error(`[owner-router] personal chat failed: ${err?.message}`);
    }
    return { handled: true };
  }

  const { handleOwnerWhatsAppCommand } = await import("@/lib/ai/owner-assistant");
  await handleOwnerWhatsAppCommand(supabase, { userId, text: txt, replyJid });
  return { handled: true };
}