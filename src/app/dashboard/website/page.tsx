"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Globe,
  RefreshCw,
  PaintBucket,
  Users,
  BookOpen,
  Shield,
  Package,
  Wrench,
  Check,
  ExternalLink,
  ChevronRight,
  ArrowUpRight,
  Palette,
  ScanLine,
  Loader2,
  MapPin,
  Sparkles,
  Briefcase,
  Phone,
  Quote,
  Target,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { websiteData } from "@/lib/data";
import type { WebsiteData } from "@/types";

const brandColors = [
  { name: "Blue", hex: "#3b82f6" },
  { name: "Indigo", hex: "#6366f1" },
  { name: "Violet", hex: "#8b5cf6" },
  { name: "Cyan", hex: "#06b6d4" },
];

const tabVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

interface ScanItem {
  name?: string;
  description?: string | null;
  source_url?: string | null;
  evidence?: string | null;
  confidence?: number | null;
}

interface ScanPricingItem {
  item?: string;
  price?: string | null;
  source_url?: string | null;
  evidence?: string | null;
}

interface ScanResults {
  business_name?: string | null;
  tagline?: string | null;
  overview?: string | null;
  services?: ScanItem[];
  products?: ScanItem[];
  target_customers?: { segment: string; description?: string | null; pain_points?: string[]; source_url?: string | null; evidence?: string | null; confidence?: number | null }[];
  industries?: string[];
  problems_solved?: { problem: string; solution?: string | null; source_url?: string | null; evidence?: string | null }[];
  value_proposition?: string | null;
  offers?: { name: string; description?: string | null; source_url?: string | null; evidence?: string | null }[];
  pricing?: ScanPricingItem[];
  locations?: string[];
  social_profiles?: { platform: string; url: string; source_url?: string | null }[];
  case_studies?: { title: string; summary?: string | null; source_url?: string | null }[];
  testimonials?: { quote: string; author?: string | null; source_url?: string | null }[];
  contact_info?: { email?: string | null; phone?: string | null; address?: string | null; source_url?: string | null } | null;
  content_themes?: { title: string; description?: string | null; source_url?: string | null }[];
  business_signals?: { signal: string; evidence?: string | null; source_url?: string | null }[];
  brand_voice?: string[];
  tone?: string | null;
  confidence?: number;
  scanned_url?: string;
  pages_crawled?: number;
  pages_discovered?: number;
  partial?: boolean;
  model?: string;
  analysis_mode?: string;
  js_rendered?: boolean;
  crawl_stats?: {
    discovered?: number;
    scanned?: number;
    failed?: number;
    robotsSkipped?: number;
    duplicates?: number;
  };
}

interface WebsiteScan {
  id: string;
  url: string;
  status: "QUEUED" | "SCANNING" | "EXTRACTING" | "ANALYZING" | "COMPLETED" | "PARTIAL" | "FAILED";
  pages_crawled?: number;
  pages_discovered?: number;
  results?: ScanResults | null;
  error_message?: string | null;
  context_synced_at?: string | null;
  created_at?: string;
  completed_at?: string | null;
}

const SCAN_LABELS: Record<WebsiteScan["status"], string> = {
  QUEUED: "Preparing website scan...",
  SCANNING: "Scanning public pages...",
  EXTRACTING: "Extracting business information...",
  ANALYZING: "Analyzing business context...",
  COMPLETED: "Finalizing business profile...",
  PARTIAL: "Finalizing business profile...",
  FAILED: "Scan failed",
};

const TERMINAL_STATUSES: WebsiteScan["status"][] = ["COMPLETED", "PARTIAL", "FAILED"];

