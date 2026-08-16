"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw, ExternalLink, Unlink, Link2, Instagram, Facebook,
  MessageCircle, Send, QrCode, Bot, Key, Check, X, Sparkles, Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

const TRACE = (tag: string, data?: any) => {
  if (data !== undefined) console.log(`[TRACE:${tag}]`, data);
  else console.log(`[TRACE:${tag}] TRIGGERED`);
};

const platformConfig: Record<string, {
  name: string; icon: React.ElementType; color: string; borderColor: string;
  type: "composio" | "baileys" | "telegram";
  connectLabel: string;
  desc: string;
}> = {
  instagram: {
    name: "Instagram", icon: Instagram, color: "from-pink-500 to-purple-500",
    borderColor: "border-l-pink-500/50", type: "composio",
    connectLabel: "Connect Instagram",
    desc: "Connect Instagram to enable AI-powered DM outreach, content scheduling, and lead generation.",
  },
  facebook: {
    name: "Facebook", icon: Facebook, color: "from-blue-600 to-blue-400",
    borderColor: "border-l-blue-500/50", type: "composio",
    connectLabel: "Connect Facebook",
    desc: "Connect Facebook to enable AI-powered DM outreach, content scheduling, and lead generation.",
  },
  whatsapp: {
    name: "WhatsApp", icon: MessageCircle, color: "from-green-500 to-emerald-400",
    borderColor: "border-l-green-500/50", type: "baileys",
    connectLabel: "Connect WhatsApp",
    desc: "Scan QR code with WhatsApp to connect. Enables AI-powered messaging and automation.",
  },
  telegram: {
    name: "Telegram", icon: Send, color: "from-sky-500 to-cyan-400",
    borderColor: "border-l-sky-500/50", type: "telegram",
    connectLabel: "Connect Telegram Bot",
    desc: "Create a bot via @BotFather, paste the token here. Enables automated Telegram messaging.",
  },
};

interface ComposioItem { id: string; appName: string; app_name?: string; integration_id?: string; appId: string; status: string; createdAt: string; }

