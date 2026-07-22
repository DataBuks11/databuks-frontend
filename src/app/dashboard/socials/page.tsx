"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, ExternalLink, Unlink, Link2, Instagram, Facebook, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

const platformConfig: Record<string, { name: string; icon: React.ElementType; color: string; borderColor: string }> = {
  instagram: { name: "Instagram", icon: Instagram, color: "from-pink-500 to-purple-500", borderColor: "border-l-pink-500/50" },
  facebook: { name: "Facebook", icon: Facebook, color: "from-blue-600 to-blue-400", borderColor: "border-l-blue-500/50" },
  whatsapp: { name: "WhatsApp", icon: MessageCircle, color: "from-green-500 to-emerald-400", borderColor: "border-l-green-500/50" },
  telegram: { name: "Telegram", icon: Send, color: "from-sky-500 to-cyan-400", borderColor: "border-l-sky-500/50" },
};

interface ComposioItem {
  id: string;
  appName: string;
  appId: string;
  status: string;
  createdAt: string;
  labels?: string[];
}

export default function SocialsPage() {
  const [connections, setConnections] = useState<ComposioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const supabase = createClient();

  async function loadConnections() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? "default";
      const res = await fetch(`/api/composio/connections?userId=${userId}`);
      const data = await res.json();
      if (data.connections) {
        setConnections(data.connections);
      }
    } catch {
      setError("Failed to load connections");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConnections();
  }, []);

  async function handleConnect(platform: string) {
    setConnecting(platform);
    setError("");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? "default";

      const res = await fetch("/api/composio/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appName: platform, entityId: userId }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }

      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        await loadConnections();
      }
    } catch {
      setError("Failed to initiate connection");
    } finally {
      setConnecting(null);
    }
  }

  async function handleDisconnect(connectionId: string) {
    try {
      await fetch(`/api/composio/connections?id=${connectionId}`, { method: "DELETE" });
      await loadConnections();
    } catch {
      setError("Failed to disconnect");
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
          Connect your social accounts via Composio to enable AI-powered outreach
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
                      {conn ? (
                        <p className="text-xs text-white/40 font-light">Connected via Composio</p>
                      ) : (
                        <p className="text-xs text-white/30 font-light">Not connected</p>
                      )}
                    </div>
                  </div>
                  <Badge variant={conn ? "success" : "secondary"}>
                    {conn ? "Connected" : "Disconnected"}
                  </Badge>
                </div>

                <CardContent className="p-0 space-y-3">
                  {conn ? (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/40 font-light">Connection ID</span>
                        <span className="text-white/60 font-mono text-xs">{conn.id.slice(0, 12)}...</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/40 font-light">Status</span>
                        <span className="text-emerald-400 font-medium text-xs flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Active
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white/40 font-light">Connected</span>
                        <span className="text-white/60 text-xs">
                          {new Date(conn.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => window.open(`https://app.composio.dev/connections/${conn.id}`, "_blank")}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Manage
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-2 text-red-400 hover:text-red-300"
                          onClick={() => handleDisconnect(conn.id)}
                        >
                          <Unlink className="w-3.5 h-3.5" />
                          Disconnect
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-white/30 font-light">
                        Connect your {config.name} account to enable AI-powered DM outreach, content scheduling, and lead generation.
                      </p>
                      <Button
                        className="w-full liquid-glass gap-2 text-sm rounded-full"
                        onClick={() => handleConnect(key)}
                        disabled={connecting === key}
                      >
                        {connecting === key ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Link2 className="w-4 h-4" />
                            Connect {config.name}
                          </>
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

      {connections.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <h3 className="text-base font-medium text-white mb-4">All Connections</h3>
          <div className="space-y-2">
            {connections.map((conn) => {
              const cfg = platformConfig[conn.appName.toLowerCase()];
              const Icon = cfg?.icon ?? ExternalLink;
              return (
                <div
                  key={conn.id}
                  className="flex items-center justify-between py-2 px-3 rounded-xl bg-white/[0.02]"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${cfg?.color ?? "from-gray-500 to-gray-400"} flex items-center justify-center`}>
                      <Icon className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm text-white font-medium">{cfg?.name ?? conn.appName}</p>
                      <p className="text-[11px] text-white/30 font-light font-mono">
                        {conn.id.slice(0, 8)}...
                      </p>
                    </div>
                  </div>
                  <Badge variant={conn.status === "ACTIVE" ? "success" : conn.status === "EXPIRED" ? "warning" : "secondary"}>
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