function displayUrl(url: string | null | undefined): string {
  if (!url) return "";
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function Evidence({ sourceUrl, evidence, confidence }: { sourceUrl?: string | null; evidence?: string | null; confidence?: number | null }) {
  if (!sourceUrl && !evidence && typeof confidence !== "number") return null;
  return (
    <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
      {sourceUrl && (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-sky-400/80 hover:text-sky-300 transition-colors w-fit max-w-full truncate"
        >
          Source: {displayUrl(sourceUrl)}
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      )}
      {evidence && <p className="text-xs text-white/40 italic leading-relaxed line-clamp-3">&ldquo;{evidence}&rdquo;</p>}
      {typeof confidence === "number" && (
        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400/80">
          <Check className="h-3 w-3" />
          Confidence: {Math.round(confidence * 100)}%
        </span>
      )}
    </div>
  );
}

function buildView(results: ScanResults | null | undefined): WebsiteData {
  if (!results) return websiteData;
  return {
    businessName: results.business_name ?? "",
    tagline: results.tagline ?? "",
    summary: results.overview ?? "",
    brandVoice: results.brand_voice ?? [],
    targetAudience: (results.target_customers ?? []).map((t) => ({
      segment: t.segment,
      description: t.description ?? "",
      painPoints: t.pain_points ?? [],
    })),
    knowledgeBase: (results.content_themes ?? []).map((theme) => ({
      title: theme.title,
      content: theme.description ?? "",
      category: "Content Theme",
    })),
    competitors: [],
    products: (results.products ?? []).map((p) => {
      const priceItem = (results.pricing ?? []).find(
        (item) =>
          item.item && p.name && item.item.toLowerCase().includes(p.name.toLowerCase())
      );
      return {
        name: p.name ?? "",
        description: p.description ?? "",
        price: priceItem?.price ?? "",
        features: [],
      };
    }),
    services: (results.services ?? []).map((s) => {
      const priceItem = (results.pricing ?? []).find(
        (item) => item.item && s.name && item.item.toLowerCase().includes(s.name.toLowerCase())
      );
      return {
        name: s.name ?? "",
        description: s.description ?? "",
        price: priceItem?.price ?? "",
        features: [],
      };
    }),
  };
}

export default function WebsiteIntelligencePage() {
  const [activeTab, setActiveTab] = useState("summary");
  const [url, setUrl] = useState("");
  const [scan, setScan] = useState<WebsiteScan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const view = useMemo(() => buildView(scan?.results ?? null), [scan]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollScan = useCallback((scanId: string) => {
    stopPolling();
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const res = await fetch(`/api/ai/website/scan/${scanId}`);
        const json = await res.json();
        if (!res.ok) {
          stopPolling();
          setScanning(false);
          setError(json.error || "Failed to read scan status");
          return;
        }
        setScan(json);
        if (TERMINAL_STATUSES.includes(json.status)) {
          stopPolling();
          setScanning(false);
          if (json.status === "FAILED") {
            setError(json.error_message || "Website scan failed. Please try again.");
          }
        } else if (attempts >= 90) {
          stopPolling();
          setScanning(false);
          setError("Scan is taking too long. Please try again.");
        }
      } catch {
        stopPolling();
        setScanning(false);
        setError("Network error while checking scan status.");
      }
    }, 2000);
  }, [stopPolling]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/website/scan/latest")
      .then((res) => res.json())
      .then((json: WebsiteScan | null) => {
        if (cancelled) return;
        if (json && json.url) {
          setScan(json);
          setUrl(json.url);
          if (!TERMINAL_STATUSES.includes(json.status)) {
            setScanning(true);
            pollScan(json.id);
          }
        }
      })
      .catch(() => {});
    fetch("/api/profile")
      .then((res) => res.json())
      .then((profile: { website?: string | null }) => {
        if (!cancelled && profile?.website) {
          setUrl((current) => current || profile.website || "");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [pollScan, stopPolling]);

  const startScan = async () => {
    setError(null);
    const target = url.trim();
    if (!target) {
      setError("Please enter your business website URL first.");
      return;
    }
    setScanning(true);
    try {
      const res = await fetch("/api/ai/website/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const json = await res.json();
      if (!res.ok) {
        setScanning(false);
        setError(json.error || "Failed to start website scan.");
        return;
      }
      setScan({ id: json.scan_id, url: target, status: "QUEUED" });
      pollScan(json.scan_id);
    } catch {
      setScanning(false);
      setError("Network error while starting the scan.");
    }
  };

  const scanInProgress = scan && !TERMINAL_STATUSES.includes(scan.status);
  const hasResults = scan && TERMINAL_STATUSES.includes(scan.status) && scan.status !== "FAILED" && scan.results;
  const results = scan?.results ?? null;

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              Website Intelligence
            </h1>
            {hasResults ? (
              <Badge variant="success">
                <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
                Scanned
              </Badge>
            ) : scanInProgress ? (
              <Badge variant="info">
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                Scanning
              </Badge>
            ) : (
              <Badge>
                <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-white/30 inline-block" />
                Not scanned
              </Badge>
            )}
          </div>
          <p className="text-sm text-white/40">
            {scan?.completed_at
              ? `Last scanned: ${new Date(scan.completed_at).toLocaleString()}`
              : "Scan your business website to build your AI business profile."}
          </p>
        </div>
        <Button
          variant="glass"
          size="sm"
          className="shrink-0 gap-2"
          onClick={startScan}
          disabled={scanning}
        >
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Re-scan Website
        </Button>
      </motion.div>

      <Card className="glass-card">
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <Input
                id="website-scan-url"
                type="url"
                placeholder="https://yourbusiness.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pl-9"
                disabled={scanning}
              />
            </div>
            <Button onClick={startScan} disabled={scanning} className="gap-2 shrink-0">
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
              Scan Website
            </Button>
          </div>

          {scanInProgress && (
            <div className="flex items-center gap-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.06] p-4">
              <Loader2 className="h-4 w-4 animate-spin text-sky-400 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm text-white/80 font-medium">{SCAN_LABELS[scan.status]}</p>
                <p className="text-xs text-white/40">
                  {displayUrl(scan.url)}
                  {typeof scan.pages_discovered === "number" && scan.pages_discovered > 0 && (
                    <span className="ml-2 text-sky-400/80">
                      · Discovered {scan.pages_discovered} pages
                    </span>
                  )}
                  {typeof scan.pages_crawled === "number" && scan.pages_crawled > 0 && (
                    <span className="ml-2 text-sky-400/80">
                      · Scanned {scan.pages_crawled}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.06] p-4">
              <AlertTriangle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm text-white/80 font-medium">Scan could not be completed</p>
                <p className="text-xs text-white/40">{error}</p>
              </div>
            </div>
          )}

          {hasResults && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {scan.context_synced_at ? (
                <Badge variant="success" className="gap-1.5">
                  <Check className="h-3 w-3" />
                  Business Context Updated
                </Badge>
              ) : (
                <Badge className="gap-1.5">
                  <Sparkles className="h-3 w-3" />
                  Scan Results
                </Badge>
              )}
              <Badge variant="info">{results?.pages_crawled ?? 0} pages scanned</Badge>
              {typeof results?.pages_discovered === "number" && results.pages_discovered > 0 && (
                <Badge variant="info">{results.pages_discovered} pages discovered</Badge>
              )}
              {typeof (results as any)?.crawl_stats?.failed === "number" && (results as any).crawl_stats.failed > 0 && (
                <Badge variant="warning">{(results as any).crawl_stats.failed} failed</Badge>
              )}
              {typeof (results as any)?.crawl_stats?.robotsSkipped === "number" && (results as any).crawl_stats.robotsSkipped > 0 && (
                <Badge variant="warning">{(results as any).crawl_stats.robotsSkipped} robots-skipped</Badge>
              )}
              {typeof (results as any)?.crawl_stats?.duplicates === "number" && (results as any).crawl_stats.duplicates > 0 && (
                <Badge variant="warning">{(results as any).crawl_stats.duplicates} duplicates</Badge>
              )}
              {results?.js_rendered && (
                <Badge variant="purple">JS-rendered site — content recovered</Badge>
              )}
              {typeof results?.confidence === "number" && (
                <Badge variant="info">{Math.round(results.confidence * 100)}% confidence</Badge>
              )}
              {results?.partial && <Badge variant="warning">Partial scan</Badge>}
              {typeof results?.analysis_mode === "string" && (
                <Badge variant="purple">{results.analysis_mode}</Badge>
              )}
            </div>
          )}

          {!scan && !scanning && !error && (
            <p className="text-xs text-white/40">
              Enter your business website URL. DataBuks will crawl its public pages, analyze them with AI,
              and build your business context — used later for lead qualification and outreach.
            </p>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="summary" className="gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            Business Summary
          </TabsTrigger>
          <TabsTrigger value="brand" className="gap-1.5">
            <PaintBucket className="h-3.5 w-3.5" />
            Brand Voice
          </TabsTrigger>
          <TabsTrigger value="audience" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Target Audience
          </TabsTrigger>
          <TabsTrigger value="profile" className="gap-1.5">
            <Briefcase className="h-3.5 w-3.5" />
            Business Profile
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            Content Themes
          </TabsTrigger>
          <TabsTrigger value="competitors" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            Competitors
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Products &amp; Services
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <motion.div
            variants={tabVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6 mt-6"
          >
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {view.businessName || "Business Summary"}
                </CardTitle>
                <CardDescription className="text-base text-white/60 font-medium">
                  {view.tagline || "Scan your website to discover your business profile."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-white/70 leading-relaxed">
                  {view.summary || "No summary yet. Run a website scan to build your business summary."}
                </p>
                {results?.value_proposition && (
                  <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <p className="text-xs uppercase tracking-wider text-sky-400/80 font-semibold mb-1.5">Value Proposition</p>
                    <p className="text-sm text-white/70 leading-relaxed">{results.value_proposition}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Products", value: view.products.length, icon: Package },
                { label: "Services", value: view.services.length, icon: Wrench },
                { label: "Target Segments", value: view.targetAudience.length, icon: Users },
                { label: "Content Themes", value: view.knowledgeBase.length, icon: BookOpen },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 * i, duration: 0.3 }}
                >
                  <Card className="glass-card flex flex-col items-center justify-center py-5 gap-2">
                    <stat.icon className="h-5 w-5 text-white/40" />
                    <span className="text-2xl font-bold">{stat.value}</span>
                    <span className="text-xs text-white/40">{stat.label}</span>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </TabsContent>

        <TabsContent value="brand">
          <motion.div
            variants={tabVariants}
            initial="hidden"
            animate="visible"
            className="space-y-4 mt-6"
          >
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Brand Voice Traits</CardTitle>
                <CardDescription>
                  How your brand communicates and positions itself
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {view.brandVoice.length > 0 ? (
                  view.brandVoice.map((trait, i) => (
                    <div
                      key={trait}
                      className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-sm font-bold text-white/60">
                        {i + 1}
                      </span>
                      <span className="text-sm text-white/80">{trait}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-white/40">No brand voice detected yet. Run a website scan.</p>
                )}
                {results?.tone && (
                  <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <Sparkles className="h-4 w-4 text-sky-400 shrink-0" />
                    <span className="text-sm text-white/80">
                      Overall tone: <span className="text-white">{results.tone}</span>
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Color Palette
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4">
                  {brandColors.map((color) => (
                    <div key={color.name} className="flex flex-col items-center gap-2">
                      <div
                        className="h-10 w-10 rounded-full border-2 border-white/10"
                        style={{ backgroundColor: color.hex }}
                      />
                      <span className="text-xs text-white/50">{color.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        <TabsContent value="audience">
          <motion.div
            variants={tabVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6 mt-6"
          >
            {view.targetAudience.length > 0 ? (
              <div className="grid grid-cols-1 gap-6">
                {view.targetAudience.map((audience, i) => {
                  const source = results?.target_customers?.[i];
                  return (
                    <motion.div
                      key={audience.segment}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1, duration: 0.3 }}
                    >
                      <Card className="glass-card">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-xs font-bold text-white/60">
                              {i + 1}
                            </span>
                            {audience.segment}
                          </CardTitle>
                          <CardDescription>{audience.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {audience.painPoints.map((point) => (
                              <div
                                key={point}
                                className="flex items-start gap-3 text-sm text-white/70"
                              >
                                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/10">
                                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                                </div>
                                {point}
                              </div>
                            ))}
                          </div>
                          <Evidence sourceUrl={source?.source_url} evidence={source?.evidence} confidence={source?.confidence} />
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <Card className="glass-card">
                <CardContent className="py-8 text-center text-sm text-white/40">
                  <Users className="h-6 w-6 mx-auto mb-3 text-white/20" />
                  No target audience detected yet. Run a website scan.
                </CardContent>
              </Card>
            )}
          </motion.div>
        </TabsContent>

        <TabsContent value="profile">
          <motion.div
            variants={tabVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6 mt-6"
          >
            {!hasResults ? (
              <Card className="glass-card">
                <CardContent className="py-8 text-center text-sm text-white/40">
                  <Briefcase className="h-6 w-6 mx-auto mb-3 text-white/20" />
                  Run a website scan to build your business profile.
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="glass-card">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Target className="h-4 w-4 text-sky-400" />
                        Industries
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {(results?.industries ?? []).length > 0 ? (
                          results?.industries?.map((industry) => (
                            <Badge key={industry} variant="info">{industry}</Badge>
                          ))
                        ) : (
                          <span className="text-sm text-white/40">Not detected</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="glass-card">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <MapPin className="h-4 w-4 text-emerald-400" />
                        Locations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {(results?.locations ?? []).length > 0 ? (
                          results?.locations?.map((location) => (
                            <Badge key={location} variant="success">{location}</Badge>
                          ))
                        ) : (
                          <span className="text-sm text-white/40">Not detected</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-violet-400" />
                    Problems Solved
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(results?.problems_solved ?? []).map((problem) => (
                      <Card key={problem.problem} className="glass-card">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">{problem.problem}</CardTitle>
                          {problem.solution && (
                            <CardDescription>{problem.solution}</CardDescription>
                          )}
                        </CardHeader>
                        <CardContent className="pt-0">
                          <Evidence sourceUrl={problem.source_url} evidence={problem.evidence} />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Package className="h-4 w-4 text-sky-400" />
                    Offers &amp; Pricing
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(results?.offers ?? []).map((offer) => (
                      <Card key={offer.name} className="glass-card">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">{offer.name}</CardTitle>
                          <CardDescription>{offer.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <Evidence sourceUrl={offer.source_url} evidence={offer.evidence} />
                        </CardContent>
                      </Card>
                    ))}
                    {(results?.pricing ?? []).map((price) => (
                      <Card key={`${price.item}-${price.price}`} className="glass-card">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">{price.item}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <span className="text-2xl font-bold">{price.price ?? "Not published"}</span>
                          <Evidence sourceUrl={price.source_url} evidence={price.evidence} />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    Business Signals
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(results?.business_signals ?? []).map((signal) => (
                      <Card key={signal.signal} className="glass-card">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">{signal.signal}</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <Evidence sourceUrl={signal.source_url} evidence={signal.evidence} />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <ArrowUpRight className="h-4 w-4 text-sky-400" />
                    Social Profiles
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(results?.social_profiles ?? []).map((profile) => (
                      <Card key={profile.url} className="glass-card">
                        <CardContent className="flex items-center justify-between py-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-xs font-bold text-white/60 uppercase">
                              {profile.platform.slice(0, 2)}
                            </span>
                            <span className="text-sm text-white/80 capitalize">{profile.platform}</span>
                          </div>
                          <a
                            href={profile.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors"
                          >
                            Visit
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Quote className="h-4 w-4 text-amber-400" />
                    Testimonials
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(results?.testimonials ?? []).map((testimonial, i) => (
                      <Card key={`${testimonial.quote.slice(0, 40)}-${i}`} className="glass-card">
                        <CardContent className="pt-6">
                          <p className="text-sm text-white/70 italic leading-relaxed">
                            &ldquo;{testimonial.quote}&rdquo;
                          </p>
                          {testimonial.author && (
                            <p className="mt-2 text-xs text-white/40">— {testimonial.author}</p>
                          )}
                          {testimonial.source_url && (
                            <a
                              href={testimonial.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 flex items-center gap-1 text-xs text-sky-400/80 hover:text-sky-300 transition-colors w-fit"
                            >
                              {displayUrl(testimonial.source_url)}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {results?.contact_info && (
                  <Card className="glass-card">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Phone className="h-4 w-4 text-emerald-400" />
                        Public Contact Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-white/70">
                      {results.contact_info.email && <p>Email: {results.contact_info.email}</p>}
                      {results.contact_info.phone && <p>Phone: {results.contact_info.phone}</p>}
                      {results.contact_info.address && <p>Address: {results.contact_info.address}</p>}
                      {results.contact_info.source_url && (
                        <a
                          href={results.contact_info.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-sky-400/80 hover:text-sky-300 transition-colors w-fit"
                        >
                          Source: {displayUrl(results.contact_info.source_url)}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </CardContent>
                  </Card>
                )}

                <div>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-cyan-400" />
                    Case Studies
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(results?.case_studies ?? []).map((caseStudy) => (
                      <Card key={caseStudy.title} className="glass-card">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">{caseStudy.title}</CardTitle>
                          <CardDescription className="line-clamp-2">
                            {caseStudy.summary}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <Evidence sourceUrl={caseStudy.source_url} />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </TabsContent>

        <TabsContent value="knowledge">
          <motion.div
            variants={tabVariants}
            initial="hidden"
            animate="visible"
            className="mt-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {view.knowledgeBase.map((article, i) => (
                <motion.div
                  key={article.title}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.3 }}
                >
                  <Card className="glass-card h-full flex flex-col">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base leading-snug pr-2">
                          {article.title}
                        </CardTitle>
                        <Badge variant="info" className="shrink-0">
                          {article.category}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col justify-between gap-3">
                      <p className="text-sm text-white/50 line-clamp-2 leading-relaxed">
                        {article.content}
                      </p>
                      {results?.content_themes?.[i]?.source_url && (
                        <a
                          href={results.content_themes[i].source_url ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors self-start"
                        >
                          Source
                          <ChevronRight className="h-3 w-3" />
                        </a>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </TabsContent>

        <TabsContent value="competitors">
          <motion.div
            variants={tabVariants}
            initial="hidden"
            animate="visible"
            className="mt-6"
          >
            <Card className="glass-card overflow-hidden">
              {view.competitors.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Website</TableHead>
                        <TableHead>Strengths</TableHead>
                        <TableHead>Weaknesses</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {view.competitors.map((competitor, i) => (
                        <motion.tr
                          key={competitor.name}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.1, duration: 0.3 }}
                          className="border-b border-white/5 transition-colors hover:bg-white/[0.02]"
                        >
                          <TableCell className="font-medium text-white">
                            {competitor.name}
                          </TableCell>
                          <TableCell>
                            <a
                              href={competitor.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors"
                            >
                              {competitor.url.replace("https://", "")}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {competitor.strengths.map((s) => (
                                <Badge
                                  key={s}
                                  variant="success"
                                  className="text-[10px]"
                                >
                                  {s}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {competitor.weaknesses.map((w) => (
                                <Badge
                                  key={w}
                                  variant="destructive"
                                  className="text-[10px]"
                                >
                                  {w}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                        </motion.tr>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <CardContent className="py-8 text-center text-sm text-white/40">
                  <Shield className="h-6 w-6 mx-auto mb-3 text-white/20" />
                  No competitor data available.
                </CardContent>
              )}
            </Card>
          </motion.div>
        </TabsContent>

        <TabsContent value="products">
          <motion.div
            variants={tabVariants}
            initial="hidden"
            animate="visible"
            className="space-y-8 mt-6"
          >
            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Package className="h-4 w-4 text-sky-400" />
                Products
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {view.products.map((product, i) => {
                  const source = results?.products?.[i];
                  return (
                    <motion.div
                      key={product.name}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1, duration: 0.3 }}
                    >
                      <Card className="glass-card h-full flex flex-col">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">
                            {product.name}
                          </CardTitle>
                          <CardDescription>{product.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col gap-4">
                          <span className="text-3xl font-bold tracking-tight">
                            {product.price || "Not published"}
                          </span>
                          {product.features.length > 0 && (
                            <>
                              <Separator className="bg-white/[0.06]" />
                              <div className="space-y-2.5">
                                {product.features.map((f) => (
                                  <div
                                    key={f}
                                    className="flex items-start gap-2.5 text-sm text-white/60"
                                  >
                                    <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                                    {f}
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                          <Evidence sourceUrl={source?.source_url} evidence={source?.evidence} confidence={source?.confidence} />
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Wrench className="h-4 w-4 text-violet-400" />
                Services
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {view.services.map((service, i) => {
                  const source = results?.services?.[i];
                  return (
                    <motion.div
                      key={service.name}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 + 0.2, duration: 0.3 }}
                    >
                      <Card className="glass-card h-full flex flex-col">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">
                            {service.name}
                          </CardTitle>
                          <CardDescription>
                            {service.description}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 flex flex-col gap-4">
                          <span className="text-3xl font-bold tracking-tight">
                            {service.price || "Not published"}
                          </span>
                          {service.features.length > 0 && (
                            <>
                              <Separator className="bg-white/[0.06]" />
                              <div className="space-y-2.5">
                                {service.features.map((f) => (
                                  <div
                                    key={f}
                                    className="flex items-start gap-2.5 text-sm text-white/60"
                                  >
                                    <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                                    {f}
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                          <Evidence sourceUrl={source?.source_url} evidence={source?.evidence} confidence={source?.confidence} />
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
