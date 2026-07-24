import {
  makeWASocket,
  DisconnectReason,
  type WASocket,
  type AuthenticationState,
  initAuthCreds,
} from "@whiskeysockets/baileys";
import { createClient } from "@/lib/supabase/server";
import QRCode from "qrcode";
import pino from "pino";

const logger = pino({ level: "silent" });

const QR_WAIT_TIMEOUT = 8000;

interface ActiveSession {
  socket: WASocket | null;
  qrCode: string | null;
  connected: boolean;
  userId: string;
}

const sessions = new Map<string, ActiveSession>();

async function loadAuthState(userId: string): Promise<{
  state: AuthenticationState;
  exists: boolean;
}> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("whatsapp_sessions")
      .select("auth_state")
      .eq("user_id", userId)
      .single();

    if (data?.auth_state?.creds) {
      return {
        state: {
          creds: data.auth_state.creds,
          keys: data.auth_state.keys || {
            get: async () => ({}),
            set: async () => {},
          },
        },
        exists: true,
      };
    }
  } catch {}

  return {
    state: {
      creds: initAuthCreds() as any,
      keys: {
        get: async () => ({}),
        set: async () => {},
      },
    },
    exists: false,
  };
}

async function saveAuthState(userId: string, creds: any, keys: any) {
  try {
    const supabase = await createClient();
    await supabase.from("whatsapp_sessions").upsert({
      user_id: userId,
      auth_state: { creds, keys },
      connected: true,
      updated_at: new Date().toISOString(),
    });
  } catch {}
}

export async function startWhatsAppConnection(
  userId: string
): Promise<{ qrCode: string } | { error: string }> {
  const { state } = await loadAuthState(userId);

  return new Promise((resolve) => {
    const timedOut = { done: false };

    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger,
      browser: ["DataBuks", "Chrome", "1.0.0"],
      connectTimeoutMs: 15000,
      keepAliveIntervalMs: 30000,
    });

    sessions.set(userId, {
      socket,
      qrCode: null,
      connected: false,
      userId,
    });

    socket.ev.on("connection.update", async (update) => {
      const { qr, connection, lastDisconnect } = update;

      if (qr && !timedOut.done) {
        timedOut.done = true;
        try {
          const qrImage = await QRCode.toDataURL(qr);
          const session = sessions.get(userId);
          if (session) session.qrCode = qrImage;
          resolve({ qrCode: qrImage });
        } catch {
          resolve({ error: "Failed to generate QR code" });
        }
      }

      if (connection === "open") {
        try {
          const creds = (socket.authState as any)?.creds;
          const keys = (socket.authState as any)?.keys;
          if (creds) await saveAuthState(userId, creds, keys);

          const supabase = await createClient();
          await supabase
            .from("whatsapp_sessions")
            .update({ connected: true, updated_at: new Date().toISOString() })
            .eq("user_id", userId);

          const session = sessions.get(userId);
          if (session) session.connected = true;

          if (!timedOut.done) {
            timedOut.done = true;
            resolve({ error: "" });
          }
        } catch {}
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          sessions.delete(userId);
          const supabase = await createClient();
          await supabase.from("whatsapp_sessions").delete().eq("user_id", userId);
        }

        if (!timedOut.done) {
          timedOut.done = true;
          resolve({ error: "Connection closed. WhatsApp may be down. Try again." });
        }
      }
    });

    socket.ev.on("creds.update", async () => {
      try {
        const creds = (socket.authState as any)?.creds;
        const keys = (socket.authState as any)?.keys;
        if (creds) await saveAuthState(userId, creds, keys);
      } catch {}
    });

    setTimeout(() => {
      if (!timedOut.done) {
        timedOut.done = true;
        resolve({ error: "QR generation timeout. Please try again." });
      }
    }, QR_WAIT_TIMEOUT);
  });
}

export function getActiveQrCode(userId: string): string | null {
  return sessions.get(userId)?.qrCode ?? null;
}

export async function getWhatsAppStatus(
  userId: string
): Promise<{ connected: boolean }> {
  const session = sessions.get(userId);
  if (session?.connected) return { connected: true };

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("whatsapp_sessions")
      .select("connected")
      .eq("user_id", userId)
      .single();

    return { connected: data?.connected ?? false };
  } catch {
    return { connected: false };
  }
}

export async function disconnectWhatsApp(
  userId: string
): Promise<{ success: boolean }> {
  try {
    const session = sessions.get(userId);
    if (session?.socket) {
      try { session.socket.ws?.close(); } catch {}
    }
    sessions.delete(userId);

    const supabase = await createClient();
    await supabase.from("whatsapp_sessions").delete().eq("user_id", userId);

    return { success: true };
  } catch {
    return { success: false };
  }
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

    if (!session?.auth_state?.creds) {
      return { success: false, error: "No active WhatsApp session" };
    }

    const socket = makeWASocket({
      auth: {
        creds: session.auth_state.creds,
        keys: session.auth_state.keys || { get: async () => ({}), set: async () => {} },
      },
      logger,
      browser: ["DataBuks", "Chrome", "1.0.0"],
      connectTimeoutMs: 15000,
    });

    return new Promise((resolve) => {
      const msgTimeout = setTimeout(() => {
        try { socket.ws?.close(); } catch {}
        resolve({ success: false, error: "Message send timeout" });
      }, 15000);

      socket.ev.on("connection.update", async ({ connection }) => {
        if (connection === "open") {
          try {
            const formattedJid = jid.includes("@s.whatsapp.net")
              ? jid
              : `${jid}@s.whatsapp.net`;
            await socket.sendMessage(formattedJid, { text: message });
            clearTimeout(msgTimeout);

            const creds = (socket.authState as any)?.creds;
            const keys = (socket.authState as any)?.keys;
            if (creds) await saveAuthState(userId, creds, keys);

            resolve({ success: true });
          } catch (err: any) {
            resolve({ success: false, error: err.message });
          } finally {
            try { socket.ws?.close(); } catch {}
          }
        }
        if (connection === "close") {
          clearTimeout(msgTimeout);
          resolve({ success: false, error: "Failed to connect" });
        }
      });
    });
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