export default function SocialsPage() {
  const [connections, setConnections] = useState<ComposioItem[]>([]);
  const [supabaseConnections, setSupabaseConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");

  const [whatsAppStatus, setWhatsAppStatus] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);

  const [tgStatus, setTgStatus] = useState(false);
  const [tgBot, setTgBot] = useState<{ username: string; name: string } | null>(null);
  const [tgModalOpen, setTgModalOpen] = useState(false);
  const [tgToken, setTgToken] = useState("");
  const [tgLoading, setTgLoading] = useState(false);
  const [tgVerify, setTgVerify] = useState<{ valid: boolean; name?: string; error?: string } | null>(null);
  const [capabilities, setCapabilities] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);

  const supabase = createClient();
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const supabaseRef = useRef<any[]>([]);

  useEffect(() => {
    TRACE("MOUNT", "SocialsPage loaded");
    init();
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  async function init() {
    try {
      TRACE("INIT", "START");
      const { data: { user } } = await supabase.auth.getUser();
      const resolvedId = resolveUserId(user);
      TRACE("INIT", { userFromAuth: user?.id, email: user?.email, resolvedId });
      setUserId(resolvedId ?? "");
      await loadAndVerify();
      await syncFromComposio();
      await checkWhatsAppStatus();
      await checkTelegramStatus();
      fetch("/api/social/capabilities").then((r) => r.json()).then((json) => {
        if (!json.error) setCapabilities(json.accounts ?? []);
      }).catch(() => {});
      fetch("/api/ai/social/activity").then((r) => r.json()).then((json) => {
        if (!json.error) setActivity(json.feed ?? []);
      }).catch(() => {});

      const params = new URLSearchParams(window.location.search);
      const platform = params.get("platform");
      TRACE("INIT", { urlHasPlatformParam: !!platform, platform });
      if (platform) {
        let attempts = 0;
        TRACE("POLLING", `START for platform=${platform}, interval=2s, max=15`);
        pollingRef.current = setInterval(async () => {
          attempts++;
          TRACE("POLLING", { attempt: attempts, platform });
          await loadAndVerify();
          const connected = supabaseRef.current.some(
            (c: any) => c.platform === platform && c.status === "connected"
          );
          TRACE("POLLING", { attempt: attempts, connectionsInRef: supabaseRef.current.length, platforms: supabaseRef.current.map((c:any) => ({p:c.platform,s:c.status})), foundConnected: connected });
          if (connected || attempts >= 15) {
            TRACE("POLLING", connected ? "STOPPED: connection found" : "STOPPED: max attempts reached");
            if (pollingRef.current) clearInterval(pollingRef.current);
            window.history.replaceState({}, "", "/dashboard/socials");
            if (!connected) {
              await syncFromComposio();
            }
          }
        }, 2000);
      }
    } catch(e:any) { TRACE("INIT", `ERROR: ${e.message}`); }
  }

  async function syncFromComposio() {
    try {
      const res = await fetch("/api/composio/sync");
      if (res.ok) {
        const json = await res.json();
        TRACE("SYNC", { summary: json.summary });
        await loadAndVerify();
      }
    } catch {}
  }

  async function verifyAndSync(connId: string, platform: string, uid: string) {
    try {
      TRACE("VERIFY", { stage: "START", connectionId: connId, platform, userId: uid });
      const verifyRes = await fetch(`/api/composio/connections?action=verify&id=${connId}`);
      const verifyData = await verifyRes.json();
      TRACE("VERIFY", { stage: "COMPOSIO_RESPONSE", data: verifyData });
      if (!verifyData.connection) {
        TRACE("VERIFY", { stage: "NO_CONNECTION_FOUND" });
        return false;
      }
      const st = verifyData.connection.status;
      TRACE("VERIFY", { stage: "COMPOSIO_STATUS", status: st });
      if (st === "ACTIVE") {
        const saveBody = { userId: uid, platform, connection_id: connId, status: "connected" };
        TRACE("PERSIST", { stage: "CALLING_POST_social_connections", body: saveBody });
        const saveRes = await fetch("/api/social-connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(saveBody),
        });
        const saveData = await saveRes.json();
        TRACE("PERSIST", { stage: "POST_RESULT", status: saveRes.status, data: saveData });
        if (!saveRes.ok) {
          TRACE("PERSIST", { stage: "POST_FAILED", status: saveRes.status });
          return false;
        }
        return true;
      }
      TRACE("VERIFY", { stage: "NOT_ACTIVE_YET", status: st });
      return false;
    } catch(e:any) { TRACE("VERIFY", `ERROR: ${e.message}`); return false; }
  }

  function resolveUserId(userFromAuth: any) {
    if (userFromAuth?.id) return userFromAuth.id;
    const stored = localStorage.getItem("composio_pending_userId");
    if (stored) return stored;
    return null;
  }

  async function loadAndVerify() {
    TRACE("LOAD_VERIFY", "START");
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = resolveUserId(user);
      TRACE("LOAD_VERIFY", { userFromAuth: user?.id, resolvedUid: uid, hasUser: !!user });
      if (!uid) { TRACE("LOAD_VERIFY", "ABORT: no resolved user id"); return; }

      const storedConn = localStorage.getItem("composio_pending_conn");
      const storedUserId = localStorage.getItem("composio_pending_userId");
      TRACE("LOAD_VERIFY", { hasLocalStorage: !!storedConn, storedUserId, currentUserId: uid, match: storedUserId === uid });

      if (storedConn && storedUserId === uid) {
        const pending = JSON.parse(storedConn);
        const age = Date.now() - pending.timestamp;
        TRACE("LOCALSTORAGE", { pending, ageMs: age });
        if (age < 300000) {
          TRACE("LOCALSTORAGE", "VERIFYING...");
          await verifyAndSync(pending.connectionId, pending.platform, uid);
        }
        localStorage.removeItem("composio_pending_conn");
        localStorage.removeItem("composio_pending_userId");
        TRACE("LOCALSTORAGE", "CLEARED");
      }

      TRACE("SUPABASE_FETCH", `GET /api/social-connections?userId=${uid}`);
      const scRes = await fetch(`/api/social-connections?userId=${uid}`);
      const scData = await scRes.json();
      const scList: any[] = scData.connections || [];
      TRACE("SUPABASE_FETCH", { count: scList.length, list: scList.map((c:any) => ({id:c.id,platform:c.platform,status:c.status,connection_id:c.connection_id})) });

      for (const sc of scList) {
        if (sc.status === "pending" && sc.connection_id) {
          TRACE("SUPABASE_PENDING", { connection_id: sc.connection_id, platform: sc.platform });
          const becameActive = await verifyAndSync(sc.connection_id, sc.platform, uid);
          if (becameActive) { sc.status = "connected"; TRACE("SUPABASE_PENDING", "NOW ACTIVE — marking connected"); }
          else { TRACE("SUPABASE_PENDING", "Still not active on Composio"); }
        }
      }

      TRACE("STATE_UPDATE", { settingConnections: scList.length, platforms: scList.map((c:any) => ({p:c.platform,s:c.status})) });
      setSupabaseConnections(scList);
      supabaseRef.current = scList;

      const instaConn = scList.find((c:any) => c.platform === "instagram");
      TRACE("UI_CHECK", { instagramStatus: instaConn?.status, instagramConnectionId: instaConn?.connection_id, isConnectedRenders: instaConn?.status === "connected" });
    } catch(e:any) { TRACE("LOAD_VERIFY", `ERROR: ${e.message}`); } finally { setLoading(false); }
  }

  async function handleComposioConnect(platform: string) {
    const effectiveUserId = userId || resolveUserId(null);
    TRACE("CLICK", `Connect ${platform} clicked. userId=${effectiveUserId}`);
    setConnecting(platform);
    setError("");
    try {
      if (!effectiveUserId) { TRACE("CLICK", "ABORT: no userId"); setConnecting(null); return; }
      const reqBody = { appName: platform, userId: effectiveUserId, origin: window.location.origin };
      TRACE("POST_COMPOSIO", { url: "/api/composio/connections", body: reqBody });
      const res = await fetch("/api/composio/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      const data = await res.json();
      TRACE("POST_COMPOSIO", { status: res.status, response: data });
      if (data.error) { setError(data.error); setConnecting(null); return; }
      if (data.redirectUrl && data.connectedAccountId) {
        TRACE("REDIRECT", { redirectUrl: data.redirectUrl, connectedAccountId: data.connectedAccountId });
        localStorage.setItem("composio_pending_conn", JSON.stringify({
          platform,
          connectionId: data.connectedAccountId,
          timestamp: Date.now(),
        }));
        localStorage.setItem("composio_pending_userId", effectiveUserId);
        TRACE("REDIRECT", "localStorage saved. Redirecting to Composio...");
        window.location.href = data.redirectUrl;
      } else {
        TRACE("POST_COMPOSIO", "MISSING redirectUrl or connectedAccountId");
      }
    } catch(e:any) { TRACE("CLICK", `ERROR: ${e.message}`); setConnecting(null); }
  }

  async function handleDisconnect(platform: string, connectionId?: string) {
    TRACE("DISCONNECT", { platform, connectionId, userId });
    if (platform === "whatsapp") {
      await fetch("/api/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disconnect", userId }) });
      setWhatsAppStatus(false); return;
    }
    if (platform === "telegram") {
      await fetch("/api/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disconnect", userId }) });
      setTgStatus(false); setTgBot(null); return;
    }
    // Optimistic UI: immediately show disconnected
    const updated = supabaseRef.current.map((c: any) =>
      c.platform === platform ? { ...c, status: "disconnected" } : c
    );
    setSupabaseConnections(updated);
    supabaseRef.current = updated;

    try {
      if (connectionId) {
        TRACE("DISCONNECT", { stage: "DELETING_COMPOSIO", connectionId });
        await fetch(`/api/composio/connections?id=${connectionId}`, { method: "DELETE" });
      }
      const disconnectBody = { userId, platform, status: "disconnected" };
      TRACE("DISCONNECT", { stage: "UPDATING_SUPABASE", body: disconnectBody });
      const res = await fetch("/api/social-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(disconnectBody),
      });
      const data = await res.json();
      TRACE("DISCONNECT", { stage: "RESULT", status: res.status, data });
    } catch (e: any) {
      TRACE("DISCONNECT", `ERROR: ${e.message}`);
    }
    await loadAndVerify();
  }

  function isConnected(platform: string) {
    if (platform === "whatsapp") return whatsAppStatus;
    if (platform === "telegram") return tgStatus;
    return supabaseRef.current.some((c: any) => c.platform === platform && c.status === "connected");
  }

  function getConnectionStatus(platform: string): string {
    if (platform === "whatsapp") return whatsAppStatus ? "ACTIVE" : "";
    if (platform === "telegram") return tgStatus ? "ACTIVE" : "";
    const sc = supabaseRef.current.find((c: any) => c.platform === platform);
    return sc?.status ?? "";
  }

  function handleConnect(platform: string) {
    const cfg = platformConfig[platform];
    if (cfg.type === "baileys") { handleWhatsAppConnect(); return; }
    if (cfg.type === "telegram") { openTelegramModal(); return; }
    handleComposioConnect(platform);
  }

  async function handleWhatsAppConnect() {
    setQrModalOpen(true); setQrLoading(true); setQrCode(null); setError("");
    try {
      if (!userId) { setError("Not authenticated"); return; }
      const attempt = async () => {
        const res = await fetch("/api/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connect", userId }) });
        return await res.json();
      };
      let data = await attempt();
      if (data.error && /Logged out/i.test(data.error)) {
        TRACE("WA_CONNECT", "logged-out error, retrying once for fresh QR");
        data = await attempt();
      }
      if (data.qrCode) { setQrCode(data.qrCode); pollQr(); }
      else if (data.error) { setError(data.error); setQrModalOpen(false); }
      else { setWhatsAppStatus(true); setQrModalOpen(false); }
    } catch { setError("Failed"); } finally { setQrLoading(false); }
  }

  function pollQr() {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/whatsapp?action=status&userId=${userId}`);
      const data = await res.json();
      if (data.connected) { clearInterval(interval); setWhatsAppStatus(true); setQrModalOpen(false); }
    }, 3000);
    setTimeout(() => clearInterval(interval), 180000);
  }

  async function checkWhatsAppStatus() {
    try { if (!userId) return; const res = await fetch(`/api/whatsapp?action=status&userId=${userId}`); const d = await res.json(); setWhatsAppStatus(d.connected ?? false); } catch {}
  }

  async function checkTelegramStatus() {
    try { if (!userId) return; const res = await fetch(`/api/telegram?action=status&userId=${userId}`); const d = await res.json(); setTgStatus(d.connected ?? false); if (d.bot) setTgBot(d.bot); } catch {}
  }

  function openTelegramModal() { setTgModalOpen(true); setTgToken(""); setTgVerify(null); }
  async function handleVerifyToken() {
    if (!tgToken.trim()) return; setTgLoading(true); setTgVerify(null);
    try {
      const res = await fetch("/api/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", token: tgToken.trim(), userId }) });
      setTgVerify(await res.json());
    } catch { setTgVerify({ valid: false, error: "Failed" }); } finally { setTgLoading(false); }
  }
  async function handleConnectTelegram() {
    setTgLoading(true);
    try {
      const res = await fetch("/api/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connect", token: tgToken.trim(), userId }) });
      const data = await res.json();
      if (data.success) { setTgStatus(true); setTgBot(data.bot || { username: "", name: "" }); setTgModalOpen(false); }
      else setError(data.error);
    } catch { setError("Failed"); } finally { setTgLoading(false); }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-normal tracking-[-0.03em] text-white">Social Connections</h1>
        <p className="text-white/40 font-light mt-1.5">Connect your social accounts to enable AI-powered outreach</p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-400 font-medium">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {Object.entries(platformConfig).map(([key, config], index) => {
          const connected = isConnected(key);
          const Icon = config.icon;
          const status = getConnectionStatus(key);
          const isExpired = status === "expired" || status === "pending";

          return (
            <motion.div key={key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: index * 0.08 }}>
              <Card className={`glass-card p-5 border-l-2 ${config.borderColor} glass-hover`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${config.color} flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-medium text-white">{config.name}</h3>
                      <p className="text-xs text-white/40 font-light">
                        {connected ? (key === "whatsapp" ? "Connected via QR" : key === "telegram" ? `@${tgBot?.username ?? "bot"}` : "Connected") : "Not connected"}
                      </p>
                    </div>
                  </div>
                  <Badge variant={connected ? "success" : isExpired ? "warning" : "secondary"}>
                    {connected ? "Connected" : isExpired ? status.charAt(0).toUpperCase() + status.slice(1) : "Disconnected"}
                  </Badge>
                </div>

                <CardContent className="p-0 space-y-3">
                  {connected ? (
                    <>
                      {key === "whatsapp" && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-white/40 font-light">Status</span>
                          <span className="text-emerald-400 font-medium text-xs flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Active
                          </span>
                        </div>
                      )}
                      {key === "telegram" && tgBot && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-white/40 font-light">Bot</span>
                          <span className="text-white/60 text-xs">@{tgBot.username} ({tgBot.name})</span>
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <Button variant="ghost" size="sm" className="gap-2 text-red-400 hover:text-red-300" onClick={() => { const sc = supabaseRef.current.find((c: any) => c.platform === key); handleDisconnect(key, sc?.connection_id); }}>
                          <Unlink className="w-3.5 h-3.5" />Disconnect
                        </Button>
                        <Button variant="outline" size="sm" className="gap-2 text-xs" onClick={() => handleConnect(key)}>
                          <RefreshCw className="w-3.5 h-3.5" />Reconnect
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-white/30 font-light">
                        {isExpired ? "Connection pending. Complete OAuth and refresh this page." : config.desc}
                      </p>
                      <Button className="w-full liquid-glass rounded-full gap-2 text-sm" onClick={() => handleConnect(key)} disabled={connecting === key}>
                        {connecting === key ? <><RefreshCw className="w-4 h-4 animate-spin" />Connecting...</> : <><Link2 className="w-4 h-4" />{config.connectLabel}</>}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><QrCode className="w-5 h-5 text-green-400" />Connect WhatsApp</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center py-4">
            {qrLoading && !qrCode && <div className="flex flex-col items-center gap-3"><RefreshCw className="w-8 h-8 text-green-400 animate-spin" /><p className="text-sm text-white/50 font-light">Generating QR code...</p></div>}
            {qrCode && <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4"><div className="p-3 bg-white rounded-2xl"><img src={qrCode} alt="QR" className="w-56 h-56" /></div><p className="text-sm text-white/50 font-light text-center">WhatsApp → Settings → Linked Devices → Link a Device</p><div className="flex items-center gap-2 text-xs text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />Waiting for scan...</div></motion.div>}
            {!qrLoading && !qrCode && <Button onClick={handleWhatsAppConnect} className="liquid-glass rounded-full gap-2"><QrCode className="w-4 h-4" />Generate QR Code</Button>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={tgModalOpen} onOpenChange={setTgModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Bot className="w-5 h-5 text-sky-400" />Connect Telegram Bot</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20"><p className="text-xs text-white/60 font-light">1. Open Telegram → <strong className="text-white/80">@BotFather</strong><br />2. Send <code className="text-sky-400">/newbot</code> → follow steps<br />3. Copy the bot token → paste below</p></div>
            <div className="space-y-1.5"><Label className="text-sm font-light text-white/60">Bot Token</Label><div className="flex gap-2"><Input placeholder="123456:ABC-DEF1234..." value={tgToken} onChange={(e) => { setTgToken(e.target.value); setTgVerify(null); }} className="flex-1" /><Button onClick={handleVerifyToken} disabled={tgLoading || !tgToken.trim()} className="liquid-glass rounded-full px-4 gap-1.5 shrink-0">{tgLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}Verify</Button></div></div>
            {tgVerify && <div className={`p-3 rounded-xl flex items-start gap-2.5 ${tgVerify.valid ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"}`}>{tgVerify.valid ? <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> : <X className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />}<div><p className={`text-sm font-medium ${tgVerify.valid ? "text-emerald-400" : "text-red-400"}`}>{tgVerify.valid ? `Bot verified: @${tgVerify.name}` : "Invalid token"}</p>{tgVerify.error && <p className="text-xs text-red-400/70 font-light mt-0.5">{tgVerify.error}</p>}</div></div>}
            <Button onClick={handleConnectTelegram} disabled={!tgVerify?.valid || tgLoading} className="w-full liquid-glass rounded-full gap-2" variant="primary">{tgLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}Connect Bot</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-400" />AI Capabilities</CardTitle>
            <CardDescription>What the connected accounts actually support</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {capabilities.length === 0 ? (
              <p className="text-sm text-white/40">Connect an account to see its AI capabilities.</p>
            ) : (
              capabilities.map((cap: any) => (
                <div key={`${cap.provider}:${cap.account_id ?? "session"}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium capitalize">{cap.provider}</span>
                    <Badge variant={cap.token_status === "valid" ? "success" : "warning"}>{cap.token_status}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cap.can_publish && <Badge variant="info">publish</Badge>}
                    {cap.can_reply_comments && <Badge variant="info">reply comments</Badge>}
                    {cap.can_read_comments && <Badge variant="info">read comments</Badge>}
                    {cap.can_send_messages && <Badge variant="info">DMs</Badge>}
                    {cap.can_read_engagement && <Badge variant="info">engagement</Badge>}
                    {!cap.can_publish && !cap.can_reply_comments && !cap.can_send_messages && (
                      <span className="text-xs text-white/40">Read-only connection</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="w-4 h-4 text-sky-400" />AI Activity</CardTitle>
            <CardDescription>Decisions and actions from the social AI engine</CardDescription>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-white/40 text-center py-6">No AI activity yet. Comments and messages will appear here once processed.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {activity.map((item: any, i: number) => (
                  <div key={i} className="flex items-start justify-between gap-3 rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                    <div>
                      <p className="text-sm text-white/70 capitalize">{item.message}</p>
                      {item.error && <p className="text-xs text-amber-400/80 mt-0.5">{item.error}</p>}
                    </div>
                    <span className="text-xs text-white/30 shrink-0">{new Date(item.at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
