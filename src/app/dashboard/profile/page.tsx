"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  MapPin,
  Calendar,
  Shield,
  Upload,
  User,
  Settings,
  Bell,
  Save,
  Mail,
  Lock,
  Globe,
  Trash2,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

const statCards = [
  { label: "Projects", value: "12", color: "text-blue-400", bg: "bg-blue-400/10" },
  { label: "Team Members", value: "24", color: "text-purple-400", bg: "bg-purple-400/10" },
  { label: "Tasks Completed", value: "847", color: "text-emerald-400", bg: "bg-emerald-400/10" },
  { label: "Days Active", value: "486", color: "text-amber-400", bg: "bg-amber-400/10" },
];

const timezones = [
  "Pacific Time (UTC-8)",
  "Mountain Time (UTC-7)",
  "Central Time (UTC-6)",
  "Eastern Time (UTC-5)",
  "UTC",
  "Greenwich Mean Time (UTC+0)",
  "Central European Time (UTC+1)",
  "Eastern European Time (UTC+2)",
];

const languages = ["English", "Spanish", "French", "German", "Portuguese", "Japanese", "Korean", "Chinese (Simplified)"];
const dateFormats = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"];
const emailFrequencies = ["Daily digest", "Weekly digest", "Monthly digest", "Never"];

