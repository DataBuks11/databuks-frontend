"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, Phone, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const QUICK_COMMANDS = ["business status", "leads count", "pending approvals", "help"];

interface ExtractedPreview {
  business_name?: string | null;
  description?: string | null;
  services?: { name: string; description?: string }[];
  target_audience?: { segment: string; description?: string }[];
  industries?: string[];
  locations?: string[];
  tone?: string | null;
  missing_fields?: string[];
}

export default function AssistantChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "I'm your business assistant 💬\n\nAsk me: \"business status\", \"leads count\", \"pending approvals\", \"meetings booked\"..." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendToWhatsApp, setSendToWhatsApp] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [preview, setPreview] = useState<ExtractedPreview | null>(null);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Check whether the user has business context the first time the widget opens
  useEffect(() => {
    if (!open) return;
    if (messages.length > 1) return; // already in conversation
    fetch("/api/ai/assistant/status")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return;
        if (!j.has_context) {
          setNeedsOnboarding(true);
          setMessages([
            {
              role: "assistant",
              text:
                "hey 👋 before we do anything, the AI needs to know your business. " +
                "tell me in 2-3 lines what you do, who's it for, and where you are. " +
                "no website? no problem — just type like you'd explain to a friend.",
            },
          ]);
        }
      })
      .catch(() => {});
  }, [open]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || loading || saving) return;
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setInput("");
    setLoading(true);
    try {
      // Onboarding mode: extract business context, don't run the command-center
      if (needsOnboarding) {
        const res = await fetch("/api/ai/onboarding/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg }),
        });
        const data = await res.json();
        if (data.confirmed === false) {
          setPreview(data.extracted ?? {});
          setMessages((prev) => [
            ...prev,
            { role: "assistant", text: renderPreview(data.extracted) },
          ]);
        } else if (data.saved) {
          setNeedsOnboarding(false);
          setPreview(null);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              text: "saved! ab AI har lead ke saath tumhari business context use karega. ab kuch bhi pooch — 'leads count', 'business status' etc.",
            },
          ]);
        } else if (data.prompt) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", text: data.prompt },
          ]);
        }
        return;
      }

      const res = await fetch("/api/ai/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, sendToWhatsApp }),
      });
      const data = await res.json();
      const tail = data.sentToWhatsApp ? " (sent to WhatsApp ✅)" : "";
      setMessages((prev) => [...prev, { role: "assistant", text: (data.reply ?? data.error ?? "Something went wrong, please try again.") + tail }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "Network issue — please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  function renderPreview(p: ExtractedPreview | null | undefined): string {
    if (!p) return "couldn't extract anything — try describing your business in a different way";
    const lines: string[] = [];
    if (p.business_name) lines.push(`• name: ${p.business_name}`);
    if (p.description) lines.push(`• about: ${p.description.slice(0, 200)}`);
    if (p.services?.length) lines.push(`• services: ${p.services.map((s) => s.name).join(", ")}`);
    if (p.target_audience?.length) lines.push(`• for: ${p.target_audience.map((t) => t.segment).join(", ")}`);
    if (p.industries?.length) lines.push(`• industries: ${p.industries.join(", ")}`);
    if (p.locations?.length) lines.push(`• location: ${p.locations.join(", ")}`);
    if (p.tone) lines.push(`• tone: ${p.tone}`);
    const head = lines.length ? "ye samjha —\n" + lines.join("\n") : "kuch bhi samajh nahi aaya";
    const tail = "agar theek hai toh ✅ Save daba do, ya kuch aur bata";
    return `${head}\n\n${tail}`;
  }

  const confirmSave = async () => {
    if (saving || !needsOnboarding) return;
    setSaving(true);
    // Re-send the last user message with confirmed: true
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) {
      setSaving(false);
      return;
    }
    try {
      const res = await fetch("/api/ai/onboarding/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: lastUser.text, confirmed: true }),
      });
      const data = await res.json();
      if (data.saved) {
        setNeedsOnboarding(false);
        setPreview(null);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "saved ✅ ab AI har lead ke saath tumhari business context use karega. 'leads count', 'business status', ya kuch bhi pooch.",
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", text: "save failed: " + (data.error ?? "unknown") }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "network issue — try again" }]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300",
          open ? "bg-white/10 border border-white/20 rotate-0" : "bg-gradient-to-br from-emerald-500 to-emerald-600 hover:scale-110"
        )}
        aria-label="AI Assistant"
      >
        {open ? <X className="w-6 h-6 text-white" /> : <MessageCircle className="w-6 h-6 text-white" />}
        {!open && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-sky-400 animate-pulse" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[calc(100vw-2.5rem)] max-w-sm h-[32rem] rounded-3xl overflow-hidden border border-white/10 bg-black/80 backdrop-blur-2xl shadow-2xl flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-emerald-500/20 to-transparent border-b border-white/10 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
              <MessageCircle className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">AI Assistant</p>
              <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> online — instant replies
              </p>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-line",
                    m.role === "user"
                      ? "bg-emerald-500/20 text-emerald-100 rounded-br-sm"
                      : "bg-white/[0.06] text-white/90 rounded-bl-sm"
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/[0.06] px-3.5 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 text-white/50 animate-spin" />
                </div>
              </div>
            )}
          </div>

          {/* Quick commands / Save button */}
          <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
            {preview ? (
              <>
                <button
                  onClick={confirmSave}
                  disabled={saving}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition-colors disabled:opacity-40 flex items-center gap-1"
                >
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save
                </button>
                <span className="text-[10px] text-white/40 self-center">review aur kuch add karna ho toh type kar</span>
              </>
            ) : (
              QUICK_COMMANDS.map((cmd) => (
                <button
                  key={cmd}
                  onClick={() => send(cmd)}
                  disabled={loading}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.12] transition-colors disabled:opacity-40"
                >
                  {cmd}
                </button>
              ))
            )}
          </div>

          {/* Input */}
          <div className="px-3 pb-3">
            <div className="flex items-center gap-1 mb-1.5">
              <button
                onClick={() => setSendToWhatsApp((v) => !v)}
                className={cn(
                  "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full transition-colors",
                  sendToWhatsApp
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "bg-white/[0.04] text-white/40 border border-white/10 hover:text-white/60"
                )}
                title={sendToWhatsApp ? "Messages will be sent to your WhatsApp" : "Click to also send to WhatsApp"}
                disabled={loading}
              >
                <Phone className="w-2.5 h-2.5" />
                {sendToWhatsApp ? "WhatsApp on" : "Web only"}
              </button>
            </div>
            <div className="flex items-center gap-2 bg-white/[0.06] rounded-full px-4 py-2 border border-white/10">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
                placeholder={sendToWhatsApp ? "Message → WhatsApp..." : "Message..."}
                className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
              />
              <button onClick={() => send(input)} disabled={loading || !input.trim()} className="disabled:opacity-40">
                <Send className={cn("w-4.5 h-4.5", input.trim() ? "text-emerald-400" : "text-white/30")} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
