"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Instagram,
  Facebook,
  MessageCircle,
  Send,
  Linkedin,
  RefreshCw,
  Plus,
  Users,
  Clock,
  Unlink,
  ExternalLink,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { socialConnections } from "@/lib/data";
import type { SocialConnection } from "@/types";

const platformMeta: Record<
  SocialConnection["platform"],
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    color: string;
    borderColor: string;
  }
> = {
  instagram: {
    icon: Instagram,
    label: "Instagram",
    color: "border-l-pink-500/50",
    borderColor: "border-pink-500/50",
  },
  facebook: {
    icon: Facebook,
    label: "Facebook",
    color: "border-l-blue-500/50",
    borderColor: "border-blue-500/50",
  },
  whatsapp: {
    icon: MessageCircle,
    label: "WhatsApp",
    color: "border-l-emerald-500/50",
    borderColor: "border-emerald-500/50",
  },
  telegram: {
    icon: Send,
    label: "Telegram",
    color: "border-l-sky-400/50",
    borderColor: "border-sky-400/50",
  },
  linkedin: {
    icon: Linkedin,
    label: "LinkedIn",
    color: "border-l-blue-400/50",
    borderColor: "border-blue-400/50",
  },
};

const statusVariant: Record<SocialConnection["status"], "success" | "warning" | "destructive" | "outline"> = {
  connected: "success",
  expired: "warning",
  error: "destructive",
  disconnected: "outline",
};

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

export default function SocialConnectionsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [syncLoading, setSyncLoading] = useState<string | null>(null);

  const handleReSync = (id: string) => {
    setSyncLoading(id);
    setTimeout(() => setSyncLoading(null), 1500);
  };

  const handleDisconnect = (id: string) => {
    console.log("Disconnect", id);
  };

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Social Connections
          </h1>
          <p className="text-sm text-white/40">
            Manage your connected social media accounts
          </p>
        </div>
        <Button
          variant="glass"
          size="sm"
          className="shrink-0 gap-2"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Connect New Account
        </Button>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {socialConnections.map((connection, i) => {
          const meta = platformMeta[connection.platform];
          const Icon = meta.icon;

          return (
            <motion.div
              key={connection.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.3 }}
            >
              <Card
                className={`glass-card border-l-2 ${meta.color}`}
              >
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06]">
                        <Icon className="h-5 w-5 text-white/70" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {meta.label}
                        </p>
                        <p className="text-xs text-white/40">
                          {connection.handle}
                        </p>
                      </div>
                    </div>
                    <Badge variant={statusVariant[connection.status]}>
                      {connection.status.charAt(0).toUpperCase() +
                        connection.status.slice(1)}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-3">
                      <div className="flex items-center gap-2 text-white/40 text-xs mb-1">
                        <Users className="h-3.5 w-3.5" />
                        Followers
                      </div>
                      <span className="text-lg font-bold">
                        {connection.followers > 0
                          ? formatNumber(connection.followers)
                          : "N/A"}
                      </span>
                    </div>
                    <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-3">
                      <div className="flex items-center gap-2 text-white/40 text-xs mb-1">
                        <Clock className="h-3.5 w-3.5" />
                        Last Synced
                      </div>
                      <span className="text-xs text-white/60">
                        {connection.lastSync}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => handleReSync(connection.id)}
                      disabled={syncLoading === connection.id}
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${
                          syncLoading === connection.id ? "animate-spin" : ""
                        }`}
                      />
                      {syncLoading === connection.id ? "Syncing..." : "Re-sync"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-white/50 hover:text-rose-400"
                      onClick={() => handleDisconnect(connection.id)}
                    >
                      <Unlink className="h-3.5 w-3.5" />
                      Disconnect
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect New Account</DialogTitle>
            <DialogDescription>
              Choose a platform to connect your social media account.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 pt-2">
            {(
              Object.entries(platformMeta) as [
                SocialConnection["platform"],
                (typeof platformMeta)[SocialConnection["platform"]]
              ][]
            ).map(([key, meta]) => {
              const Icon = meta.icon;
              return (
                <button
                  key={key}
                  onClick={() => setDialogOpen(false)}
                  className="flex items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-left transition-all hover:bg-white/[0.05] hover:border-white/[0.15]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06]">
                    <Icon className="h-5 w-5 text-white/60" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">
                      {meta.label}
                    </p>
                    <p className="text-xs text-white/40">
                      Connect your {meta.label} account
                    </p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-white/30" />
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
