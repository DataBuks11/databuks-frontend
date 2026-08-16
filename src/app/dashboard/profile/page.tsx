"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Calendar, Upload, Save, User, Settings, Bell, Shield, Loader2, CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useProfile, useProfileMutations } from "@/hooks/use-profile";
import { useSettings, useSettingsMutations } from "@/hooks/use-settings";
import { createClient } from "@/lib/supabase/client";
import { formatNumber } from "@/lib/utils";

const timezones = ["Asia/Kolkata", "Asia/Dubai", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Australia/Sydney", "UTC"];
const dateFormats = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"];

export default function ProfilePage() {
  const { profile, loading: profileLoading, refetch: refetchProfile } = useProfile();
  const { updateProfile, loading: saveLoading } = useProfileMutations();
  const { settings, refetch: refetchSettings } = useSettings();
  const { updateSettings } = useSettingsMutations();

  const [formData, setFormData] = useState({ firstName: "", lastName: "", displayName: "", email: "", phone: "", website: "" });
  const [initialized, setInitialized] = useState(false);
  const [preferences, setPreferences] = useState({ theme: "dark", timezone: "", dateFormat: "MM/DD/YYYY", weeklyDigest: false });
  const [prefsInitialized, setPrefsInitialized] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [realStats, setRealStats] = useState({ leads: 0, meetings: 0, conversations: 0, scans: 0, daysActive: 0 });
  const [authEmail, setAuthEmail] = useState("");
  const [signInMethod, setSignInMethod] = useState("Email & Password");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/analytics?days=30").then((r) => r.json()).then((json) => {
      if (!json.error && json.overview) {
        setRealStats({
          leads: json.overview.totalLeads ?? 0,
          meetings: json.overview.meetingsBooked ?? 0,
          conversations: json.overview.conversations ?? 0,
          scans: json.overview.websiteScans ?? 0,
          daysActive: 0,
        });
      }
    }).catch(() => {});
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setAuthEmail(data.user.email ?? "");
        const providers = (data.user.identities ?? []).map((i: any) => i.provider);
        setSignInMethod(providers.length > 0 ? providers.map((p: string) => (p === "email" ? "Email & Password" : p)).join(", ") : "Email & Password");
      }
    });
  }, []);

  useEffect(() => {
    if (profile) {
      setRealStats((prev) => ({
        ...prev,
        daysActive: profile.created_at ? Math.max(1, Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000)) : 0,
      }));
      if (!initialized) {
        const parts = (profile.full_name || "").split(" ");
        setFormData({
          firstName: parts[0] || "",
          lastName: parts.slice(1).join(" ") || "",
          displayName: profile.full_name || "",
          email: profile.email || "",
          phone: profile.phone || "",
          website: profile.website || "",
        });
        setInitialized(true);
      }
    }
  }, [profile, initialized]);

  useEffect(() => {
    if (settings && !prefsInitialized) {
      const saved = (settings.notifications as any)?.preferences ?? {};
      setPreferences({
        theme: saved.theme ?? "dark",
        timezone: saved.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        dateFormat: saved.dateFormat ?? "MM/DD/YYYY",
        weeklyDigest: saved.weeklyDigest ?? false,
      });
      setPrefsInitialized(true);
    } else if (!settings && !prefsInitialized) {
      setPreferences((p) => ({ ...p, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }));
      setPrefsInitialized(true);
    }
  }, [settings, prefsInitialized]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/storage/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      await updateProfile({ avatar_url: json.url });
      refetchProfile();
    } catch {}
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSavePersonal = async () => {
    try {
      await updateProfile({
        full_name: formData.displayName || `${formData.firstName} ${formData.lastName}`.trim(),
        phone: formData.phone || null,
        website: formData.website || null,
      });
      refetchProfile();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {}
  };

  const handleSavePreferences = async () => {
    try {
      await updateSettings({
        notifications: {
          ...(settings?.notifications ?? {}),
          preferences,
        } as any,
      });
      refetchSettings();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {}
  };

  const statCards = [
    { label: "Leads", value: formatNumber(realStats.leads), color: "text-blue-400", bg: "bg-blue-400/10" },
    { label: "Meetings Booked", value: formatNumber(realStats.meetings), color: "text-amber-400", bg: "bg-amber-400/10" },
    { label: "Conversations", value: formatNumber(realStats.conversations), color: "text-purple-400", bg: "bg-purple-400/10" },
    { label: "Days Active", value: formatNumber(realStats.daysActive), color: "text-emerald-400", bg: "bg-emerald-400/10" },
  ];

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <Card className="overflow-hidden">
          <div className="h-32 bg-gradient-to-r from-blue-600/30 via-purple-600/30 to-blue-600/20" />
          <div className="px-6 sm:px-8 pb-8">
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex flex-col items-center -mt-12 shrink-0">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold ring-4 ring-background shadow-xl overflow-hidden">
                  {profileLoading ? (
                    <Loader2 className="h-8 w-8 animate-spin text-white/60" />
                  ) : profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    (profile?.full_name || authEmail?.slice(0, 1).toUpperCase() || "U").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFileChange} />
                <Button variant="outline" size="sm" className="mt-3 gap-2 text-xs" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />
                  Change Photo
                </Button>
              </div>
              <div className="flex-1 text-center sm:text-left pt-2">
                {profileLoading ? (
                  <div className="space-y-2">
                    <div className="h-7 w-48 bg-white/[0.05] rounded-lg animate-pulse" />
                    <div className="h-4 w-36 bg-white/[0.05] rounded-lg animate-pulse" />
                  </div>
                ) : (
                  <>
                    <h1 className="text-2xl font-semibold">{profile?.full_name || authEmail?.split("@")[0] || "Your Account"}</h1>
                    <p className="text-white/60 mt-1">{authEmail}</p>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-3">
                      <div className="flex items-center gap-1.5 text-sm text-white/50">
                        <MapPin className="h-3.5 w-3.5 text-white/40" />
                        {profile?.company_name || "Location not set"}
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-white/50">
                        <Calendar className="h-3.5 w-3.5 text-white/40" />
                        Joined {profile?.created_at ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : ""}
                      </div>
                      <Badge variant="purple" className="gap-1">
                        <Shield className="h-3 w-3" />
                        Account Owner
                      </Badge>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="p-4">
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <p className="text-xs text-white/40 mt-1">{stat.label}</p>
          </Card>
        ))}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}>
        <Tabs defaultValue="personal-info">
          <TabsList className="mb-6">
            <TabsTrigger value="personal-info" className="gap-2"><User className="h-4 w-4" />Personal Info</TabsTrigger>
            <TabsTrigger value="account" className="gap-2"><Settings className="h-4 w-4" />Account</TabsTrigger>
            <TabsTrigger value="preferences" className="gap-2"><Bell className="h-4 w-4" />Preferences</TabsTrigger>
          </TabsList>

          <TabsContent value="personal-info">
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>Update your personal details.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display Name</Label>
                    <Input id="displayName" value={formData.displayName} onChange={(e) => setFormData({ ...formData, displayName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={formData.email || authEmail} disabled />
                    <p className="text-xs text-white/40">Email is your login and cannot be changed here.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input id="website" value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} />
                  </div>
                </div>
                <div className="pt-4 flex items-center gap-3">
                  <Button onClick={handleSavePersonal} disabled={saveLoading} className="gap-2">
                    {saveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Save Changes
                  </Button>
                  {saveSuccess && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="account">
            <Card>
              <CardHeader>
                <CardTitle>Account</CardTitle>
                <CardDescription>Your sign-in information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between py-3 px-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-sm text-white/60">{authEmail}</p>
                  </div>
                </div>
                <Separator className="bg-white/[0.06]" />
                <div className="flex items-center justify-between py-3 px-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                  <div>
                    <p className="text-sm font-medium">Sign-in Method</p>
                    <p className="text-sm text-white/60">{signInMethod}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preferences">
            <Card>
              <CardHeader>
                <CardTitle>Preferences</CardTitle>
                <CardDescription>Saved to your workspace and applied across the dashboard.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <div className="flex gap-4">
                    {["dark", "light"].map((theme) => (
                      <label key={theme} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="theme" value={theme} checked={preferences.theme === theme} onChange={() => setPreferences({ ...preferences, theme })} className="text-primary focus:ring-primary" />
                        <span className="text-sm capitalize">{theme}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prefTz">Timezone</Label>
                  <Select value={preferences.timezone} onValueChange={(v) => setPreferences({ ...preferences, timezone: v })}>
                    <SelectTrigger id="prefTz"><SelectValue placeholder="Select timezone" /></SelectTrigger>
                    <SelectContent>
                      {timezones.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prefDate">Date Format</Label>
                  <Select value={preferences.dateFormat} onValueChange={(v) => setPreferences({ ...preferences, dateFormat: v })}>
                    <SelectTrigger id="prefDate"><SelectValue placeholder="Select date format" /></SelectTrigger>
                    <SelectContent>
                      {dateFormats.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Separator className="bg-white/[0.06]" />
                <div className="space-y-4">
                  <Label>Notifications</Label>
                  <label className="flex items-center justify-between py-3 px-4 rounded-xl border border-white/[0.08] bg-white/[0.02] cursor-pointer">
                    <div>
                      <p className="text-sm font-medium">Weekly digest</p>
                      <p className="text-xs text-white/50">Saved preference for future reports</p>
                    </div>
                    <input type="checkbox" checked={preferences.weeklyDigest} onChange={(e) => setPreferences({ ...preferences, weeklyDigest: e.target.checked })} className="text-primary focus:ring-primary" />
                  </label>
                </div>
                <div className="pt-2 flex items-center gap-3">
                  <Button onClick={handleSavePreferences} className="gap-2"><Save className="h-4 w-4" />Save Preferences</Button>
                  {saveSuccess && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Saved</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
