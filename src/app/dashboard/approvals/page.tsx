"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Send,
  Reply,
  MessageCircle,
  Check,
  X,
  Edit,
  Clock,
  AlertCircle,
  Instagram,
  Facebook,
  Linkedin,
  Twitter,
  MessageCircle as WhatsApp,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { approvals } from "@/lib/data";
import type { Approval } from "@/types";
import { formatDate } from "@/lib/utils";

const typeMeta: Record<
  Approval["type"],
  { icon: React.ComponentType<{ className?: string }>; label: string; color: string }
> = {
  post: { icon: MessageSquare, label: "Post", color: "text-sky-400" },
  dm: { icon: Send, label: "DM", color: "text-violet-400" },
  reply: { icon: Reply, label: "Reply", color: "text-amber-400" },
  comment: { icon: MessageCircle, label: "Comment", color: "text-emerald-400" },
};

const platformIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  twitter: Twitter,
  whatsapp: WhatsApp,
};

const platformColors: Record<string, string> = {
  instagram: "bg-pink-500/20 text-pink-400",
  facebook: "bg-blue-500/20 text-blue-400",
  linkedin: "bg-blue-400/20 text-blue-400",
  twitter: "bg-sky-500/20 text-sky-400",
  whatsapp: "bg-emerald-500/20 text-emerald-400",
};

const urgencyConfig = {
  low: { dot: "bg-gray-400", ring: "", pulse: false, label: "Low" },
  medium: { dot: "bg-amber-400", ring: "", pulse: false, label: "Medium" },
  high: { dot: "bg-red-400", ring: "ring-2 ring-red-400/40", pulse: true, label: "High" },
};

type FilterKey = "pending" | "approved" | "rejected";

const filters: { key: FilterKey; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export default function ApprovalsPage() {
  const [filter, setFilter] = useState<FilterKey>("pending");
  const [items, setItems] = useState(approvals);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const filteredItems = useMemo(() => {
    return items.filter((item) => item.status === filter);
  }, [items, filter]);

  const summary = useMemo(() => {
    const pending = items.filter((i) => i.status === "pending").length;
    const approved = items.filter((i) => i.status === "approved").length;
    const rejected = items.filter((i) => i.status === "rejected").length;
    const approvedToday = items.filter(
      (i) => i.status === "approved" && i.date === "2025-01-22"
    ).length;
    return { pending, approved, rejected, approvedToday };
  }, [items]);

  const handleAction = useCallback(
    (id: string, action: "approve" | "reject") => {
      setRemovingIds((prev) => new Set(prev).add(id));
      setTimeout(() => {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, status: action === "approve" ? "approved" as const : "rejected" as const } : item
          )
        );
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 400);
    },
    []
  );

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Approval Queue
            </h1>
            {summary.pending > 0 && (
              <Badge variant="warning" className="text-xs">
                {summary.pending} pending
              </Badge>
            )}
          </div>
          <p className="text-sm text-white/40">
            Review and approve content before it goes live
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 flex items-center gap-6 text-sm"
      >
        <span className="text-white/50">
          <span className="text-amber-400 font-semibold">{summary.pending}</span> pending
        </span>
        <span className="text-white/50">
          <span className="text-emerald-400 font-semibold">{summary.approvedToday}</span> approved today
        </span>
        <span className="text-white/50">
          <span className="text-rose-400 font-semibold">{summary.rejected}</span> rejected
        </span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        <div className="inline-flex h-10 items-center justify-center rounded-xl bg-white/[0.03] border border-white/10 p-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                filter === f.key
                  ? "bg-white/[0.08] text-white shadow-sm"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {f.label}
              {f.key === "pending" && summary.pending > 0 && (
                <span className="ml-1.5 text-[10px] text-amber-400">({summary.pending})</span>
              )}
            </button>
          ))}
        </div>
      </motion.div>

      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filteredItems.map((item, i) => {
            const TypeIcon = typeMeta[item.type].icon;
            const PlatformIcon = platformIcons[item.platform];
            const urgency = urgencyConfig[item.urgency];
            const isRemoving = removingIds.has(item.id);

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 15 }}
                animate={
                  isRemoving
                    ? { opacity: 0, scale: 0.95, y: -10 }
                    : { opacity: 1, y: 0 }
                }
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{
                  delay: isRemoving ? 0 : i * 0.05,
                  duration: isRemoving ? 0.3 : 0.3,
                }}
              >
                <Card className="glass-card">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06] ${typeMeta[item.type].color}`}
                        >
                          <TypeIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-white capitalize">
                              {item.type}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {typeMeta[item.type].label}
                            </Badge>
                            {PlatformIcon && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${platformColors[item.platform] ?? ""}`}
                              >
                                <PlatformIcon className="h-3 w-3 mr-1" />
                                {item.platform.charAt(0).toUpperCase() + item.platform.slice(1)}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-xs text-white/40">
                            <span>by {item.submittedBy}</span>
                            <span className="w-1 h-1 rounded-full bg-white/20" />
                            <span>{formatDate(item.date)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`relative flex h-2.5 w-2.5 shrink-0 ${urgency.dot} ${urgency.ring}`}
                        >
                          {urgency.pulse && (
                            <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-75" />
                          )}
                        </span>
                        <span className="text-xs text-white/40">{urgency.label}</span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-4">
                      <p className="text-sm text-white/80 line-clamp-2 leading-relaxed">
                        {item.content}
                      </p>
                    </div>

                    {item.status === "pending" && (
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                          onClick={() => handleAction(item.id, "approve")}
                        >
                          <Check className="h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                          onClick={() => handleAction(item.id, "reject")}
                        >
                          <X className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                        >
                          <Edit className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </div>
                    )}

                    {item.status === "approved" && (
                      <div className="flex items-center gap-2 pt-1 text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-sm font-medium">Approved</span>
                      </div>
                    )}

                    {item.status === "rejected" && (
                      <div className="flex items-center gap-2 pt-1 text-rose-400">
                        <XCircle className="h-4 w-4" />
                        <span className="text-sm font-medium">Rejected</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredItems.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-white/30"
          >
            <CheckCircle2 className="h-12 w-12 mb-3" />
            <p className="text-sm">No {filter} items</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
