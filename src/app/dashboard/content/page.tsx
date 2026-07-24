"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, FileText, CalendarClock, TrendingUp, Send, Edit, Trash2, Heart,
  MessageCircle, Share2, Instagram, Facebook, Linkedin, Twitter, Mail,
  MessageSquare, Video, LayoutGrid, List, Camera, Layers, AlertCircle, RefreshCw,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useContent, useContentMutations } from "@/hooks/use-content";
import type { ContentItem } from "@/types";
import { formatNumber, formatDate } from "@/lib/utils";

const platformMeta: Record<ContentItem["platform"], { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  instagram: { icon: Instagram, label: "Instagram" },
  facebook: { icon: Facebook, label: "Facebook" },
  linkedin: { icon: Linkedin, label: "LinkedIn" },
  twitter: { icon: Twitter, label: "Twitter" },
  email: { icon: Mail, label: "Email" },
  whatsapp: { icon: MessageSquare, label: "WhatsApp" },
  telegram: { icon: Send, label: "Telegram" },
};

const typeMeta: Record<ContentItem["type"], { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  post: { icon: FileText, label: "Post" },
  reel: { icon: Video, label: "Reel" },
  story: { icon: Camera, label: "Story" },
  carousel: { icon: Layers, label: "Carousel" },
  email: { icon: Mail, label: "Email" },
};

const typeVariant: Record<ContentItem["type"], "info" | "pink" | "purple" | "warning"> = {
  post: "info", reel: "pink", story: "purple", carousel: "info", email: "warning",
};

const statusVariant: Record<ContentItem["status"], "secondary" | "info" | "success"> = {
  draft: "secondary", scheduled: "info", published: "success",
};

type FilterKey = "all" | "draft" | "scheduled" | "published";

const filters: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" }, { key: "draft", label: "Draft" }, { key: "scheduled", label: "Scheduled" }, { key: "published", label: "Published" },
];

const contentTypeOptions = [
  { type: "post" as const, icon: FileText, label: "Post", color: "text-sky-400" },
  { type: "reel" as const, icon: Video, label: "Reel", color: "text-pink-400" },
  { type: "story" as const, icon: Camera, label: "Story", color: "text-purple-400" },
  { type: "carousel" as const, icon: Layers, label: "Carousel", color: "text-cyan-400" },
  { type: "email" as const, icon: Mail, label: "Email", color: "text-orange-400" },
];

