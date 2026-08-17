"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Filter, RefreshCw, ExternalLink, MessageCircle, User,
  Target, Zap, TrendingUp, Clock, CheckCircle2, XCircle, AlertCircle,
  ArrowRight, ChevronDown, Globe, Linkedin, Instagram, Facebook,
  Mail, Phone, Sparkles, Eye, ThumbsUp, ThumbsDown, Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DiscoveredLead {
  id: string;
  source_platform: string;
  source_url: string | null;
  source_content: string;
  source_content_type: string | null;
  author_name: string | null;
  author_handle: string | null;
  author_profile_url: string | null;
  detected_requirement: string | null;
  relevance_score: number;
  intent_score: number;
  lead_score: number;
  urgency_score: number;
  confidence: number;
  evidence: any;
  recommended_next_action: string | null;
  conversation_stage: string;
  conversation_summary: string | null;
  total_messages: number;
  closed_reason: string | null;
  created_at: string;
}

interface PlatformCapability {
  platform: string;
  connected: boolean;
  capability_status: string;
  capabilities: {
    can_read_posts: boolean;
    can_read_comments: boolean;
    can_search_discovery: boolean;
    can_send_messages: boolean;
    can_reply_comments: boolean;
  };
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STAGE_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  DISCOVER: { label: "Discovered", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: Search },
  QUALIFY: { label: "Qualifying", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: Target },
  CONVERSATION: { label: "In Conversation", color: "bg-purple-500/20 text-purple-400 border-purple-500/30", icon: MessageCircle },
  NURTURE: { label: "Nurturing", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", icon: TrendingUp },
  INTEREST_CONFIRMED: { label: "Interest Confirmed", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  MEETING_INTENT: { label: "Meeting Intent", color: "bg-green-500/20 text-green-400 border-green-500/30", icon: Zap },
  WHATSAPP_HANDOFF: { label: "WhatsApp Handoff", color: "bg-green-600/20 text-green-300 border-green-500/30", icon: Phone },
  MEETING: { label: "Meeting", color: "bg-emerald-600/20 text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
  CLOSED: { label: "Closed", color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30", icon: XCircle },
  IGNORED: { label: "Ignored", color: "bg-zinc-600/20 text-zinc-500 border-zinc-600/30", icon: XCircle },
};

const PLATFORM_ICONS: Record<string, React.ElementType> = {
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  whatsapp: MessageCircle,
  email: Mail,
  website: Globe,
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "from-pink-500 to-purple-500",
  facebook: "from-blue-600 to-blue-400",
  linkedin: "from-blue-700 to-cyan-500",
  whatsapp: "from-green-500 to-emerald-400",
  email: "from-amber-500 to-orange-400",
  website: "from-slate-500 to-zinc-400",
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function DiscoveryPage() {
  const [leads, setLeads] = useState<DiscoveredLead[]>([]);
  const [capabilities, setCapabilities] = useState<PlatformCapability[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [selectedLead, setSelectedLead] = useState<DiscoveredLead | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [handoffModalOpen, setHandoffModalOpen] = useState(false);
  const [handoffLead, setHandoffLead] = useState<DiscoveredLead | null>(null);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [scanResults, setScanResults] = useState<Record<string, any> | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterStage, setFilterStage] = useState("all");

  const supabase = createClient();

  const loadLeads = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (filterPlatform !== "all") params.set("platform", filterPlatform);
      if (filterStage !== "all") params.set("stage", filterStage);

      const res = await fetch(`/api/ai/discovery?${params}`);
      const json = await res.json();
      if (!json.error) {
        setLeads(json.discovered_leads ?? []);
        setTotal(json.total ?? 0);
      }
    } catch (err) {
      console.error("Failed to load discovered leads:", err);
    }
  }, [page, filterPlatform, filterStage]);

  const loadCapabilities = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/discovery/capabilities");
      const json = await res.json();
      if (!json.error) {
        setCapabilities(json.platforms ?? []);
      }
    } catch (err) {
      console.error("Failed to load capabilities:", err);
    }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([loadLeads(), loadCapabilities()]);
      setLoading(false);
    }
    init();
  }, [loadLeads, loadCapabilities]);

  const handleScan = async () => {
    setScanning(true);
    setScanResults(null);
    try {
      const res = await fetch("/api/ai/discovery/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      setScanResults(json.scan_results ?? null);
      await loadLeads();
    } catch (err) {
      console.error("Scan failed:", err);
      setScanResults({ _error: "Scan failed" });
    } finally {
      setScanning(false);
    }
  };

  const openDetail = async (lead: DiscoveredLead) => {
    setSelectedLead(lead);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/ai/discovery/${lead.id}`);
      const json = await res.json();
      setDetailData(json);
    } catch {
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const openHandoff = (lead: DiscoveredLead) => {
    setHandoffLead(lead);
    setHandoffModalOpen(true);
  };

  const submitHandoff = async () => {
    if (!handoffLead) return;
    setHandoffLoading(true);
    try {
      await fetch("/api/ai/discovery/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discovered_lead_id: handoffLead.id }),
      });
      setHandoffModalOpen(false);
      setHandoffLead(null);
      await loadLeads();
    } catch (err) {
      console.error("Handoff failed:", err);
    } finally {
      setHandoffLoading(false);
    }
  };

  const handleHandoffAction = async (handoffId: string, action: "approve" | "reject" | "defer") => {
    try {
      await fetch(`/api/ai/discovery/handoff/${handoffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await loadLeads();
    } catch (err) {
      console.error("Handoff action failed:", err);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  const activeLeads = leads.filter((l) => !["CLOSED", "IGNORED"].includes(l.conversation_stage));
  const qualifiedCount = leads.filter((l) => l.lead_score >= 50).length;
  const meetingIntentCount = leads.filter((l) =>
    ["MEETING_INTENT", "WHATSAPP_HANDOFF", "MEETING"].includes(l.conversation_stage)
  ).length;
  const connectedPlatforms = capabilities.filter((c) => c.connected).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-purple-400" />
            Lead Discovery
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            AI-powered lead discovery across connected platforms
          </p>
        </div>
        <Button
          onClick={handleScan}
          disabled={scanning}
          className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Scanning..." : "Run Discovery Scan"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Discovered" value={total} icon={Search} color="text-blue-400" />
        <StatCard label="Active Leads" value={activeLeads.length} icon={Target} color="text-purple-400" />
        <StatCard label="Qualified" value={qualifiedCount} icon={CheckCircle2} color="text-emerald-400" />
        <StatCard label="Meeting Intent" value={meetingIntentCount} icon={Zap} color="text-green-400" />
      </div>

      {/* Platform Status */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-zinc-300">Platform Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {capabilities.map((cap) => {
              const Icon = PLATFORM_ICONS[cap.platform] ?? Globe;
              const statusLabel =
                cap.capability_status === "AVAILABLE" ? "Connected"
                : cap.capability_status === "SUPPORTED_BUT_NOT_CONNECTED" ? "Not Connected"
                : cap.capability_status === "SUPPORTED_BUT_NOT_VERIFIED" ? "Not Verified"
                : "Unavailable";
              const statusColor =
                cap.capability_status === "AVAILABLE" ? "text-emerald-400"
                : cap.capability_status === "SUPPORTED_BUT_NOT_VERIFIED" ? "text-amber-400"
                : "text-zinc-500";
              return (
                <div
                  key={cap.platform}
                  className="flex items-center gap-2 p-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50"
                >
                  <div className={`p-1.5 rounded-md bg-gradient-to-br ${PLATFORM_COLORS[cap.platform] ?? "from-zinc-500 to-zinc-600"}`}>
                    <Icon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-zinc-200 capitalize">{cap.platform}</p>
                    <p className={`text-[10px] ${statusColor}`}>{statusLabel}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Scan Results Banner */}
      <AnimatePresence>
        {scanResults && !scanning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-medium text-zinc-300">Scan Results:</span>
                    {Object.entries(scanResults).map(([platform, result]: [string, any]) => {
                      if (platform === "_error") return <span key={platform} className="text-xs text-red-400">{result}</span>;
                      const Icon = PLATFORM_ICONS[platform] ?? Globe;
                      return (
                        <div key={platform} className="flex items-center gap-1.5 text-xs">
                          <Icon className="h-3 w-3 text-zinc-400" />
                          <span className="text-zinc-400 capitalize">{platform}:</span>
                          {result.status === "completed" ? (
                            <span className="text-emerald-400">
                              {result.processed} new, {result.duplicates} dup, {result.events_found} found
                            </span>
                          ) : result.status === "skipped" ? (
                            <span className="text-zinc-500">{result.reason?.replace(/_/g, " ")}</span>
                          ) : (
                            <span className="text-red-400">{result.error ?? result.status}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button onClick={() => setScanResults(null)} className="text-zinc-500 hover:text-zinc-300 text-xs">✕</button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterPlatform}
          onChange={(e) => { setFilterPlatform(e.target.value); setPage(1); }}
          className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:ring-purple-500 focus:border-purple-500"
        >
          <option value="all">All Platforms</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="linkedin">LinkedIn</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Email</option>
        </select>
        <select
          value={filterStage}
          onChange={(e) => { setFilterStage(e.target.value); setPage(1); }}
          className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 focus:ring-purple-500 focus:border-purple-500"
        >
          <option value="all">All Stages</option>
          {Object.entries(STAGE_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.label}</option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={() => { setPage(1); loadLeads(); }} className="border-zinc-700 text-zinc-300">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Leads List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-6 w-6 text-purple-400 animate-spin" />
          <span className="ml-3 text-zinc-400">Loading discovered leads...</span>
        </div>
      ) : leads.length === 0 ? (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="py-16 text-center">
            <Search className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400 text-lg">No discovered leads yet</p>
            <p className="text-zinc-500 text-sm mt-2">
              Connect your platforms and run a discovery scan to find potential leads.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {leads.map((lead, idx) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                index={idx}
                onView={() => openDetail(lead)}
                onHandoff={() => openHandoff(lead)}
              />
            ))}
          </AnimatePresence>

          {/* Pagination */}
          {total > 20 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="border-zinc-700 text-zinc-300"
              >
                Previous
              </Button>
              <span className="text-sm text-zinc-400">
                Page {page} of {Math.ceil(total / 20)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= Math.ceil(total / 20)}
                onClick={() => setPage((p) => p + 1)}
                className="border-zinc-700 text-zinc-300"
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedLead && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <PlatformIcon platform={selectedLead.source_platform} />
                  {selectedLead.author_name ?? selectedLead.author_handle ?? "Unknown Prospect"}
                </DialogTitle>
                <DialogDescription className="text-zinc-400">
                  Discovered via {selectedLead.source_platform} · {new Date(selectedLead.created_at).toLocaleDateString()}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                {/* Scores */}
                <div className="grid grid-cols-4 gap-3">
                  <ScoreBadge label="Relevance" value={selectedLead.relevance_score} />
                  <ScoreBadge label="Intent" value={selectedLead.intent_score} />
                  <ScoreBadge label="Lead Score" value={selectedLead.lead_score} />
                  <ScoreBadge label="Urgency" value={selectedLead.urgency_score} />
                </div>
                {/* Evidence */}
                {selectedLead.detected_requirement && (
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
                    <p className="text-xs text-zinc-400 mb-1">Detected Requirement</p>
                    <p className="text-sm text-zinc-200">{selectedLead.detected_requirement}</p>
                  </div>
                )}
                {/* Why this lead was discovered */}
                {selectedLead.evidence && (
                  <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 rounded-lg p-3 border border-purple-700/30">
                    <p className="text-xs font-medium text-purple-300 mb-2 flex items-center gap-1.5">
                      <Eye className="h-3.5 w-3.5" />
                      Why this lead was discovered
                    </p>
                    {selectedLead.evidence.reason && (
                      <p className="text-xs text-zinc-300 mb-2">{selectedLead.evidence.reason}</p>
                    )}
                    {Array.isArray(selectedLead.evidence.signals) && selectedLead.evidence.signals.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {selectedLead.evidence.signals.map((sig: string, i: number) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            {sig.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}
                    {Array.isArray(selectedLead.evidence.quotes) && selectedLead.evidence.quotes.length > 0 && (
                      <div className="space-y-1">
                        {selectedLead.evidence.quotes.map((quote: string, i: number) => (
                          <p key={i} className="text-xs text-zinc-400 italic border-l-2 border-purple-500/40 pl-2">
                            &ldquo;{quote}&rdquo;
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-3 mt-2 text-[10px] text-zinc-500">
                      <span>Relevance: {selectedLead.evidence.relevance_score ?? "—"}</span>
                      <span>Intent: {selectedLead.evidence.intent_score ?? "—"}</span>
                      <span>Urgency: {selectedLead.evidence.urgency_score ?? "—"}</span>
                      <span>Confidence: {selectedLead.evidence.confidence ? `${Math.round(selectedLead.evidence.confidence * 100)}%` : "—"}</span>
                    </div>
                  </div>
                )}
                {/* Source Content */}
                <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
                  <p className="text-xs text-zinc-400 mb-1">Source Content</p>
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap line-clamp-6">
                    {selectedLead.source_content}
                  </p>
                </div>
                {/* Conversation */}
                {detailData?.conversation_thread?.messages && (
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
                    <p className="text-xs text-zinc-400 mb-2">Conversation ({detailData.conversation_thread.total_messages} messages)</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {(detailData.conversation_thread.messages as any[]).slice(-6).map((msg: any, i: number) => (
                        <div key={i} className={`text-xs p-2 rounded ${msg.role === "agent" ? "bg-purple-900/30 text-purple-200" : "bg-zinc-700/50 text-zinc-300"}`}>
                          <span className="font-medium">{msg.role === "agent" ? "Agent" : "Prospect"}:</span>{" "}
                          {msg.content}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  {selectedLead.conversation_stage !== "CLOSED" && selectedLead.conversation_stage !== "IGNORED" && (
                    <Button
                      onClick={() => { setSelectedLead(null); openHandoff(selectedLead); }}
                      className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                      size="sm"
                    >
                      <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
                      Create WhatsApp Handoff
                    </Button>
                  )}
                  {selectedLead.source_url && (
                    <Button variant="outline" size="sm" asChild className="border-zinc-700 text-zinc-300">
                      <a href={selectedLead.source_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        View Source
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Handoff Approval Modal */}
      <Dialog open={handoffModalOpen} onOpenChange={setHandoffModalOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-xl">
          {handoffLead && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-green-400" />
                  WhatsApp Handoff Request
                </DialogTitle>
                <DialogDescription className="text-zinc-400">
                  Review and submit this lead for WhatsApp handoff approval.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 mt-4">
                <InfoRow label="Prospect" value={handoffLead.author_name ?? handoffLead.author_handle ?? "Unknown"} />
                <InfoRow label="Platform" value={handoffLead.source_platform} />
                <InfoRow label="Requirement" value={handoffLead.detected_requirement ?? "Not detected"} />
                <InfoRow label="Lead Score" value={`${handoffLead.lead_score}/100`} />
                <InfoRow label="Intent Score" value={`${handoffLead.intent_score}/100`} />
                <InfoRow label="Confidence" value={`${Math.round(handoffLead.confidence * 100)}%`} />
                <InfoRow label="Stage" value={STAGE_CONFIG[handoffLead.conversation_stage]?.label ?? handoffLead.conversation_stage} />
                {handoffLead.conversation_summary && (
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
                    <p className="text-xs text-zinc-400 mb-1">Conversation Summary</p>
                    <p className="text-xs text-zinc-300">{handoffLead.conversation_summary}</p>
                  </div>
                )}
                {handoffLead.evidence?.reason && (
                  <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
                    <p className="text-xs text-zinc-400 mb-1">Why AI Qualified</p>
                    <p className="text-xs text-zinc-300">{handoffLead.evidence.reason}</p>
                  </div>
                )}
                <div className="flex gap-2 pt-3">
                  <Button
                    onClick={submitHandoff}
                    disabled={handoffLoading}
                    className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                  >
                    {handoffLoading ? "Submitting..." : "Submit for Approval"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setHandoffModalOpen(false)}
                    className="border-zinc-700 text-zinc-300"
                  >
                    Cancel
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

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-zinc-800/70 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-xs text-zinc-400">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LeadCard({
  lead,
  index,
  onView,
  onHandoff,
}: {
  lead: DiscoveredLead;
  index: number;
  onView: () => void;
  onHandoff: () => void;
}) {
  const stage = STAGE_CONFIG[lead.conversation_stage] ?? STAGE_CONFIG.DISCOVER;
  const StageIcon = stage.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ delay: index * 0.03 }}
    >
      <Card
        className="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer group"
        onClick={onView}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            {/* Platform Icon */}
            <div className={`p-2 rounded-lg bg-gradient-to-br ${PLATFORM_COLORS[lead.source_platform] ?? "from-zinc-600 to-zinc-700"} shrink-0`}>
              <PlatformIcon platform={lead.source_platform} className="h-5 w-5 text-white" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-zinc-100">
                  {lead.author_name ?? lead.author_handle ?? "Unknown"}
                </span>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${stage.color}`}>
                  <StageIcon className="h-2.5 w-2.5 mr-1" />
                  {stage.label}
                </Badge>
                <span className="text-[10px] text-zinc-500">
                  {new Date(lead.created_at).toLocaleDateString()}
                </span>
              </div>
              {lead.detected_requirement && (
                <p className="text-xs text-purple-300 mb-1">
                  <Target className="h-3 w-3 inline mr-1" />
                  {lead.detected_requirement}
                </p>
              )}
              <p className="text-xs text-zinc-400 line-clamp-2">
                {lead.source_content}
              </p>
            </div>

            {/* Scores */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-center">
                <p className={`text-lg font-bold ${scoreColor(lead.lead_score)}`}>{lead.lead_score}</p>
                <p className="text-[10px] text-zinc-500">Score</p>
              </div>
              <div className="flex flex-col gap-1">
                {["MEETING_INTENT", "INTEREST_CONFIRMED", "QUALIFY"].includes(lead.conversation_stage) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-[10px] h-6 px-2 border-green-700 text-green-400 hover:bg-green-900/30"
                    onClick={(e) => { e.stopPropagation(); onHandoff(); }}
                  >
                    <ArrowRight className="h-3 w-3 mr-1" />
                    Handoff
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-[10px] h-6 px-2 text-zinc-400 hover:text-zinc-200"
                  onClick={(e) => { e.stopPropagation(); onView(); }}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function PlatformIcon({ platform, className = "h-4 w-4" }: { platform: string; className?: string }) {
  const Icon = PLATFORM_ICONS[platform] ?? Globe;
  return <Icon className={className} />;
}

function ScoreBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-zinc-800/50 rounded-lg p-2 text-center border border-zinc-700/50">
      <p className={`text-lg font-bold ${scoreColor(value)}`}>{value}</p>
      <p className="text-[10px] text-zinc-400">{label}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-zinc-800/50">
      <span className="text-xs text-zinc-400">{label}</span>
      <span className="text-xs text-zinc-200 capitalize">{value}</span>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  if (score >= 40) return "text-orange-400";
  return "text-zinc-400";
}
