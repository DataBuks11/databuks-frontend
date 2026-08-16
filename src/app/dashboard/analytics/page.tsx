"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  MessageSquare,
  Target,
  Calendar,
  Globe,
  Zap,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartArea } from "@/components/charts/area-chart";
import { cn, formatNumber } from "@/lib/utils";

const dateRanges = ["7d", "30d", "90d"] as const;
type DateRange = (typeof dateRanges)[number];

interface AnalyticsResponse {
  overview: {
    totalLeads: number;
    newLeads7d: number;
    qualifiedLeads: number;
    conversations: number;
    totalMessages: number;
    meetingsBooked: number;
    meetingsHeld: number;
    websiteScans: number;
    conversionRate: number | null;
  };
  buckets: { day: string; leads: number; conversations: number; messages: number; meetings: number }[];
  hasData: boolean;
}

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
    setLoading(true);
    fetch(`/api/analytics?days=${days}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        setData(json);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateRange]);

  const cards = useMemo(() => {
    const o = data?.overview;
    return [
      { title: "Total Leads", value: o?.totalLeads ?? 0, sub: `${o?.newLeads7d ?? 0} new in last 7 days`, icon: Users, color: "text-blue-400", bg: "bg-blue-400/10" },
      { title: "Qualified Leads", value: o?.qualifiedLeads ?? 0, sub: o && o.conversionRate !== null ? `${o.conversionRate}% converted to meetings` : "no qualified leads yet", icon: Target, color: "text-emerald-400", bg: "bg-emerald-400/10" },
      { title: "Conversations", value: o?.conversations ?? 0, sub: `${o?.totalMessages ?? 0} total messages`, icon: MessageSquare, color: "text-violet-400", bg: "bg-violet-400/10" },
      { title: "Meetings Booked", value: o?.meetingsBooked ?? 0, sub: `${o?.meetingsHeld ?? 0} held`, icon: Calendar, color: "text-amber-400", bg: "bg-amber-400/10" },
      { title: "Website Scans", value: o?.websiteScans ?? 0, sub: "completed scans", icon: Globe, color: "text-sky-400", bg: "bg-sky-400/10" },
    ];
  }, [data]);

  const leadChart = useMemo(
    () =>
      (data?.buckets ?? []).map((b) => ({
        day: b.day.slice(5).replace("-", "/"),
        value: b.leads,
      })),
    [data]
  );

  const conversationChart = useMemo(
    () =>
      (data?.buckets ?? []).map((b) => ({
        day: b.day.slice(5).replace("-", "/"),
        value: b.messages,
      })),
    [data]
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="glass-card">
        <CardContent className="py-10 text-center">
          <p className="text-sm text-white/60">Could not load analytics: {error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-white/50 mt-1 text-sm">Real activity from your workspace</p>
        </div>
        <div className="flex items-center rounded-xl border border-white/[0.08] bg-white/[0.02] p-0.5">
          {dateRanges.map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200",
                dateRange === range ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:text-white/80"
              )}
            >
              {range}
            </button>
          ))}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.06 }}
          >
            <Card className="glass-card p-5 rounded-2xl border-white/[0.08]">
              <div className="flex items-start justify-between mb-3">
                <p className="text-sm text-white/50 font-medium">{card.title}</p>
                <div className={cn("w-9 h-9 rounded-full flex items-center justify-center", card.bg)}>
                  <card.icon className={cn("w-4 h-4", card.color)} />
                </div>
              </div>
              <div className="text-3xl font-bold text-white tabular-nums">{formatNumber(card.value)}</div>
              <p className="text-xs text-white/40 mt-1">{card.sub}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      {!data?.hasData ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <Zap className="w-8 h-8 text-white/20 mx-auto mb-3" />
            <p className="text-sm text-white/50">Not enough activity data yet.</p>
            <p className="text-xs text-white/30 mt-1">
              Leads, conversations, messages and meetings will appear here as they happen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>New Leads</CardTitle>
              <p className="text-sm text-white/40 mt-1">Leads created per day</p>
            </CardHeader>
            <CardContent>
              <ChartArea data={leadChart} dataKey="value" xKey="day" color="#3b82f6" gradientId="real-leads-gradient" height={260} />
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Messages</CardTitle>
              <p className="text-sm text-white/40 mt-1">Conversation messages per day</p>
            </CardHeader>
            <CardContent>
              <ChartArea data={conversationChart} dataKey="value" xKey="day" color="#8b5cf6" gradientId="real-messages-gradient" height={260} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
