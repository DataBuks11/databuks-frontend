"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Filter, MoreHorizontal, Eye, MessageSquare, Pencil, Archive,
  TrendingUp, TrendingDown, UserCheck, CheckCircle2, Users, Star,
  MapPin, Mail, Phone, Calendar, Clock, MessageCircle, ArrowUpRight,
  BellRing, Plus, Trash2, AlertCircle, RefreshCw,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { useLeads, useLeadMutations } from "@/hooks/use-leads";
import type { Lead } from "@/types";

const statusVariant: Record<Lead["status"], "info" | "secondary" | "success" | "warning" | "purple" | "destructive"> = {
  new: "info", contacted: "secondary", qualified: "success", nurturing: "warning", converted: "purple", lost: "destructive",
};

const industries = ["SaaS", "FinTech", "Healthcare", "E-commerce", "Real Estate", "Legal", "Education", "Manufacturing", "Logistics", "Marketing"];

function getScoreColor(score: number) { return score >= 91 ? "bg-emerald-400" : score >= 71 ? "bg-blue-400" : score >= 41 ? "bg-amber-400" : "bg-red-400"; }
function getScoreBg(score: number) { return score >= 91 ? "bg-emerald-400/10" : score >= 71 ? "bg-blue-400/10" : score >= 41 ? "bg-amber-400/10" : "bg-red-400/10"; }
function getScoreTextColor(score: number) { return score >= 91 ? "text-emerald-400" : score >= 71 ? "text-blue-400" : score >= 41 ? "text-amber-400" : "text-red-400"; }
function getInitials(name: string) { return name.split(" ").map((n) => n[0]).join("").toUpperCase(); }
function getAvatarGradient(name: string) {
  const gradients = ["from-blue-500/30 to-cyan-500/30", "from-violet-500/30 to-purple-500/30", "from-emerald-500/30 to-teal-500/30", "from-amber-500/30 to-orange-500/30", "from-pink-500/30 to-rose-500/30", "from-sky-500/30 to-indigo-500/30"];
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

const timelineSteps = [
  { action: "Lead created", icon: UserCheck, color: "text-sky-400", bg: "bg-sky-400/10" },
  { action: "Initial outreach sent", icon: MessageSquare, color: "text-blue-400", bg: "bg-blue-400/10" },
  { action: "Lead responded", icon: MessageCircle, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  { action: "Demo scheduled", icon: Calendar, color: "text-violet-400", bg: "bg-violet-400/10" },
  { action: "Proposal sent", icon: ArrowUpRight, color: "text-amber-400", bg: "bg-amber-400/10" },
];

export default function LeadsPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { leads, total, totalPages, loading, error, refetch } = useLeads({
    search: debouncedSearch,
    status: statusFilter === "all" ? undefined : statusFilter,
    industry: industryFilter === "all" ? undefined : industryFilter,
    page,
    limit: 10,
  });

  const { createLead, updateLead, deleteLead, loading: mutating } = useLeadMutations();

  const stats = useMemo(() => {
    const qualified = leads.filter((l) => l.status === "qualified").length;
    const converted = leads.filter((l) => l.status === "converted").length;
    const avgScore = leads.length > 0 ? Math.round(leads.reduce((acc, l) => acc + l.leadScore, 0) / leads.length) : 0;
    return { qualified, converted, avgScore };
  }, [leads]);

  const statCards = [
    { label: "Total Leads", value: total, icon: Users, trend: "up", change: "this period", color: "text-sky-400", bg: "bg-sky-400/10" },
    { label: "Qualified", value: stats.qualified, icon: Star, trend: "up", change: "this period", color: "text-emerald-400", bg: "bg-emerald-400/10" },
    { label: "Converted", value: stats.converted, icon: CheckCircle2, trend: "up", change: "this period", color: "text-violet-400", bg: "bg-violet-400/10" },
    { label: "Avg Lead Score", value: stats.avgScore, icon: TrendingUp, trend: "up", change: "this period", color: "text-amber-400", bg: "bg-amber-400/10" },
  ];

  async function handleCreate(data: any) {
    await createLead(data);
    setCreateDialogOpen(false);
    refetch();
  }

  async function handleUpdate(id: string, updates: Partial<Lead>) {
    await updateLead(id, updates);
    refetch();
    setEditDialogOpen(false);
    setEditLead(null);
  }

  async function handleDelete(id: string) {
    await deleteLead(id);
    setDeleteConfirm(null);
    if (selectedLead?.id === id) { setSelectedLead(null); setDialogOpen(false); }
    refetch();
  }

  async function handleStatusChange(id: string, status: Lead["status"]) {
    await updateLead(id, { status });
    refetch();
    if (selectedLead?.id === id) setSelectedLead((prev) => prev ? { ...prev, status } : null);
  }

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-normal tracking-[-0.03em] text-white">Lead Engine</h1>
            <p className="text-sm text-white/40 font-light mt-1">Track, qualify, and convert your leads</p>
          </div>
          <Button className="liquid-glass rounded-full gap-2" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4" />Add Lead
          </Button>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.3 }}>
            <Card className="glass-card">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-white/40 font-medium uppercase tracking-wider">{stat.label}</span>
                  <div className={`${stat.bg} rounded-lg p-1.5`}><stat.icon className={`h-3.5 w-3.5 ${stat.color}`} /></div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{loading ? <Skeleton className="h-7 w-12" /> : stat.value}</span>
                  <span className="flex items-center gap-0.5 text-xs text-emerald-400">
                    <TrendingUp className="h-3 w-3" />{stat.change}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.3 }}>
        <Card className="glass-card overflow-hidden">
          <CardContent className="p-5 space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <Input placeholder="Search leads..." className="pl-10" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-white/30" />
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {["new", "contacted", "qualified", "nurturing", "converted", "lost"].map((s) => (
                        <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Select value={industryFilter} onValueChange={(v) => { setIndustryFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue placeholder="Industry" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Industries</SelectItem>
                    {industries.map((ind) => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && (
              <div className="flex items-center justify-between p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span className="text-sm text-red-400">{error}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={refetch} className="gap-1"><RefreshCw className="w-3.5 h-3.5" />Retry</Button>
              </div>
            )}

            <div className="overflow-x-auto -mx-5">
              <div className="min-w-[1100px] px-5">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Industry</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Lead Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Last Contact</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-4 w-24" /></div></TableCell>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-8 w-8 rounded-lg" /></TableCell>
                        </TableRow>
                      ))
                    ) : leads.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10}>
                          <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-16 h-16 rounded-full bg-white/[0.03] flex items-center justify-center mb-4">
                              <Users className="w-6 h-6 text-white/20" />
                            </div>
                            <h3 className="text-base font-medium text-white/60 mb-1">No leads found</h3>
                            <p className="text-sm text-white/30 font-light mb-4 max-w-sm">
                              {search || statusFilter !== "all" || industryFilter !== "all"
                                ? "No leads match your filters. Try adjusting your search."
                                : "Start building your pipeline by adding your first lead."}
                            </p>
                            <Button className="liquid-glass rounded-full gap-2" onClick={() => setCreateDialogOpen(true)}>
                              <Plus className="w-4 h-4" />Add Lead
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <AnimatePresence>
                        {leads.map((lead, i) => (
                          <motion.tr
                            key={lead.id}
                            initial={{ opacity: 0, x: -15 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -15 }}
                            transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.25 }}
                            className="border-b border-white/5 transition-colors hover:bg-white/[0.03]"
                          >
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarGradient(lead.name)} border border-white/10`}>
                                  <span className="text-xs font-bold text-white/80">{getInitials(lead.name)}</span>
                                </div>
                                <span className="font-medium text-sm text-white">{lead.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-white/70">{lead.company || "Not provided"}</TableCell>
                            <TableCell>
                              {lead.industry ? <Badge variant="outline" className="text-[10px]">{lead.industry}</Badge> : <span className="text-xs text-white/30">-</span>}
                            </TableCell>
                            <TableCell className="text-sm text-white/60">{lead.email || "Not provided"}</TableCell>
                            <TableCell className="text-sm text-white/60">{lead.phone || "Not provided"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 min-w-[100px]">
                                <div className="h-1.5 flex-1 rounded-full bg-white/[0.06] overflow-hidden">
                                  <div className={`h-full rounded-full transition-all duration-500 ${getScoreColor(lead.leadScore)}`} style={{ width: `${lead.leadScore}%` }} />
                                </div>
                                <span className={`text-xs font-bold ${getScoreTextColor(lead.leadScore)}`}>{lead.leadScore > 0 ? lead.leadScore : "Not scored"}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="cursor-pointer">
                                    <Badge variant={statusVariant[lead.status]}>
                                      {lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}
                                    </Badge>
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-36">
                                  {(["new", "contacted", "qualified", "nurturing", "converted", "lost"] as Lead["status"][]).map((s) => (
                                    <DropdownMenuItem key={s} onClick={() => handleStatusChange(lead.id, s)} disabled={lead.status === s || mutating}>
                                      {s.charAt(0).toUpperCase() + s.slice(1)}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5 text-xs text-white/50">
                                <MapPin className="h-3 w-3" />{lead.location || "Not available"}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-white/40">{lead.lastContact ? new Date(lead.lastContact).toLocaleDateString() : "-"}</TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4 text-white/40" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                  <DropdownMenuItem onClick={() => { setSelectedLead(lead); setDialogOpen(true); }}>
                                    <Eye className="h-4 w-4 mr-2" />View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setEditLead(lead); setEditDialogOpen(true); }}>
                                    <Pencil className="h-4 w-4 mr-2" />Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-rose-400" onClick={() => setDeleteConfirm(lead.id)}>
                                    <Trash2 className="h-4 w-4 mr-2" />Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-white/30">Showing {leads.length} of {total} leads</p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
                  const p = i + 1;
                  return (
                    <Button key={p} variant={p === page ? "default" : "outline"} size="sm" className="h-8" onClick={() => setPage(p)}>{p}</Button>
                  );
                })}
                {totalPages > 5 && <span className="text-xs text-white/30 px-1">...</span>}
                <Button variant="outline" size="sm" className="h-8" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Detail Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          {selectedLead && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarGradient(selectedLead.name)} border border-white/10`}>
                    <span className="text-sm font-bold text-white/80">{getInitials(selectedLead.name)}</span>
                  </div>
                  <div>
                    <DialogTitle className="text-lg">{selectedLead.name}</DialogTitle>
                    <DialogDescription className="flex items-center gap-2 mt-0.5">
                      {selectedLead.company}
                      <Badge variant={statusVariant[selectedLead.status]}>{selectedLead.status.charAt(0).toUpperCase() + selectedLead.status.slice(1)}</Badge>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                    <span className="text-xs text-white/30 block mb-1">Email</span>
                    <span className="text-sm text-white/70 flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-white/40" />{selectedLead.email || "Not provided"}</span>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                    <span className="text-xs text-white/30 block mb-1">Phone</span>
                    <span className="text-sm text-white/70 flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-white/40" />{selectedLead.phone || "Not provided"}</span>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                    <span className="text-xs text-white/30 block mb-1">Industry</span>
                    {selectedLead.industry ? <Badge variant="outline">{selectedLead.industry}</Badge> : <span className="text-sm text-white/40">-</span>}
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                    <span className="text-xs text-white/30 block mb-1">Location</span>
                    <span className="text-sm text-white/70 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-white/40" />{selectedLead.location || "Not available"}</span>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                    <span className="text-xs text-white/30 block mb-1">Created</span>
                    <span className="text-sm text-white/70 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-white/40" />{selectedLead.created_at ? new Date(selectedLead.created_at).toLocaleDateString() : "-"}</span>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                    <span className="text-xs text-white/30 block mb-1">Lead Score</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${getScoreTextColor(selectedLead.leadScore)}`}>{selectedLead.leadScore > 0 ? selectedLead.leadScore : "Not scored"}</span>
                      <div className="h-2 flex-1 rounded-full bg-white/[0.06] overflow-hidden max-w-[80px]">
                        <div className={`h-full rounded-full ${getScoreColor(selectedLead.leadScore)}`} style={{ width: `${selectedLead.leadScore}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
                <Separator className="bg-white/[0.06]" />
                <div>
                  <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-white/40" />Interaction Timeline</h4>
                  <div className="space-y-0">
                    {timelineSteps.map((step, i) => (
                      <div key={step.action} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${step.bg}`}><step.icon className={`h-4 w-4 ${step.color}`} /></div>
                          {i < timelineSteps.length - 1 && <div className="w-px flex-1 bg-white/[0.06] my-1" />}
                        </div>
                        <div className="pb-4">
                          <p className="text-sm text-white/80 font-medium">{step.action}</p>
                          <p className="text-xs text-white/40 mt-0.5">{i === 0 && selectedLead.created_at ? new Date(selectedLead.created_at).toLocaleDateString() : `Jan ${15 + i * 2}, 2025`}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {selectedLead.notes && (
                  <>
                    <Separator className="bg-white/[0.06]" />
                    <div>
                      <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><Pencil className="h-4 w-4 text-white/40" />Notes</h4>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-4">
                        <p className="text-sm text-white/60 leading-relaxed">{selectedLead.notes}</p>
                      </div>
                    </div>
                  </>
                )}
                <Separator className="bg-white/[0.06]" />
                <div className="flex items-center gap-3">
                  <Button size="sm" variant="primary" className="gap-2 rounded-full"><MessageSquare className="h-4 w-4" />Send Message</Button>
                  <Button variant="outline" size="sm" className="gap-2 rounded-full"><Calendar className="h-4 w-4" />Schedule Meeting</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Lead Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add New Lead</DialogTitle><DialogDescription>Enter the lead details below.</DialogDescription></DialogHeader>
          <LeadForm
            onSubmit={handleCreate}
            onCancel={() => setCreateDialogOpen(false)}
            loading={mutating}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Lead Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Lead</DialogTitle><DialogDescription>Update the lead information.</DialogDescription></DialogHeader>
          {editLead && (
            <LeadForm
              initial={editLead}
              onSubmit={(data) => handleUpdate(editLead.id, data)}
              onCancel={() => { setEditDialogOpen(false); setEditLead(null); }}
              loading={mutating}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-400"><Trash2 className="w-5 h-5" />Delete Lead</DialogTitle>
            <DialogDescription>Are you sure you want to delete this lead? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)} className="rounded-full">Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)} disabled={mutating} className="rounded-full gap-2">
              {mutating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LeadForm({ initial, onSubmit, onCancel, loading }: {
  initial?: Lead;
  onSubmit: (data: any) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [company, setCompany] = useState(initial?.company || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [industry, setIndustry] = useState(initial?.industry || "");
  const [location, setLocation] = useState(initial?.location || "");
  const [leadScore, setLeadScore] = useState(initial?.leadScore || 0);
  const [status, setStatus] = useState<Lead["status"]>(initial?.status || "new");
  const [notes, setNotes] = useState(initial?.notes || "");

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ name, company, email, phone, industry, location, leadScore, status, notes }); }} className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-sm font-light text-white/60">Name *</Label>
        <Input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-sm font-light text-white/60">Company</Label>
          <Input placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-light text-white/60">Industry</Label>
          <Select value={industry || "none"} onValueChange={(v) => setIndustry(v === "none" ? "" : v)}>
            <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">-</SelectItem>
              {industries.map((ind) => <SelectItem key={ind} value={ind}>{ind}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-sm font-light text-white/60">Email</Label>
          <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-light text-white/60">Phone</Label>
          <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-sm font-light text-white/60">Location</Label>
          <Input placeholder="City, State" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm font-light text-white/60">Lead Score</Label>
          <Input type="number" min={0} max={100} value={leadScore} onChange={(e) => setLeadScore(Number(e.target.value))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-light text-white/60">Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as Lead["status"])}>
          <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["new", "contacted", "qualified", "nurturing", "converted", "lost"] as Lead["status"][]).map((s) => (
              <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-sm font-light text-white/60">Notes</Label>
        <textarea className="w-full h-20 rounded-xl bg-white/[0.02] border border-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:bg-white/[0.04] transition-all resize-none" placeholder="Add notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} className="rounded-full">Cancel</Button>
        <Button type="submit" variant="primary" disabled={loading || !name.trim()} className="rounded-full gap-2">
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
          {initial ? "Save Changes" : "Create Lead"}
        </Button>
      </div>
    </form>
  );
}
