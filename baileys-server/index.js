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

// ─── QR sizing ───
// A NaN/invalid dimension reaching the PNG encoder throws Node's
// RangeError "The value of 'size' is out of range ... Received NaN".
// Every width value is coerced through this guard before rendering.
const DEFAULT_QR_WIDTH = 300;
const MIN_QR_WIDTH = 64;
const MAX_QR_WIDTH = 1024;

function sanitizeQrWidth(value) {
  let n;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && value.trim() !== "") n = Number(value.trim());
  else return DEFAULT_QR_WIDTH;
  if (!Number.isFinite(n)) return DEFAULT_QR_WIDTH;
  const floored = Math.floor(n);
  if (floored < MIN_QR_WIDTH || floored > MAX_QR_WIDTH) return DEFAULT_QR_WIDTH;
  return floored;
}

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

/**
 * A restored auth_state must contain the crypto material Baileys needs for
 * the noise handshake. Partial/corrupt state (e.g. creds persisted without
 * keys, or truncated JSON) makes Baileys throw deep inside its crypto layer
 * — surfacing as Node RangeErrors like "The value of 'size' is out of range
 * ... Received NaN". Reject anything suspicious up front.
 */
function isValidRestoredCreds(authState) {
  if (!authState || typeof authState !== "object") return false;
  const required = ["noiseKey", "signedIdentityKey", "signedPreKey", "registrationId"];
  for (const field of required) {
    const v = authState[field];
    if (!v || typeof v !== "object") return false;
    if (field === "registrationId") {
      if (typeof v !== "number" && typeof v.value !== "number") return false;
      continue;
    }
    if (field === "signedPreKey") {
      if (!v.keyPair || typeof v.keyPair.privateKey !== "string" && !Array.isArray(v.keyPair.privateKey)) return false;
      continue;
    }
    // noiseKey / signedIdentityKey: { private: <string|bytes>, public: ... }
    const hasMaterial =
      typeof v.private === "string" || Array.isArray(v.private) || (v.private && typeof v.private === "object");
    if (!hasMaterial) return false;
  }
  return true;
}

/** Wipe local auth dir + Supabase auth_state so the next connect starts fresh. */
async function clearAuthState(userId) {
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
    console.error("[Auth] Supabase clear failed:", err.message);
  }
  sessions.delete(userId);
}

