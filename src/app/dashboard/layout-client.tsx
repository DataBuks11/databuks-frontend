"use client";

import { useState, type ReactNode } from "react";
import Sidebar from "@/components/layout/sidebar";
import MobileSidebar from "@/components/layout/mobile-sidebar";
import Navbar from "@/components/layout/navbar";

function DashboardBg() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-black" />

      {/* Background Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260302_085844_21a8f4b3-dea5-4ede-be16-d53f6973bb14.mp4"
          type="video/mp4"
        />
      </video>

      {/* Dark overlay to maintain liquid glass clarity */}
      <div className="absolute inset-0 bg-black/75" />
    </div>
  );
}

export function DashboardLayoutClient({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-black relative">
      <DashboardBg />
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((prev) => !prev)} />
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <Navbar onMenuToggle={() => setMobileOpen((prev) => !prev)} />
      <main
        className={`relative z-10 pt-20 px-4 sm:px-6 md:px-8 pb-12 transition-all duration-300 ${
          sidebarCollapsed ? "md:pl-[5rem]" : "md:pl-60"
        }`}
      >
        {children}
      </main>
    </div>
  );
}
