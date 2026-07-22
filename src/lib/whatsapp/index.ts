import {
  makeWASocket,
  DisconnectReason,
  type WASocket,
  type AuthenticationState,
  initAuthCreds,
  BufferJSON,
  proto,
} from "@whiskeysockets/baileys";
import { createClient } from "@/lib/supabase/server";
import QRCode from "qrcode";
import pino from "pino";

const logger = pino({ level: "silent" });

const activeConnections = new Map<string, { socket: WASocket; qrCode: string | null }>();

const CONNECTION_TIMEOUT = 180000;

async function loadAuthState(userId: string): Promise<{ state: AuthenticationState; exists: boolean; saveCreds: () => Promise<void> }> {
  const credsKey = `wa:${userId}:creds`;
  const keysKey = `wa:${userId}:keys`;

  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_sessions")
    .select("auth_state")
    .eq("user_id", userId)
    .single();

  if (data?.auth_state) {
    try {
      const creds = JSON.parse(JSON.stringify(data.auth_state.creds), (key, value) => {
        if (key === "noiseKey" && value) return { ...value };
        if (key === "signedIdentityKey" && value) return { ...value };
        if (key === "signedPreKey" && value) return { ...value };
        return value;
      }) as any;

      const keys: any = {
        get: async (type: string, ids: string[]) => {
          const storedKeys = data.auth_state.keys?.[type];
          const result: any = {};
          if (storedKeys) {
            for (const id of ids) {
              if (storedKeys[id]) result[id] = storedKeys[id];
            }
          }
          return result;
        },
        set: async (items: any) => {
          if (!data.auth_state.keys) data.auth_state.keys = {};
          for (const category of Object.keys(items)) {
            if (!data.auth_state.keys[category]) data.auth_state.keys[category] = {};
            Object.assign(data.auth_state.keys[category], items[category]);
          }
          await saveAuthState(userId, { creds, keys: data.auth_state.keys });
        },
      };

      return {
        state: { creds, keys },
        exists: true,
        saveCreds: async () => {
          await saveAuthState(userId, { creds, keys: data.auth_state.keys });
        },
      };
    } catch {}
  }

  const initCreds = initAuthCreds();
  const keyStore: Record<string, any> = {};

  return {
    state: {
      creds: initCreds as any,
      keys: {
        get: async (_type: string, _ids: string[]) => ({}),
        set: async (items: any) => {
          for (const category of Object.keys(items)) {
            if (!keyStore[category]) keyStore[category] = {};
            Object.assign(keyStore[category], items[category]);
          }
        },
      },
    },
    exists: false,
    saveCreds: async () => {},
  };
}

async function saveAuthState(userId: string, authState: { creds: any; keys: any }) {
  try {
    const supabase = await createClient();
    await supabase.from("whatsapp_sessions").upsert({
      user_id: userId,
      auth_state: authState,
      connected: true,
      updated_at: new Date().toISOString(),
    });
  } catch {}
}

