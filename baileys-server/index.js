require("dotenv").config();

const express = require("express");
const cors = require("cors");
const {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const { createClient } = require("@supabase/supabase-js");
const QRCode = require("qrcode");
const pino = require("pino");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.BAILEYS_API_KEY || "dev-key";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL || ""; // Optional: forward messages to Next.js

const logger = pino({ level: "silent" });

// Supabase client (service role for server-side operations)
let supabase = null;
try {
  if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    const WebSocket = require("ws");
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: WebSocket },
    });
    console.log("[Supabase] Client created successfully");
  } else {
    console.warn("[Supabase] Missing URL or SERVICE_KEY — running without persistence");
  }
} catch (err) {
  console.error("[Supabase] Failed to create client:", err.message);
}

app.use(cors());
app.use(express.json());

// ─── Auth Middleware ───
function authMiddleware(req, res, next) {
  const key = req.headers["x-api-key"];
  if (key !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.use(authMiddleware);

// ─── In-memory sessions ───
const sessions = new Map();

// Auth state directory
const AUTH_DIR = path.join(__dirname, "auth_sessions");
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

function getAuthDir(userId) {
  const dir = path.join(AUTH_DIR, userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Supabase Helpers ───
async function updateSupabaseStatus(userId, connected) {
  if (!supabase) return;
  try {
    const { data: existing } = await supabase
      .from("whatsapp_sessions")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (existing) {
      await supabase
        .from("whatsapp_sessions")
        .update({ connected, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
    } else {
      await supabase
        .from("whatsapp_sessions")
        .insert({
          user_id: userId,
          connected,
          auth_state: {},
          updated_at: new Date().toISOString(),
        });
    }
  } catch (err) {
    console.error("[Supabase Error]", err.message);
  }
}

// Store message in Supabase
async function storeMessage(userId, msg) {
  if (!supabase) return;
  try {
    await supabase.from("whatsapp_messages").insert({
      user_id: userId,
      remote_jid: msg.remoteJid,
      from_me: msg.fromMe,
      message_id: msg.messageId,
      message_type: msg.type,
      message_text: msg.text,
      timestamp: msg.timestamp,
      push_name: msg.pushName || null,
      raw_data: msg.raw || null,
    });
  } catch (err) {
    console.error("[Store Message Error]", err.message);
  }
}

// Forward message to webhook (for AI agent processing)
async function forwardToWebhook(userId, msg) {
  if (!WEBHOOK_URL) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({ userId, message: msg }),
    });
  } catch (err) {
    console.error("[Webhook Error]", err.message);
  }
}

// ─── Message Handler ───
function setupMessageHandler(socket, userId) {
  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      // Skip status messages
      if (msg.key.remoteJid === "status@broadcast") continue;

      const messageText =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        "";

      const messageType = msg.message?.conversation
        ? "text"
        : msg.message?.extendedTextMessage
        ? "text"
        : msg.message?.imageMessage
        ? "image"
        : msg.message?.videoMessage
        ? "video"
        : msg.message?.audioMessage
        ? "audio"
        : msg.message?.documentMessage
        ? "document"
        : msg.message?.contactMessage
        ? "contact"
        : msg.message?.locationMessage
        ? "location"
        : "unknown";

      const parsedMsg = {
        remoteJid: msg.key.remoteJid,
        fromMe: msg.key.fromMe || false,
        messageId: msg.key.id,
        type: messageType,
        text: messageText,
        timestamp: new Date((msg.messageTimestamp || 0) * 1000).toISOString(),
        pushName: msg.pushName || "",
        raw: JSON.stringify(msg.message || {}),
      };

      console.log(
        `[Message] ${parsedMsg.fromMe ? "SENT" : "RECEIVED"} | ${parsedMsg.remoteJid} | ${messageType}: ${messageText.slice(0, 50)}`
      );

      // Store in Supabase
      await storeMessage(userId, parsedMsg);

      // Forward to webhook for AI processing (only incoming messages)
      if (!parsedMsg.fromMe) {
        await forwardToWebhook(userId, parsedMsg);
      }
    }
  });

  // Track message read receipts
  socket.ev.on("message-receipt.update", (updates) => {
    for (const update of updates) {
      console.log(`[Receipt] ${update.key.remoteJid} — ${update.receipt?.readTimestamp ? "read" : "delivered"}`);
    }
  });
}

