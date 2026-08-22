"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Search, Target, RefreshCw, Loader2, ExternalLink, Phone, Globe, MapPin, Star, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";

interface WhyThisLead {
  match_reason?: string;
  requirement_evidence?: { status?: string; type?: string; reason?: string };
  urgency_evidence?: { level?: string; score?: number; reason?: string };
  score?: number;
  confidence?: number;
  provenance?: { providers?: string[]; sources?: string[]; query?: string | null };
  contacts_found?: Record<string, boolean>;
  conflicts?: string[];
  missing_information?: string[];
  recommended_channel?: string | null;
  channel_reason?: string | null;
}

interface DiscoveredLead {
  id: string;
  author_name: string | null;
  source_platform: string;
  source_url: string | null;
  source_content: string;
  detected_requirement?: string | null;
  business_context_match?: string | null;
  relevance_score?: number;
  intent_score?: number;
  lead_score?: number;
  urgency_score?: number;
  confidence?: number;
  evidence?: {
    quality_gate?: string;
    why_this_lead?: WhyThisLead;
    sub_scores?: Record<string, number>;
  };
  recommended_next_action?: string | null;
  metadata?: {
    final_score?: number;
    confidence?: number;
    quality_gate?: string;
    why_this_lead?: string;
  };
  created_at: string;
}

interface DiscoveryRun {
  status: string;
  queries_generated: number;
  raw_candidates: number;
  canonical_count: number;
  qualified_count: number;
  created_at: string;
}

