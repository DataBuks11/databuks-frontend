import type { SupabaseClient } from "@supabase/supabase-js";
import { handleOwnerWhatsAppCommand } from "@/lib/ai/owner-assistant";

/**
 * WhatsApp Owner Command Polling Bridge
 *
 * The Baileys server stores every inbound message (including self-chat /
 * owner commands) in `whatsapp_messages`. Depending on the deployed server
 * version, self-chat messages may NOT be forwarded to the webhook in real
 * time. This bridge polls for unprocessed from-me messages and routes them
 * through the owner assistant, making the command center work regardless
 * of the server version.
 */

export interface PollResult {
  checked: number;
  processed: number;
  skipped: number;
  errors: string[];
}

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function pollOwnerWhatsAppCommands(
  supabase: SupabaseClient,
  opts: { limit?: number } = {}
): Promise<PollResult> {
  const result: PollResult = { checked: 0, processed: 0, skipped: 0, errors: [] };
  const limit = Math.min(opts.limit ?? 5, 20);

  const { data: pending, error } = await supabase
    .from("whatsapp_messages")
    .select("id, user_id, remote_jid, message_id, message_text, timestamp")
    .eq("from_me", true)
    .eq("processed", false)
    .not("message_text", "is", null)
    .neq("message_text", "")
    .order("timestamp", { ascending: true })
    .limit(limit);

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  // Own-phone lookup per user: ONLY self-chat messages (user → their own
  // number) are owner commands. fromMe messages directed at other people
  // are the user's normal outbound chats — the assistant must NEVER reply
  // to those (it was replying to the user's leads!).
  const phoneCache = new Map<string, string>();
  const getOwnPhone = async (userId: string): Promise<string> => {
    if (phoneCache.has(userId)) return phoneCache.get(userId)!;
    let phone = "";
    try {
      const { data: sess } = await supabase
        .from("whatsapp_sessions")
        .select("auth_state")
        .eq("user_id", userId)
        .maybeSingle();
      phone = String(sess?.auth_state?.phone ?? "").replace(/\D/g, "");
    } catch {}
    phoneCache.set(userId, phone);
    return phone;
  };

  for (const row of pending ?? []) {
    result.checked += 1;
    const text = String(row.message_text ?? "").trim();
    const ts = row.timestamp ? new Date(row.timestamp).getTime() : 0;

    const markProcessed = async () => {
      await supabase.from("whatsapp_messages").update({ processed: true }).eq("id", row.id);
    };

    // Ancient history replays — mark and skip
    if (!text || !ts || Date.now() - ts > MAX_AGE_MS) {
      await markProcessed();
      result.skipped += 1;
      continue;
    }

    // Self-chat filter: remote_jid must be the user's OWN number.
    const ownPhone = await getOwnPhone(row.user_id);
    const remotePhone = String(row.remote_jid ?? "").split("@")[0].split(":")[0].split(".")[0].replace(/\D/g, "");
    const isSelfChat =
      ownPhone.length >= 10 &&
      remotePhone.length >= 10 &&
      (remotePhone === ownPhone || remotePhone.endsWith(ownPhone.slice(-10)) || ownPhone.endsWith(remotePhone.slice(-10)));

    if (!isSelfChat) {
      // Outbound chat to someone else — never an assistant command.
      await markProcessed();
      result.skipped += 1;
      continue;
    }

    // Claim first (prevents double-processing across overlapping polls)
    const { error: claimError } = await supabase
      .from("whatsapp_messages")
      .update({ processed: true })
      .eq("id", row.id)
      .eq("processed", false);
    if (claimError) {
      result.skipped += 1;
      continue;
    }

    try {
      const reply = await handleOwnerWhatsAppCommand(supabase, {
        userId: row.user_id,
        text,
        replyJid: row.remote_jid,
      });
      await supabase
        .from("whatsapp_messages")
        .update({ ai_response: reply })
        .eq("id", row.id);
      result.processed += 1;
    } catch (err: any) {
      result.errors.push(`${row.message_id}: ${err?.message ?? "unknown"}`);
    }
  }

  return result;
}
