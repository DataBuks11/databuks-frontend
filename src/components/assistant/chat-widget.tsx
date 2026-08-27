"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

const QUICK_COMMANDS = ["business status", "leads count", "pending approvals", "help"];

export default function AssistantChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", text: "I'm your business assistant 💬\n\nAsk me: \"business status\", \"leads count\", \"pending approvals\", \"meetings booked\"..." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || loading) return;
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", text: data.reply ?? data.error ?? "Something went wrong, please try again." }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", text: "Network issue — please try again." }]);
    } finally {
      setLoading(false);
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

          {/* Quick commands */}
          <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
            {QUICK_COMMANDS.map((cmd) => (
              <button
                key={cmd}
                onClick={() => send(cmd)}
                disabled={loading}
                className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.12] transition-colors disabled:opacity-40"
              >
                {cmd}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="px-3 pb-3">
            <div className="flex items-center gap-2 bg-white/[0.06] rounded-full px-4 py-2 border border-white/10">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
                placeholder="Message..."
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
