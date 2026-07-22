"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import Sidebar from "@/components/layout/sidebar";
import MobileSidebar from "@/components/layout/mobile-sidebar";
import Navbar from "@/components/layout/navbar";

function DashboardBg() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      <div className="absolute inset-0 bg-black" />

      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full -top-40 -right-40"
        style={{
          background: "radial-gradient(circle at center, rgba(59,130,246,0.06) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
        animate={{ scale: [1, 1.1, 0.95, 1.05, 1], opacity: [0.6, 0.8, 0.5, 0.7, 0.6] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full -bottom-20 -left-20"
        style={{
          background: "radial-gradient(circle at center, rgba(99,102,241,0.04) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
        animate={{ scale: [0.9, 1.15, 1, 1.1, 0.9], opacity: [0.4, 0.7, 0.5, 0.6, 0.4] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute w-[300px] h-[300px] rounded-full top-1/2 left-1/3"
        style={{
          background: "radial-gradient(circle at center, rgba(139,92,246,0.03) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
        animate={{ x: ["-10%", "10%", "-5%", "15%", "-10%"], y: ["-5%", "15%", "-10%", "5%", "-5%"] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
        animate={{ backgroundPosition: ["0px 0px", "0px 64px"] }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

export function DashboardLayoutClient({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-black relative">
      <DashboardBg />
      <Sidebar />
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <Navbar onMenuToggle={() => setMobileOpen((prev) => !prev)} />
      <main className="relative z-10 md:pl-60 pt-20 px-4 sm:px-6 md:px-8 pb-12">
        {children}
      </main>
    </div>
  );
}
