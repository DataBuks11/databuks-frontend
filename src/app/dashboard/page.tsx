"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  FileText,
  MessageSquare,
  Calendar,
  DollarSign,
  TrendingUp,
  Target,
  Zap,
  UserPlus,
  CheckCircle2,
  BellRing,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/charts/stat-card";
import { ChartArea } from "@/components/charts/area-chart";
import { ChartBar } from "@/components/charts/bar-chart";
import { dashboardStats, chartData } from "@/lib/data";
import { createClient } from "@/lib/supabase/client";

const stats = [
  {
    title: "Total Leads",
    value: dashboardStats.totalLeads,
    change: `+${dashboardStats.leadsGrowth}%`,
    icon: Users,
    trend: "up" as const,
  },
  {
    title: "Content Published",
    value: dashboardStats.contentPublished,
    change: `+${dashboardStats.contentGrowth}%`,
    icon: FileText,
    trend: "up" as const,
  },
  {
    title: "Active Conversations",
    value: dashboardStats.conversationsActive,
    change: `${dashboardStats.conversationsGrowth}%`,
    icon: MessageSquare,
    trend: "down" as const,
  },
  {
    title: "Meetings Booked",
    value: dashboardStats.meetingsBooked,
    change: `+${dashboardStats.meetingsGrowth}%`,
    icon: Calendar,
    trend: "up" as const,
  },
  {
    title: "Revenue",
    value: `$${(dashboardStats.revenue / 1000).toFixed(1)}K`,
    change: `+${dashboardStats.revenueGrowth}%`,
    icon: DollarSign,
    trend: "up" as const,
  },
  {
    title: "Response Rate",
    value: `${dashboardStats.responseRate}%`,
    change: `+${dashboardStats.responseGrowth}%`,
    icon: TrendingUp,
    trend: "up" as const,
  },
];

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

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const name = data.user?.user_metadata?.full_name || data.user?.email?.split("@")[0] || "";
      setUserName(name);
    });
  }, []);

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
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

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <StatCard
            key={stat.title}
            title={stat.title}
            value={stat.value}
            change={stat.change}
            icon={stat.icon}
            trend={stat.trend}
          />
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Weekly Lead Generation</CardTitle>
            <p className="text-sm text-white/40 mt-1">
              New qualified leads per day this week
            </p>
          </CardHeader>
          <CardContent>
            <ChartArea
              data={chartData.weekly.leads}
              dataKey="value"
              xKey="day"
              color="#3b82f6"
              gradientId="weekly-leads-gradient"
              height={280}
            />
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Monthly Revenue</CardTitle>
            <p className="text-sm text-white/40 mt-1">
              Revenue tracked across the last 12 months
            </p>
          </CardHeader>
          <CardContent>
            <ChartBar
              data={chartData.monthly.revenue.map((item) => ({
                month: item.month,
                value: item.value,
              }))}
              dataKey="value"
              xKey="month"
              color="#8b5cf6"
              height={280}
            />
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <p className="text-sm text-white/40 mt-1">
            Latest actions across your workspace
          </p>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-white/30 text-center py-8">No recent activity yet. Start by connecting your social accounts.</p>
        </CardContent>
      </Card>
    </div>
  );
}
