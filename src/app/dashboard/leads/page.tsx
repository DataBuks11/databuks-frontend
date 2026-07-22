"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  MessageSquare,
  Pencil,
  Archive,
  TrendingUp,
  TrendingDown,
  UserCheck,
  CheckCircle2,
  DollarSign,
  MapPin,
  Mail,
  Phone,
  Calendar,
  Clock,
  MessageCircle,
  ArrowUpRight,
  ChevronDown,
  Users,
  BellRing,
  Star,
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
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { leads } from "@/lib/data";
import type { Lead } from "@/types";

const statusVariant: Record<Lead["status"], "info" | "secondary" | "success" | "warning" | "purple" | "destructive"> = {
  new: "info",
  contacted: "secondary",
  qualified: "success",
  nurturing: "warning",
  converted: "purple",
  lost: "destructive",
};

const allIndustries = Array.from(new Set(leads.map((l) => l.industry))).sort();

function getScoreColor(score: number): string {
  if (score >= 91) return "bg-emerald-400";
  if (score >= 71) return "bg-blue-400";
  if (score >= 41) return "bg-amber-400";
  return "bg-red-400";
}

function getScoreBg(score: number): string {
  if (score >= 91) return "bg-emerald-400/10";
  if (score >= 71) return "bg-blue-400/10";
  if (score >= 41) return "bg-amber-400/10";
  return "bg-red-400/10";
}

