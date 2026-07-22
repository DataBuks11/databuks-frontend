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

const activities = [
  {
    id: 1,
    action: "New lead created",
    detail: "Sarah Mitchell — NexHealth Technologies",
    time: "2 minutes ago",
    icon: UserPlus,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-400/10",
  },
  {
    id: 2,
    action: "Content published",
    detail: "Carousel post on LinkedIn — 847 likes",
    time: "18 minutes ago",
    icon: FileText,
    iconColor: "text-blue-400",
    iconBg: "bg-blue-400/10",
  },
  {
    id: 3,
    action: "Meeting booked",
    detail: "Demo call with Priya Ramachandran — Thu 2PM",
    time: "1 hour ago",
    icon: Calendar,
    iconColor: "text-violet-400",
    iconBg: "bg-violet-400/10",
  },
  {
    id: 4,
    action: "Automation completed",
    detail: "LinkedIn Content Scheduler — 5 posts published",
    time: "2 hours ago",
    icon: Zap,
    iconColor: "text-amber-400",
    iconBg: "bg-amber-400/10",
  },
  {
    id: 5,
    action: "Lead converted",
    detail: "Marcus Webb — Sentinel Commerce Inc. ($48K/yr)",
    time: "4 hours ago",
    icon: CheckCircle2,
    iconColor: "text-emerald-400",
    iconBg: "bg-emerald-400/10",
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

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          {greeting}, <span className="gradient-text">Marcus</span>
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
          <div className="divide-y divide-white/5">
            {activities.map((activity, index) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.08 }}
                className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div
                  className={`w-9 h-9 rounded-full ${activity.iconBg} flex items-center justify-center shrink-0`}
                >
                  <activity.icon className={`w-4 h-4 ${activity.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{activity.action}</p>
                  <p className="text-sm text-white/50 truncate">
                    {activity.detail}
                  </p>
                </div>
                <span className="text-xs text-white/30 shrink-0">
                  {activity.time}
                </span>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
