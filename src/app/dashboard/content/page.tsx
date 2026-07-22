"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  FileText,
  CalendarClock,
  TrendingUp,
  Send,
  Edit,
  Trash2,
  Heart,
  MessageCircle,
  Share2,
  Instagram,
  Facebook,
  Linkedin,
  Twitter,
  Mail,
  MessageSquare,
  Image,
  Video,
  LayoutGrid,
  List,
  Camera,
  Layers,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { contentItems } from "@/lib/data";
import type { ContentItem } from "@/types";
import { formatNumber, formatDate } from "@/lib/utils";

const platformMeta: Record<
  ContentItem["platform"],
  { icon: React.ComponentType<{ className?: string }>; label: string }
> = {
  instagram: { icon: Instagram, label: "Instagram" },
  facebook: { icon: Facebook, label: "Facebook" },
  linkedin: { icon: Linkedin, label: "LinkedIn" },
  twitter: { icon: Twitter, label: "Twitter" },
  email: { icon: Mail, label: "Email" },
  whatsapp: { icon: MessageSquare, label: "WhatsApp" },
  telegram: { icon: Send, label: "Telegram" },
};

const typeMeta: Record<
  ContentItem["type"],
  { icon: React.ComponentType<{ className?: string }>; label: string; variant: "info" | "pink" | "purple" | "info" | "warning" }
> = {
  post: { icon: FileText, label: "Post", variant: "info" },
  reel: { icon: Video, label: "Reel", variant: "pink" },
  story: { icon: Camera, label: "Story", variant: "purple" },
  carousel: { icon: Layers, label: "Carousel", variant: "info" },
  email: { icon: Mail, label: "Email", variant: "warning" },
};

const typeVariant: Record<ContentItem["type"], "info" | "pink" | "purple" | "warning"> = {
  post: "info",
  reel: "pink",
  story: "purple",
  carousel: "info",
  email: "warning",
};

const statusVariant: Record<ContentItem["status"], "secondary" | "info" | "success"> = {
  draft: "secondary",
  scheduled: "info",
  published: "success",
};

type FilterKey = "all" | "draft" | "scheduled" | "published";

const filters: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
];

const contentTypeOptions: { type: ContentItem["type"]; icon: React.ComponentType<{ className?: string }>; label: string; color: string }[] = [
  { type: "post", icon: FileText, label: "Post", color: "text-sky-400" },
  { type: "reel", icon: Video, label: "Reel", color: "text-pink-400" },
  { type: "story", icon: Camera, label: "Story", color: "text-purple-400" },
  { type: "carousel", icon: Layers, label: "Carousel", color: "text-cyan-400" },
  { type: "email", icon: Mail, label: "Email", color: "text-orange-400" },
];

