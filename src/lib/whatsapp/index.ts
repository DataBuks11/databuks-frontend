import { makeWASocket, useMultiFileAuthState, DisconnectReason, type WASocket } from "@whiskeysockets/baileys";
import { createClient } from "@/lib/supabase/server";
import QRCode from "qrcode";
import pino from "pino";

const logger = pino({ level: "silent" });

let activeSocket: WASocket | null = null;
let activeQrCode: string | null = null;
let activeUserId: string | null = null;

const SOCKET_TIMEOUT = 120000;

export function getActiveQrCode(): string | null {
  return activeQrCode;
}

export function getActiveUserId(): string | null {
  return activeUserId;
}

export async function startWhatsAppConnection(userId: string): Promise<{ qrCode: string } | { error: string }> {
  if (activeSocket && activeQrCode) {
    return { qrCode: activeQrCode };
  }

  try {
    const supabase = await createClient();

    const { data: existingSession } = await supabase
      .from("whatsapp_sessions")
      .select("auth_state")
      .eq("user_id", userId)
      .single();

    let state: any = {};
    let saveCreds: any = undefined;

    if (existingSession?.auth_state) {
      state = { creds: existingSession.auth_state.creds, keys: existingSession.auth_state.keys };
    } else {
      const { state: freshState, saveCreds: freshSaveCreds } = await useMultiFileAuthState("wa_session");
      state = freshState;
      saveCreds = freshSaveCreds;
    }

    activeUserId = userId;

    return new Promise((resolve) => {
      const startTime = Date.now();

      const socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger,
        browser: ["DataBuks", "Chrome", "1.0.0"],
        connectTimeoutMs: 60000,
      });

      activeSocket = socket;

      socket.ev.on("creds.update", async () => {
        if (saveCreds) await saveCreds();
      });

      socket.ev.on("connection.update", async ({ qr, connection }) => {
        if (qr) {
          const qrImage = await QRCode.toDataURL(qr);
          activeQrCode = qrImage;
          resolve({ qrCode: qrImage });
        }

        if (connection === "open") {
          activeQrCode = null;

          const authState = {
            creds: (socket.authState as any)?.creds ?? {},
            keys: (socket.authState as any)?.keys ?? {},
          };

          await supabase.from("whatsapp_sessions").upsert({
            user_id: userId,
            auth_state: authState,
            connected: true,
            updated_at: new Date().toISOString(),
          });

          resolve({ qrCode: "" });
        }

        if (connection === "close") {
          const statusCode = (socket as any).lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          if (!shouldReconnect) {
            activeQrCode = null;
            activeSocket = null;
            activeUserId = null;
            await supabase.from("whatsapp_sessions").delete().eq("user_id", userId);
          }
        }
      });

      setTimeout(() => {
        if (activeQrCode) {
          resolve({ error: "Connection timeout. Please try again." });
        }
      }, SOCKET_TIMEOUT);
    });
  } catch (err: any) {
    return { error: err.message ?? "Failed to start WhatsApp connection" };
  }
}

export async function disconnectWhatsApp(userId: string): Promise<{ success: boolean }> {
  try {
    if (activeSocket) {
      (activeSocket as any)?.end?.();
      activeSocket = null;
    }
    activeQrCode = null;
    activeUserId = null;

    const supabase = await createClient();
    await supabase.from("whatsapp_sessions").delete().eq("user_id", userId);

    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function getWhatsAppStatus(userId: string): Promise<{ connected: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_sessions")
    .select("connected")
    .eq("user_id", userId)
    .single();

  return { connected: data?.connected ?? false };
}

export async function sendWhatsAppMessage(
  userId: string,
  jid: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("auth_state")
      .eq("user_id", userId)
      .single();

    if (!session?.auth_state) {
      return { success: false, error: "No active WhatsApp session" };
    }

    const socket = makeWASocket({
      auth: { creds: session.auth_state.creds, keys: session.auth_state.keys },
      logger,
      browser: ["DataBuks", "Chrome", "1.0.0"],
    });

    return new Promise((resolve) => {
      socket.ev.on("connection.update", async ({ connection }) => {
        if (connection === "open") {
          try {
            const formattedJid = jid.includes("@s.whatsapp.net") ? jid : `${jid}@s.whatsapp.net`;
            await socket.sendMessage(formattedJid, { text: message });
            resolve({ success: true });
          } catch (err: any) {
            resolve({ success: false, error: err.message });
          } finally {
            socket.ev.removeAllListeners("connection.update");
            socket.ws?.close();
          }
        }

        if (connection === "close") {
          resolve({ success: false, error: "Failed to connect" });
        }
      });

      setTimeout(() => {
        resolve({ success: false, error: "Connection timeout" });
      }, 15000);
    });
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
