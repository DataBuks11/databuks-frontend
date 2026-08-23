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

  for (const row of pending ?? []) {
    result.checked += 1;
    const text = String(row.message_text ?? "").trim();
    const ts = row.timestamp ? new Date(row.timestamp).getTime() : 0;

    // Ancient history replays — mark and skip
    if (!text || !ts || Date.now() - ts > MAX_AGE_MS) {
      await supabase.from("whatsapp_messages").update({ processed: true }).eq("id", row.id);
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
