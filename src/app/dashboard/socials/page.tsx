"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw, ExternalLink, Unlink, Link2, Instagram, Facebook,
  MessageCircle, Send, QrCode, Bot, Key, Check, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

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

interface ComposioItem { id: string; appName: string; appId: string; status: string; createdAt: string; }

export default function SocialsPage() {
  const [connections, setConnections] = useState<ComposioItem[]>([]);
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

  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? "");
      await loadConnections();
      await checkWhatsAppStatus();
      await checkTelegramStatus();
    }
    init();
  }, []);

  async function loadConnections() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id ?? "default";
      const res = await fetch(`/api/composio/connections?userId=${uid}`);
      const data = await res.json();
      if (data.connections) setConnections(data.connections);
    } catch { } finally { setLoading(false); }
  }

  async function checkWhatsAppStatus() {
    try {
      const uid = userId;
      if (!uid) return;
      const res = await fetch(`/api/whatsapp?action=status&userId=${uid}`);
      const data = await res.json();
      setWhatsAppStatus(data.connected ?? false);
    } catch { }
  }

  async function checkTelegramStatus() {
    try {
      const uid = userId;
      if (!uid) return;
      const res = await fetch(`/api/telegram?action=status&userId=${uid}`);
      const data = await res.json();
      setTgStatus(data.connected ?? false);
      if (data.bot) setTgBot(data.bot);
    } catch { }
  }

  // ---- WhatsApp handlers ----
  async function handleWhatsAppConnect() {
    setQrModalOpen(true);
    setQrLoading(true);
    setQrCode(null);
    setError("");
    try {
      const uid = userId;
      if (!uid) { setError("Not authenticated"); return; }
      const res = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", userId: uid }),
      });
      const data = await res.json();
      if (data.qrCode) { setQrCode(data.qrCode); startQrPolling(); }
      else if (data.error) { setError(data.error); setQrModalOpen(false); }
      else { setWhatsAppStatus(true); setQrModalOpen(false); setQrCode(null); }
    } catch { setError("Failed to generate QR code"); }
    finally { setQrLoading(false); }
  }

  function startQrPolling() {
    const interval = setInterval(async () => {
      const uid = userId;
      if (!uid) { clearInterval(interval); return; }
      const res = await fetch(`/api/whatsapp?action=status&userId=${uid}`);
      const data = await res.json();
      if (data.connected) { clearInterval(interval); setWhatsAppStatus(true); setQrModalOpen(false); setQrCode(null); }
    }, 3000);
    setTimeout(() => clearInterval(interval), 180000);
  }

  // ---- Telegram handlers ----
  function openTelegramModal() { setTgModalOpen(true); setTgToken(""); setTgVerify(null); }
  
  async function handleVerifyToken() {
    if (!tgToken.trim()) return;
    setTgLoading(true);
    setTgVerify(null);
    try {
      const res = await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", token: tgToken.trim(), userId: userId || "default" }),
      });
      const data = await res.json();
      setTgVerify(data);
    } catch { setTgVerify({ valid: false, error: "Failed to verify" }); }
    finally { setTgLoading(false); }
  }

  async function handleConnectTelegram() {
    setTgLoading(true);
    try {
      const res = await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", token: tgToken.trim(), userId }),
      });
      const data = await res.json();
      if (data.success) { setTgStatus(true); setTgBot({ username: data.bot?.username ?? "", name: data.bot?.first_name ?? "" }); setTgModalOpen(false); }
      else { setError(data.error); }
    } catch { setError("Failed to connect"); }
    finally { setTgLoading(false); }
  }

  // ---- Composio handlers ----
  async function handleComposioConnect(platform: string) {
    setConnecting(platform);
    setError("");
    try {
      const uid = userId || "default";
      const res = await fetch("/api/composio/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName: platform, entityId: uid }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      if (data.redirectUrl) { window.location.href = data.redirectUrl; }
      else { await loadConnections(); }
    } catch { setError("Failed to initiate connection"); }
    finally { setConnecting(null); }
  }

  // ---- Disconnect handlers ----
  async function handleDisconnect(platform: string, connectionId?: string) {
    if (platform === "whatsapp") {
      await fetch("/api/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disconnect", userId }) });
      setWhatsAppStatus(false);
      return;
    }
    if (platform === "telegram") {
      await fetch("/api/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disconnect", userId }) });
      setTgStatus(false); setTgBot(null);
      return;
    }
    if (connectionId) {
      await fetch(`/api/composio/connections?id=${connectionId}`, { method: "DELETE" });
      await loadConnections();
    }
  }

  function getConnectionForPlatform(platform: string) {
    return connections.find(c => c.appName.toLowerCase() === platform.toLowerCase() && c.status === "ACTIVE");
  }

  function isConnected(platform: string) {
    if (platform === "whatsapp") return whatsAppStatus;
    if (platform === "telegram") return tgStatus;
    return !!getConnectionForPlatform(platform);
  }

  function handleConnect(platform: string) {
    const cfg = platformConfig[platform];
    if (cfg.type === "baileys") { handleWhatsAppConnect(); return; }
    if (cfg.type === "telegram") { openTelegramModal(); return; }
    handleComposioConnect(platform);
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
          const conn = getConnectionForPlatform(key);
          const Icon = config.icon;

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
            >
              <Card className={`glass-card p-5 border-l-2 ${config.borderColor} glass-hover`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${config.color} flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-medium text-white">{config.name}</h3>
                      {connected ? (
                        <p className="text-xs text-white/40 font-light">
                          {key === "whatsapp" ? "Connected via QR" : key === "telegram" ? `@${tgBot?.username ?? "bot"}` : "Connected via Composio"}
                        </p>
                      ) : (
                        <p className="text-xs text-white/30 font-light">Not connected</p>
                      )}
                    </div>
                  </div>
                  <Badge variant={connected ? "success" : "secondary"}>
                    {connected ? "Connected" : "Disconnected"}
                  </Badge>
                </div>

                <CardContent className="p-0 space-y-3">
                  {connected ? (
                    <>
                      {key !== "whatsapp" && key !== "telegram" && conn && (
                        <>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-white/40 font-light">Connection ID</span>
                            <span className="text-white/60 font-mono text-xs">{conn.id.slice(0, 12)}...</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-white/40 font-light">Connected</span>
                            <span className="text-white/60 text-xs">{new Date(conn.createdAt).toLocaleDateString()}</span>
                          </div>
                        </>
                      )}
                      {key === "whatsapp" && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-white/40 font-light">Status</span>
                          <span className="text-emerald-400 font-medium text-xs flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Active
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
                        <Button variant="ghost" size="sm" className="gap-2 text-red-400 hover:text-red-300"
                          onClick={() => handleDisconnect(key, conn?.id)}>
                          <Unlink className="w-3.5 h-3.5" />Disconnect
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-white/30 font-light">{config.desc}</p>
                      <Button className="w-full liquid-glass rounded-full gap-2 text-sm"
                        onClick={() => handleConnect(key)} disabled={connecting === key}>
                        {connecting === key ? <><RefreshCw className="w-4 h-4 animate-spin" />Connecting...</> :
                          <><Link2 className="w-4 h-4" />{config.connectLabel}</>}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* WhatsApp QR Modal */}
      <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><QrCode className="w-5 h-5 text-green-400" />Connect WhatsApp</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center py-4">
            {qrLoading && !qrCode && (
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 text-green-400 animate-spin" />
                <p className="text-sm text-white/50 font-light">Generating QR code...</p>
              </div>
            )}
            {qrCode && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4">
                <div className="p-3 bg-white rounded-2xl"><img src={qrCode} alt="QR" className="w-56 h-56" /></div>
                <p className="text-sm text-white/50 font-light text-center">WhatsApp → Settings → Linked Devices → Link a Device</p>
                <div className="flex items-center gap-2 text-xs text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />Waiting for scan...</div>
              </motion.div>
            )}
            {!qrLoading && !qrCode && (
              <Button onClick={handleWhatsAppConnect} className="liquid-glass rounded-full gap-2"><QrCode className="w-4 h-4" />Generate QR Code</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Telegram Token Modal */}
      <Dialog open={tgModalOpen} onOpenChange={setTgModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Bot className="w-5 h-5 text-sky-400" />Connect Telegram Bot</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20">
              <p className="text-xs text-white/60 font-light">
                1. Open Telegram → <strong className="text-white/80">@BotFather</strong><br />
                2. Send <code className="text-sky-400">/newbot</code> → follow steps<br />
                3. Copy the bot token → paste below
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-light text-white/60">Bot Token</Label>
              <div className="flex gap-2">
                <Input placeholder="123456:ABC-DEF1234ghikl..." value={tgToken}
                  onChange={(e) => { setTgToken(e.target.value); setTgVerify(null); }}
                  className="flex-1" />
                <Button onClick={handleVerifyToken} disabled={tgLoading || !tgToken.trim()}
                  className="liquid-glass rounded-full px-4 gap-1.5 shrink-0">
                  {tgLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                  Verify
                </Button>
              </div>
            </div>

            {tgVerify && (
              <div className={`p-3 rounded-xl flex items-start gap-2.5 ${tgVerify.valid ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
                {tgVerify.valid ? <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> : <X className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />}
                <div>
                  <p className={`text-sm font-medium ${tgVerify.valid ? "text-emerald-400" : "text-red-400"}`}>
                    {tgVerify.valid ? `Bot verified: @${tgVerify.name}` : "Invalid token"}
                  </p>
                  {tgVerify.error && <p className="text-xs text-red-400/70 font-light mt-0.5">{tgVerify.error}</p>}
                </div>
              </div>
            )}

            <Button onClick={handleConnectTelegram} disabled={!tgVerify?.valid || tgLoading}
              className="w-full liquid-glass rounded-full gap-2" variant="primary">
              {tgLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              Connect Bot
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Composio Connections List */}
      {connections.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <h3 className="text-base font-medium text-white mb-4">Composio Connections</h3>
          <div className="space-y-2">
            {connections.map((conn) => {
              const cfg = platformConfig[conn.appName.toLowerCase()];
              const Icon = cfg?.icon ?? ExternalLink;
              return (
                <div key={conn.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-white/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${cfg?.color ?? "from-gray-500 to-gray-400"} flex items-center justify-center`}>
                      <Icon className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm text-white font-medium">{cfg?.name ?? conn.appName}</p>
                      <p className="text-[11px] text-white/30 font-light font-mono">{conn.id.slice(0, 8)}...</p>
                    </div>
                  </div>
                  <Badge variant={conn.status === "ACTIVE" ? "success" : "warning"}>{conn.status.toLowerCase()}</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
