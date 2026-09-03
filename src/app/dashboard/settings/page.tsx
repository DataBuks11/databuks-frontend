"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  Bell,
  Smartphone,
  MessageSquare,
  Wifi,
  WifiOff,
  Send,
  Bot,
  Phone,
  Target,
  FileText,
  Mail,
  Plug,
  Key,
  Shield,
  Copy,
  X,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  Clock,
  MapPin,
  Monitor,
  Check,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { settingsData } from "@/lib/data";
import { useSettings, useSettingsMutations } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { ApiKey as ApiKeyType, SettingsData } from "@/types";

type TabId = "business-profile" | "business-context" | "notifications" | "integrations" | "api-keys" | "security" | "personal-whatsapp";

const ADMIN_EMAILS = ["databuksllc@gmail.com"];

const baseTabs: { id: TabId; label: string; icon: any; adminOnly?: boolean }[] = [
  { id: "business-profile", label: "Business Profile", icon: Building2 },
  { id: "business-context", label: "Business Context", icon: Target, adminOnly: true },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "personal-whatsapp", label: "Personal WhatsApp", icon: MessageSquare, adminOnly: true },
];

const notificationSettings = [
  {
    key: "emailAlerts" as const,
    label: "Email Alerts",
    description: "Receive email notifications for important updates",
    icon: Bell,
    color: "text-amber-400",
    bg: "bg-amber-400/10",
  },
  {
    key: "pushNotifications" as const,
    label: "Push Notifications",
    description: "Get push notifications on your devices",
    icon: Smartphone,
    color: "text-violet-400",
    bg: "bg-violet-400/10",
  },
  {
    key: "leadNotifications" as const,
    label: "Lead Notifications",
    description: "Get notified when new leads are created or scored",
    icon: Target,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
  },
  {
    key: "contentNotifications" as const,
    label: "Content Notifications",
    description: "Notifications about content publishing and approvals",
    icon: FileText,
    color: "text-sky-400",
    bg: "bg-sky-400/10",
  },
  {
    key: "weeklyReport" as const,
    label: "Weekly Report",
    description: "Receive a weekly performance summary via email",
    icon: Mail,
    color: "text-rose-400",
    bg: "bg-rose-400/10",
  },
] as const;

