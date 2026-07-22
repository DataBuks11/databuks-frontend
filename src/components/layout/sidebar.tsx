"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Globe,
  Share2,
  Target,
  FileText,
  CheckCircle,
  MessageSquare,
  BarChart3,
  Workflow,
  Settings,
  CreditCard,
  User,
  HelpCircle,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/website", label: "Website", icon: Globe },
  { href: "/dashboard/socials", label: "Social Connections", icon: Share2 },
  { href: "/dashboard/leads", label: "Lead Engine", icon: Target },
  { href: "/dashboard/content", label: "Content", icon: FileText },
  { href: "/dashboard/approvals", label: "Approvals", icon: CheckCircle },
  { href: "/dashboard/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/automation", label: "Automation", icon: Workflow },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/profile", label: "Profile", icon: User },
  { href: "/dashboard/help", label: "Help", icon: HelpCircle },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email ?? "");
        const name = user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "User";
        setUserName(name);
      }
    }
    getUser();
  }, [supabase]);

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 z-30 h-screen w-60 bg-black/60 backdrop-blur-xl border-r border-white/[0.04]">
      <div className="flex items-center gap-2.5 px-4 h-16 shrink-0">
        <div className="relative flex items-center justify-center w-8 h-8">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="8" fill="rgba(59,130,246,0.15)" />
            <circle cx="16" cy="16" r="6" fill="#3B82F6" />
            <circle cx="16" cy="16" r="3" fill="white" opacity="0.4" />
          </svg>
        </div>
        <span className="text-lg font-semibold tracking-tight text-white">DataBuks</span>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2">
        <ul className="flex flex-col gap-0.5">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(link.href));
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-300",
                    isActive ? "bg-white/[0.04] text-white" : "text-white/40 hover:text-white hover:bg-white/[0.02]"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{link.label}</span>
                  {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-white/[0.04] p-2">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 hover:bg-white/[0.02] cursor-pointer w-full text-left"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-semibold text-white shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{userName || "User"}</p>
            <p className="text-xs font-light text-white/40 truncate">{userEmail || "Loading..."}</p>
          </div>
          <LogOut className="w-4 h-4 text-white/30 hover:text-white/60 transition-colors shrink-0" />
        </button>
      </div>
    </aside>
  );
}
