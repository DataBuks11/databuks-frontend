"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  RefreshCw, ExternalLink, Unlink, Link2, Instagram, Facebook,
  MessageCircle, Send, QrCode, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

const platformConfig: Record<string, {
  name: string; icon: React.ElementType; color: string; borderColor: string;
  isWhatsApp?: boolean;
}> = {
  instagram: { name: "Instagram", icon: Instagram, color: "from-pink-500 to-purple-500", borderColor: "border-l-pink-500/50" },
  facebook: { name: "Facebook", icon: Facebook, color: "from-blue-600 to-blue-400", borderColor: "border-l-blue-500/50" },
  whatsapp: { name: "WhatsApp", icon: MessageCircle, color: "from-green-500 to-emerald-400", borderColor: "border-l-green-500/50", isWhatsApp: true },
  telegram: { name: "Telegram", icon: Send, color: "from-sky-500 to-cyan-400", borderColor: "border-l-sky-500/50" },
};

interface ComposioItem {
  id: string;
  appName: string;
  appId: string;
  status: string;
  createdAt: string;
}

export default function SocialsPage() {
  const [connections, setConnections] = useState<ComposioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [whatsAppStatus, setWhatsAppStatus] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [userId, setUserId] = useState("");
  const supabase = createClient();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? "");
      await loadConnections();
      await checkWhatsAppStatus();
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
    } catch {
      setError("Failed to load connections");
    } finally {
      setLoading(false);
    }
  }

  async function checkWhatsAppStatus() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id;
      if (!uid) return;
      const res = await fetch(`/api/whatsapp?action=status&userId=${uid}`);
      const data = await res.json();
      setWhatsAppStatus(data.connected ?? false);
    } catch { /* ignore */ }
  }

  async function handleConnect(platform: string) {
    if (platform === "whatsapp") {
      setQrModalOpen(true);
      await handleWhatsAppConnect();
      return;
    }

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
    } catch {
      setError("Failed to initiate connection");
    } finally {
      setConnecting(null);
    }
  }

  async function handleWhatsAppConnect() {
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

      if (data.qrCode) {
        setQrCode(data.qrCode);
        startQrPolling();
      } else if (data.error) {
        setError(data.error);
        setQrModalOpen(false);
      } else {
        setWhatsAppStatus(true);
        setQrModalOpen(false);
        setQrCode(null);
      }
    } catch {
      setError("Failed to generate QR code");
    } finally {
      setQrLoading(false);
    }
  }

  function startQrPolling() {
    const interval = setInterval(async () => {
      const uid = userId;
      if (!uid) { clearInterval(interval); return; }
      try {
        const res = await fetch(`/api/whatsapp?action=status&userId=${uid}`);
        const data = await res.json();
        if (data.connected) {
          clearInterval(interval);
          setWhatsAppStatus(true);
          setQrModalOpen(false);
          setQrCode(null);
        }
      } catch { /* keep polling */ }
    }, 3000);

    setTimeout(() => { clearInterval(interval); }, 180000);
  }

  async function handleDisconnect(platform: string, connectionId?: string) {
    if (platform === "whatsapp") {
      const uid = userId;
      await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect", userId: uid }),
      });
      setWhatsAppStatus(false);
      return;
    }
    if (connectionId) {
      await fetch(`/api/composio/connections?id=${connectionId}`, { method: "DELETE" });
      await loadConnections();
    }
  }

  function getConnectionForPlatform(platform: string) {
    return connections.find(
      (c) => c.appName.toLowerCase() === platform.toLowerCase() && c.status === "ACTIVE"
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-normal tracking-[-0.03em] text-white">Social Connections</h1>
        <p className="text-white/40 font-light mt-1.5">
          Connect your social accounts to enable AI-powered outreach
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-400 font-medium">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {Object.entries(platformConfig).map(([key, config], index) => {
          const conn = getConnectionForPlatform(key);
          const isConnected = key === "whatsapp" ? whatsAppStatus : !!conn;
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
                      {isConnected ? (
                        <p className="text-xs text-white/40 font-light">
                          {key === "whatsapp" ? "Connected via QR scan" : "Connected via Composio"}
                        </p>
                      ) : (
                        <p className="text-xs text-white/30 font-light">Not connected</p>
                      )}
                    </div>
                  </div>
                  <Badge variant={isConnected ? "success" : "secondary"}>
                    {isConnected ? "Connected" : "Disconnected"}
                  </Badge>
                </div>

                <CardContent className="p-0 space-y-3">
                  {isConnected ? (
                    <>
                      {key !== "whatsapp" && conn && (
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
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Active
                          </span>
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-2 text-red-400 hover:text-red-300"
                          onClick={() => handleDisconnect(key, conn?.id)}
                        >
                          <Unlink className="w-3.5 h-3.5" />
                          Disconnect
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-white/30 font-light">
                        {key === "whatsapp"
                          ? "Scan QR code with WhatsApp to connect. Enables AI-powered messaging and automation."
                          : `Connect your ${config.name} account to enable AI-powered DM outreach, content scheduling, and lead generation.`
                        }
                      </p>
                      <Button
                        className="w-full liquid-glass rounded-full gap-2 text-sm"
                        onClick={() => handleConnect(key)}
                        disabled={connecting === key}
                      >
                        {connecting === key ? (
                          <><RefreshCw className="w-4 h-4 animate-spin" />Connecting...</>
                        ) : (
                          <><Link2 className="w-4 h-4" />Connect {config.name}</>
                        )}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* WhatsApp QR Code Modal */}
      <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-green-400" />
              Connect WhatsApp
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center py-4">
            {qrLoading && !qrCode && (
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 text-green-400 animate-spin" />
                <p className="text-sm text-white/50 font-light">Generating QR code...</p>
              </div>
            )}

            {qrCode && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center gap-4"
              >
                <div className="p-3 bg-white rounded-2xl">
                  <img src={qrCode} alt="WhatsApp QR Code" className="w-56 h-56" />
                </div>
                <p className="text-sm text-white/50 font-light text-center">
                  Open WhatsApp on your phone{" "}
                  <strong className="text-white/70">Settings → Linked Devices → Link a Device</strong>
                  {" "}and scan this QR code
                </p>
                <div className="flex items-center gap-2 text-xs text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Waiting for scan...
                </div>
              </motion.div>
            )}

            {!qrLoading && !qrCode && (
              <div className="flex flex-col items-center gap-3">
                <Button
                  onClick={handleWhatsAppConnect}
                  className="liquid-glass rounded-full gap-2"
                >
                  <QrCode className="w-4 h-4" />
                  Generate QR Code
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Composio connections list */}
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
                  <Badge variant={conn.status === "ACTIVE" ? "success" : "warning"}>
                    {conn.status.toLowerCase()}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