export default function ContentPage() {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  const { content, total, loading, error, refetch } = useContent({
    status: filter === "all" ? undefined : filter,
  });
  const { createContent, updateContent, deleteContent, loading: mutating } = useContentMutations();

  const filteredItems = content;

  const stats = useMemo(() => {
    const scheduled = content.filter((i) => i.status === "scheduled").length;
    const published = content.filter((i) => i.status === "published").length;
    return { total, scheduled, published, avgEngagement: "12" };
  }, [content, total]);

  const statCards = [
    { label: "Total Posts", value: stats.total, icon: FileText, color: "text-sky-400", bg: "bg-sky-400/10" },
    { label: "Scheduled", value: stats.scheduled, icon: CalendarClock, color: "text-amber-400", bg: "bg-amber-400/10" },
    { label: "Published", value: stats.published, icon: Send, color: "text-emerald-400", bg: "bg-emerald-400/10" },
    { label: "Avg Engagement Rate", value: `${stats.avgEngagement}%`, icon: TrendingUp, color: "text-violet-400", bg: "bg-violet-400/10" },
  ];

  async function handleCreate(data: any) {
    await createContent(data);
    setCreateDialogOpen(false);
    refetch();
  }

  async function handleDelete(id: string) {
    await deleteContent(id);
    refetch();
  }

  async function handleStatusChange(id: string, status: ContentItem["status"]) {
    await updateContent(id, { status } as any);
    refetch();
  }

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-normal tracking-[-0.03em] text-white">Content Hub</h1>
          <p className="text-sm text-white/40 font-light">Manage and schedule your social media content</p>
        </div>
        <Button className="liquid-glass rounded-full gap-2" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4" />Create New
        </Button>
      </motion.div>

      <div className="flex items-center justify-between gap-4">
        <div className="inline-flex h-10 items-center justify-center rounded-xl bg-white/[0.03] border border-white/[0.06] p-1">
          {filters.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${filter === f.key ? "bg-white/[0.08] text-white shadow-sm" : "text-white/50 hover:text-white/80"}`}>{f.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-white/[0.03] border border-white/[0.06] p-1">
          <button onClick={() => setViewMode("grid")} className={`inline-flex items-center justify-center rounded-md p-1.5 transition-all ${viewMode === "grid" ? "bg-white/[0.08] text-white" : "text-white/40 hover:text-white/70"}`}><LayoutGrid className="h-4 w-4" /></button>
          <button onClick={() => setViewMode("table")} className={`inline-flex items-center justify-center rounded-md p-1.5 transition-all ${viewMode === "table" ? "bg-white/[0.08] text-white" : "text-white/40 hover:text-white/70"}`}><List className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 + 0.15, duration: 0.3 }}>
            <Card className="glass-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-white/40 font-medium uppercase tracking-wider">{stat.label}</span>
                  <div className={`${stat.bg} rounded-lg p-1.5`}><stat.icon className={`h-3.5 w-3.5 ${stat.color}`} /></div>
                </div>
                <span className="text-2xl font-bold">{loading ? <Skeleton className="h-7 w-12" /> : stat.value}</span>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {error && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-red-400" /><span className="text-sm text-red-400">{error}</span></div>
          <Button variant="ghost" size="sm" onClick={refetch} className="gap-1"><RefreshCw className="w-3.5 h-3.5" />Retry</Button>
        </div>
      )}

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="glass-card"><CardContent className="p-5 space-y-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-16 w-full" /><Skeleton className="h-3 w-20" /><Skeleton className="h-5 w-16 rounded-full" /></CardContent></Card>
            ))
          ) : filteredItems.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-white/30">
              <FileText className="h-12 w-12 mb-3" /><p className="text-sm">No content items yet. Create your first!</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredItems.map((item, i) => {
                const PlatformIcon = platformMeta[item.platform]?.icon ?? Mail;
                const TypeIcon = typeMeta[item.type].icon;
                return (
                  <motion.div key={item.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: Math.min(i * 0.05, 0.3), duration: 0.3 }}>
                    <Card className="glass-card h-full flex flex-col">
                      <CardContent className="p-5 flex flex-col flex-1 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5"><PlatformIcon className="h-3.5 w-3.5 text-white/50" /><span className="text-xs text-white/40">{platformMeta[item.platform]?.label ?? item.platform}</span></div>
                          <Badge variant={typeVariant[item.type]} className="text-[10px]"><TypeIcon className="h-3 w-3 mr-1" />{typeMeta[item.type].label}</Badge>
                        </div>
                        <h3 className="text-sm font-medium text-white line-clamp-2 leading-snug flex-1">{item.title}</h3>
                        <div className="flex items-center justify-between text-xs text-white/40 pt-2 border-t border-white/[0.06]">
                          <span>{item.author || "You"}</span>
                          <span>{item.date ? formatDate(item.date) : "-"}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="cursor-pointer"><Badge variant={statusVariant[item.status]}>{item.status.charAt(0).toUpperCase() + item.status.slice(1)}</Badge></button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-36">
                              {(["draft", "scheduled", "published"] as ContentItem["status"][]).map((s) => (
                                <DropdownMenuItem key={s} onClick={() => handleStatusChange(item.id, s)} disabled={item.status === s}>{s.charAt(0).toUpperCase() + s.slice(1)}</DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div className="flex items-center gap-1 pt-1">
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-white/40 hover:text-white/80"><Edit className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-white/40 hover:text-rose-400" onClick={() => handleDelete(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      ) : (
        <Card className="glass-card overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto"><div className="min-w-[900px]">
              <Table>
                <TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Platform</TableHead><TableHead>Author</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead className="w-20" /></TableRow></TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}><TableCell><Skeleton className="h-4 w-64" /></TableCell><TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell><TableCell><Skeleton className="h-4 w-20" /></TableCell><TableCell><Skeleton className="h-4 w-24" /></TableCell><TableCell><Skeleton className="h-4 w-20" /></TableCell><TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell><TableCell><Skeleton className="h-8 w-16" /></TableCell></TableRow>
                    ))
                  ) : filteredItems.length === 0 ? (
                    <TableRow><TableCell colSpan={7}><div className="flex flex-col items-center justify-center py-16"><FileText className="h-10 w-10 text-white/20 mb-2" /><p className="text-sm text-white/30">No content yet</p></div></TableCell></TableRow>
                  ) : (
                    <AnimatePresence>
                      {filteredItems.map((item, i) => {
                        const PlatformIcon = platformMeta[item.platform]?.icon ?? Mail;
                        const TypeIcon = typeMeta[item.type].icon;
                        return (
                          <motion.tr key={item.id} initial={{ opacity: 0, x: -15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -15 }} transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.25 }} className="border-b border-white/5 hover:bg-white/[0.03]">
                            <TableCell><span className="text-sm text-white line-clamp-1 max-w-[300px]">{item.title}</span></TableCell>
                            <TableCell><Badge variant={typeVariant[item.type]} className="text-[10px]"><TypeIcon className="h-3 w-3 mr-1" />{typeMeta[item.type].label}</Badge></TableCell>
                            <TableCell><div className="flex items-center gap-1.5 text-sm text-white/60"><PlatformIcon className="h-3.5 w-3.5" />{platformMeta[item.platform]?.label ?? item.platform}</div></TableCell>
                            <TableCell className="text-sm text-white/60">{item.author || "You"}</TableCell>
                            <TableCell className="text-sm text-white/50">{item.date ? formatDate(item.date) : "-"}</TableCell>
                            <TableCell><Badge variant={statusVariant[item.status]}>{item.status.charAt(0).toUpperCase() + item.status.slice(1)}</Badge></TableCell>
                            <TableCell><div className="flex items-center gap-0.5"><Button variant="ghost" size="icon" className="h-8 w-8 text-white/40 hover:text-white/80"><Edit className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-white/40 hover:text-rose-400" onClick={() => handleDelete(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div></TableCell>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  )}
                </TableBody>
              </Table>
            </div></div>
          </CardContent>
        </Card>
      )}

      <CreateDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} onCreate={handleCreate} loading={mutating} />
    </div>
  );
}

function CreateDialog({ open, onOpenChange, onCreate, loading }: { open: boolean; onOpenChange: (v: boolean) => void; onCreate: (d: any) => void; loading: boolean }) {
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<ContentItem["type"]>("post");
  const [platform, setPlatform] = useState<ContentItem["platform"]>("instagram");
  const [author, setAuthor] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Create New Content</DialogTitle><DialogDescription>Fill in the details for your content.</DialogDescription></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); onCreate({ title, type: contentType, platform, author, status: "draft" }); }} className="space-y-3">
          <div className="space-y-1.5"><Label className="text-sm font-light text-white/60">Title *</Label><Input placeholder="Content title" value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-sm font-light text-white/60">Type</Label><Select value={contentType} onValueChange={(v) => setContentType(v as ContentItem["type"])}><SelectTrigger className="h-10"><SelectValue /></SelectTrigger><SelectContent>{contentTypeOptions.map((o) => <SelectItem key={o.type} value={o.type}><o.icon className={`h-3.5 w-3.5 ${o.color} mr-1.5 inline`} />{o.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label className="text-sm font-light text-white/60">Platform</Label><Select value={platform} onValueChange={(v) => setPlatform(v as ContentItem["platform"])}><SelectTrigger className="h-10"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(platformMeta).map(([k, v]) => <SelectItem key={k} value={k}><v.icon className="h-3.5 w-3.5 mr-1.5 inline" />{v.label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className="space-y-1.5"><Label className="text-sm font-light text-white/60">Author</Label><Input placeholder="Author name" value={author} onChange={(e) => setAuthor(e.target.value)} /></div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-full">Cancel</Button>
            <Button type="submit" variant="primary" disabled={loading || !title.trim()} className="rounded-full gap-2">{loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}Create</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