export default function ProfilePage() {
  const [formData, setFormData] = useState({
    firstName: "Marcus",
    lastName: "Johnson",
    displayName: "Marcus Johnson",
    email: "marcus@databuks.com",
    phone: "+1 (415) 555-0192",
    location: "San Francisco, CA",
    bio: "Head of Growth at DataBuks. Passionate about AI-driven marketing and building scalable outreach systems.",
    website: "https://marcusjohnson.io",
    timezone: "Pacific Time (UTC-8)",
  });

  const [preferences, setPreferences] = useState({
    theme: "dark",
    language: "English",
    timezone: "Pacific Time (UTC-8)",
    dateFormat: "MM/DD/YYYY",
    emailFrequency: "Weekly digest",
    emailDigest: true,
  });

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const handleSavePersonal = () => {};

  const handleSavePreferences = () => {};

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card className="overflow-hidden">
          <div className="h-32 bg-gradient-to-r from-blue-600/30 via-purple-600/30 to-blue-600/20" />
          <div className="px-6 sm:px-8 pb-8">
            <div className="flex flex-col sm:flex-row gap-6">
              <div className="flex flex-col items-center -mt-12 shrink-0">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold ring-4 ring-background shadow-xl">
                  MJ
                </div>
                <Button variant="outline" size="sm" className="mt-3 gap-2 text-xs">
                  <Upload className="h-3.5 w-3.5" />
                  Change Photo
                </Button>
              </div>
              <div className="flex-1 text-center sm:text-left pt-2">
                <h1 className="text-2xl font-semibold">Marcus Johnson</h1>
                <p className="text-white/60 mt-1">Head of Growth at DataBuks</p>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-3">
                  <div className="flex items-center gap-1.5 text-sm text-white/50">
                    <MapPin className="h-3.5 w-3.5 text-white/40" />
                    San Francisco, CA
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-white/50">
                    <Calendar className="h-3.5 w-3.5 text-white/40" />
                    Joined March 2023
                  </div>
                  <Badge variant="purple" className="gap-1">
                    <Shield className="h-3 w-3" />
                    Team Lead
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        {statCards.map((stat, i) => (
          <Card key={stat.label} className="p-4">
            <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center mb-3`}>
              <span className={`text-lg font-bold ${stat.color}`}>{i < 3 ? "+" : ""}{stat.value.split("").slice(0, 3).join("")}</span>
            </div>
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <p className="text-xs text-white/40 mt-1">{stat.label}</p>
          </Card>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <Tabs defaultValue="personal-info">
          <TabsList className="mb-6">
            <TabsTrigger value="personal-info" className="gap-2">
              <User className="h-4 w-4" />
              Personal Info
            </TabsTrigger>
            <TabsTrigger value="account" className="gap-2">
              <Settings className="h-4 w-4" />
              Account
            </TabsTrigger>
            <TabsTrigger value="preferences" className="gap-2">
              <Bell className="h-4 w-4" />
              Preferences
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personal-info">
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>Update your personal details and public profile.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display Name</Label>
                    <Input
                      id="displayName"
                      value={formData.displayName}
                      onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="bio">Bio</Label>
                    <textarea
                      id="bio"
                      rows={3}
                      className="flex w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 resize-none"
                      value={formData.bio}
                      onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      value={formData.website}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timezone">Timezone</Label>
                    <Select
                      value={formData.timezone}
                      onValueChange={(v) => setFormData({ ...formData, timezone: v })}
                    >
                      <SelectTrigger id="timezone">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        {timezones.map((tz) => (
                          <SelectItem key={tz} value={tz}>
                            {tz}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-6">
                  <Button onClick={handleSavePersonal} className="gap-2">
                    <Save className="h-4 w-4" />
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="account">
            <Card>
              <CardHeader>
                <CardTitle>Account Settings</CardTitle>
                <CardDescription>Manage your email, password, and connected accounts.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-400/10 flex items-center justify-center">
                      <Mail className="h-5 w-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Email</p>
                      <p className="text-sm text-white/50">marcus@databuks.com</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    Change Email
                  </Button>
                </div>

                <Separator className="bg-white/[0.06]" />

                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-400/10 flex items-center justify-center">
                      <Lock className="h-5 w-5 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Password</p>
                      <p className="text-sm text-white/50">********</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">
                    Change Password
                  </Button>
                </div>

                <Separator className="bg-white/[0.06]" />

                <div>
                  <p className="text-sm font-medium mb-4">Connected Accounts</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 px-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">&#xf1a0;</span>
                        <div>
                          <p className="text-sm font-medium">Google</p>
                          <p className="text-xs text-emerald-400">Connected</p>
                        </div>
                      </div>
                      <Badge variant="success">Connected</Badge>
                    </div>
                    <div className="flex items-center justify-between py-2 px-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">&#xf09b;</span>
                        <div>
                          <p className="text-sm font-medium">GitHub</p>
                          <p className="text-xs text-emerald-400">Connected</p>
                        </div>
                      </div>
                      <Badge variant="success">Connected</Badge>
                    </div>
                    <div className="flex items-center justify-between py-2 px-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">&#xf08c;</span>
                        <div>
                          <p className="text-sm font-medium">LinkedIn</p>
                          <p className="text-xs text-white/40">Not connected</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        Connect
                      </Button>
                    </div>
                  </div>
                </div>

                <Separator className="bg-white/[0.06]" />

                <div>
                  {!deleteConfirm ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-2"
                      onClick={() => setDeleteConfirm(true)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Account
                    </Button>
                  ) : (
                    <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/5 space-y-3">
                      <div className="flex items-start gap-2 text-sm text-red-400">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <p>Are you absolutely sure? This action cannot be undone. All your data, projects, and team associations will be permanently removed.</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="destructive" size="sm">
                          Yes, Delete My Account
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preferences">
            <Card>
              <CardHeader>
                <CardTitle>Preferences</CardTitle>
                <CardDescription>Customize your dashboard experience and notification settings.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="theme"
                        value="dark"
                        checked={preferences.theme === "dark"}
                        onChange={() => setPreferences({ ...preferences, theme: "dark" })}
                        className="text-primary focus:ring-primary"
                      />
                      <span className="text-sm">Dark</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="theme"
                        value="light"
                        checked={preferences.theme === "light"}
                        onChange={() => setPreferences({ ...preferences, theme: "light" })}
                        className="text-primary focus:ring-primary"
                      />
                      <span className="text-sm">Light</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prefLang">Language</Label>
                  <Select
                    value={preferences.language}
                    onValueChange={(v) => setPreferences({ ...preferences, language: v })}
                  >
                    <SelectTrigger id="prefLang">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prefTz">Timezone</Label>
                  <Select
                    value={preferences.timezone}
                    onValueChange={(v) => setPreferences({ ...preferences, timezone: v })}
                  >
                    <SelectTrigger id="prefTz">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {timezones.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prefDate">Date Format</Label>
                  <Select
                    value={preferences.dateFormat}
                    onValueChange={(v) => setPreferences({ ...preferences, dateFormat: v })}
                  >
                    <SelectTrigger id="prefDate">
                      <SelectValue placeholder="Select date format" />
                    </SelectTrigger>
                    <SelectContent>
                      {dateFormats.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator className="bg-white/[0.06]" />

                <div className="space-y-4">
                  <Label>Notifications</Label>
                  <div className="flex items-center justify-between py-3 px-4 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                    <div>
                      <p className="text-sm font-medium">Weekly digest</p>
                      <p className="text-xs text-white/50">Get a summary of your activity every week</p>
                    </div>
                    <Switch
                      checked={preferences.emailDigest}
                      onCheckedChange={(v) => setPreferences({ ...preferences, emailDigest: v })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prefFreq">Email Frequency</Label>
                    <Select
                      value={preferences.emailFrequency}
                      onValueChange={(v) => setPreferences({ ...preferences, emailFrequency: v })}
                    >
                      <SelectTrigger id="prefFreq">
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        {emailFrequencies.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="pt-2">
                  <Button onClick={handleSavePreferences} className="gap-2">
                    <Save className="h-4 w-4" />
                    Save Preferences
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
