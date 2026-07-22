"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  Globe,
  Target,
  MessageSquare,
  Workflow,
  CheckCircle,
  BarChart3,
  Play,
  Menu,
  X,
  ArrowRight,
  ChevronRight,
  Sparkles,
  Zap,
  Users,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Globe,
    title: "AI Website Intelligence",
    description:
      "Your AI learns your entire business from your website — products, brand voice, target audience, and competitors.",
  },
  {
    icon: Target,
    title: "AI Lead Generation",
    description:
      "Find and score high-intent prospects across social platforms. Automated outreach that feels personal.",
  },
  {
    icon: MessageSquare,
    title: "AI Conversations",
    description:
      "Engage leads with context-aware conversations. 94% response rate on autopilot.",
  },
  {
    icon: Workflow,
    title: "Workflow Automation",
    description:
      "Create multi-step automation flows. Connect triggers, conditions, and actions visually.",
  },
  {
    icon: CheckCircle,
    title: "Human Approval",
    description:
      "Every message reviewed by you or your team. AI drafts, you approve. Full control.",
  },
  {
    icon: BarChart3,
    title: "Analytics & Insights",
    description:
      "Real-time dashboards. Track pipeline, conversion rates, revenue attribution per channel.",
  },
];

const steps = [
  { step: "01", title: "Connect Your Website", desc: "Link your business website in seconds." },
  { step: "02", title: "AI Learns Your Business", desc: "Our AI analyzes your products, brand voice, and audience." },
  { step: "03", title: "Connect Social Accounts", desc: "Link Instagram, Facebook, LinkedIn, WhatsApp, Telegram." },
  { step: "04", title: "AI Finds Prospects", desc: "AI scans social platforms for high-intent leads matching your ICP." },
  { step: "05", title: "AI Creates Outreach", desc: "Personalized messages crafted for each prospect, at scale." },
  { step: "06", title: "Your Approval", desc: "Review every message. AI drafts, you approve with one click." },
  { step: "07", title: "Execution", desc: "Approved messages are sent across all connected platforms." },
  { step: "08", title: "Qualified Leads → Customers", desc: "Track pipeline, measure conversion, watch revenue grow." },
];

const pricingPlans = [
  {
    name: "Starter",
    price: "$49",
    period: "/mo",
    description: "For solopreneurs and small teams getting started.",
    features: [
      "500 automated DMs/month",
      "3 social platform connections",
      "Basic lead scoring",
      "Content scheduler (10 posts/month)",
      "Email support",
    ],
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$149",
    period: "/mo",
    description: "For growing businesses that need multi-channel automation.",
    features: [
      "5,000 automated DMs/month",
      "All platform connections",
      "Advanced AI lead scoring",
      "Unlimited content scheduling",
      "Analytics dashboard",
      "Priority support",
      "API access",
    ],
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For agencies and large teams with dedicated support.",
    features: [
      "Unlimited DMs and automations",
      "White-label dashboard",
      "Dedicated account manager",
      "Custom AI model training",
      "SLA guarantee",
      "SSO and advanced security",
      "Multi-team workspaces",
    ],
    highlighted: false,
  },
];

