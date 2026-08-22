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

interface DiscoveredLead {
  id: string;
  author_name: string | null;
  source_platform: string;
  source_url: string | null;
  source_content: string;
  metadata: {
    final_score?: number;
    confidence?: number;
    quality_gate?: string;
    detected_requirement?: string | null;
    recommended_channel?: string | null;
    channel_reason?: string | null;
    why_this_lead?: string;
    canonical_business_id?: string;
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
              {leads.map((lead) => (
                <TableRow key={lead.id} className="hover:bg-white/[0.02]">
                  <TableCell>
                    <div className="font-medium text-sm text-white">{lead.author_name ?? lead.source_content?.slice(0, 40) ?? "Unknown"}</div>
                    {lead.metadata?.detected_requirement && (
                      <div className="text-xs text-white/40 mt-0.5">{lead.metadata.detected_requirement}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`text-lg font-bold ${getScoreColor(lead.metadata?.final_score ?? 0)}`}>
                      {lead.metadata?.final_score ?? 0}
                    </span>
                    <span className="text-xs text-white/30 ml-1">/100</span>
                  </TableCell>
                  <TableCell>
                    {getQualityBadge(lead.metadata?.quality_gate ?? "NEW")}
                    {lead.metadata?.confidence && (
                      <div className="text-xs text-white/30 mt-1">Conf: {lead.metadata.confidence}%</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="info" className="capitalize">{lead.metadata?.recommended_channel ?? "—"}</Badge>
                  </TableCell>
                  <TableCell>
                    {lead.source_url && (
                      <a href={lead.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300">
                        <ExternalLink className="h-3 w-3" />
                        Source
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