export async function startWhatsAppConnection(
  userId: string
): Promise<{ qrCode: string } | { connected: true } | { error: string }> {
  const existing = activeConnections.get(userId);
  if (existing?.qrCode) {
    return { qrCode: existing.qrCode };
  }

  const { state, exists } = await loadAuthState(userId);
  let qrGenerated = false;

  try {
    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger,
      browser: ["DataBuks", "Chrome", "1.0.0"],
      connectTimeoutMs: 30000,
      keepAliveIntervalMs: 15000,
    });

    activeConnections.set(userId, { socket, qrCode: null });

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup(userId);
        if (qrGenerated) return;
        resolve({ error: "Connection timeout. Please try again." });
      }, CONNECTION_TIMEOUT);

      socket.ev.on("connection.update", async (update) => {
        const { qr, connection, lastDisconnect } = update;

        if (qr && !qrGenerated) {
          qrGenerated = true;
          const qrImage = await QRCode.toDataURL(qr);
          const conn = activeConnections.get(userId);
          if (conn) conn.qrCode = qrImage;
          resolve({ qrCode: qrImage });
        }

        if (connection === "open") {
          clearTimeout(timeout);
          const conn = activeConnections.get(userId);
          if (conn) conn.qrCode = null;

          const creds = (socket.authState as any)?.creds;
          const keys = (socket.authState as any)?.keys;

          if (creds) {
            await saveAuthState(userId, { creds, keys });
          }

          const supabase = await createClient();
          await supabase
            .from("whatsapp_sessions")
            .update({ connected: true, updated_at: new Date().toISOString() })
            .eq("user_id", userId);

          resolve({ connected: true });
        }

        if (connection === "close") {
          const shouldReconnect =
            (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;

          if (shouldReconnect) {
            const conn = activeConnections.get(userId);
            if (conn) {
              setTimeout(async () => {
                try {
                  const { state: savedState } = await loadAuthState(userId);
                  if (!savedState.creds.me) return;
                  const reconnectSocket = makeWASocket({
                    auth: savedState,
                    logger,
                    browser: ["DataBuks", "Chrome", "1.0.0"],
                    connectTimeoutMs: 15000,
                    keepAliveIntervalMs: 15000,
                  });

                  reconnectSocket.ev.on("connection.update", async ({ connection: connStatus }) => {
                    if (connStatus === "open") {
                      const newCreds = (reconnectSocket.authState as any)?.creds;
                      const newKeys = (reconnectSocket.authState as any)?.keys;
                      if (newCreds) {
                        await saveAuthState(userId, { creds: newCreds, keys: newKeys });
                      }
                      activeConnections.set(userId, { socket: reconnectSocket, qrCode: null });
                      await updateConnectionStatus(userId, true);
                    }
                    if (connStatus === "close") {
                      cleanup(userId);
                      await updateConnectionStatus(userId, false);
                    }
                  });
                } catch {
                  cleanup(userId);
                  await updateConnectionStatus(userId, false);
                }
              }, 2000);
            }
          } else {
            clearTimeout(timeout);
            cleanup(userId);
            await updateConnectionStatus(userId, false);
            const supabase = await createClient();
            await supabase.from("whatsapp_sessions").delete().eq("user_id", userId);
          }
        }
      });

      socket.ev.on("creds.update", async () => {
        const creds = (socket.authState as any)?.creds;
        const keys = (socket.authState as any)?.keys;
        if (creds) {
          await saveAuthState(userId, { creds, keys });
        }
      });
    });
  } catch (err: any) {
    cleanup(userId);
    return { error: err.message ?? "Failed to start WhatsApp connection" };
  }
}

export async function disconnectWhatsApp(userId: string): Promise<{ success: boolean }> {
  try {
    cleanup(userId);
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

  const isConnected = data?.connected ?? false;

  if (!isConnected) {
    const conn = activeConnections.get(userId);
    if (conn?.socket) {
      try {
        const creds = (conn.socket.authState as any)?.creds;
        return { connected: !!creds?.me };
      } catch {
        return { connected: false };
      }
    }
  }

  return { connected: isConnected };
}

export async function sendWhatsAppMessage(
  userId: string,
  jid: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { state } = await loadAuthState(userId);
    if (!(state.creds as any)?.me) {
      return { success: false, error: "No active WhatsApp session. Please scan QR code first." };
    }

    const socket = makeWASocket({
      auth: state,
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
            const formattedJid = jid.includes("@s.whatsapp.net") ? jid : `${jid}@s.whatsapp.net`;
            await socket.sendMessage(formattedJid, { text: message });
            clearTimeout(msgTimeout);

            const creds = (socket.authState as any)?.creds;
            const keys = (socket.authState as any)?.keys;
            if (creds) await saveAuthState(userId, { creds, keys });

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

      socket.ev.on("creds.update", async () => {
        const creds = (socket.authState as any)?.creds;
        const keys = (socket.authState as any)?.keys;
        if (creds) await saveAuthState(userId, { creds, keys });
      });
    });
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getActiveQrCode(userId: string): Promise<string | null> {
  const conn = activeConnections.get(userId);
  return conn?.qrCode ?? null;
}

async function updateConnectionStatus(userId: string, connected: boolean) {
  try {
    const supabase = await createClient();
    await supabase
      .from("whatsapp_sessions")
      .update({ connected, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  } catch {}
}

function cleanup(userId: string) {
  const conn = activeConnections.get(userId);
  if (conn) {
    try { conn.socket.ws?.close(); } catch {}
    activeConnections.delete(userId);
  }
}