function FadeInWhenVisible({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function ParticleField() {
  const particles = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 1,
    duration: Math.random() * 15 + 10,
    delay: Math.random() * 10,
    opacity: Math.random() * 0.3 + 0.05,
  }));

  return (
    <div className="absolute inset-0">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-blue-400"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
          }}
          animate={{
            y: ["0px", "-80px", "0px", "40px", "0px"],
            opacity: [p.opacity, p.opacity * 2.5, p.opacity, p.opacity * 1.5, p.opacity],
            scale: [1, 1.8, 1, 1.4, 1],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { label: "Home", href: "#home" },
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
  ];

  return (
    <div className="relative min-h-screen bg-black text-white font-sans selection:bg-blue-500/30">
      {/* Animated Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-black/70 z-10" />

        {/* Background Video */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260715_082433_69699cf8-444b-4484-93cc-053e57896dfd.mp4"
            type="video/mp4"
          />
        </video>

        {/* Animated gradient orbs - on top of video */}
        <motion.div
          className="absolute w-[800px] h-[800px] rounded-full z-20"
          style={{
            background: "radial-gradient(circle at center, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.05) 30%, transparent 70%)",
            filter: "blur(80px)",
          }}
          animate={{
            x: ["-20%", "20%", "-10%", "10%", "-20%"],
            y: ["-10%", "10%", "-20%", "20%", "-10%"],
            scale: [1, 1.15, 0.9, 1.1, 1],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          className="absolute w-[600px] h-[600px] rounded-full bottom-0 right-0 z-20"
          style={{
            background: "radial-gradient(circle at center, rgba(99,102,241,0.12) 0%, rgba(99,102,241,0.04) 30%, transparent 70%)",
            filter: "blur(80px)",
          }}
          animate={{
            x: ["10%", "-20%", "10%", "-5%", "10%"],
            y: ["-5%", "15%", "-10%", "5%", "-5%"],
            scale: [0.9, 1.2, 0.95, 1.1, 0.9],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          className="absolute w-[500px] h-[500px] rounded-full top-1/2 left-1/3 z-20"
          style={{
            background: "radial-gradient(circle at center, rgba(139,92,246,0.1) 0%, rgba(139,92,246,0.03) 30%, transparent 70%)",
            filter: "blur(70px)",
          }}
          animate={{
            x: ["0%", "30%", "-10%", "20%", "0%"],
            y: ["0%", "-20%", "20%", "-10%", "0%"],
            scale: [1.1, 0.85, 1.15, 0.95, 1.1],
          }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          className="absolute w-[400px] h-[400px] rounded-full top-1/4 right-1/4 z-20"
          style={{
            background: "radial-gradient(circle at center, rgba(59,130,246,0.08) 0%, transparent 70%)",
            filter: "blur(50px)",
          }}
          animate={{
            x: ["-30%", "20%", "-15%", "30%", "-30%"],
            y: ["20%", "-15%", "30%", "-20%", "20%"],
            scale: [1, 0.8, 1.05, 0.9, 1],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Floating particles */}
        <ParticleField />
      </div>

      {/* NAVIGATION */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 pt-6 sm:px-8 sm:pt-8 md:px-16 lg:px-20">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="relative flex items-center justify-center w-8 h-8 md:w-9 md:h-9">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="rgba(59,130,246,0.15)" />
              <circle cx="16" cy="16" r="6" fill="#3B82F6" />
              <circle cx="16" cy="16" r="3" fill="white" opacity="0.4" />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">
            DataBuks
          </span>
        </Link>

        {/* Desktop Nav Pill */}
        <div className="hidden md:flex liquid-glass rounded-full px-8 py-3 items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors duration-300",
                link.label === "Home"
                  ? "text-white"
                  : "text-white/60 hover:text-white"
              )}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/auth/login"
            className="liquid-glass rounded-full px-5 py-2.5 text-sm font-medium text-white/70 hover:text-white transition-colors duration-300"
          >
            Sign In
          </Link>
          <Link
            href="/auth/signup"
            className="liquid-glass rounded-full px-5 py-2.5 text-sm font-medium text-white hover:bg-white/[0.06] transition-all duration-300"
          >
            Start Free
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="relative md:hidden z-50 liquid-glass h-10 w-10 rounded-full flex items-center justify-center"
          aria-label="Toggle menu"
        >
          <div className="relative w-5 h-5">
            <Menu
              className={cn(
                "absolute inset-0 w-5 h-5 text-white/80 transition-all duration-300",
                menuOpen ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
              )}
            />
            <X
              className={cn(
                "absolute inset-0 w-5 h-5 text-white/80 transition-all duration-300",
                menuOpen ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
              )}
            />
          </div>
        </button>
      </nav>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="fixed inset-0 z-40 md:hidden bg-black/80 backdrop-blur-xl flex items-center justify-center"
          >
            <motion.div
              initial={{ y: -32, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -32, opacity: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="flex flex-col items-center gap-8"
            >
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="text-2xl font-medium text-white/80 hover:text-white transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <div className="flex flex-col items-center gap-3 mt-4">
                <div className="liquid-glass h-10 w-10 rounded-full flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600" />
                </div>
                <span className="text-sm font-light text-white/50">Account</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN CONTENT */}
      <motion.div
        animate={menuOpen ? { opacity: 0, pointerEvents: "none" as const } : { opacity: 1, pointerEvents: "auto" as const }}
        transition={{ duration: 0.3 }}
        className="relative z-10 flex flex-col justify-between min-h-screen"
      >
        {/* Hero */}
        <div className="flex-1 flex flex-col justify-center px-5 sm:px-8 md:px-16 lg:px-20">
          <div className="max-w-2xl mt-14 sm:mt-20 md:mt-28">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="liquid-glass rounded-full inline-flex items-center gap-2.5 sm:gap-3 px-3 py-1.5 sm:px-4 sm:py-2 mb-5 sm:mb-6"
            >
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
              <span className="text-xs sm:text-sm font-light text-white/80">
                AI Workforce Platform
              </span>
            </motion.div>

            {/* Heading */}
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35 }}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-normal leading-[1.05] text-white tracking-[-0.05em]"
            >
              Build Your AI
              <br />
              Workforce
            </motion.h1>

            {/* Subheading */}
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="block mt-3 text-lg sm:text-xl md:text-2xl font-medium text-blue-400 tracking-tight"
            >
              Not Just Another Chatbot.
            </motion.span>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="mt-4 sm:mt-5 text-sm sm:text-base md:text-lg font-light text-white/60 leading-relaxed"
            >
              Deploy AI teammates that understand your business, generate qualified
              leads, automate repetitive work, execute workflows and help your
              business grow.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.75 }}
              className="flex items-center gap-3 sm:gap-4 mt-6 sm:mt-8 flex-wrap"
            >
              <Link
                href="/auth/signup"
                className="liquid-glass rounded-full px-6 py-3 sm:px-7 sm:py-3.5 text-sm font-medium text-white transition-all duration-300 hover:bg-white/[0.06] inline-flex items-center gap-2"
              >
                Start Free Trial
                <ArrowRight className="w-4 h-4" />
              </Link>
              <button className="liquid-glass rounded-full px-6 py-3 sm:px-7 sm:py-3.5 text-sm font-medium text-white/70 hover:text-white transition-all duration-300 hover:bg-white/[0.04] inline-flex items-center gap-2">
                <Play className="w-4 h-4" />
                Watch Demo
              </button>
            </motion.div>
          </div>
        </div>

        {/* Bottom Stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="flex items-end gap-6 sm:gap-10 md:gap-16 px-5 sm:px-8 md:px-16 lg:px-20 pb-8 sm:pb-10"
        >
          <div className="flex items-end gap-3">
            <div className="relative w-5 h-5 shrink-0 mb-1">
              <div className="grid grid-cols-3 gap-[1.5px]">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="w-[4px] h-[4px] bg-white/60 rounded-[1px]" />
                ))}
              </div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl md:text-3xl font-normal text-white">10K+</div>
              <div className="text-xs sm:text-sm font-light text-white/50">Active Businesses</div>
            </div>
          </div>

          <div className="flex items-end gap-3">
            <div className="grid grid-cols-3 gap-[2px] shrink-0 mb-1">
              {[1, 0, 1, 0, 1, 0, 1, 0, 1].map((v, i) => (
                <div
                  key={i}
                  className={cn("w-[4px] h-[4px] rounded-[1px]", v ? "bg-white/60" : "bg-white/0")}
                />
              ))}
            </div>
            <div>
              <div className="text-xl sm:text-2xl md:text-3xl font-normal text-white">2.4K+</div>
              <div className="text-xs sm:text-sm font-light text-white/50">Leads Generated Daily</div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* SCROLL SECTIONS */}
      <div className="relative z-10 bg-black">

        {/* FEATURES */}
        <section id="features" className="py-24 px-5 sm:px-8 md:px-16 lg:px-20">
          <div className="max-w-7xl mx-auto">
            <FadeInWhenVisible className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-normal tracking-[-0.03em]">
                Everything You Need to Scale
              </h2>
              <p className="mt-4 text-base sm:text-lg font-light text-white/50 max-w-xl mx-auto">
                Your AI workforce, ready in minutes. No engineering required.
              </p>
            </FadeInWhenVisible>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {features.map((feature, index) => (
                <FadeInWhenVisible key={feature.title} delay={index * 0.08}>
                  <div className="glass rounded-2xl p-6 h-full glass-hover group">
                    <div className="w-10 h-10 rounded-full glass flex items-center justify-center mb-5 group-hover:bg-white/[0.05] transition-all duration-500">
                      <feature.icon className="w-4.5 h-4.5 text-blue-400" />
                    </div>
                    <h3 className="text-base font-medium mb-2.5">{feature.title}</h3>
                    <p className="text-sm font-light text-white/50 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </FadeInWhenVisible>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="py-24 px-5 sm:px-8 md:px-16 lg:px-20 border-y border-white/[0.04]">
          <div className="max-w-3xl mx-auto">
            <FadeInWhenVisible className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-normal tracking-[-0.03em]">
                How It Works
              </h2>
              <p className="mt-4 text-base font-light text-white/50">
                From website to customers — your AI workforce in 8 steps.
              </p>
            </FadeInWhenVisible>

            <div className="flex flex-col gap-6">
              {steps.map((s, index) => (
                <FadeInWhenVisible key={s.step} delay={index * 0.06}>
                  <div className="flex items-start gap-5 group">
                    <div className="relative z-10 w-11 h-11 glass rounded-full flex items-center justify-center shrink-0 group-hover:bg-white/[0.06] transition-all duration-500">
                      <span className="text-xs font-semibold text-blue-400">{s.step}</span>
                    </div>
                    <div className="pt-1">
                      <h4 className="text-base font-medium text-white">{s.title}</h4>
                      <p className="text-sm font-light text-white/40 mt-0.5">{s.desc}</p>
                    </div>
                  </div>
                </FadeInWhenVisible>
              ))}
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="py-24 px-5 sm:px-8 md:px-16 lg:px-20">
          <div className="max-w-7xl mx-auto">
            <FadeInWhenVisible className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-normal tracking-[-0.03em]">
                Simple, Transparent Pricing
              </h2>
              <p className="mt-4 text-base sm:text-lg font-light text-white/50 max-w-xl mx-auto">
                Choose the plan that fits your business. Upgrade anytime.
              </p>
            </FadeInWhenVisible>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
              {pricingPlans.map((plan, index) => (
                <FadeInWhenVisible key={plan.name} delay={index * 0.1}>
                  <div
                    className={cn(
                      "glass rounded-2xl p-6 h-full flex flex-col relative glass-hover",
                      plan.highlighted && "ring-1 ring-blue-500/20"
                    )}
                  >
                    {plan.highlighted && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 liquid-glass rounded-full px-4 py-1">
                        <span className="text-xs font-medium text-blue-400">Most Popular</span>
                      </div>
                    )}
                    <div className="mb-6">
                      <h3 className="text-lg font-medium mb-1">{plan.name}</h3>
                      <p className="text-sm font-light text-white/50 mb-5">{plan.description}</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-normal tracking-tight">{plan.price}</span>
                        {plan.period && (
                          <span className="text-sm font-light text-white/40">{plan.period}</span>
                        )}
                      </div>
                    </div>

                    <ul className="space-y-3 mb-8 flex-1">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5 text-sm font-light text-white/50">
                          <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    <Link
                      href={plan.name === "Enterprise" ? "#" : "/auth/signup"}
                      className={cn(
                        "w-full liquid-glass rounded-full py-2.5 text-sm font-medium text-center transition-all duration-300 hover:bg-white/[0.06]",
                        plan.highlighted ? "text-white" : "text-white/70"
                      )}
                    >
                      {plan.name === "Enterprise" ? "Contact Sales" : "Get Started"}
                      <ArrowRight className="w-3.5 h-3.5 inline ml-1.5" />
                    </Link>
                  </div>
                </FadeInWhenVisible>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-5 sm:px-8 md:px-16 lg:px-20">
          <FadeInWhenVisible>
            <div className="max-w-2xl mx-auto text-center glass rounded-2xl p-10 sm:p-12 md:p-16">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-normal tracking-[-0.03em]">
                Ready to build your AI workforce?
              </h2>
              <p className="mt-4 text-sm sm:text-base font-light text-white/50 max-w-md mx-auto">
                Join thousands of businesses automating their growth with DataBuks.
              </p>
              <div className="mt-8">
                <Link
                  href="/auth/signup"
                  className="liquid-glass rounded-full px-8 py-3.5 text-sm font-medium text-white inline-flex items-center gap-2 hover:bg-white/[0.06] transition-all duration-300"
                >
                  Start Free Trial
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <p className="mt-6 text-xs font-light text-white/30">
                No credit card required · 14-day free trial · Cancel anytime
              </p>
            </div>
          </FadeInWhenVisible>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/[0.04] px-5 sm:px-8 md:px-16 lg:px-20 py-8">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <span className="text-sm font-light text-white/30">DataBuks</span>
              <div className="hidden md:flex items-center gap-5">
                {["Privacy Policy", "Terms of Service", "Contact"].map((item) => (
                  <a key={item} href="#" className="text-xs font-light text-white/30 hover:text-white/50 transition-colors">
                    {item}
                  </a>
                ))}
              </div>
            </div>
            <p className="text-xs font-light text-white/20">
              &copy; {new Date().getFullYear()} DataBuks Inc. All rights reserved.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
