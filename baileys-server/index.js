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

const logger = pino({ level: "silent" });

// Supabase client (service role for server-side operations)
const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

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

// ─── Helpers ───
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

// ─── Connect WhatsApp ───
async function connectWhatsApp(userId) {
  // If already connected, return status
  const existing = sessions.get(userId);
  if (existing?.connected) {
    return { connected: true, message: "Already connected" };
  }

  // Clean up old socket if exists
  if (existing?.socket) {
    try { existing.socket.ws?.close(); } catch {}
  }

  const authDir = getAuthDir(userId);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
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
    });

    const session = {
      socket,
      qrCode: null,
      connected: false,
      userId,
      qrRetries: 0,
    };
    sessions.set(userId, session);

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
          // User logged out — clean up everything
          sessions.delete(userId);
          const authDir = getAuthDir(userId);
          try { fs.rmSync(authDir, { recursive: true, force: true }); } catch {}
          await updateSupabaseStatus(userId, false);

          if (!resolved) {
            resolved = true;
            resolve({ error: "Logged out from WhatsApp. Please reconnect." });
          }
        } else if (shouldReconnect) {
          // Auto-reconnect
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

    socket.ev.on("creds.update", saveCreds);

    // Timeout after 30 seconds
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
  res.json({
    status: "ok",
    activeSessions: sessions.size,
    uptime: process.uptime(),
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
    });
  }

  // Check Supabase if no in-memory session
  if (supabase) {
    supabase
      .from("whatsapp_sessions")
      .select("connected")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        res.json({ connected: data?.connected ?? false, hasQr: false });
      })
      .catch(() => {
        res.json({ connected: false, hasQr: false });
      });
  } else {
    res.json({ connected: false, hasQr: false });
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

  // Clean auth files
  const authDir = getAuthDir(userId);
  try { fs.rmSync(authDir, { recursive: true, force: true }); } catch {}

  await updateSupabaseStatus(userId, false);

  res.json({ success: true });
});

// Send message
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
    await session.socket.sendMessage(formattedJid, { text: message });
    res.json({ success: true });
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
  console.log(`   API Key: ${API_KEY ? "Set" : "NOT set"}`);
  console.log(`   Health: http://0.0.0.0:${PORT}/health`);
});