const envVariant: Record<ApiKeyType["environment"], "success" | "info" | "warning"> = {
  production: "success",
  development: "info",
  sandbox: "warning",
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("business-profile");

  // Admin detection
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const isAdmin = !!userEmail && ADMIN_EMAILS.includes(userEmail);
  const tabs = baseTabs.filter((t) => !t.adminOnly || isAdmin);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, []);

  // Personal WhatsApp state
  const [personalWA, setPersonalWA] = useState<{
    enabled: boolean;
    jid: string | null;
    loading: boolean;
    saving: boolean;
    testSending: boolean;
    testResult: string | null;
    phoneInput: string;
    mode: "business" | "personal" | null;
    modeUpdating: boolean;
    connecting: boolean;
    qr: string | null;
    qrError: string | null;
    sessionStatus: "unknown" | "connected" | "disconnected";
    disconnectBusy: boolean;
    sessionBusy: boolean;
  }>({ enabled: false, jid: null, loading: true, saving: false, testSending: false, testResult: null, phoneInput: "", mode: null, modeUpdating: false, connecting: false, qr: null, qrError: null, sessionStatus: "unknown", disconnectBusy: false, sessionBusy: false });

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/ai/assistant/personal")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setPersonalWA((prev) => ({
            ...prev,
            enabled: d.enabled ?? false,
            jid: d.jid ?? null,
            phoneInput: d.jid ? d.jid.replace("@s.whatsapp.net", "") : "",
            mode: d.mode ?? "business",
            loading: false,
          }));
        } else {
          setPersonalWA((prev) => ({ ...prev, loading: false }));
        }
      })
      .catch(() => setPersonalWA((prev) => ({ ...prev, loading: false })));
  }, [isAdmin]);

  const handleSavePersonalWA = async () => {
    setPersonalWA((prev) => ({ ...prev, saving: true }));
    try {
      const digits = personalWA.phoneInput.replace(/\D/g, "");
      const jid = digits.length >= 10 ? `${digits}@s.whatsapp.net` : null;
      await fetch("/api/ai/assistant/personal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: personalWA.enabled, jid }),
      });
      setPersonalWA((prev) => ({ ...prev, jid, saving: false, testResult: "Saved!" }));
      setTimeout(() => setPersonalWA((prev) => ({ ...prev, testResult: null })), 3000);
    } catch {
      setPersonalWA((prev) => ({ ...prev, saving: false, testResult: "Save failed" }));
    }
  };

  const handleTestMessage = async () => {
    setPersonalWA((prev) => ({ ...prev, testSending: true, testResult: null }));
    try {
      const res = await fetch("/api/ai/assistant/personal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test_message: true }),
      });
      const data = await res.json();
      setPersonalWA((prev) => ({
        ...prev,
        testSending: false,
        testResult: data.ok ? "Test message sent!" : (data.error ?? "Failed"),
      }));
      setTimeout(() => setPersonalWA((prev) => ({ ...prev, testResult: null })), 5000);
    } catch {
      setPersonalWA((prev) => ({ ...prev, testSending: false, testResult: "Request failed" }));
    }
  };

  // ─── QR pairing + session control (Baileys via admin proxy) ─────────────
  const currentUserId = async (): Promise<string | null> => {
    try {
      const sb = createClient();
      const { data } = await sb.auth.getUser();
      return data.user?.id ?? null;
    } catch {
      return null;
    }
  };

  const refreshSessionStatus = async () => {
    try {
      const uid = await currentUserId();
      if (!uid) return;
      const res = await fetch(`/api/ai/assistant/personal/baileys?action=status&userId=${uid}`);
      const data = await res.json();
      setPersonalWA((prev) => ({
        ...prev,
        sessionStatus: data.connected ? "connected" : "disconnected",
      }));
    } catch {}
  };

  const startQrConnect = async () => {
    setPersonalWA((prev) => ({ ...prev, connecting: true, qr: null, qrError: null }));
    try {
      const uid = await currentUserId();
      if (!uid) {
        setPersonalWA((prev) => ({ ...prev, connecting: false, qrError: "Not signed in" }));
        return;
      }
      // 1. Ask baileys to prepare a connection
      await fetch("/api/ai/assistant/personal/baileys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, action: "connect" }),
      });
      // 2. Poll for QR (up to 90s)
      let lastError: string | null = null;
      for (let i = 0; i < 18; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        try {
          const res = await fetch(`/api/ai/assistant/personal/baileys?action=qr&userId=${uid}`);
          const data = await res.json();
          if (data.connected) {
            setPersonalWA((prev) => ({ ...prev, connecting: false, sessionStatus: "connected", qr: null, qrError: null }));
            return;
          }
          if (data.qr) {
            setPersonalWA((prev) => ({ ...prev, connecting: false, qr: data.qr, qrError: null, sessionStatus: "disconnected" }));
            return;
          }
          lastError = data.error ?? null;
        } catch {
          lastError = "baileys unreachable";
        }
      }
      setPersonalWA((prev) => ({
        ...prev,
        connecting: false,
        qr: null,
        qrError: lastError ?? "QR timeout — try again",
      }));
    } catch (err: any) {
      setPersonalWA((prev) => ({ ...prev, connecting: false, qrError: err?.message ?? "connect failed" }));
    }
  };

  const handleDisconnectSession = async () => {
    setPersonalWA((prev) => ({ ...prev, disconnectBusy: true }));
    try {
      const uid = await currentUserId();
      if (!uid) return;
      const res = await fetch("/api/ai/assistant/personal/baileys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, action: "disconnect" }),
      });
      const data = await res.json();
      setPersonalWA((prev) => ({
        ...prev,
        disconnectBusy: false,
        sessionStatus: "disconnected",
        qr: null,
        qrError: data.ok ? null : (data.error ?? "disconnect failed"),
      }));
    } catch {
      setPersonalWA((prev) => ({ ...prev, disconnectBusy: false }));
    }
  };

  // ─── Business Context (business_context table) ──────────────────────────
  const [bizCtx, setBizCtx] = useState<{
    business_name: string;
    description: string;
    products: string;
    services: string;
    target_audience: string;
    ideal_customer_profile: string;
    locations: string;
    industries: string;
    brand_voice: string;
    tone: string;
    preferred_channels: string;
    monthly_meeting_target: string;
    business_instructions: string;
    preferred_language: string;
    content_preferences: string;
    outreach_preferences: string;
    loading: boolean;
    saving: boolean;
    saved: string | null;
    error: string | null;
  }>({
    business_name: "", description: "", products: "", services: "", target_audience: "",
    ideal_customer_profile: "", locations: "", industries: "", brand_voice: "", tone: "",
    preferred_channels: "", monthly_meeting_target: "", business_instructions: "",
    preferred_language: "", content_preferences: "", outreach_preferences: "",
    loading: false, saving: false, saved: null, error: null,
  });
  const [bizCtxInitialized, setBizCtxInitialized] = useState(false);

  useEffect(() => {
    if (!isAdmin || bizCtxInitialized) return;
    setBizCtxInitialized(true);
    (async () => {
      setBizCtx((prev) => ({ ...prev, loading: true }));
      try {
        const res = await fetch("/api/ai/business-context");
        if (!res.ok) throw new Error("failed to load");
        const d = await res.json();
        const arr = (v: any, key: string) => Array.isArray(v) ? JSON.stringify(v.map((x: any) => (typeof x === "string" ? x : x?.[key] ?? x)), null, 1) : "";
        setBizCtx((prev) => ({
          ...prev,
          business_name: d.business_name ?? "",
          description: d.description ?? "",
          products: arr(d.products, "name"),
          services: arr(d.services, "name"),
          target_audience: Array.isArray(d.target_audience) ? JSON.stringify(d.target_audience, null, 1) : "",
          ideal_customer_profile: d.ideal_customer_profile && Object.keys(d.ideal_customer_profile).length ? JSON.stringify(d.ideal_customer_profile, null, 1) : "",
          locations: Array.isArray(d.locations) ? JSON.stringify(d.locations, null, 1) : "",
          industries: Array.isArray(d.industries) ? JSON.stringify(d.industries, null, 1) : "",
          brand_voice: arr(d.brand_voice, "brand_voice"),
          tone: d.tone ?? "",
          preferred_channels: arr(d.preferred_channels, "preferred_channels"),
          monthly_meeting_target: String(d.monthly_meeting_target ?? ""),
          business_instructions: (d.constraints && typeof d.constraints === "object" && (d.constraints as any).business_instructions) || "",
          preferred_language: (d.constraints && typeof d.constraints === "object" && (d.constraints as any).preferred_language) || "",
          content_preferences: (d.constraints && typeof d.constraints === "object" && (d.constraints as any).content_preferences) || "",
          outreach_preferences: (d.constraints && typeof d.constraints === "object" && (d.constraints as any).outreach_preferences) || "",
          loading: false,
        }));
      } catch {
        setBizCtx((prev) => ({ ...prev, loading: false, error: "Business context load failed" }));
      }
    })();
  }, [isAdmin, bizCtxInitialized]);

  const parseJsonSafe = (s: string): any => {
    const t = s.trim();
    if (!t) return undefined;
    return JSON.parse(t);
  };

  const handleSaveBizCtx = async () => {
    setBizCtx((prev) => ({ ...prev, saving: true, saved: null, error: null }));
    try {
      const body: Record<string, any> = {
        business_name: bizCtx.business_name || undefined,
        description: bizCtx.description || undefined,
        monthly_meeting_target: bizCtx.monthly_meeting_target ? parseInt(bizCtx.monthly_meeting_target, 10) : undefined,
        tone: bizCtx.tone || undefined,
        products: parseJsonSafe(bizCtx.products),
        services: parseJsonSafe(bizCtx.services),
        target_audience: parseJsonSafe(bizCtx.target_audience),
        ideal_customer_profile: parseJsonSafe(bizCtx.ideal_customer_profile),
        locations: parseJsonSafe(bizCtx.locations),
        industries: parseJsonSafe(bizCtx.industries),
        brand_voice: parseJsonSafe(bizCtx.brand_voice),
        preferred_channels: parseJsonSafe(bizCtx.preferred_channels),
      };
      const constraints: Record<string, string> = {};
      if (bizCtx.business_instructions.trim()) constraints.business_instructions = bizCtx.business_instructions.trim();
      if (bizCtx.preferred_language.trim()) constraints.preferred_language = bizCtx.preferred_language.trim();
      if (bizCtx.content_preferences.trim()) constraints.content_preferences = bizCtx.content_preferences.trim();
      if (bizCtx.outreach_preferences.trim()) constraints.outreach_preferences = bizCtx.outreach_preferences.trim();
      if (Object.keys(constraints).length) body.constraints = constraints;

      const res = await fetch("/api/ai/business-context", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "save failed");
      }
      setBizCtx((prev) => ({ ...prev, saving: false, saved: "Business context saved ✓" }));
      setTimeout(() => setBizCtx((prev) => ({ ...prev, saved: null })), 3500);
    } catch (err: any) {
      setBizCtx((prev) => ({ ...prev, saving: false, error: err?.message ?? "save failed" }));
    }
  };

  const { settings: workspaceSettings, loading: settingsLoading } = useSettings();
  const { updateSettings, loading: saveSettingsLoading } = useSettingsMutations();

  const [profile, setProfile] = useState(settingsData.businessProfile);
  const [profileInitialized, setProfileInitialized] = useState(false);

  if (workspaceSettings && !profileInitialized) {
    setProfile((prev) => ({
      ...prev,
      name: workspaceSettings.business_name || prev.name,
    }));
    setProfileInitialized(true);
  }

  const [notifications, setNotifications] = useState(settingsData.notifications);
  const [notificationsInitialized, setNotificationsInitialized] = useState(false);

  if (workspaceSettings?.notifications && !notificationsInitialized) {
    const n = workspaceSettings.notifications;
    setNotifications({
      emailAlerts: n.emailAlerts ?? settingsData.notifications.emailAlerts,
      pushNotifications: n.pushNotifications ?? settingsData.notifications.pushNotifications,
      leadNotifications: n.leadNotifications ?? settingsData.notifications.leadNotifications,
      contentNotifications: n.contentNotifications ?? settingsData.notifications.contentNotifications,
      weeklyReport: n.weeklyReport ?? settingsData.notifications.weeklyReport,
    });
    setNotificationsInitialized(true);
  }

  const [apiKeys] = useState(settingsData.apiKeys);
  const [security] = useState(settingsData.security);
  const [integrations] = useState(settingsData.integrations);

  const [twoFactor, setTwoFactor] = useState(security.twoFactorEnabled);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [businessProfileSaved, setBusinessProfileSaved] = useState(false);
  const [notificationsSaved, setNotificationsSaved] = useState(false);

  const handleSaveBusinessProfile = async () => {
    try {
      await updateSettings({ business_name: profile.name });
      setBusinessProfileSaved(true);
      setTimeout(() => setBusinessProfileSaved(false), 3000);
    } catch {}
  };

  const handleSaveNotifications = async () => {
    try {
      await updateSettings({ notifications });
      setNotificationsSaved(true);
      setTimeout(() => setNotificationsSaved(false), 3000);
    } catch {}
  };

  const handleCopyKey = useCallback((key: string, id: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  const handleToggleNotification = useCallback(
    (key: keyof SettingsData["notifications"]) => {
      setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    []
  );

  function maskKey(key: string, show: boolean): string {
    if (show) return key;
    const prefix = key.slice(0, 7);
    return `${prefix}${"•".repeat(Math.max(key.length - 11, 8))}`;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          Settings
        </h1>
        <p className="text-white/50 mt-1 text-sm">
          Manage your account preferences and configurations
        </p>
      </motion.div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Sidebar Tabs */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="lg:w-56 shrink-0"
        >
          <Card className="glass-card rounded-2xl border-white/[0.08] p-2">
            <nav className="space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                    activeTab === tab.id
                      ? "bg-white/10 text-white"
                      : "text-white/50 hover:text-white/80 hover:bg-white/[0.05]"
                  )}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </Card>
        </motion.div>

        {/* Right Content Panel */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {/* Business Profile */}
              {activeTab === "business-profile" && (
                <Card className="glass-card rounded-2xl border-white/[0.08] p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-blue-400/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">
                        Business Profile
                      </h2>
                      <p className="text-sm text-white/50">
                        Update your business information
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="business-name">Business Name</Label>
                      <Input
                        id="business-name"
                        value={profile.name}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, name: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="business-email">Email</Label>
                      <Input
                        id="business-email"
                        type="email"
                        value={profile.email}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, email: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="business-phone">Phone</Label>
                      <Input
                        id="business-phone"
                        type="tel"
                        value={profile.phone}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, phone: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="business-website">Website</Label>
                      <Input
                        id="business-website"
                        type="url"
                        value={profile.website}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            website: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="md:col-span-2 space-y-2">
                      <Label htmlFor="business-address">Address</Label>
                      <Input
                        id="business-address"
                        value={profile.address}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            address: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-white/[0.08] flex items-center gap-3">
                    <Button onClick={handleSaveBusinessProfile} disabled={saveSettingsLoading}>
                      {saveSettingsLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Save Changes
                    </Button>
                    {businessProfileSaved && (
                      <span className="flex items-center gap-1.5 text-sm text-emerald-400">
                        <CheckCircle2 className="h-4 w-4" />
                        Saved
                      </span>
                    )}
                  </div>
                </Card>
              )}

              {/* Business Context (admin) */}
              {activeTab === "business-context" && isAdmin && (
                <Card className="glass-card rounded-2xl border-white/[0.08] p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-violet-400/10 flex items-center justify-center">
                      <Target className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">Business Context</h2>
                      <p className="text-sm text-white/50">
                        Lead discovery, scoring, outreach, content & replies iske according honge
                      </p>
                    </div>
                  </div>

                  {bizCtx.loading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="h-5 w-5 animate-spin text-white/50" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2 md:col-span-2">
                        <Label>Business Name</Label>
                        <Input value={bizCtx.business_name} onChange={(e) => setBizCtx((p) => ({ ...p, business_name: e.target.value }))} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Description</Label>
                        <textarea className="w-full min-h-[80px] rounded-lg bg-white/[0.04] border border-white/[0.08] p-3 text-sm text-white" value={bizCtx.description} onChange={(e) => setBizCtx((p) => ({ ...p, description: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Products (JSON array)</Label>
                        <textarea className="w-full min-h-[70px] rounded-lg bg-white/[0.04] border border-white/[0.08] p-2 text-xs text-white" value={bizCtx.products} onChange={(e) => setBizCtx((p) => ({ ...p, products: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Services (JSON array)</Label>
                        <textarea className="w-full min-h-[70px] rounded-lg bg-white/[0.04] border border-white/[0.08] p-2 text-xs text-white" value={bizCtx.services} onChange={(e) => setBizCtx((p) => ({ ...p, services: e.target.value }))} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Target Audience (JSON: [{"{"}"segment":"...","description":"..."{"}"}])</Label>
                        <textarea className="w-full min-h-[70px] rounded-lg bg-white/[0.04] border border-white/[0.08] p-2 text-xs text-white" value={bizCtx.target_audience} onChange={(e) => setBizCtx((p) => ({ ...p, target_audience: e.target.value }))} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Locations / Regions (JSON array, e.g. ["Nagpur, Maharashtra, India", "Global"])</Label>
                        <textarea className="w-full min-h-[50px] rounded-lg bg-white/[0.04] border border-white/[0.08] p-2 text-xs text-white" value={bizCtx.locations} onChange={(e) => setBizCtx((p) => ({ ...p, locations: e.target.value }))} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Target Industries (JSON array)</Label>
                        <textarea className="w-full min-h-[50px] rounded-lg bg-white/[0.04] border border-white/[0.08] p-2 text-xs text-white" value={bizCtx.industries} onChange={(e) => setBizCtx((p) => ({ ...p, industries: e.target.value }))} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Ideal Customer Profile (JSON object)</Label>
                        <textarea className="w-full min-h-[60px] rounded-lg bg-white/[0.04] border border-white/[0.08] p-2 text-xs text-white" value={bizCtx.ideal_customer_profile} onChange={(e) => setBizCtx((p) => ({ ...p, ideal_customer_profile: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Brand Voice (JSON array)</Label>
                        <textarea className="w-full min-h-[50px] rounded-lg bg-white/[0.04] border border-white/[0.08] p-2 text-xs text-white" value={bizCtx.brand_voice} onChange={(e) => setBizCtx((p) => ({ ...p, brand_voice: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Tone</Label>
                        <Input value={bizCtx.tone} onChange={(e) => setBizCtx((p) => ({ ...p, tone: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Preferred Channels (JSON array, e.g. ["whatsapp","instagram","email"])</Label>
                        <Input value={bizCtx.preferred_channels} onChange={(e) => setBizCtx((p) => ({ ...p, preferred_channels: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Monthly Meeting Target</Label>
                        <Input type="number" value={bizCtx.monthly_meeting_target} onChange={(e) => setBizCtx((p) => ({ ...p, monthly_meeting_target: e.target.value }))} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Business-specific Instructions</Label>
                        <textarea className="w-full min-h-[50px] rounded-lg bg-white/[0.04] border border-white/[0.08] p-2 text-xs text-white" value={bizCtx.business_instructions} onChange={(e) => setBizCtx((p) => ({ ...p, business_instructions: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Preferred Language</Label>
                        <Input value={bizCtx.preferred_language} onChange={(e) => setBizCtx((p) => ({ ...p, preferred_language: e.target.value }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Content Preferences</Label>
                        <Input value={bizCtx.content_preferences} onChange={(e) => setBizCtx((p) => ({ ...p, content_preferences: e.target.value }))} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>Outreach Preferences</Label>
                        <Input value={bizCtx.outreach_preferences} onChange={(e) => setBizCtx((p) => ({ ...p, outreach_preferences: e.target.value }))} />
                      </div>
                      <div className="md:col-span-2 flex items-center gap-3 pt-2">
                        <Button onClick={handleSaveBizCtx} disabled={bizCtx.saving}>
                          {bizCtx.saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                          Save Business Context
                        </Button>
                        {bizCtx.saved && <span className="text-sm text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />{bizCtx.saved}</span>}
                        {bizCtx.error && <span className="text-sm text-red-400">{bizCtx.error}</span>}
                      </div>
                    </div>
                  )}
                </Card>
              )}

              {/* Notifications */}
              {activeTab === "notifications" && (
                <Card className="glass-card rounded-2xl border-white/[0.08] p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-amber-400/10 flex items-center justify-center">
                      <Bell className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">Notifications</h2>
                      <p className="text-sm text-white/50">Manage how you receive alerts and updates</p>
                    </div>
                  </div>
                  <p className="text-sm text-white/50 py-4">
                    Email and push notification delivery is not set up yet. Important events
                    (new leads, meeting bookings, WhatsApp activity) are always available in
                    your dashboard Activity feed.
                  </p>
                </Card>
              )}

              {/* Personal WhatsApp — admin only */}
              {activeTab === "personal-whatsapp" && isAdmin && (
                <Card className="glass-card rounded-2xl border-white/[0.08] p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-green-400/10 flex items-center justify-center">
                      <MessageSquare className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">Personal WhatsApp Assistant</h2>
                      <p className="text-sm text-white/50">Connect your personal WhatsApp for AI-powered conversations</p>
                    </div>
                  </div>

                  {personalWA.loading ? (
                    <div className="flex items-center gap-2 py-8 justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-white/50" />
                      <span className="text-sm text-white/50">Loading...</span>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Connection Status */}
                      <div className="glass-card rounded-xl border border-white/[0.08] p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {personalWA.jid ? (
                              <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                                <Wifi className="w-4 h-4 text-green-400" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                <WifiOff className="w-4 h-4 text-white/40" />
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-medium text-white">
                                {personalWA.jid ? "Connected" : "Not Connected"}
                              </p>
                              <p className="text-xs text-white/40">
                                {personalWA.jid
                                  ? `JID: ${personalWA.jid}`
                                  : "Enter your personal WhatsApp number below"}
                              </p>
                            </div>
                          </div>
                          <Badge variant={personalWA.jid ? "success" : "secondary"} className="text-xs">
                            {personalWA.jid ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </div>

                      {/* Phone Number Input */}
                      <div className="space-y-2">
                        <Label htmlFor="personal-wa-phone">Personal WhatsApp Number</Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                            <Input
                              id="personal-wa-phone"
                              type="tel"
                              placeholder="919876543210 (with country code)"
                              value={personalWA.phoneInput}
                              onChange={(e) =>
                                setPersonalWA((prev) => ({ ...prev, phoneInput: e.target.value }))
                              }
                              className="pl-10"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-white/30">Include country code without + (e.g. 919876543210)</p>
                      </div>

                      {/* Enable/Disable */}
                      <div className="flex items-center justify-between glass-card rounded-xl border border-white/[0.08] p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-violet-400/10 flex items-center justify-center">
                            <Bot className="w-4 h-4 text-violet-400" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">Enable Personal WhatsApp AI</p>
                            <p className="text-xs text-white/40">AI will respond to messages on your personal number</p>
                          </div>
                        </div>
                        <Switch
                          checked={personalWA.enabled}
                          onCheckedChange={(checked) =>
                            setPersonalWA((prev) => ({ ...prev, enabled: checked }))
                          }
                        />
                      </div>

                      {/* Assistant Mode — switch between Personal Assistant & Business Chatbot */}
                      <div className="glass-card rounded-xl border border-white/[0.08] p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-sky-400/10 flex items-center justify-center">
                              <MessageSquare className="w-4 h-4 text-sky-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">
                                Assistant Mode:{" "}
                                <span className="capitalize">{personalWA.mode ?? "business"}</span>
                              </p>
                              <p className="text-xs text-white/40">
                                WhatsApp pe "personal" ya "back to business" likh ke bhi switch ho sakta hai.
                                Personal = casual chat (no business data), Business = business context ke hisaab se replies.
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant={personalWA.mode === "personal" ? "warning" : "success"}
                            className="text-xs"
                          >
                            {personalWA.mode === "personal" ? "Personal" : "Business"}
                          </Badge>
                        </div>
                        <div className="mt-4 flex items-center justify-between rounded-lg bg-white/[0.03] border border-white/[0.06] p-3">
                          <div>
                            <p className="text-sm font-medium text-white">
                              {personalWA.mode === "personal" ? "Personal Assistant ON" : "Business Chatbot ON"}
                            </p>
                            <p className="text-xs text-white/40">
                              {personalWA.mode === "personal"
                                ? "Casual chats, no business data shared"
                                : "Replies using your business context (services, tone, leads)"}
                            </p>
                          </div>
                          <Switch
                            checked={personalWA.mode === "personal"}
                            disabled={personalWA.modeUpdating}
                            onCheckedChange={async (checked) => {
                              const nextMode = checked ? "personal" : "business";
                              setPersonalWA((prev) => ({ ...prev, modeUpdating: true }));
                              try {
                                const res = await fetch("/api/ai/assistant/personal", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ mode: nextMode }),
                                });
                                if (res.ok) {
                                  setPersonalWA((prev) => ({ ...prev, mode: nextMode, testResult: `${nextMode} mode on ✓` }));
                                } else {
                                  setPersonalWA((prev) => ({ ...prev, testResult: "Mode switch failed" }));
                                }
                              } catch {
                                setPersonalWA((prev) => ({ ...prev, testResult: "Mode switch failed" }));
                              } finally {
                                setPersonalWA((prev) => ({ ...prev, modeUpdating: false }));
                                setTimeout(() => setPersonalWA((prev) => ({ ...prev, testResult: null })), 3000);
                              }
                            }}
                          />
                        </div>
                      </div>

                      {/* QR Pairing */}
                      <div className="glass-card rounded-xl border border-white/[0.08] p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-400/10 flex items-center justify-center">
                              <Wifi className="w-4 h-4 text-emerald-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">WhatsApp QR Pairing</p>
                              <p className="text-xs text-white/40">
                                Personal WhatsApp "Linked Devices" se QR scan karo
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant={personalWA.sessionStatus === "connected" ? "success" : personalWA.sessionStatus === "unknown" ? "secondary" : "warning"}
                            className="text-xs"
                          >
                            {personalWA.sessionStatus === "connected" ? "Session Connected" : personalWA.sessionStatus === "unknown" ? "Unknown" : "Not Paired"}
                          </Badge>
                        </div>

                        {personalWA.qr && (
                          <div className="flex flex-col items-center gap-2 py-2">
                            <img src={personalWA.qr} alt="WhatsApp QR" className="w-56 h-56 rounded-lg bg-white p-2" />
                            <p className="text-xs text-white/40">WhatsApp → Linked Devices → Link a Device → scan</p>
                          </div>
                        )}
                        {personalWA.connecting && (
                          <div className="flex items-center gap-2 py-3 justify-center text-sm text-white/50">
                            <Loader2 className="h-4 w-4 animate-spin" /> preparing QR...
                          </div>
                        )}
                        {personalWA.qrError && (
                          <p className="text-xs text-red-400 py-1">{personalWA.qrError}</p>
                        )}

                        <div className="flex flex-wrap gap-2 mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={startQrConnect}
                            disabled={personalWA.connecting || personalWA.sessionStatus === "connected"}
                          >
                            {personalWA.connecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wifi className="h-4 w-4 mr-2" />}
                            {personalWA.sessionStatus === "connected" ? "Paired ✓" : "Show QR"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={refreshSessionStatus}
                            disabled={personalWA.sessionBusy}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" /> Refresh Status
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleDisconnectSession}
                            disabled={personalWA.disconnectBusy || personalWA.sessionStatus !== "connected"}
                          >
                            {personalWA.disconnectBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <WifiOff className="h-4 w-4 mr-2" />}
                            Disconnect
                          </Button>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap gap-3">
                        <Button onClick={handleSavePersonalWA} disabled={personalWA.saving}>
                          {personalWA.saving ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Check className="h-4 w-4 mr-2" />
                          )}
                          Save Settings
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleTestMessage}
                          disabled={personalWA.testSending || !personalWA.jid}
                        >
                          {personalWA.testSending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          Send Test Message
                        </Button>
                        <Button
                          variant="outline"
                          disabled={!personalWA.jid || !personalWA.enabled}
                          onClick={() => {
                            setPersonalWA((prev) => ({ ...prev, testResult: "AI conversation triggered (check WhatsApp)" }));
                            setTimeout(() => setPersonalWA((prev) => ({ ...prev, testResult: null })), 5000);
                          }}
                        >
                          <Bot className="h-4 w-4 mr-2" />
                          Trigger AI Conversation
                        </Button>
                      </div>

                      {/* Status Message */}
                      {personalWA.testResult && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex items-center gap-2 text-sm"
                        >
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          <span className="text-emerald-400">{personalWA.testResult}</span>
                        </motion.div>
                      )}

                      {/* Info Note */}
                      <div className="glass-card rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-200/80 space-y-1">
                          <p>This personal WhatsApp account is separate from the business WhatsApp account.</p>
                          <p className="text-xs text-amber-200/60">Messages sent via this number will not appear in the main business conversation feed.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              )}

              {/* Integrations */}
              {activeTab === "integrations" && (
                <Card className="glass-card rounded-2xl border-white/[0.08] p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-violet-400/10 flex items-center justify-center">
                      <Plug className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-white">
                        Integrations
                      </h2>
                      <p className="text-sm text-white/50">
                        Connect your favorite tools and services
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {integrations.map((integration) => (
                      <div
                        key={integration.name}
                        className="glass-card rounded-xl border border-white/[0.08] p-4 flex flex-col gap-3"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-white">
                            {integration.name}
                          </p>
                          <Badge
                            variant={
                              integration.connected ? "success" : "secondary"
                            }
                            className="text-xs"
                          >
                            {integration.connected
                              ? "Connected"
                              : "Not Connected"}
                          </Badge>
                        </div>

                        {integration.lastSync && (
                          <p className="text-xs text-white/40">
                            Last sync: {integration.lastSync}
                          </p>
                        )}

                        <div className="flex gap-2 mt-auto">
                          {integration.connected ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                              >
                                Configure
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                              >
                                Disconnect
                              </Button>
                            </>
                          ) : (
                            <Button variant="outline" size="sm" className="w-full">
                              <Plug className="w-3.5 h-3.5 mr-1.5" />
                              Connect
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* API Keys */}
              {activeTab === "api-keys" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-rose-400/10 flex items-center justify-center">
                        <Key className="w-5 h-5 text-rose-400" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-white">
                          API Keys
                        </h2>
                        <p className="text-sm text-white/50">
                          Manage your API authentication keys
                        </p>
                      </div>
                    </div>
                    <Button size="sm" className="gap-2">
                      <Plus className="w-4 h-4" />
                      Generate New Key
                    </Button>
                  </div>

                  <div className="glass-card rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-200/80">
                      Keep your API keys secure. Never share them publicly or
                      commit them to version control.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {apiKeys.map((apiKey) => {
                      const isShown = showKeys[apiKey.id] || false;
                      return (
                        <Card
                          key={apiKey.id}
                          className="glass-card rounded-2xl border-white/[0.08] p-5"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0 space-y-3">
                              <div className="flex items-center gap-3">
                                <p className="text-sm font-semibold text-white">
                                  {apiKey.name}
                                </p>
                                <Badge
                                  variant={envVariant[apiKey.environment]}
                                  className="text-xs capitalize"
                                >
                                  {apiKey.environment}
                                </Badge>
                              </div>

                              <div className="flex items-center gap-2">
                                <code className="text-xs text-white/60 bg-white/5 rounded-lg px-3 py-1.5 font-mono tracking-wider">
                                  {maskKey(apiKey.key, isShown)}
                                </code>
                                <button
                                  onClick={() =>
                                    setShowKeys((prev) => ({
                                      ...prev,
                                      [apiKey.id]: !isShown,
                                    }))
                                  }
                                  className="p-1 rounded-md hover:bg-white/10 transition-colors"
                                >
                                  {isShown ? (
                                    <EyeOff className="w-3.5 h-3.5 text-white/40" />
                                  ) : (
                                    <Eye className="w-3.5 h-3.5 text-white/40" />
                                  )}
                                </button>
                              </div>

                              <div className="flex items-center gap-4 text-xs text-white/40">
                                <span>
                                  Created: {apiKey.createdAt}
                                </span>
                                {apiKey.lastUsed && (
                                  <span>
                                    Last used: {apiKey.lastUsed}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5">
                                {apiKey.permissions.map((perm) => (
                                  <Badge
                                    key={perm}
                                    variant="outline"
                                    className="text-xs capitalize"
                                  >
                                    {perm}
                                  </Badge>
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1.5"
                                onClick={() =>
                                  handleCopyKey(apiKey.key, apiKey.id)
                                }
                              >
                                {copiedKey === apiKey.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-emerald-400">
                                      Copied
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    Copy
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                              >
                                <X className="w-3.5 h-3.5 mr-1" />
                                Revoke
                              </Button>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Security */}
              {activeTab === "security" && (
                <div className="space-y-4">
                  {/* Two-Factor */}
                  <Card className="glass-card rounded-2xl border-white/[0.08] p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-400/10 flex items-center justify-center">
                          <Shield className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">
                            Two-Factor Authentication
                          </p>
                          <p className="text-xs text-white/50">
                            Add an extra layer of security to your account
                          </p>
                        </div>
                      </div>
                      <Switch
                        checked={twoFactor}
                        onCheckedChange={setTwoFactor}
                      />
                    </div>
                  </Card>

                  {/* Password Change */}
                  <Card className="glass-card rounded-2xl border-white/[0.08] p-6">
                    <h3 className="text-sm font-semibold text-white mb-4">
                      Change Password
                    </h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="current-password">
                          Current Password
                        </Label>
                        <Input
                          id="current-password"
                          type="password"
                          placeholder="Enter current password"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-password">New Password</Label>
                        <Input
                          id="new-password"
                          type="password"
                          placeholder="Enter new password"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm-password">
                          Confirm New Password
                        </Label>
                        <Input
                          id="confirm-password"
                          type="password"
                          placeholder="Confirm new password"
                        />
                      </div>
                      <Button>Update Password</Button>
                    </div>
                  </Card>

                  {/* Login History */}
                  <Card className="glass-card rounded-2xl border-white/[0.08] p-6">
                    <h3 className="text-sm font-semibold text-white mb-4">
                      Login History
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-white/[0.08]">
                            <th className="text-left text-xs font-medium text-white/40 py-2 pr-4">
                              Date
                            </th>
                            <th className="text-left text-xs font-medium text-white/40 py-2 pr-4">
                              IP Address
                            </th>
                            <th className="text-left text-xs font-medium text-white/40 py-2 pr-4">
                              Location
                            </th>
                            <th className="text-left text-xs font-medium text-white/40 py-2">
                              Device
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.05]">
                          {security.loginHistory.map((entry, index) => (
                            <tr key={index} className="group">
                              <td className="py-3 pr-4">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-3.5 h-3.5 text-white/30" />
                                  <span className="text-xs text-white/70">
                                    {entry.date}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 pr-4">
                                <code className="text-xs text-white/50 bg-white/5 rounded px-2 py-0.5">
                                  {entry.ip}
                                </code>
                              </td>
                              <td className="py-3 pr-4">
                                <div className="flex items-center gap-1.5">
                                  <MapPin className="w-3 h-3 text-white/30" />
                                  <span className="text-xs text-white/70">
                                    {entry.location}
                                  </span>
                                </div>
                              </td>
                              <td className="py-3">
                                <div className="flex items-center gap-1.5">
                                  <Monitor className="w-3 h-3 text-white/30" />
                                  <span className="text-xs text-white/70">
                                    {entry.device}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
