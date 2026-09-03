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
import { sendViaBaileys } from "@/lib/whatsapp/jid-utils";

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
      const ack =
        approval.status === "no-pending"
          ? "koi pending post nahi hai abhi."
          : approval.status === "approved"
            ? "approved ✓ ab post publish hone ke liye queue mein hai."
            : approval.status === "rejected"
              ? "rejected ✗ skip kar diya."
              : approval.status === "edited"
                ? "edit saved. naya version bhej raha hoon."
                : `scheduled ✓ ${(approval as any).topic ?? ""} schedule ho gaya.`;
      await sendViaBaileys({ userId, jid: replyJid, message: ack });
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