function getScoreTextColor(score: number): string {
  if (score >= 91) return "text-emerald-400";
  if (score >= 71) return "text-blue-400";
  if (score >= 41) return "text-amber-400";
  return "text-red-400";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function getAvatarGradient(name: string): string {
  const gradients = [
    "from-blue-500/30 to-cyan-500/30",
    "from-violet-500/30 to-purple-500/30",
    "from-emerald-500/30 to-teal-500/30",
    "from-amber-500/30 to-orange-500/30",
    "from-pink-500/30 to-rose-500/30",
    "from-sky-500/30 to-indigo-500/30",
  ];
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
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const matchesSearch =
        !search ||
        lead.name.toLowerCase().includes(search.toLowerCase()) ||
        lead.company.toLowerCase().includes(search.toLowerCase()) ||
        lead.email.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || lead.status === statusFilter;

      const matchesIndustry =
        industryFilter === "all" || lead.industry === industryFilter;

      return matchesSearch && matchesStatus && matchesIndustry;
    });
  }, [search, statusFilter, industryFilter]);

  const stats = useMemo(() => {
    const total = leads.length;
    const qualified = leads.filter(
      (l) => l.status === "qualified"
    ).length;
    const converted = leads.filter(
      (l) => l.status === "converted"
    ).length;
    const totalScore = leads.reduce((acc, l) => acc + l.leadScore, 0);

    return {
      total,
      qualified,
      converted,
      avgScore: Math.round(totalScore / total),
    };
  }, []);

  const statCards = [
    {
      label: "Total Leads",
      value: stats.total,
      icon: Users,
      trend: "up",
      change: "+12.5%",
      color: "text-sky-400",
      bg: "bg-sky-400/10",
    },
    {
      label: "Qualified",
      value: stats.qualified,
      icon: Star,
      trend: "up",
      change: "+8.3%",
      color: "text-emerald-400",
      bg: "bg-emerald-400/10",
    },
    {
      label: "Converted",
      value: stats.converted,
      icon: CheckCircle2,
      trend: "up",
      change: "+22.4%",
      color: "text-violet-400",
      bg: "bg-violet-400/10",
    },
    {
      label: "Avg Lead Score",
      value: stats.avgScore,
      icon: TrendingUp,
      trend: "up",
      change: "+5.1pts",
      color: "text-amber-400",
      bg: "bg-amber-400/10",
    },
  ];

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          Lead Engine
        </h1>
        <p className="text-sm text-white/40 mt-1">
          Track, qualify, and convert your leads
        </p>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.3 }}
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
                  <span className="flex items-center gap-0.5 text-xs text-emerald-400">
                    {stat.trend === "up" ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {stat.change}
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        <Card className="glass-card overflow-hidden">
          <CardContent className="p-5 space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <Input
                  placeholder="Search leads..."
                  className="pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-white/30" />
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px] h-9 text-xs">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="qualified">Qualified</SelectItem>
                      <SelectItem value="nurturing">Nurturing</SelectItem>
                      <SelectItem value="converted">Converted</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Select
                  value={industryFilter}
                  onValueChange={setIndustryFilter}
                >
                  <SelectTrigger className="w-[150px] h-9 text-xs">
                    <SelectValue placeholder="Industry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Industries</SelectItem>
                    {allIndustries.map((ind) => (
                      <SelectItem key={ind} value={ind}>
                        {ind}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

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
                    <AnimatePresence>
                      {filteredLeads.map((lead, i) => (
                        <motion.tr
                          key={lead.id}
                          initial={{ opacity: 0, x: -15 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -15 }}
                          transition={{
                            delay: i * 0.04,
                            duration: 0.25,
                          }}
                          className="border-b border-white/5 transition-colors hover:bg-white/[0.03]"
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarGradient(lead.name)} border border-white/10`}
                              >
                                <span className="text-xs font-bold text-white/80">
                                  {getInitials(lead.name)}
                                </span>
                              </div>
                              <span className="font-medium text-sm text-white">
                                {lead.name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-white/70">
                            {lead.company}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {lead.industry}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-white/60">
                            {lead.email}
                          </TableCell>
                          <TableCell className="text-sm text-white/60">
                            {lead.phone}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <div className="h-1.5 flex-1 rounded-full bg-white/[0.06] overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${getScoreColor(lead.leadScore)}`}
                                  style={{ width: `${lead.leadScore}%` }}
                                />
                              </div>
                              <span
                                className={`text-xs font-bold ${getScoreTextColor(lead.leadScore)}`}
                              >
                                {lead.leadScore}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant[lead.status]}>
                              {lead.status.charAt(0).toUpperCase() +
                                lead.status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-xs text-white/50">
                              <MapPin className="h-3 w-3" />
                              {lead.location}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-white/40">
                            {lead.lastContact}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                >
                                  <MoreHorizontal className="h-4 w-4 text-white/40" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setSelectedLead(lead);
                                    setDialogOpen(true);
                                  }}
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <MessageSquare className="h-4 w-4 mr-2" />
                                  Send Message
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-rose-400">
                                  <Archive className="h-4 w-4 mr-2" />
                                  Archive
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-white/30">
                Showing {filteredLeads.length} of {leads.length} leads
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled className="h-8">
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 bg-white/[0.05]"
                >
                  1
                </Button>
                <Button variant="outline" size="sm" className="h-8">
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          {selectedLead && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${getAvatarGradient(selectedLead.name)} border border-white/10`}
                  >
                    <span className="text-sm font-bold text-white/80">
                      {getInitials(selectedLead.name)}
                    </span>
                  </div>
                  <div>
                    <DialogTitle className="text-lg">
                      {selectedLead.name}
                    </DialogTitle>
                    <DialogDescription className="flex items-center gap-2 mt-0.5">
                      {selectedLead.company}
                      <Badge variant={statusVariant[selectedLead.status]}>
                        {selectedLead.status.charAt(0).toUpperCase() +
                          selectedLead.status.slice(1)}
                      </Badge>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                    <span className="text-xs text-white/30 block mb-1">
                      Email
                    </span>
                    <span className="text-sm text-white/70 flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-white/40" />
                      {selectedLead.email}
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                    <span className="text-xs text-white/30 block mb-1">
                      Phone
                    </span>
                    <span className="text-sm text-white/70 flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-white/40" />
                      {selectedLead.phone}
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                    <span className="text-xs text-white/30 block mb-1">
                      Industry
                    </span>
                    <Badge variant="outline">{selectedLead.industry}</Badge>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                    <span className="text-xs text-white/30 block mb-1">
                      Location
                    </span>
                    <span className="text-sm text-white/70 flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-white/40" />
                      {selectedLead.location}
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                    <span className="text-xs text-white/30 block mb-1">
                      Created
                    </span>
                    <span className="text-sm text-white/70 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-white/40" />
                      {selectedLead.createdAt}
                    </span>
                  </div>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-3">
                    <span className="text-xs text-white/30 block mb-1">
                      Lead Score
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-lg font-bold ${getScoreTextColor(selectedLead.leadScore)}`}
                      >
                        {selectedLead.leadScore}
                      </span>
                      <div className="h-2 flex-1 rounded-full bg-white/[0.06] overflow-hidden max-w-[80px]">
                        <div
                          className={`h-full rounded-full ${getScoreColor(selectedLead.leadScore)}`}
                          style={{
                            width: `${selectedLead.leadScore}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <Separator className="bg-white/[0.06]" />

                <div>
                  <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-white/40" />
                    Interaction Timeline
                  </h4>
                  <div className="space-y-0">
                    {timelineSteps.map((step, i) => (
                      <div key={step.action} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${step.bg}`}
                          >
                            <step.icon
                              className={`h-4 w-4 ${step.color}`}
                            />
                          </div>
                          {i < timelineSteps.length - 1 && (
                            <div className="w-px flex-1 bg-white/[0.06] my-1" />
                          )}
                        </div>
                        <div className="pb-4">
                          <p className="text-sm text-white/80 font-medium">
                            {step.action}
                          </p>
                          <p className="text-xs text-white/40 mt-0.5">
                            {i === 0
                              ? selectedLead.createdAt
                              : `Jan ${15 + i * 2}, 2025`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedLead.notes && (
                  <>
                    <Separator className="bg-white/[0.06]" />
                    <div>
                      <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                        <Pencil className="h-4 w-4 text-white/40" />
                        Notes
                      </h4>
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] p-4">
                        <p className="text-sm text-white/60 leading-relaxed">
                          {selectedLead.notes}
                        </p>
                      </div>
                    </div>
                  </>
                )}

                <Separator className="bg-white/[0.06]" />

                <div className="flex items-center gap-3">
                  <Button size="sm" className="gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Send Message
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Calendar className="h-4 w-4" />
                    Schedule Meeting
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
