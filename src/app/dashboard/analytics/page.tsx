"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Eye,
  Zap,
  Activity,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Download,
  Users,
  MessageSquare,
  Target,
  Calendar,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChartArea } from "@/components/charts/area-chart";
import { ChartLine } from "@/components/charts/line-chart";
import { analyticsData } from "@/lib/data";
import { cn, formatNumber } from "@/lib/utils";

const dateRanges = ["7d", "30d", "90d", "12m"] as const;
type DateRange = (typeof dateRanges)[number];

const statCards = [
  {
    title: "Reach",
    value: "184.2K",
    change: "+12.3%",
    icon: Eye,
    trend: "up" as const,
  },
  {
    title: "Impressions",
    value: "492.1K",
    change: "+18.7%",
    icon: Zap,
    trend: "up" as const,
  },
  {
    title: "Engagement Rate",
    value: "13.5%",
    change: "+2.1%",
    icon: Activity,
    trend: "up" as const,
  },
  {
    title: "Revenue",
    value: "$284.5K",
    change: "+22.4%",
    icon: DollarSign,
    trend: "up" as const,
  },
];

const miniCards = [
  {
    title: "Followers",
    value: formatNumber(analyticsData.followers),
    icon: Users,
    color: "text-blue-400",
    bg: "bg-blue-400/10",
  },
  {
    title: "Replies",
    value: formatNumber(analyticsData.replies),
    icon: MessageSquare,
    color: "text-violet-400",
    bg: "bg-violet-400/10",
  },
  {
    title: "Qualified Leads",
    value: formatNumber(analyticsData.qualifiedLeads),
    icon: Target,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
  },
  {
    title: "Meetings",
    value: analyticsData.meetings,
    icon: Calendar,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
  },
];

const channelPerformance = [
  { platform: "Instagram", value: 38, color: "bg-blue-500" },
  { platform: "LinkedIn", value: 27, color: "bg-sky-400" },
  { platform: "Facebook", value: 18, color: "bg-indigo-500" },
  { platform: "WhatsApp", value: 12, color: "bg-emerald-500" },
  { platform: "Telegram", value: 5, color: "bg-cyan-400" },
];

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange>("30d");

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Analytics
          </h1>
          <p className="text-white/50 mt-1 text-sm">
            Track your performance and growth metrics
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-white/[0.08] bg-white/[0.02] p-0.5">
            {dateRanges.map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200",
                  dateRange === range
                    ? "bg-white/10 text-white shadow-sm"
                    : "text-white/50 hover:text-white/80"
                )}
              >
                {range}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" />
            Export Report
          </Button>
        </div>
      </motion.div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.08 }}
          >
            <Card className="glass-card p-5 rounded-2xl border-white/[0.08] relative overflow-hidden">
              <div className="flex items-start justify-between mb-3">
                <p className="text-sm text-white/50 font-medium">
                  {stat.title}
                </p>
                <div className="w-9 h-9 rounded-full glass-card flex items-center justify-center">
                  <stat.icon className="w-4 h-4 text-white/70" />
                </div>
              </div>
              <div className="text-3xl font-bold text-white mb-2 tabular-nums">
                {stat.value}
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded",
                    stat.trend === "up"
                      ? "bg-emerald-400/10 text-emerald-400"
                      : "bg-red-400/10 text-red-400"
                  )}
                >
                  <TrendingUp className="w-3 h-3" />
                  {stat.change}
                </span>
                <span className="text-xs text-white/40">vs last period</span>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts - Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="glass-card rounded-2xl border-white/[0.08]">
            <CardHeader>
              <CardTitle>Reach Growth</CardTitle>
              <p className="text-sm text-white/40 mt-1">
                Daily reach across all platforms
              </p>
            </CardHeader>
            <CardContent>
              <ChartArea
                data={analyticsData.reachChart}
                dataKey="value"
                xKey="date"
                color="#3b82f6"
                gradientId="reach-growth-gradient"
                height={260}
              />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card className="glass-card rounded-2xl border-white/[0.08]">
            <CardHeader>
              <CardTitle>Impressions</CardTitle>
              <p className="text-sm text-white/40 mt-1">
                Daily impression trends
              </p>
            </CardHeader>
            <CardContent>
              <ChartArea
                data={analyticsData.impressionsChart}
                dataKey="value"
                xKey="date"
                color="#8b5cf6"
                gradientId="impressions-gradient"
                height={260}
              />
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts - Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
        >
          <Card className="glass-card rounded-2xl border-white/[0.08]">
            <CardHeader>
              <CardTitle>Follower Growth</CardTitle>
              <p className="text-sm text-white/40 mt-1">
                Daily follower count
              </p>
            </CardHeader>
            <CardContent>
              <ChartArea
                data={analyticsData.followersChart}
                dataKey="value"
                xKey="date"
                color="#10b981"
                gradientId="followers-gradient"
                height={260}
              />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Card className="glass-card rounded-2xl border-white/[0.08]">
            <CardHeader>
              <CardTitle>Engagement Rate</CardTitle>
              <p className="text-sm text-white/40 mt-1">
                Daily engagement rate %
              </p>
            </CardHeader>
            <CardContent>
              <ChartLine
                data={analyticsData.engagementChart}
                dataKey="value"
                xKey="date"
                color="#f59e0b"
                height={260}
              />
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Channel Performance */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
      >
        <Card className="glass-card rounded-2xl border-white/[0.08]">
          <CardHeader>
            <CardTitle>Channel Performance</CardTitle>
            <p className="text-sm text-white/40 mt-1">
              Distribution of reach across platforms
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {channelPerformance.map((channel) => (
                <div key={channel.platform} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white/80">
                      {channel.platform}
                    </span>
                    <span className="text-sm font-semibold text-white/90">
                      {channel.value}%
                    </span>
                  </div>
                  <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${channel.value}%` }}
                      transition={{ duration: 1, delay: 0.6, ease: "easeOut" }}
                      className={cn(
                        "h-full rounded-full",
                        channel.color
                      )}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Mini Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {miniCards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.6 + index * 0.08 }}
          >
            <Card className="glass-card p-4 rounded-2xl border-white/[0.08]">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center",
                    card.bg
                  )}
                >
                  <card.icon className={cn("w-5 h-5", card.color)} />
                </div>
                <div>
                  <p className="text-xs text-white/50 font-medium">
                    {card.title}
                  </p>
                  <p className="text-xl font-bold text-white tabular-nums">
                    {card.value}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