export default function ContentPage() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [items, setItems] = useState(contentItems);

  const filteredItems = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((item) => item.status === filter);
  }, [filter, items]);

  const stats = useMemo(() => {
    const total = items.length;
    const scheduled = items.filter((i) => i.status === "scheduled").length;
    const published = items.filter((i) => i.status === "published").length;
    const totalEngagement = items.reduce((acc, i) => {
      if (i.engagement) {
        return acc + i.engagement.likes + i.engagement.comments + i.engagement.shares;
      }
      return acc;
    }, 0);
    const publishedCount = published || 1;
    const avgEngagement = (totalEngagement / publishedCount).toFixed(0);

    return { total, scheduled, published, avgEngagement };
  }, [items]);

  const statCards = [
    { label: "Total Posts", value: stats.total, icon: FileText, color: "text-sky-400", bg: "bg-sky-400/10" },
    { label: "Scheduled", value: stats.scheduled, icon: CalendarClock, color: "text-amber-400", bg: "bg-amber-400/10" },
    { label: "Published This Month", value: stats.published, icon: Send, color: "text-emerald-400", bg: "bg-emerald-400/10" },
    { label: "Avg Engagement Rate", value: `${stats.avgEngagement}%`, icon: TrendingUp, color: "text-violet-400", bg: "bg-violet-400/10" },
  ];

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
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
            Content Hub
          </h1>
          <p className="text-sm text-white/40">
            Manage and schedule your social media content
          </p>
        </div>
        <Button
          variant="glass"
          size="sm"
          className="shrink-0 gap-2"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Create New
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="flex items-center justify-between gap-4"
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
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-white/[0.03] border border-white/10 p-1">
          <button
            onClick={() => setViewMode("grid")}
            className={`inline-flex items-center justify-center rounded-md p-1.5 transition-all ${
              viewMode === "grid" ? "bg-white/[0.08] text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={`inline-flex items-center justify-center rounded-md p-1.5 transition-all ${
              viewMode === "table" ? "bg-white/[0.08] text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 + 0.15, duration: 0.3 }}
          >
            <Card className="glass-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-white/40 font-medium uppercase tracking-wider">
                    {stat.label}
                  </span>
                  <div className={`${stat.bg} rounded-lg p-1.5`}>
                    <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{stat.value}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredItems.map((item, i) => {
              const PlatformIcon = platformMeta[item.platform]?.icon ?? Mail;
              const TypeIcon = typeMeta[item.type].icon;

              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                >
                  <Card className="glass-card h-full flex flex-col">
                    <CardContent className="p-5 flex flex-col flex-1 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <PlatformIcon className="h-3.5 w-3.5 text-white/50" />
                          <span className="text-xs text-white/40">
                            {platformMeta[item.platform]?.label ?? item.platform}
                          </span>
                        </div>
                        <Badge variant={typeVariant[item.type]} className="text-[10px]">
                          <TypeIcon className="h-3 w-3 mr-1" />
                          {typeMeta[item.type].label}
                        </Badge>
                      </div>

                      <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug flex-1">
                        {item.title}
                      </h3>

                      <div className="flex items-center justify-between text-xs text-white/40 pt-2 border-t border-white/[0.06]">
                        <span>{item.author}</span>
                        <span>{formatDate(item.date)}</span>
                      </div>

                      <div className="flex items-center justify-between">
                        <Badge variant={statusVariant[item.status]}>
                          {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                        </Badge>
                        {item.engagement && (
                          <div className="flex items-center gap-3 text-xs text-white/40">
                            <span className="flex items-center gap-1">
                              <Heart className="h-3 w-3 text-rose-400" />
                              {formatNumber(item.engagement.likes)}
                            </span>
                            <span className="flex items-center gap-1">
                              <MessageCircle className="h-3 w-3 text-sky-400" />
                              {formatNumber(item.engagement.comments)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Share2 className="h-3 w-3 text-emerald-400" />
                              {formatNumber(item.engagement.shares)}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-white/40 hover:text-white/80"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-white/40 hover:text-rose-400"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {filteredItems.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-white/30">
              <FileText className="h-12 w-12 mb-3" />
              <p className="text-sm">No content items found</p>
            </div>
          )}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <Card className="glass-card overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <div className="min-w-[900px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Platform</TableHead>
                        <TableHead>Author</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Engagement</TableHead>
                        <TableHead className="w-20" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <AnimatePresence>
                        {filteredItems.map((item, i) => {
                          const PlatformIcon = platformMeta[item.platform]?.icon ?? Mail;
                          const TypeIcon = typeMeta[item.type].icon;

                          return (
                            <motion.tr
                              key={item.id}
                              initial={{ opacity: 0, x: -15 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: -15 }}
                              transition={{ delay: i * 0.04, duration: 0.25 }}
                              className="border-b border-white/5 transition-colors hover:bg-white/[0.03]"
                            >
                              <TableCell>
                                <span className="text-sm text-white line-clamp-1 max-w-[300px]">
                                  {item.title}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge variant={typeVariant[item.type]} className="text-[10px]">
                                  <TypeIcon className="h-3 w-3 mr-1" />
                                  {typeMeta[item.type].label}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5 text-sm text-white/60">
                                  <PlatformIcon className="h-3.5 w-3.5" />
                                  {platformMeta[item.platform]?.label ?? item.platform}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-white/60">
                                {item.author}
                              </TableCell>
                              <TableCell className="text-sm text-white/50">
                                {formatDate(item.date)}
                              </TableCell>
                              <TableCell>
                                <Badge variant={statusVariant[item.status]}>
                                  {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {item.engagement ? (
                                  <div className="flex items-center gap-3 text-xs text-white/50">
                                    <span className="flex items-center gap-1">
                                      <Heart className="h-3 w-3 text-rose-400" />
                                      {formatNumber(item.engagement.likes)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <MessageCircle className="h-3 w-3 text-sky-400" />
                                      {formatNumber(item.engagement.comments)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Share2 className="h-3 w-3 text-emerald-400" />
                                      {formatNumber(item.engagement.shares)}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-white/30">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-0.5">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-white/40 hover:text-white/80"
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-white/40 hover:text-rose-400"
                                    onClick={() => handleDelete(item.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                    </TableBody>
                  </Table>
                </div>
              </div>
              {filteredItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-white/30">
                  <FileText className="h-12 w-12 mb-3" />
                  <p className="text-sm">No content items found</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between pt-3">
            <p className="text-xs text-white/30">
              Showing {filteredItems.length} of {items.length} items
            </p>
          </div>
        </motion.div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Content</DialogTitle>
            <DialogDescription>
              Select a content type to get started.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 pt-2">
            {contentTypeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.type}
                  onClick={() => setDialogOpen(false)}
                  className="flex items-center gap-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-left transition-all hover:bg-white/[0.05] hover:border-white/[0.15]"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06]">
                    <Icon className={`h-5 w-5 ${option.color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{option.label}</p>
                    <p className="text-xs text-white/40">Create a new {option.label.toLowerCase()}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
