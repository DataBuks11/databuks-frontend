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

// ─── Dual slots: business + personal numbers simultaneously ───
// In-memory/filesystem session key: "biz__<uuid>" / "personal__<uuid>".
// Supabase writes ALWAYS use the raw UUID + slot column (user_id is UUID).
// A bare UUID (legacy callers) means the business slot.
const SLOT_PREFIX = { business: "biz", personal: "personal" };

function normalizeKey(input, fallbackSlot) {
  const raw = String(input ?? "");
  const m = raw.match(/^(biz|business|personal)__(.+)$/);
  if (m) {
    const slot = m[1] === "biz" ? "business" : m[1];
    return { key: `${SLOT_PREFIX[slot]}__${m[2]}`, slot, userId: m[2] };
  }
  const slot = fallbackSlot === "personal" ? "personal" : "business";
  return { key: `${SLOT_PREFIX[slot]}__${raw}`, slot, userId: raw };
}

function lookupSession(input, fallbackSlot) {
  const n = normalizeKey(input, fallbackSlot);
  const session =
    sessions.get(n.key) ??
    sessions.get(n.userId) ?? // legacy raw-uuid session (pre-slot deploys)
    sessions.get(`personal__${n.userId}`) ?? // very old personal scope
    null;
  return { ...n, session };
}

