"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  MessageSquare,
  Calendar,
  Target,
  Zap,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/charts/stat-card";
import { ChartArea } from "@/components/charts/area-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { formatNumber } from "@/lib/utils";

interface Overview {
  totalLeads: number;
  newLeads7d: number;
  qualifiedLeads: number;
  conversations: number;
  totalMessages: number;
  meetingsBooked: number;
  meetingsHeld: number;
  websiteScans: number;
  conversionRate: number | null;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getFormattedDate() {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

export default function DashboardPage() {
  const [greeting] = useState(getGreeting());
  const [date] = useState(getFormattedDate());
  const [userName, setUserName] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [leadChart, setLeadChart] = useState<{ day: string; value: number }[]>([]);
  const [msgChart, setMsgChart] = useState<{ day: string; value: number }[]>([]);
  const [recentEvents, setRecentEvents] = useState<{ label: string; at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const name = data.user?.user_metadata?.full_name || data.user?.email?.split("@")[0] || "";
      setUserName(name);
    });

    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/analytics?days=14");
        const json = await res.json();
        if (cancelled) return;
        if (!json.error) {
          setOverview(json.overview);
          setLeadChart(
            (json.buckets ?? []).map((b: any) => ({ day: b.day.slice(5).replace("-", "/"), value: b.leads }))
          );
          setMsgChart(
            (json.buckets ?? []).map((b: any) => ({ day: b.day.slice(5).replace("-", "/"), value: b.messages }))
          );
        }
      } catch {
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    const loadEvents = async () => {
      const { data: events } = await supabase
        .from("funnel_events")
        .select("event_type, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (events) {
        setRecentEvents(
          events.map((e: any) => ({
            label: e.event_type.replace(/_/g, " ").toLowerCase(),
            at: new Date(e.created_at).toLocaleString(),
          }))
        );
      }
    };
    loadEvents();

    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const stats = [
    { title: "Total Leads", value: overview ? formatNumber(overview.totalLeads) : "—", change: overview ? `+${overview.newLeads7d} this week` : "", icon: Users, trend: "up" as const },
    { title: "Qualified Leads", value: overview ? formatNumber(overview.qualifiedLeads) : "—", change: overview?.conversionRate !== null && overview ? `${overview.conversionRate}% to meetings` : "", icon: Target, trend: "up" as const },
    { title: "Conversations", value: overview ? formatNumber(overview.conversations) : "—", change: overview ? `${formatNumber(overview.totalMessages)} messages` : "", icon: MessageSquare, trend: "up" as const },
    { title: "Meetings Booked", value: overview ? formatNumber(overview.meetingsBooked) : "—", change: overview ? `${overview.meetingsHeld} held` : "", icon: Calendar, trend: "up" as const },
    { title: "Website Scans", value: overview ? formatNumber(overview.websiteScans) : "—", change: "", icon: Zap, trend: "up" as const },
  ];

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          {greeting}{userName ? ", " : ""}<span className="gradient-text">{userName}</span>
        </h1>
        <p className="text-white/50 mt-1 text-sm">{date}</p>
      </motion.div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {stats.map((stat) => (
            <StatCard key={stat.title} title={stat.title} value={stat.value} change={stat.change} icon={stat.icon} trend={stat.trend} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Leads (last 14 days)</CardTitle>
            <p className="text-sm text-white/40 mt-1">New leads created per day</p>
          </CardHeader>
          <CardContent>
            {leadChart.every((p) => p.value === 0) ? (
              <p className="text-sm text-white/30 text-center py-16">No leads yet.</p>
            ) : (
              <ChartArea data={leadChart} dataKey="value" xKey="day" color="#3b82f6" gradientId="dash-leads-gradient" height={260} />
            )}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Messages (last 14 days)</CardTitle>
            <p className="text-sm text-white/40 mt-1">Conversation messages per day</p>
          </CardHeader>
          <CardContent>
            {msgChart.every((p) => p.value === 0) ? (
              <p className="text-sm text-white/30 text-center py-16">No messages yet.</p>
            ) : (
              <ChartArea data={msgChart} dataKey="value" xKey="day" color="#8b5cf6" gradientId="dash-msg-gradient" height={260} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <p className="text-sm text-white/40 mt-1">Latest funnel events in your workspace</p>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-white/30 text-center py-8">
              No activity yet. Connect WhatsApp or scan your website to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {recentEvents.map((event, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-4 py-2.5">
                  <span className="text-sm text-white/70 capitalize">{event.label}</span>
                  <span className="text-xs text-white/40">{event.at}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
