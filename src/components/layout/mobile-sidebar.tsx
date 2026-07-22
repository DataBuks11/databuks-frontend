"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
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
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

interface MobileSidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function MobileSidebar({ open, onClose }: MobileSidebarProps) {
  const pathname = usePathname();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 250 }}
            className="fixed left-0 top-0 z-50 h-screen w-64 bg-background/95 backdrop-blur-xl border-r border-white/5 flex flex-col"
          >
            <div className="flex items-center justify-between px-5 h-16 border-b border-white/5 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="relative flex items-center justify-center w-8 h-8">
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 32 32"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect width="32" height="32" rx="8" fill="rgba(59, 130, 246, 0.15)" />
                    <circle cx="16" cy="16" r="6" fill="#3B82F6" />
                    <circle cx="16" cy="16" r="3" fill="white" opacity="0.4" />
                  </svg>
                </div>
                <span className="text-lg font-semibold tracking-tight text-white">
                  DataBuks
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-muted-foreground hover:text-white hover:bg-white/[0.05] transition-all duration-150"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto scrollbar-thin py-4 px-3">
              <ul className="flex flex-col gap-0.5">
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive =
                    pathname === link.href ||
                    (link.href !== "/dashboard" && pathname.startsWith(link.href));

                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={onClose}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                          isActive
                            ? "bg-white/5 text-white"
                            : "text-muted-foreground hover:text-white hover:bg-white/[0.03]"
                        )}
                      >
                        <Icon className="w-4.5 h-4.5 shrink-0" />
                        <span>{link.label}</span>
                        {isActive && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="border-t border-white/5 p-3">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 hover:bg-white/[0.03] cursor-pointer">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-semibold text-white shrink-0">
                  MJ
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">
                    Marcus Johnson
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    marcus@databuks.com
                  </p>
                </div>
                <LogOut className="w-4 h-4 text-muted-foreground hover:text-white transition-colors shrink-0" />
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