// Slot-aware session upsert. Requires the dual-slots migration
// (slot column + UNIQUE(user_id, slot)); falls back to the legacy
// single row for business if the DB predates it.
async function upsertSessionRow(rawUserId, slot, patch) {
  if (!supabase) return;
  const row = { user_id: rawUserId, slot, updated_at: new Date().toISOString(), ...patch };
  try {
    const { error } = await supabase.from("whatsapp_sessions").upsert(row, { onConflict: "user_id,slot" });
    if (error) throw error;
  } catch (err) {
    const msg = String(err?.message ?? err ?? "");
    if (/slot/i.test(msg) && slot === "business") {
      try {
        const legacy = { ...row };
        delete legacy.slot;
        const { error: e2 } = await supabase.from("whatsapp_sessions").upsert(legacy, { onConflict: "user_id" });
        if (e2) throw e2;
        return;
      } catch (e2) {
        console.error("[Supabase] legacy session upsert failed:", e2.message);
        return;
      }
    }
    console.error("[Supabase] session upsert failed:", msg);
  }
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
async function clearAuthState(key) {
  const { slot, userId } = normalizeKey(key);
  const authDir = getAuthDir(key);
  try { fs.rmSync(authDir, { recursive: true, force: true }); } catch {}
  await upsertSessionRow(userId, slot, { connected: false, auth_state: {} });
  sessions.delete(key);
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
async function updateSupabaseStatus(key, connected) {
  if (!supabase) return;
  const { slot, userId } = normalizeKey(key);
  try {
    await upsertSessionRow(userId, slot, { connected });
  } catch (err) {
    console.error("[Supabase Error]", err.message);
  }
}

// Store message in Supabase (slot-tagged; legacy retry if DB predates migration)
async function storeMessage(key, msg, preProcessed = false) {
  if (!supabase) return;
  const { slot, userId } = normalizeKey(key);
  const base = {
    user_id: userId,
    remote_jid: msg.remoteJid,
    from_me: msg.fromMe,
    message_id: msg.messageId,
    message_type: msg.type,
    message_text: msg.text,
    timestamp: msg.timestamp,
    push_name: msg.pushName || null,
    raw_data: msg.raw || null,
    processed: preProcessed,
  };
  try {
    const { error } = await supabase.from("whatsapp_messages").insert({ ...base, slot });
    if (error) throw error;
  } catch (err) {
    if (/slot/i.test(String(err?.message ?? ""))) {
      try {
        await supabase.from("whatsapp_messages").insert(base);
      } catch (e2) {
        console.error("[Store Message Error]", e2.message);
      }
    } else {
      console.error("[Store Message Error]", err.message);
    }
  }
}

// Forward message to webhook (for AI agent processing)
async function forwardToWebhook(key, msg, ownPhone = "") {
  if (!WEBHOOK_URL) { console.log("[Webhook] No WEBHOOK_URL set, skipping"); return; }
  const { slot, userId } = normalizeKey(key);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000); // 55s timeout
    console.log(`[Webhook] Forwarding ${msg.origin} message to ${WEBHOOK_URL}`);
    const resp = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({ userId, slot, ownPhone, message: msg }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const body = await resp.text();
    console.log(`[Webhook] Response: ${resp.status} ${body.slice(0, 200)}`);
  } catch (err) {
    console.error("[Webhook Error]", err.message);
  }
}

// ─── Echo suppression ───
// Messages WE just sent via /send come back through messages.upsert as
// fromMe=false echoes (LID addressing). Without suppression the AI replies
// to its own reply forever — including CROSS-SLOT loops where business-AI
// and personal-AI keep answering each other. Keyed per session+remote, PLUS
// a per-user global record so an AI text arriving on the OTHER slot (or the
// other phone) is also recognized as ours. Exact-text + 120s window, so a
// human retyping the same words later is unaffected.
const lastSent = new Map(); // `${key}|${remoteJid}` -> { text, at }
const globalSent = new Map(); // `${rawUserId}|${text}` -> { at }
function pruneSentMap(map, key) {
  try {
    if (map.size > 500) {
      const cutoff = Date.now() - 5 * 60 * 1000;
      for (const [k, v] of map) if (v.at < cutoff) map.delete(k);
    }
  } catch {}
}
function recordSent(key, remoteJid, text) {
  try {
    const t = String(text ?? "").slice(0, 120);
    if (!t) return;
    lastSent.set(`${key}|${String(remoteJid ?? "")}`, { text: t, at: Date.now() });
    pruneSentMap(lastSent);
    const { userId } = normalizeKey(key);
    globalSent.set(`${userId}|${t}`, { at: Date.now() });
    pruneSentMap(globalSent);
  } catch {}
}
function isOwnEcho(key, remoteJid, text) {
  try {
    const t = String(text ?? "").slice(0, 120);
    if (!t) return false;
    const now = Date.now();
    const rec = lastSent.get(`${key}|${String(remoteJid ?? "")}`);
    if (rec && rec.text === t && now - rec.at < 120 * 1000) return true;
    const { userId } = normalizeKey(key);
    const g = globalSent.get(`${userId}|${t}`);
    return !!g && now - g.at < 120 * 1000;
  } catch {
    return false;
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
      // Skip status broadcasts + channels/newsletters — never leads, never
      // commands. Replying inside a channel would spam thousands of people.
      const rj = String(msg.key.remoteJid ?? "");
      if (msg.key.remoteJid === "status@broadcast" || rj.endsWith("@newsletter") || rj.endsWith("@broadcast")) continue;

      // Skip reactions and protocol noise — no replyable content, and
      // forwarding them only produces webhook 400s (empty text).
      const rawTop = msg.message || {};
      if (rawTop.reactionMessage || rawTop.protocolMessage) continue;

      // Unwrap container message types. WhatsApp wraps captioned media as
      // documentWithCaptionMessage/imageWithCaptionMessage/videoWithCaption-
      // Message, and view-once media in viewOnceMessage(V2). Without
      // unwrapping, type detection falls to "unknown" with empty text and
      // the webhook rejects with 400 — so PDFs/images with captions (or
      // empty captions) NEVER get an AI reply.
      let inner = rawTop;
      for (let i = 0; i < 3; i++) {
        const next =
          inner.documentWithCaptionMessage?.message ||
          inner.imageWithCaptionMessage?.message ||
          inner.videoWithCaptionMessage?.message ||
          inner.viewOnceMessage?.message ||
          inner.viewOnceMessageV2?.message ||
          inner.editedMessage?.message?.protocolMessage?.editedMessage ||
          null;
        if (!next || next === inner) break;
        inner = next;
      }

      const fromMe = msg.key.fromMe || false;
      const remotePhone = String(msg.key.remoteJid ?? "").replace(/@.*$/, "").split(":")[0].replace(/\D/g, "");
      const ownPhones = resolveOwnPhones();
      const isSelfChat =
        fromMe && !!remotePhone && (ownPhones.has(remotePhone) || [...ownPhones].some((p) => p && (p.includes(remotePhone) || remotePhone.includes(p))));
      // Own LID resolution: Baileys v7 exposes the account's own LID via
      // socket.user.lid ("123...@lid"). A message whose remoteJid matches OUR
      // OWN LID is a self-chat from one of our linked devices (assistant
      // command). Everyone else's @lid JIDs are REAL PEOPLE — never treat a
      // generic @lid remote as self; that misroutes customer messages into
      // the owner-assistant path and they never get a lead reply.
      const ownLid = String(socket.user?.lid ?? "").split("@")[0].replace(/\D/g, "");
      const ownLidSuffix = String(socket.user?.lid ?? "").split("@")[1] ?? "";
      const remoteLidRaw = String(msg.key.remoteJid ?? "").split("@")[0].replace(/\D/g, "");
      const remoteSuffix = String(msg.key.remoteJid ?? "").split("@")[1] ?? "";
      const isLidSelfChat =
        !fromMe &&
        !!ownLid &&
        remoteLidRaw === ownLid &&
        (!ownLidSuffix || ownLidSuffix === remoteSuffix);
      const ownerPhone = process.env.OWNER_WHATSAPP_NUMBER
        ? process.env.OWNER_WHATSAPP_NUMBER.replace(/\D/g, "")
        : "";
      const isOwnerDevice = !fromMe && !!ownerPhone && remotePhone === ownerPhone;

      // Use a placeholder when the message has media but no caption so the
      // downstream pipeline (engine + AI) can acknowledge the attachment
      // instead of silently rejecting media-only messages.
      const messageType = inner.conversation
        ? "text"
        : inner.extendedTextMessage
        ? "text"
        : inner.imageMessage
        ? "image"
        : inner.videoMessage
        ? "video"
        : inner.audioMessage
        ? "audio"
        : inner.documentMessage
        ? "document"
        : inner.stickerMessage
        ? "sticker"
        : inner.contactMessage
        ? "contact"
        : inner.locationMessage
        ? "location"
        : "unknown";
      const mediaTextFor = (type) => {
        switch (type) {
          case "image": return "[image]";
          case "video": return "[video]";
          case "audio": return "[audio]";
          case "document": return "[document]";
          case "sticker": return "[sticker]";
          case "contact": return "[contact]";
          case "location": return "[location]";
          default: return "";
        }
      };
      const messageText =
        inner.conversation ||
        inner.extendedTextMessage?.text ||
        inner.imageMessage?.caption ||
        inner.videoMessage?.caption ||
        inner.documentMessage?.caption ||
        mediaTextFor(messageType) ||
        "";

      const parsedMsg = {
        remoteJid: msg.key.remoteJid,
        fromMe,
        messageId: msg.key.id,
        type: messageType,
        text: messageText,
        timestamp: new Date((msg.messageTimestamp || 0) * 1000).toISOString(),
        pushName: msg.pushName || "",
        raw: JSON.stringify(msg.message || {}),
        origin: isSelfChat || isLidSelfChat ? "self" : isOwnerDevice ? "owner_device" : "lead",
      };
      // LID → phone resolution: WhatsApp increasingly addresses senders by
      // @lid. A reply sent to "<lid>@s.whatsapp.net" vanishes, so resolve
      // the real phone number here (best-effort, never blocks).
      try {
        const rj = String(msg.key.remoteJid ?? "");
        if (rj.endsWith("@lid")) {
          const lid = rj.split("@")[0];
          const pn = await socket.signalRepository?.lidMapping?.getPNForLID?.(lid);
          const digits = String(pn ?? "").split("@")[0].replace(/\D/g, "");
          if (digits.length >= 10) {
            parsedMsg.senderPhone = digits;
            console.log(`[LID] ${lid} → ${digits.slice(-10)}`);
          }
        } else if (rj.endsWith("@s.whatsapp.net")) {
          const digits = rj.split("@")[0].replace(/\D/g, "");
          if (digits.length >= 10) parsedMsg.senderPhone = digits;
        }
      } catch { /* mapping unavailable — webhook falls back to JID parsing */ }

      console.log(
        `[Message] ${parsedMsg.origin.toUpperCase()} | own=[${[...resolveOwnPhones()]}] ownLid=${ownLid || "none"} remote=${remotePhone} | ${parsedMsg.remoteJid} | ${messageType}: ${messageText.slice(0, 50)}`
      );

      // Own-reply echo: our just-sent message bounced back as inbound.
      // Store as processed (audit) but NEVER forward — else infinite loop.
      if (!fromMe && isOwnEcho(userId, msg.key.remoteJid, messageText)) {
        console.log(`[Echo] suppressed own-reply echo in ${String(msg.key.remoteJid).slice(0, 30)}`);
        await storeMessage(userId, parsedMsg, true);
        continue;
      }

      // Store in Supabase. Self-chat (owner commands) is stored UNPROCESSED
      // so the owner-poll bridge picks it up even if the webhook is
      // unreachable/misconfigured. fromMe messages to OTHER people are just
      // the user's own outbound chats — stored marked processed so the owner
      // assistant never mistakes them for commands.
      if (isSelfChat || isLidSelfChat) {
        await storeMessage(userId, parsedMsg, false);
      } else {
        await storeMessage(userId, parsedMsg, fromMe ? true : false);
      }

      // Forward EVERYTHING that is either an inbound lead message OR any
      // fromMe message with text. The webhook decides routing: messages from
      // the owner number become assistant commands; other fromMe messages
      // are ignored there as outbound. This removes ALL detection fragility
      // from the server — JID formats vary across Baileys events/devices.
      if (!fromMe || messageText) {
        const ownPhones = [...resolveOwnPhones()];
        const primaryOwn = ownPhones.find((p) => p && p.length >= 10) ?? "";
        await forwardToWebhook(userId, parsedMsg, primaryOwn);
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

async function persistFullAuthState(key, authDir, reason) {
  if (!supabase) return;
  const { slot, userId } = normalizeKey(key);
  const now = Date.now();
  const last = lastPersistAt.get(key) ?? 0;
  if (now - last < AUTH_PERSIST_MIN_MS) return;
  lastPersistAt.set(key, now);
  try {
    const files = readAuthFiles(authDir);
    if (!files["creds.json"]) return;
    const phone = String(sessions.get(key)?.phoneNumber ?? "").replace(/\D/g, "");
    await upsertSessionRow(userId, slot, {
      auth_state: { files, format: "full", phone },
      connected: true,
    });
    console.log(`[Auth] Full auth state persisted for ${key} (${Object.keys(files).length} files, phone=${phone ? "set" : "none"}, ${reason})`);
  } catch (err) {
    console.error("[Auth] Full persist failed:", err.message);
  }
}

async function restoreFullAuthState(key, authDir) {
  if (!supabase) return false;
  const { slot, userId } = normalizeKey(key);
  try {
    let { data: savedSession } = await supabase
      .from("whatsapp_sessions")
      .select("auth_state")
      .eq("user_id", userId)
      .eq("slot", slot)
      .maybeSingle();
    // Legacy fallback: pre-slot single row belongs to the business slot
    if (!savedSession && slot === "business") {
      const legacy = await supabase
        .from("whatsapp_sessions")
        .select("auth_state")
        .eq("user_id", userId)
        .maybeSingle();
      savedSession = legacy.data;
    }
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
      console.warn(`[Auth] Supabase auth_state for ${key} is corrupt/partial — ignoring, starting fresh`);
      await clearAuthState(key);
      fs.mkdirSync(authDir, { recursive: true });
    }
  } catch (err) {
    console.error("[Auth] Restore failed:", err.message);
  }
  return false;
}

// ─── Connect WhatsApp ───
async function connectWhatsApp(sessionKey, opts = {}) {
  const { key, slot } = normalizeKey(sessionKey, opts.slot);
  const existing = sessions.get(key);
  if (existing?.connected) {
    return { connected: true, message: "Already connected" };
  }

  if (existing?.socket) {
    try { existing.socket.ws?.close(); } catch {}
  }

  // Per-session device label so the phone's Linked Devices screen shows
  // "DataBuks Business" vs "DataBuks Personal" instead of one generic name.
  // Auto-restore passes no opts, so infer from the slot as fallback.
  let deviceName = typeof opts.deviceName === "string" && opts.deviceName.trim() !== ""
    ? opts.deviceName.trim().slice(0, 32)
    : null;
  if (!deviceName) {
    deviceName = slot === "personal" ? "DataBuks Personal" : "DataBuks Business";
  }

  const authDir = getAuthDir(key);

  if (!fs.existsSync(path.join(authDir, "creds.json"))) {
    await restoreFullAuthState(key, authDir);
  }

  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const wrappedSaveCreds = async (creds) => {
    await saveCreds();
    // Full-state persist (throttled) — creds AND keys survive restarts
    await persistFullAuthState(key, authDir, "creds.update");
  };
  const { version } = await fetchLatestBaileysVersion();

  return new Promise((resolve) => {
    let resolved = false;

    const socket = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: false,
      logger,
      // Register as a different device type than WhatsApp Desktop ("Chrome")
      // so both can coexist as linked devices without 440 conflicts.
      browser: [deviceName, "Ubuntu", "22.04"],
      connectTimeoutMs: 30000,
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 250,
      markOnlineOnConnect: false,
    });

    const session = {
      socket,
      qrCode: null,
      connected: false,
      userId: key,
      slot,
      qrRetries: 0,
      phoneNumber: null,
    };
    sessions.set(key, session);

    // Set up message handler for AI agents
    setupMessageHandler(socket, key);

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
        console.log(`[WhatsApp] Connected for user: ${key}`);
        session.connected = true;
        session.qrCode = null;

        // Get phone number
        try {
          const user = socket.user;
          session.phoneNumber = user?.id?.split(":")[0] || null;
          console.log(`[WhatsApp] Phone: ${session.phoneNumber}`);
        } catch {}

        await updateSupabaseStatus(key, true);
        // Persist FULL auth state right after handshake — keys are fresh now
        lastPersistAt.set(key, 0);
        await persistFullAuthState(key, getAuthDir(key), "connected");

        if (!resolved) {
          resolved = true;
          resolve({ connected: true });
        }
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[WhatsApp] Disconnected for user: ${key}, code: ${statusCode}, reconnect: ${shouldReconnect}`);
        session.connected = false;

        if (statusCode === DisconnectReason.loggedOut) {
          sessions.delete(key);
          const authDir = getAuthDir(key);
          try { fs.rmSync(authDir, { recursive: true, force: true }); } catch {}
          await clearAuthState(key);

          if (!resolved) {
            resolved = true;
            resolve({ error: "Logged out from WhatsApp. Please reconnect." });
          }
        } else if (shouldReconnect) {
          // Code 440 = session replaced on another device. Stop reconnecting
          // after 3 attempts to avoid infinite loops that block all other sessions.
          const reconnectKey = `440:${key}`;
          if (statusCode === 440) {
            const count = (global.__reconnectCounts || (global.__reconnectCounts = {}))[reconnectKey] || 0;
            if (count >= 3) {
              console.log(`[WhatsApp] STOPPED reconnecting for ${key} — 440 loop detected (${count} attempts). User must re-scan QR.`);
              sessions.delete(key);
              return;
            }
            global.__reconnectCounts[reconnectKey] = count + 1;
          } else {
            // Reset counter for non-440 disconnects
            if (global.__reconnectCounts) delete global.__reconnectCounts[`440:${key}`];
          }
          console.log(`[WhatsApp] Auto-reconnecting for user: ${key}`);
          setTimeout(() => {
            connectWhatsApp(key).catch(() => {});
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
    sessionList.push({ userId: uid, slot: s.slot ?? null, connected: s.connected, phone: s.phoneNumber });
  });
  res.json({
    status: "ok",
    activeSessions: sessions.size,
    sessions: sessionList,
    uptime: process.uptime(),
    supabase: !!supabase,
  });
});

// Connect WhatsApp. Accepts { userId, slot?, fresh?, deviceName? }.
// userId may be a raw UUID (slot decides the session) or an already-scoped
// key ("biz__<uuid>" / "personal__<uuid>"). Business + personal slots are
// fully independent — both numbers stay live simultaneously.
// fresh=true wipes stale auth state FIRST so the QR is always pairing-ready —
// without this, re-linking after an unlink reuses dead creds and WhatsApp
// rejects pairing with "couldn't link device".
// deviceName sets the linked-device label (e.g. "DataBuks Business").
app.post("/connect", async (req, res) => {
  const { userId, slot, fresh, force, deviceName } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });

  try {
    const { key } = normalizeKey(userId, slot);
    // Safety: an already-LIVE session is never wiped by accident. fresh=true
    // only wipes a dead/disconnected session. Explicit re-pair passes
    // force:true (the dashboard "Reconnect" button).
    const live = sessions.get(key);
    if (live?.connected && !force) {
      return res.json({ connected: true, message: "Already connected" });
    }
    if (fresh) {
      console.log(`[Connect] fresh pairing requested for ${key} — wiping auth state first`);
      await clearAuthState(key);
    }
    const result = await connectWhatsApp(key, { deviceName, slot });
    res.json(result);
  } catch (err) {
    // Corrupt auth state can make Baileys crash mid-handshake with raw
    // buffer errors. Recover automatically: wipe the bad state and retry
    // once with a fresh session so a QR is generated instead of an error.
    try {
      const { key } = normalizeKey(userId, slot);
      console.log(`[Connect] error for ${key}, clearing auth and retrying fresh`);
      await clearAuthState(key);
      const retry = await connectWhatsApp(key, { slot });
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
  const { key, slot, userId } = normalizeKey(req.params.userId);
  const session = sessions.get(key) ?? sessions.get(userId) ?? null;

  if (session) {
    return res.json({
      connected: session.connected,
      hasQr: !!session.qrCode,
      phoneNumber: session.phoneNumber,
      slot,
    });
  }

  if (supabase) {
    supabase
      .from("whatsapp_sessions")
      .select("connected")
      .eq("user_id", userId)
      .eq("slot", slot)
      .maybeSingle()
      .then(({ data }) => {
        res.json({ connected: data?.connected ?? false, hasQr: false, phoneNumber: null, slot });
      })
      .catch(() => {
        res.json({ connected: false, hasQr: false, phoneNumber: null, slot });
      });
  } else {
    res.json({ connected: false, hasQr: false, phoneNumber: null, slot });
  }
});

// Get latest QR code
app.get("/qr/:userId", (req, res) => {
  const { key, userId } = normalizeKey(req.params.userId);
  const session = sessions.get(key) ?? sessions.get(userId);
  if (session?.qrCode) {
    return res.json({ qrCode: session.qrCode });
  }
  res.json({ qrCode: null });
});

// Disconnect
app.post("/disconnect", async (req, res) => {
  const { userId, slot } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });

  const { key } = normalizeKey(userId, slot);
  const session = sessions.get(key) ?? sessions.get(String(userId));
  if (session?.socket) {
    try { session.socket.ws?.close(); } catch {}
    try { await session.socket.logout(); } catch {}
  }
  sessions.delete(key);

  const authDir = getAuthDir(key);
  try { fs.rmSync(authDir, { recursive: true, force: true }); } catch {}

  await updateSupabaseStatus(key, false);

  res.json({ success: true });
});

// Pairing code endpoint — links a phone WITHOUT QR.
// Always starts a FRESH pairing session: stale/dead sockets make
// requestPairingCode throw, which surfaces as "Failed to generate pairing code".
app.post("/pair", async (req, res) => {
  const { userId, phoneNumber, slot } = req.body;
  if (!userId || !phoneNumber) return res.status(400).json({ error: "userId and phoneNumber required" });
  const cleanPhone = String(phoneNumber).replace(/\D/g, "");
  if (cleanPhone.length < 10 || cleanPhone.length > 15) {
    return res.status(400).json({ error: "invalid phone number (use full international format, no +)" });
  }

  const { key } = normalizeKey(userId, slot);
  const existing = sessions.get(key);
  if (existing?.connected) {
    return res.json({ success: true, alreadyConnected: true });
  }

  try {
    // Fresh pairing session: close old socket, wipe local + remote auth state
    if (existing?.socket) { try { existing.socket.ws?.close(); } catch {} }
    sessions.delete(key);
    const authDir = getAuthDir(key);
    try { fs.rmSync(authDir, { recursive: true, force: true }); } catch {}
    await clearAuthState(key);

    // connectWhatsApp resolves the moment the socket is pairing-ready (QR event)
    const result = await connectWhatsApp(key, { slot });
    if (result?.error) return res.status(500).json({ error: result.error });
    const session = sessions.get(key);
    if (!session?.socket) return res.status(500).json({ error: "Connection not ready" });

    const pairingCode = await session.socket.requestPairingCode(cleanPhone);
    res.json({ success: true, pairingCode });
  } catch (err) {
    console.error("[Pair] Error:", err.message);
    res.status(500).json({ error: "Failed to generate pairing code: " + String(err.message ?? "").slice(0, 100) });
  }
});

// Resolve the right session for a send-like action. Prefers the requested
// slot, then any live session of the same raw user (transition safety).
function resolveSendSession(userId, slot) {
  const n = normalizeKey(userId, slot);
  return (
    sessions.get(n.key) ??
    sessions.get(n.userId) ??
    sessions.get(`personal__${n.userId}`) ??
    [...sessions.values()].find((s) => s.connected && (s.userId === n.key || s.userId === n.userId))
  );
}

// Send text message
app.post("/send", async (req, res) => {
  const { userId, jid, message, slot } = req.body;
  if (!userId || !jid || !message) {
    return res.status(400).json({ error: "userId, jid, and message required" });
  }

  const session = resolveSendSession(userId, slot);
  if (!session?.connected || !session?.socket) {
    return res.status(400).json({ error: "No active WhatsApp connection" });
  }

  try {
    const formattedJid = jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;
    const sent = await session.socket.sendMessage(formattedJid, { text: message });
    recordSent(session.userId, formattedJid, message);
    res.json({ success: true, messageId: sent?.key?.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Typing/presence indicator (composing | paused | available)
app.post("/presence", async (req, res) => {
  const { userId, jid, presence, slot } = req.body;
  if (!userId || !jid || !presence) {
    return res.status(400).json({ error: "userId, jid, and presence required" });
  }
  if (!["composing", "paused", "available"].includes(presence)) {
    return res.json({ success: false, reason: "presence must be composing, paused or available" });
  }

  const session = resolveSendSession(userId, slot);
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
  const { userId, jid, mediaUrl, caption, type, slot } = req.body;
  if (!userId || !jid || !mediaUrl) {
    return res.status(400).json({ error: "userId, jid, and mediaUrl required" });
  }

  const session = resolveSendSession(userId, slot);
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
    recordSent(session.userId, formattedJid, caption || "");
    res.json({ success: true, messageId: sent?.key?.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get contacts/chats list
app.get("/chats/:userId", async (req, res) => {
  const { session } = lookupSession(req.params.userId, req.query.slot);

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
  const { slot, userId } = normalizeKey(req.params.userId, req.query.slot);
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

    // Slot filter when the column exists (dual-slots migration); legacy
    // DBs without it just return all rows.
    try {
      query = query.eq("slot", slot);
      const { data, error } = await query;
      if (error) throw error;
      let rows = data || [];
      if (jid) rows = rows.filter((m) => m.remote_jid === jid);
      return res.json({ messages: rows });
    } catch {
      let query2 = supabase
        .from("whatsapp_messages")
        .select("*")
        .eq("user_id", userId)
        .order("timestamp", { ascending: false })
        .limit(Number(limit));
      if (jid) query2 = query2.eq("remote_jid", jid);
      const { data, error } = await query2;
      if (error) throw error;
      return res.json({ messages: data || [] });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if number exists on WhatsApp
app.get("/check-number/:userId/:phone", async (req, res) => {
  const { session } = lookupSession(req.params.userId, req.query.slot);
  const { phone } = req.params;

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

// ─── Reminder scheduler ───
// In-process timer-based scheduler for WhatsApp follow-ups. When the
// Next.js engine detects a "remind me in 5 min" style message, it calls
// /schedule-reminder here and we setTimeout to send the message at the
// right time. Persisted to Supabase as a backup + audit trail.
function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"];
  if (key !== API_KEY) return res.status(401).json({ ok: false, error: "unauthorized" });
  next();
}
const reminderTimers = new Map(); // reminderId -> { timer, jid, message, userId }
async function loadPendingReminders() {
  if (!supabase) return;
  try {
    const { data: pending } = await supabase
      .from("reminders")
      .select("id, user_id, remote_jid, message_text, send_at")
      .eq("status", "pending")
      .lte("send_at", new Date(Date.now() + 24 * 3600 * 1000).toISOString())
      .limit(100);
    for (const r of pending ?? []) {
      scheduleReminderInternal(r);
    }
    if ((pending ?? []).length > 0) {
      console.log(`[Reminder] loaded ${(pending ?? []).length} pending reminders from DB`);
    }
  } catch (err) {
    console.error("[Reminder] load failed:", err.message);
  }
}
function scheduleReminderInternal(r) {
  const sendAt = new Date(r.send_at).getTime();
  const delay = sendAt - Date.now();
  if (delay <= 0) {
    // Already due — fire immediately
    fireReminder(r);
    return;
  }
  if (delay > 24 * 3600 * 1000) {
    // Too far out — ignore, will be reloaded later
    return;
  }
  // Clear any existing timer for this id
  const existing = reminderTimers.get(r.id);
  if (existing?.timer) clearTimeout(existing.timer);
  const timer = setTimeout(() => fireReminder(r), delay);
  reminderTimers.set(r.id, { timer, jid: r.remote_jid, message: r.message_text, userId: r.user_id });
  console.log(`[Reminder] scheduled id=${r.id} in ${Math.round(delay/1000)}s to ${r.remote_jid}`);
}
async function fireReminder(r) {
  try {
    // Prefer the business slot for lead follow-ups; fall back to any live session.
    const all = [...sessions.values()].filter((s) => s?.socket);
    const session =
      all.find((s) => s.slot === "business") ??
      all.find((s) => s.connected) ??
      all[0];
    if (!session?.socket) {
      console.warn(`[Reminder] fire failed — no active WhatsApp session: id=${r.id}`);
      return;
    }
    const jid = r.remote_jid.includes("@") ? r.remote_jid : `${r.remote_jid.replace(/\D/g, "")}@s.whatsapp.net`;
    await session.socket.sendMessage(jid, { text: r.message_text });
    console.log(`[Reminder] fired id=${r.id} → ${jid}`);
    if (supabase) {
      await supabase
        .from("reminders")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", r.id);
    }
  } catch (err) {
    console.error(`[Reminder] fire failed id=${r.id}:`, err.message);
    if (supabase) {
      await supabase
        .from("reminders")
        .update({ status: "failed", error_message: String(err?.message ?? err) })
        .eq("id", r.id);
    }
  } finally {
    reminderTimers.delete(r.id);
  }
}

app.post("/schedule-reminder", requireApiKey, async (req, res) => {
  try {
    const { id, user_id: userId, remote_jid: jid, message_text: message, send_at: sendAt } = req.body ?? {};
    if (!id || !jid || !message || !sendAt) {
      return res.status(400).json({ ok: false, error: "id, remote_jid, message_text, send_at required" });
    }
    scheduleReminderInternal({ id, user_id: userId, remote_jid: jid, message_text: message, send_at: sendAt });
    res.json({ ok: true, scheduled: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message ?? "failed" });
  }
});

app.delete("/schedule-reminder/:id", requireApiKey, async (req, res) => {
  const id = req.params.id;
  const entry = reminderTimers.get(id);
  if (entry?.timer) clearTimeout(entry.timer);
  reminderTimers.delete(id);
  res.json({ ok: true, cancelled: !!entry });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Baileys server running on port ${PORT}`);
  console.log(`   Supabase: ${SUPABASE_URL ? "Connected" : "NOT configured"}`);
  console.log(`   Webhook: ${WEBHOOK_URL || "NOT configured"}`);
  console.log(`   API Key: ${API_KEY ? "Set" : "NOT set"}`);
  console.log(`   Health: http://0.0.0.0:${PORT}/health`);

  autoRestoreSessions();
  loadPendingReminders();
  startNextJsBridge();
});

// ─── Next.js cron bridge ───
// Vercel Hobby allows DAILY crons only, but owner-command polling (2 min)
// and daily-post time matching (hourly) need frequent runs. This server
// runs 24/7, so it pings those Next.js routes itself. Fire-and-forget:
// the routes are idempotent + self-gating (time windows, dedup, skip-if-done).
function startNextJsBridge() {
  const appBase = String(WEBHOOK_URL || "").replace(/\/api\/ai\/whatsapp\/webhook\/?$/, "");
  if (!appBase) {
    console.log("[Bridge] WEBHOOK_URL not set — frequent jobs (poll, daily-posts) disabled");
    return;
  }
  const ping = (path) => {
    fetch(`${appBase}${path}`, { headers: { "x-api-key": API_KEY } })
      .then(async (r) => {
        if (!r.ok) console.warn(`[Bridge] ${path} → ${r.status}`);
      })
      .catch((err) => console.error(`[Bridge] ${path} failed:`, err.message));
  };
  // Owner self-chat backup (webhook realtime is primary; this catches misses)
  setInterval(() => ping("/api/ai/whatsapp/poll"), 2 * 60 * 1000);
  // Hourly post-time matcher (per-user custom times, default 10:00 IST)
  setInterval(() => ping("/api/cron/daily-posts"), 60 * 60 * 1000);
  // First runs shortly after boot (stagger to avoid cold-start pileup)
  setTimeout(() => ping("/api/ai/whatsapp/poll"), 60 * 1000);
  setTimeout(() => ping("/api/cron/daily-posts"), 5 * 60 * 1000);
  console.log(`[Bridge] Next.js frequent jobs enabled → ${appBase}`);
}

async function autoRestoreSessions() {
  if (!supabase) return;
  try {
    const { data: savedSessions, error } = await supabase
      .from("whatsapp_sessions")
      .select("user_id, slot")
      .eq("connected", true)
      .limit(40);
    if (error && /slot/i.test(String(error.message ?? ""))) {
      // Pre-migration DB: legacy single rows = business slot
      const { data: legacy } = await supabase
        .from("whatsapp_sessions")
        .select("user_id")
        .eq("connected", true)
        .limit(40);
      for (const row of legacy ?? []) {
        const key = `biz__${row.user_id}`;
        console.log(`[Auth] Auto-restoring legacy session: ${key}`);
        connectWhatsApp(key, { deviceName: "DataBuks Business" }).catch((err) => {
          console.error(`[Auth] Auto-restore failed for ${key}:`, err.message);
        });
      }
      return;
    }
    for (const row of savedSessions ?? []) {
      const slot = row.slot === "personal" ? "personal" : "business";
      const key = `${slot === "business" ? "biz" : "personal"}__${row.user_id}`;
      const deviceName = slot === "personal" ? "DataBuks Personal" : "DataBuks Business";
      console.log(`[Auth] Auto-restoring session for user: ${key} (${deviceName})`);
      connectWhatsApp(key, { deviceName }).catch((err) => {
        console.error(`[Auth] Auto-restore failed for ${key}:`, err.message);
      });
    }
  } catch (err) {
    console.error("[Auth] Auto-restore scan failed:", err.message);
  }
}