/** Never leak raw internals (stack traces, buffer errors) to API clients. */
function safeConnectError(err) {
  const msg = String(err?.message ?? err ?? "unknown");
  console.error("[Connect] Internal error:", msg, err?.stack?.split("\n")[1] ?? "");
  if (/size.*out of range|NaN|RangeError|TypeError/i.test(msg)) {
    return "WhatsApp session data was corrupted. A fresh connection was prepared — please try generating the QR code again.";
  }
  return "Could not start WhatsApp connection. Please try again.";
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
  // Owner command center: messages the user sends to THEIR OWN number
  // ("message yourself" chat) are routed as assistant commands.
  // ownPhone is resolved from TWO sources — socket.user.id AND the live
  // session phoneNumber — because JID formats differ across Baileys events.
  const resolveOwnPhones = () => {
    const phones = new Set();
    try {
      const uid = String(socket.user?.id ?? "");
      if (uid) phones.add(uid.split(":")[0].split("@")[0]);
    } catch {}
    try {
      const p = String(sessions.get(userId)?.phoneNumber ?? "");
      if (p) phones.add(p.replace(/\D/g, ""));
    } catch {}
    phones.delete("");
    return phones;
  };

  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      // Skip status messages
      if (msg.key.remoteJid === "status@broadcast") continue;

      const fromMe = msg.key.fromMe || false;
      const remotePhone = String(msg.key.remoteJid ?? "").replace(/@.*$/, "").split(":")[0].replace(/\D/g, "");
      const ownPhones = resolveOwnPhones();
      const isSelfChat =
        fromMe && !!remotePhone && (ownPhones.has(remotePhone) || [...ownPhones].some((p) => p && (p.includes(remotePhone) || remotePhone.includes(p))));
      const ownerPhone = process.env.OWNER_WHATSAPP_NUMBER
        ? process.env.OWNER_WHATSAPP_NUMBER.replace(/\D/g, "")
        : "";
      const isOwnerDevice = !fromMe && !!ownerPhone && remotePhone === ownerPhone;

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
        fromMe,
        messageId: msg.key.id,
        type: messageType,
        text: messageText,
        timestamp: new Date((msg.messageTimestamp || 0) * 1000).toISOString(),
        pushName: msg.pushName || "",
        raw: JSON.stringify(msg.message || {}),
        origin: isSelfChat ? "self" : isOwnerDevice ? "owner_device" : "lead",
      };

      console.log(
        `[Message] ${parsedMsg.origin.toUpperCase()} | own=[${[...resolveOwnPhones()]}] remote=${remotePhone} | ${parsedMsg.remoteJid} | ${messageType}: ${messageText.slice(0, 50)}`
      );

      // Store in Supabase (skip storing self-commands as business inbox msgs)
      if (!isSelfChat) {
        await storeMessage(userId, parsedMsg);
      }

      // Forward EVERYTHING that is either an inbound lead message OR any
      // fromMe message with text. The webhook decides routing: messages from
      // the owner number become assistant commands; other fromMe messages
      // are ignored there as outbound. This removes ALL detection fragility
      // from the server — JID formats vary across Baileys events/devices.
      if (!fromMe || messageText) {
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

// ─── Full Auth-State Persistence ───
// Persists the ENTIRE auth folder (creds.json + keys/*) so a Railway restart
// restores a complete session — no QR re-scan needed. The old creds-only
// restore left sessions half-alive (connected:false, handshake failures).
const AUTH_PERSIST_MIN_MS = 30000;
const lastPersistAt = new Map();

function readAuthFiles(authDir) {
  const files = {};
  const walk = (dir, base) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) walk(full, rel);
      else {
        try { files[rel] = fs.readFileSync(full, "utf8"); } catch {}
      }
    }
  };
  walk(authDir, "");
  return files;
}

