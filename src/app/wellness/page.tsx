"use client";

import { useState } from "react";
import Image from "next/image";
import { Inter } from "next/font/google";
import { AnimatePresence, motion } from "framer-motion";
import { CircleUserRound, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const navLinks = [
  { label: "Home", href: "#" },
  { label: "Our Approach", href: "#" },
  { label: "Healing Methods", href: "#" },
];

const avatarUrls = [
  "https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=100",
  "https://images.pexels.com/photos/1222271/pexels-photo-1222271.jpeg?auto=compress&cs=tinysrgb&w=100",
  "https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=100",
  "https://images.pexels.com/photos/697509/pexels-photo-697509.jpeg?auto=compress&cs=tinysrgb&w=100",
];

const DotGridIcon = () => (
  <div className="relative w-5 h-5">
    {Array.from({ length: 9 }).map((_, i) => {
      const row = Math.floor(i / 3);
      const col = i % 3;
      return (
        <div
          key={i}
          className="absolute bg-white/60"
          style={{
            width: "2.5px",
            height: "2.5px",
            top: `${row * 7.5 + 2.5}px`,
            left: `${col * 7.5 + 2.5}px`,
          }}
        />
      );
    })}
  </div>
);

const CheckerboardIcon = () => (
  <div className="grid grid-cols-3 gap-[2px] w-5 h-5">
    {Array.from({ length: 9 }).map((_, i) => {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const filled = (row + col) % 2 === 0;
      return (
        <div
          key={i}
          className={cn("rounded-[1px]", filled ? "bg-white/60" : "bg-white/0")}
          style={{ width: "4px", height: "4px" }}
        />
      );
    })}
  </div>
);

export default function WellnessPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={cn(
        inter.className,
        "relative h-screen w-full overflow-hidden bg-black"
      )}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .liquid-glass {
              background: rgba(255, 255, 255, 0.01);
              background-blend-mode: luminosity;
              backdrop-filter: blur(4px);
              -webkit-backdrop-filter: blur(4px);
              box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1);
              position: relative;
              overflow: hidden;
            }
            .liquid-glass::before {
              content: "";
              position: absolute;
              inset: 0;
              border-radius: inherit;
              padding: 1.4px;
              background: linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.15) 20%, transparent 40%, transparent 60%, rgba(255,255,255,0.15) 80%, rgba(255,255,255,0.45) 100%);
              -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
              -webkit-mask-composite: xor;
              mask-composite: exclude;
              pointer-events: none;
            }
          `,
        }}
      />

      {/* Background Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 z-0 w-full h-full object-cover"
      >
        <source
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260715_082433_69699cf8-444b-4484-93cc-053e57896dfd.mp4"
          type="video/mp4"
        />
      </video>

      {/* Dark overlay for better text contrast */}
      <div className="absolute inset-0 z-[1] bg-black/40 pointer-events-none" />

      {/* Navigation */}
      <nav className="absolute top-0 left-0 right-0 z-20 flex items-start justify-between px-5 pt-6 sm:px-8 sm:pt-8 md:px-16 lg:px-20">
        {/* Logo */}
        <svg
          width="32"
          height="32"
          viewBox="0 0 256 256"
          fill="white"
          className="shrink-0 md:w-9 md:h-9"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M 128 128 C 198.692 128 256 185.308 256 256 L 151.883 256 C 149.812 220.307 120.213 192 84 192 C 47.787 192 18.188 220.307 16.117 256 L 0 256 C 0 185.308 57.308 128 128 128 Z M 104.117 0 C 106.188 35.694 135.787 64 172 64 C 208.213 64 237.812 35.694 239.883 0 L 256 0 C 256 70.692 198.692 128 128 128 C 57.308 128 0 70.692 0 0 Z" />
        </svg>

        {/* Center nav links (desktop) */}
        <div className="hidden md:flex items-center gap-6 liquid-glass rounded-full px-8 py-3">
          {navLinks.map((link, i) => (
            <a
              key={link.label}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors duration-200",
                i === 0
                  ? "text-white"
                  : "text-white/70 hover:text-white"
              )}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Right avatar (desktop) */}
        <div className="hidden md:flex liquid-glass h-10 w-10 items-center justify-center rounded-full">
          <CircleUserRound
            className="h-5 w-5 text-white/80"
            strokeWidth={1.5}
          />
        </div>

        {/* Mobile menu toggle */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden liquid-glass h-10 w-10 z-50 flex items-center justify-center rounded-full"
          aria-label="Toggle menu"
        >
          <AnimatePresence mode="wait">
            {menuOpen ? (
              <motion.div
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <X className="h-5 w-5 text-white" strokeWidth={1.5} />
              </motion.div>
            ) : (
              <motion.div
                key="menu"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Menu className="h-5 w-5 text-white" strokeWidth={1.5} />
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </nav>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-8 bg-black/80 backdrop-blur-xl md:hidden"
          >
            <motion.div
              initial={{ opacity: 0, y: -32 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -32 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="flex flex-col items-center gap-8"
            >
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="text-2xl font-medium text-white transition-colors hover:text-white/80"
                >
                  {link.label}
                </a>
              ))}
              <div className="flex flex-col items-center gap-3 mt-4">
                <div className="liquid-glass h-14 w-14 flex items-center justify-center rounded-full">
                  <CircleUserRound
                    className="h-6 w-6 text-white/80"
                    strokeWidth={1.5}
                  />
                </div>
                <span className="text-sm font-light text-white/60">
                  Account
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div
        className={cn(
          "relative z-10 flex flex-col justify-between h-full",
          menuOpen && "md:opacity-100 opacity-0 pointer-events-none"
        )}
      >
        {/* Top Content */}
        <div className="mt-14 sm:mt-20 md:mt-28 max-w-2xl px-5 sm:px-8 md:px-16 lg:px-20">
          {/* Badge */}
          <div className="liquid-glass inline-flex items-center gap-2.5 sm:gap-3 rounded-full px-3 py-1.5 sm:px-4 sm:py-2 mb-5 sm:mb-6">
            <div className="flex -space-x-2">
              {avatarUrls.map((url, i) => (
                <div
                  key={i}
                  className="relative h-5 w-5 sm:h-6 sm:w-6 rounded-full border-2 border-white/20 overflow-hidden"
                >
                  <Image
                    src={url}
                    alt=""
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
              ))}
            </div>
            <span className="text-xs sm:text-sm font-light text-white/80 whitespace-nowrap">
              our path to natural wellness
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-normal leading-[1.05] text-white tracking-[-0.05em]">
            Heal Your Body
            <br />
            Naturally
          </h1>

          {/* Subtitle */}
          <p className="mt-4 sm:mt-5 text-sm sm:text-base md:text-lg font-light text-white/70">
            Holistic wellness. Transformative results.
          </p>

          {/* CTA Button */}
          <a
            href="#"
            className="liquid-glass inline-flex items-center rounded-full px-6 py-3 sm:px-7 sm:py-3.5 mt-6 sm:mt-8 text-sm font-medium text-white transition duration-300 hover:bg-white/10"
          >
            Begin Your Journey
          </a>
        </div>

        {/* Bottom Stats */}
        <div className="flex items-end gap-6 sm:gap-10 md:gap-16 px-5 sm:px-8 md:px-16 lg:px-20 pb-8 sm:pb-10">
          {/* Stat 1 */}
          <div className="flex flex-col gap-2">
            <DotGridIcon />
            <span className="text-xl sm:text-2xl md:text-3xl font-normal text-white">
              48 Hours
            </span>
            <span className="text-xs sm:text-sm font-light text-white/60">
              Initial Consultation
            </span>
          </div>

          {/* Stat 2 */}
          <div className="flex flex-col gap-2">
            <CheckerboardIcon />
            <span className="text-xl sm:text-2xl md:text-3xl font-normal text-white">
              12,000+
            </span>
            <span className="text-xs sm:text-sm font-light text-white/60">
              Healing Sessions
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