export default function FindLeadsPage() {
  const [leads, setLeads] = useState<DiscoveredLead[]>([]);
  const [latestRun, setLatestRun] = useState<DiscoveryRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const loadLeads = async () => {
    try {
      const res = await fetch("/api/growth/find-leads");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setLeads(json.leads ?? []);
      setLatestRun(json.latest_run ?? null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, []);

  const startDiscovery = async () => {
    setDiscovering(true);
    setError(null);
    try {
      const res = await fetch("/api/growth/find-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_queries: 15, max_pages: 100 }),
      });
      const json = await res.json();
      if (json.status === "FAILED") {
        setError(json.errors?.join("; ") || "Discovery failed");
      }
      await loadLeads();
    } catch (err: any) {
      setError(err.message || "Discovery failed");
    } finally {
      setDiscovering(false);
    }
  };

  const getScoreColor = (score: number) =>
    score >= 70 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-white/40";

  const getQualityBadge = (gate: string) => {
    switch (gate) {
      case "QUALIFIED": return <Badge variant="success">Qualified</Badge>;
      case "NEEDS_REVIEW": return <Badge variant="warning">Needs Review</Badge>;
      case "REJECTED": return <Badge variant="destructive">Rejected</Badge>;
      default: return <Badge>{gate}</Badge>;
    }
  };

  const leadScore = (lead: DiscoveredLead) => lead.lead_score ?? lead.metadata?.final_score ?? 0;
  const leadConfidencePct = (lead: DiscoveredLead) => {
    if (typeof lead.confidence === "number") return Math.round(lead.confidence * 100);
    if (typeof lead.metadata?.confidence === "number") return lead.metadata.confidence;
    return null;
  };
  const qualityGate = (lead: DiscoveredLead) =>
    lead.evidence?.quality_gate ?? lead.metadata?.quality_gate ?? "NEW";
  const channelOf = (lead: DiscoveredLead) => {
    const action = lead.recommended_next_action;
    if (!action) return "—";
    const ch = action.split(":")[0]?.trim();
    return ch || "—";
  };
  const why = (lead: DiscoveredLead) => {
    if (lead.evidence?.why_this_lead && typeof lead.evidence.why_this_lead === "object") return lead.evidence.why_this_lead;
    if (typeof lead.metadata?.why_this_lead === "string") {
      return { match_reason: lead.metadata.why_this_lead } as WhyThisLead;
    }
    return null;
  };

  const toggleWhy = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-3">
            <Target className="h-7 w-7 text-sky-400" />
            Find Leads
          </h1>
          <p className="text-white/50 mt-1 text-sm">Proactive external lead discovery</p>
        </div>
        <Button onClick={startDiscovery} disabled={discovering} className="gap-2">
          {discovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {discovering ? "Discovering..." : "Start Discovery"}
        </Button>
      </div>

      {latestRun && (
        <Card className="glass-card">
          <CardContent className="py-4 flex flex-wrap gap-4 text-sm">
            <Badge variant={latestRun.status === "COMPLETED" ? "success" : latestRun.status === "FAILED" ? "destructive" : "info"}>
              {latestRun.status}
            </Badge>
            <span className="text-white/50">{latestRun.queries_generated} queries</span>
            <span className="text-white/50">{latestRun.raw_candidates} candidates</span>
            <span className="text-white/50">{latestRun.canonical_count} businesses</span>
            <span className="text-emerald-400">{latestRun.qualified_count} qualified</span>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card className="glass-card border-red-500/30">
          <CardContent className="py-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : leads.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12 text-center">
            <Target className="h-8 w-8 text-white/20 mx-auto mb-3" />
            <p className="text-sm text-white/50">No leads discovered yet.</p>
            <p className="text-xs text-white/30 mt-1">Click "Start Discovery" to find businesses matching your services.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Quality</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => {
                const whyInfo = why(lead);
                const conf = leadConfidencePct(lead);
                const isOpen = expanded.has(lead.id);
                return (
                  <>
                    <TableRow key={lead.id} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => toggleWhy(lead.id)}>
                      <TableCell>
                        <div className="font-medium text-sm text-white">{lead.author_name ?? lead.source_content?.slice(0, 40) ?? "Unknown"}</div>
                        {(lead.detected_requirement || lead.business_context_match) && (
                          <div className="text-xs text-white/40 mt-0.5">
                            {lead.detected_requirement}{lead.detected_requirement && lead.business_context_match ? " · " : ""}{lead.business_context_match}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`text-lg font-bold ${getScoreColor(leadScore(lead))}`}>
                          {leadScore(lead)}
                        </span>
                        <span className="text-xs text-white/30 ml-1">/100</span>
                      </TableCell>
                      <TableCell>
                        {getQualityBadge(qualityGate(lead))}
                        {conf !== null && (
                          <div className="text-xs text-white/30 mt-1">Conf: {conf}%</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="info" className="capitalize">{channelOf(lead)}</Badge>
                      </TableCell>
                      <TableCell>
                        {lead.source_url && (
                          <a href={lead.source_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300">
                            <ExternalLink className="h-3 w-3" />
                            Source
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                    {isOpen && whyInfo && (
                      <TableRow key={`${lead.id}-why`} className="bg-white/[0.03]">
                        <TableCell colSpan={5}>
                          <div className="space-y-2 py-2 text-xs">
                            {whyInfo.match_reason && (
                              <div><span className="text-white/50">Match:</span> <span className="text-white/80">{whyInfo.match_reason}</span></div>
                            )}
                            {whyInfo.requirement_evidence && (
                              <div>
                                <span className="text-white/50">Requirement evidence ({whyInfo.requirement_evidence.status}):</span>{" "}
                                <span className="text-white/80">{whyInfo.requirement_evidence.reason}</span>
                              </div>
                            )}
                            {whyInfo.urgency_evidence && (
                              <div>
                                <span className="text-white/50">Urgency evidence ({whyInfo.urgency_evidence.level}, {whyInfo.urgency_evidence.score}):</span>{" "}
                                <span className="text-white/80">{whyInfo.urgency_evidence.reason}</span>
                              </div>
                            )}
                            {whyInfo.provenance?.providers && whyInfo.provenance.providers.length > 0 && (
                              <div><span className="text-white/50">Source provenance:</span> <span className="text-white/80">{whyInfo.provenance.providers.join(", ")}{whyInfo.provenance.query ? ` — "${whyInfo.provenance.query}"` : ""}</span></div>
                            )}
                            {whyInfo.contacts_found && (
                              <div>
                                <span className="text-white/50">Contacts found:</span>{" "}
                                <span className="text-white/80">
                                  {Object.entries(whyInfo.contacts_found).filter(([, v]) => v).map(([k]) => k).join(", ") || "none yet"}
                                </span>
                              </div>
                            )}
                            {whyInfo.missing_information && whyInfo.missing_information.length > 0 && (
                              <div><span className="text-white/50">Missing information:</span> <span className="text-white/60">{whyInfo.missing_information.join(", ")}</span></div>
                            )}
                            {whyInfo.conflicts && whyInfo.conflicts.length > 0 && (
                              <div><span className="text-white/50">Conflicts:</span> <span className="text-red-300">{whyInfo.conflicts.join("; ")}</span></div>
                            )}
                            {whyInfo.channel_reason && (
                              <div><span className="text-white/50">Channel rationale ({whyInfo.recommended_channel}):</span> <span className="text-white/80">{whyInfo.channel_reason}</span></div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