async function persistFullAuthState(userId, authDir, reason) {
  if (!supabase) return;
  const now = Date.now();
  const last = lastPersistAt.get(userId) ?? 0;
  if (now - last < AUTH_PERSIST_MIN_MS) return;
  lastPersistAt.set(userId, now);
  try {
    const files = readAuthFiles(authDir);
    if (!files["creds.json"]) return;
    await supabase.from("whatsapp_sessions").upsert(
      {
        user_id: userId,
        auth_state: { files, format: "full" },
        connected: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    console.log(`[Auth] Full auth state persisted for ${userId} (${Object.keys(files).length} files, ${reason})`);
  } catch (err) {
    console.error("[Auth] Full persist failed:", err.message);
  }
}

async function restoreFullAuthState(userId, authDir) {
  if (!supabase) return false;
  try {
    const { data: savedSession } = await supabase
      .from("whatsapp_sessions")
      .select("auth_state")
      .eq("user_id", userId)
      .maybeSingle();
    const restored = savedSession?.auth_state;

    // 1. FULL restore: { format: "full", files: { "creds.json": ..., "keys/...": ... } }
    if (restored?.format === "full" && restored?.files && Object.keys(restored.files).length > 0) {
      fs.mkdirSync(authDir, { recursive: true });
      for (const [rel, content] of Object.entries(restored.files)) {
        const target = path.join(authDir, rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
      }
      console.log(`[Auth] FULL session restored from Supabase for ${userId} (${Object.keys(restored.files).length} files)`);
      return true;
    }

    // 2. Legacy creds-only restore
    if (restored && Object.keys(restored).length > 0) {
      if (isValidRestoredCreds(restored)) {
        fs.mkdirSync(authDir, { recursive: true });
        fs.writeFileSync(path.join(authDir, "creds.json"), JSON.stringify(restored));
        console.log(`[Auth] Restored creds-only from Supabase for ${userId} (legacy)`);
        return true;
      }
      console.warn(`[Auth] Supabase auth_state for ${userId} is corrupt/partial — ignoring, starting fresh`);
      await clearAuthState(userId);
      fs.mkdirSync(authDir, { recursive: true });
    }
  } catch (err) {
    console.error("[Auth] Restore failed:", err.message);
  }
  return false;
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
    await restoreFullAuthState(userId, authDir);
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const wrappedSaveCreds = async (creds) => {
    await saveCreds();
    // Full-state persist (throttled) — creds AND keys survive restarts
    await persistFullAuthState(userId, authDir, "creds.update");
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
          if (typeof qr !== "string" || qr.trim() === "") throw new Error("empty QR payload");
          const qrImage = await QRCode.toDataURL(qr, {
            width: sanitizeQrWidth(process.env.QR_WIDTH),
            margin: 2,
          });
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
        // Persist FULL auth state right after handshake — keys are fresh now
        lastPersistAt.set(userId, 0);
        await persistFullAuthState(userId, getAuthDir(userId), "connected");

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
    // Corrupt auth state can make Baileys crash mid-handshake with raw
    // buffer errors. Recover automatically: wipe the bad state and retry
    // once with a fresh session so a QR is generated instead of an error.
    try {
      console.log(`[Connect] error for ${userId}, clearing auth and retrying fresh`);
      await clearAuthState(userId);
      const retry = await connectWhatsApp(userId);
      if (retry?.error) {
        console.error("[Connect] retry also failed:", retry.error);
        return res.status(500).json({ error: safeConnectError(new Error(retry.error)) });
      }
      return res.json(retry);
    } catch (retryErr) {
      console.error("[Connect] fresh retry crashed:", retryErr);
      return res.status(500).json({ error: safeConnectError(retryErr) });
    }
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

// Pairing code endpoint
app.post("/pair", async (req, res) => {
  const { userId, phoneNumber } = req.body;
  if (!userId || !phoneNumber) return res.status(400).json({ error: "userId and phoneNumber required" });
  let currentSession = sessions.get(userId);
  if (!currentSession?.socket) {
    try { await connectWhatsApp(userId); currentSession = sessions.get(userId); } catch (err) { return res.status(500).json({ error: err.message }); }
  }
  try {
    if (!currentSession?.socket) return res.status(400).json({ error: "Connection not ready" });
    await new Promise((r) => setTimeout(r, 2000));
    const cleanPhone = phoneNumber.replace(/[^\d]/g, "");
    const pairingCode = await currentSession.socket.requestPairingCode(cleanPhone);
    res.json({ success: true, pairingCode });
  } catch (err) {
    console.error("[Pair] Error:", err.message);
    res.status(500).json({ error: "Failed to generate pairing code" });
  }
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
  console.log(`Baileys server running on port ${PORT}`);
  console.log(`   Supabase: ${SUPABASE_URL ? "Connected" : "NOT configured"}`);
  console.log(`   Webhook: ${WEBHOOK_URL || "NOT configured"}`);
  console.log(`   API Key: ${API_KEY ? "Set" : "NOT set"}`);
  console.log(`   Health: http://0.0.0.0:${PORT}/health`);

  autoRestoreSessions();
});

async function autoRestoreSessions() {
  if (!supabase) return;
  try {
    const { data: savedSessions } = await supabase
      .from("whatsapp_sessions")
      .select("user_id")
      .eq("connected", true)
      .limit(20);
    for (const row of savedSessions ?? []) {
      const userId = row.user_id;
      console.log(`[Auth] Auto-restoring session for user: ${userId}`);
      connectWhatsApp(userId).catch((err) => {
        console.error(`[Auth] Auto-restore failed for ${userId}:`, err.message);
      });
    }
  } catch (err) {
    console.error("[Auth] Auto-restore scan failed:", err.message);
  }
}
