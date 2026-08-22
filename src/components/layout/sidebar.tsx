"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Globe,
  Share2,
  Target,
  Sparkles,
  FileText,
  CheckCircle,
  MessageSquare,
  BarChart3,
  Search,
  Workflow,
  Settings,
  CreditCard,
  User,
  HelpCircle,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/website", label: "Website", icon: Globe },
  { href: "/dashboard/socials", label: "Social Connections", icon: Share2 },
  { href: "/dashboard/leads", label: "Lead Engine", icon: Target },
  { href: "/dashboard/find-leads", label: "Find Leads", icon: Search },
  { href: "/dashboard/socials/discovery", label: "Lead Discovery", icon: Sparkles },
  { href: "/dashboard/content", label: "Content", icon: FileText },
  { href: "/dashboard/approvals", label: "Approvals", icon: CheckCircle },
  { href: "/dashboard/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/profile", label: "Profile", icon: User },
  { href: "/dashboard/help", label: "Help", icon: HelpCircle },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export default function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");

  useEffect(() => {
    async function getUser() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserEmail(user.email ?? "");
          const name = user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "User";
          setUserName(name);
        }
      } catch {}
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
    <aside
      className={cn(
        "hidden md:flex flex-col fixed left-0 top-0 z-30 h-screen bg-black/60 backdrop-blur-xl border-r border-white/[0.04] transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center h-16 shrink-0 border-b border-white/[0.04]",
        collapsed ? "justify-center px-2" : "justify-between px-4"
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center w-8 h-8">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="8" fill="rgba(59,130,246,0.15)" />
                <circle cx="16" cy="16" r="6" fill="#3B82F6" />
                <circle cx="16" cy="16" r="3" fill="white" opacity="0.4" />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight text-white">DataBuks</span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.04] transition-all duration-300"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2">
        <ul className="flex flex-col gap-0.5">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(link.href));
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  title={collapsed ? link.label : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-300",
                    collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
                    isActive ? "bg-white/[0.04] text-white" : "text-white/40 hover:text-white hover:bg-white/[0.02]"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!collapsed && <span>{link.label}</span>}
                  {!collapsed && isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Section */}
      <div className="border-t border-white/[0.04] p-2">
        <button
          onClick={handleSignOut}
          title={collapsed ? `${userName} â€” Sign out` : undefined}
          className={cn(
            "flex items-center rounded-xl transition-all duration-300 hover:bg-white/[0.02] cursor-pointer w-full text-left",
            collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5"
          )}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-semibold text-white shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{userName || "User"}</p>
                <p className="text-xs font-light text-white/40 truncate">{userEmail || "Loading..."}</p>
              </div>
              <LogOut className="w-4 h-4 text-white/30 hover:text-white/60 transition-colors shrink-0" />
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