// ─── Connect WhatsApp ───
async function connectWhatsApp(userId) {
  const existing = sessions.get(userId);
  if (existing?.connected) {
    return { connected: true, message: "Already connected" };
  }

  if (existing?.socket) {
    try { existing.socket.ws?.close(); } catch {}
  }

  const authDir = getAuthDir(userId);

  if (!fs.existsSync(path.join(authDir, "creds.json"))) {
    try {
      if (supabase) {
        const { data: savedSession } = await supabase
          .from("whatsapp_sessions")
          .select("auth_state")
          .eq("user_id", userId)
          .maybeSingle();
        if (savedSession?.auth_state && Object.keys(savedSession.auth_state).length > 0) {
          fs.writeFileSync(path.join(authDir, "creds.json"), JSON.stringify(savedSession.auth_state));
          console.log(`[Auth] Restored session from Supabase for user: ${userId}`);
        }
      }
    } catch (err) {
      console.error("[Auth] Restore failed:", err.message);
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const wrappedSaveCreds = async (creds) => {
    await saveCreds();
    try {
      if (supabase) {
        let credsToPersist = creds;
        if (!credsToPersist) {
          try {
            credsToPersist = JSON.parse(fs.readFileSync(path.join(authDir, "creds.json"), "utf8"));
          } catch {
            credsToPersist = null;
          }
        }
        if (credsToPersist && Object.keys(credsToPersist).length > 0) {
          await supabase.from("whatsapp_sessions").upsert(
            {
              user_id: userId,
              auth_state: credsToPersist,
              connected: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );
        }
      }
    } catch (err) {
      console.error("[Auth] Persist failed:", err.message);
    }
  };
  const { version } = await fetchLatestBaileysVersion();

  return new Promise((resolve) => {
    let resolved = false;

    const socket = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
      logger,
      browser: ["DataBuks", "Chrome", "1.0.0"],
      connectTimeoutMs: 30000,
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 250,
      markOnlineOnConnect: true,
    });

    const session = {
      socket,
      qrCode: null,
      connected: false,
      userId,
      qrRetries: 0,
      phoneNumber: null,
    };
    sessions.set(userId, session);

    // Set up message handler for AI agents
    setupMessageHandler(socket, userId);

    socket.ev.on("connection.update", async (update) => {
      const { qr, connection, lastDisconnect } = update;

      if (qr) {
        try {
          const qrImage = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
          session.qrCode = qrImage;
          session.qrRetries++;

          if (!resolved) {
            resolved = true;
            resolve({ qrCode: qrImage });
          }
        } catch (err) {
          if (!resolved) {
            resolved = true;
            resolve({ error: "Failed to generate QR code" });
          }
        }
      }

      if (connection === "open") {
        console.log(`[WhatsApp] Connected for user: ${userId}`);
        session.connected = true;
        session.qrCode = null;

        // Get phone number
        try {
          const user = socket.user;
          session.phoneNumber = user?.id?.split(":")[0] || null;
          console.log(`[WhatsApp] Phone: ${session.phoneNumber}`);
        } catch {}

        await updateSupabaseStatus(userId, true);

        if (!resolved) {
          resolved = true;
          resolve({ connected: true });
        }
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[WhatsApp] Disconnected for user: ${userId}, code: ${statusCode}, reconnect: ${shouldReconnect}`);
        session.connected = false;

        if (statusCode === DisconnectReason.loggedOut) {
          sessions.delete(userId);
          const authDir = getAuthDir(userId);
          try { fs.rmSync(authDir, { recursive: true, force: true }); } catch {}
          try {
            if (supabase) {
              await supabase
                .from("whatsapp_sessions")
                .upsert(
                  { user_id: userId, connected: false, auth_state: {}, updated_at: new Date().toISOString() },
                  { onConflict: "user_id" }
                );
            }
          } catch (err) {
            console.error("[Supabase] Failed to clear session on logout:", err.message);
          }
          await updateSupabaseStatus(userId, false);

          if (!resolved) {
            resolved = true;
            resolve({ error: "Logged out from WhatsApp. Please reconnect." });
          }
        } else if (shouldReconnect) {
          console.log(`[WhatsApp] Auto-reconnecting for user: ${userId}`);
          setTimeout(() => {
            connectWhatsApp(userId).catch(() => {});
          }, 3000);
        }

        if (!resolved) {
          resolved = true;
          resolve({ error: "Connection closed. Try again." });
        }
      }
    });

    socket.ev.on("creds.update", wrappedSaveCreds);

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ error: "Connection timeout. Please try again." });
      }
    }, 30000);
  });
}

// ─── Routes ───

// Health check
app.get("/health", (req, res) => {
  const sessionList = [];
  sessions.forEach((s, uid) => {
    sessionList.push({ userId: uid, connected: s.connected, phone: s.phoneNumber });
  });
  res.json({
    status: "ok",
    activeSessions: sessions.size,
    sessions: sessionList,
    uptime: process.uptime(),
    supabase: !!supabase,
  });
});

// Connect WhatsApp
app.post("/connect", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });

  try {
    const result = await connectWhatsApp(userId);
    res.json(result);
  } catch (err) {
    console.error("[Connect Error]", err);
    res.status(500).json({ error: err.message });
  }
});

// Get status
app.get("/status/:userId", (req, res) => {
  const { userId } = req.params;
  const session = sessions.get(userId);

  if (session) {
    return res.json({
      connected: session.connected,
      hasQr: !!session.qrCode,
      phoneNumber: session.phoneNumber,
    });
  }

  if (supabase) {
    supabase
      .from("whatsapp_sessions")
      .select("connected")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        res.json({ connected: data?.connected ?? false, hasQr: false, phoneNumber: null });
      })
      .catch(() => {
        res.json({ connected: false, hasQr: false, phoneNumber: null });
      });
  } else {
    res.json({ connected: false, hasQr: false, phoneNumber: null });
  }
});

// Get latest QR code
app.get("/qr/:userId", (req, res) => {
  const { userId } = req.params;
  const session = sessions.get(userId);
  if (session?.qrCode) {
    return res.json({ qrCode: session.qrCode });
  }
  res.json({ qrCode: null });
});

// Disconnect
app.post("/disconnect", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });

  const session = sessions.get(userId);
  if (session?.socket) {
    try { session.socket.ws?.close(); } catch {}
    try { await session.socket.logout(); } catch {}
  }
  sessions.delete(userId);

  const authDir = getAuthDir(userId);
  try { fs.rmSync(authDir, { recursive: true, force: true }); } catch {}

  await updateSupabaseStatus(userId, false);

  res.json({ success: true });
});

// Send text message
app.post("/send", async (req, res) => {
  const { userId, jid, message } = req.body;
  if (!userId || !jid || !message) {
    return res.status(400).json({ error: "userId, jid, and message required" });
  }

  const session = sessions.get(userId);
  if (!session?.connected || !session?.socket) {
    return res.status(400).json({ error: "No active WhatsApp connection" });
  }

  try {
    const formattedJid = jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;
    const sent = await session.socket.sendMessage(formattedJid, { text: message });
    res.json({ success: true, messageId: sent?.key?.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Typing/presence indicator (composing | paused | available)
app.post("/presence", async (req, res) => {
  const { userId, jid, presence } = req.body;
  if (!userId || !jid || !presence) {
    return res.status(400).json({ error: "userId, jid, and presence required" });
  }
  if (!["composing", "paused", "available"].includes(presence)) {
    return res.status(400).json({ error: "presence must be composing, paused or available" });
  }

  const session = sessions.get(userId);
  if (!session?.connected || !session?.socket) {
    return res.json({ success: false, reason: "no_active_connection" });
  }

  try {
    const formattedJid = jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;
    await session.socket.sendPresenceUpdate(presence, formattedJid);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, reason: err.message });
  }
});

// Send media message (image, video, document)
app.post("/send-media", async (req, res) => {
  const { userId, jid, mediaUrl, caption, type } = req.body;
  if (!userId || !jid || !mediaUrl) {
    return res.status(400).json({ error: "userId, jid, and mediaUrl required" });
  }

  const session = sessions.get(userId);
  if (!session?.connected || !session?.socket) {
    return res.status(400).json({ error: "No active WhatsApp connection" });
  }

  try {
    const formattedJid = jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;
    let messageContent;

    if (type === "image") {
      messageContent = { image: { url: mediaUrl }, caption: caption || "" };
    } else if (type === "video") {
      messageContent = { video: { url: mediaUrl }, caption: caption || "" };
    } else if (type === "document") {
      messageContent = { document: { url: mediaUrl }, caption: caption || "", mimetype: "application/pdf" };
    } else {
      messageContent = { image: { url: mediaUrl }, caption: caption || "" };
    }

    const sent = await session.socket.sendMessage(formattedJid, messageContent);
    res.json({ success: true, messageId: sent?.key?.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get contacts/chats list
app.get("/chats/:userId", async (req, res) => {
  const { userId } = req.params;
  const session = sessions.get(userId);

  if (!session?.connected || !session?.socket) {
    return res.status(400).json({ error: "No active WhatsApp connection" });
  }

  try {
    const chats = await session.socket.groupFetchAllParticipating();
    const groups = Object.values(chats).map((g) => ({
      jid: g.id,
      name: g.subject,
      participants: g.participants?.length || 0,
    }));
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages from Supabase (for AI agent to read history)
app.get("/messages/:userId", async (req, res) => {
  const { userId } = req.params;
  const { jid, limit = 50 } = req.query;

  if (!supabase) {
    return res.status(500).json({ error: "Supabase not configured" });
  }

  try {
    let query = supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("user_id", userId)
      .order("timestamp", { ascending: false })
      .limit(Number(limit));

    if (jid) query = query.eq("remote_jid", jid);

    const { data, error } = await query;
    if (error) throw error;

    res.json({ messages: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if number exists on WhatsApp
app.get("/check-number/:userId/:phone", async (req, res) => {
  const { userId, phone } = req.params;
  const session = sessions.get(userId);

  if (!session?.connected || !session?.socket) {
    return res.status(400).json({ error: "No active WhatsApp connection" });
  }

  try {
    const jid = phone.includes("@") ? phone : `${phone}@s.whatsapp.net`;
    const [result] = await session.socket.onWhatsApp(jid);
    res.json({ exists: result?.exists ?? false, jid: result?.jid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ───
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught Exception:", err.message);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled Rejection:", reason);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🟢 Baileys server running on port ${PORT}`);
  console.log(`   Supabase: ${SUPABASE_URL ? "Connected" : "NOT configured"}`);
  console.log(`   Webhook: ${WEBHOOK_URL || "NOT configured"}`);
  console.log(`   API Key: ${API_KEY ? "Set" : "NOT set"}`);
  console.log(`   Health: http://0.0.0.0:${PORT}/health`);
});
