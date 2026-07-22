import { createClient } from "@/lib/supabase/server";

const TELEGRAM_API = "https://api.telegram.org";

interface TelegramBotInfo {
  id: number;
  username: string;
  first_name: string;
  can_join_groups: boolean;
  can_read_all_group_messages: boolean;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string; username?: string };
    chat: { id: number; first_name?: string; username?: string; type: string };
    text?: string;
    date: number;
  };
}

export async function verifyBotToken(
  token: string
): Promise<{ valid: boolean; bot?: TelegramBotInfo; error?: string }> {
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/getMe`);
    const data = await res.json();
    if (data.ok) {
      return { valid: true, bot: data.result };
    }
    return { valid: false, error: data.description ?? "Invalid token" };
  } catch {
    return { valid: false, error: "Failed to verify token" };
  }
}

export async function connectTelegramBot(
  userId: string,
  token: string
): Promise<{ success: boolean; bot?: TelegramBotInfo; error?: string }> {
  const verify = await verifyBotToken(token);
  if (!verify.valid) {
    return { success: false, error: verify.error };
  }

  try {
    const supabase = await createClient();

    const botId = verify.bot!.id;
    const res = await fetch(`${TELEGRAM_API}/bot${token}/getMe`);
    const data = await res.json();

    await supabase.from("telegram_bots").upsert({
      user_id: userId,
      bot_token: token,
      bot_id: botId,
      bot_username: data.result.username,
      bot_name: data.result.first_name,
      connected: true,
      updated_at: new Date().toISOString(),
    });

    return { success: true, bot: verify.bot };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function disconnectTelegramBot(
  userId: string
): Promise<{ success: boolean }> {
  try {
    const supabase = await createClient();

    const { data: bot } = await supabase
      .from("telegram_bots")
      .select("bot_token")
      .eq("user_id", userId)
      .single();

    if (bot?.bot_token) {
      await fetch(`${TELEGRAM_API}/bot${bot.bot_token}/deleteWebhook`);
    }

    await supabase.from("telegram_bots").delete().eq("user_id", userId);
    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function getTelegramBotStatus(
  userId: string
): Promise<{ connected: boolean; bot?: { username: string; name: string } }> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("telegram_bots")
      .select("connected, bot_username, bot_name, bot_token")
      .eq("user_id", userId)
      .single();

    if (!data?.connected) return { connected: false };

    const verify = await verifyBotToken(data.bot_token);
    return {
      connected: verify.valid,
      bot: verify.bot ? { username: verify.bot.username, name: verify.bot.first_name } : undefined,
    };
  } catch {
    return { connected: false };
  }
}

export async function sendTelegramMessage(
  userId: string,
  chatId: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: bot } = await supabase
      .from("telegram_bots")
      .select("bot_token")
      .eq("user_id", userId)
      .single();

    if (!bot?.bot_token) {
      return { success: false, error: "No Telegram bot connected" };
    }

    const res = await fetch(
      `${TELEGRAM_API}/bot${bot.bot_token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
      }
    );

    const data = await res.json();
    if (data.ok) return { success: true };
    return { success: false, error: data.description };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getTelegramUpdates(
  userId: string
): Promise<{ updates: TelegramUpdate[]; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: bot } = await supabase
      .from("telegram_bots")
      .select("bot_token")
      .eq("user_id", userId)
      .single();

    if (!bot?.bot_token) {
      return { updates: [], error: "No Telegram bot connected" };
    }

    const res = await fetch(
      `${TELEGRAM_API}/bot${bot.bot_token}/getUpdates?limit=20&timeout=5`
    );
    const data = await res.json();
    if (data.ok) return { updates: data.result };
    return { updates: [], error: data.description };
  } catch (err: any) {
    return { updates: [], error: err.message };
  }
}

export async function setTelegramWebhook(
  userId: string,
  webhookUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: bot } = await supabase
      .from("telegram_bots")
      .select("bot_token")
      .eq("user_id", userId)
      .single();

    if (!bot?.bot_token) return { success: false, error: "No bot connected" };

    const res = await fetch(
      `${TELEGRAM_API}/bot${bot.bot_token}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      }
    );

    const data = await res.json();
    return { success: data.ok, error: data.description };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
