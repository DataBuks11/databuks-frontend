"use client";

import { usePathname } from "next/navigation";
import { Menu, Search, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/website": "Website",
  "/dashboard/socials": "Social Connections",
  "/dashboard/leads": "Lead Engine",
  "/dashboard/content": "Content",
  "/dashboard/approvals": "Approvals",
  "/dashboard/conversations": "Conversations",
  "/dashboard/analytics": "Analytics",
  "/dashboard/automation": "Automation",
  "/dashboard/settings": "Settings",
  "/dashboard/billing": "Billing",
  "/dashboard/profile": "Profile",
  "/dashboard/help": "Help",
};

interface NavbarProps {
  onMenuToggle?: () => void;
}

export default function Navbar({ onMenuToggle }: NavbarProps) {
  const pathname = usePathname();
  const pageTitle = pageTitles[pathname] ?? "Dashboard";
  const notificationCount = 5;

  return (
    <header className="sticky top-0 z-20 h-16 bg-black/60 backdrop-blur-xl border-b border-white/[0.04] flex items-center justify-between px-3 md:px-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="md:hidden p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.04] transition-all duration-300"
          aria-label="Toggle menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 text-sm font-light">
          <span className="text-white/30">Dashboard</span>
          <span className="text-white/20">/</span>
          <span className="text-white/60 font-medium">{pageTitle}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          className="relative p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.04] transition-all duration-300"
          aria-label="Search"
        >
          <Search className="w-4 h-4" />
        </button>

        <button
          className="relative p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.04] transition-all duration-300"
          aria-label={`Notifications: ${notificationCount} unread`}
        >
          <Bell className="w-4 h-4" />
          {notificationCount > 0 && (
            <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-blue-500 text-[9px] font-semibold text-white flex items-center justify-center">
              {notificationCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
