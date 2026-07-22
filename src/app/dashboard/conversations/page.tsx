"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  MessageSquare,
  Phone,
  Video,
  MoreHorizontal,
  Paperclip,
  Send,
  Instagram,
  Facebook,
  Linkedin,
  MessageCircle,
  Twitter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { conversations } from "@/lib/data";
import type { Conversation } from "@/types";

const platformIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  whatsapp: MessageCircle,
  telegram: Send,
};

const platformColors: Record<string, string> = {
  instagram: "text-pink-400",
  facebook: "text-blue-400",
  linkedin: "text-blue-400",
  whatsapp: "text-emerald-400",
  telegram: "text-sky-400",
};

const statusColors = {
  online: "bg-emerald-400",
  away: "bg-amber-400",
  offline: "bg-gray-500",
};

const chatMessages: Record<string, { from: "ai" | "user"; text: string; time: string }[]> = {
  "cn-001": [
    { from: "user", text: "Hey Alex! Thanks for checking out our platform. Did you have a chance to go through the demo?", time: "10:02 AM" },
    { from: "ai", text: "Yes, I did! I was really impressed with the automation features. Especially the lead scoring engine.", time: "10:03 AM" },
    { from: "user", text: "Great to hear! The lead scoring uses 40+ data points to give you real-time scores. Would you like to see a custom setup for your team?", time: "10:04 AM" },
    { from: "ai", text: "That would be amazing. We have about 15 sales reps who would benefit from automated lead prioritization.", time: "10:05 AM" },
    { from: "user", text: "Perfect. I can set up a custom workspace for 15 users. Let me know what CRM integrations you need - we support HubSpot, Salesforce, and Pipedrive.", time: "10:06 AM" },
    { from: "ai", text: "Sounds great! Let me check with my team and I'll get back to you by Friday.", time: "10:07 AM" },
  ],
  "cn-002": [
    { from: "ai", text: "Hi! I was wondering about the enterprise plan pricing. We need something for a team of 40.", time: "2:15 PM" },
    { from: "user", text: "Hi Maria! Our Enterprise plan is custom-priced based on your needs. It includes unlimited DMs, white-label dashboard, and a dedicated account manager.", time: "2:16 PM" },
    { from: "ai", text: "That sounds exactly like what we need. Can you send over the pricing PDF for the enterprise plan?", time: "2:18 PM" },
    { from: "user", text: "Absolutely! I'll send it right over. Do you have time for a quick call this week to go over the details?", time: "2:19 PM" },
    { from: "ai", text: "Yes, Thursday at 3 PM works for me.", time: "2:20 PM" },
    { from: "user", text: "Booked! I'll send the calendar invite and the PDF now.", time: "2:21 PM" },
  ],
  "cn-003": [
    { from: "ai", text: "The demo was really helpful. Our team is excited to move forward.", time: "11:00 AM" },
    { from: "user", text: "That's wonderful, Derek! I'm glad the demo resonated. Are you ready to discuss the annual plan we talked about?", time: "11:02 AM" },
    { from: "ai", text: "Yes, we've reviewed the numbers and the ROI projections look solid.", time: "11:03 AM" },
    { from: "user", text: "Excellent. The annual plan gives you 20% savings plus priority support and custom AI model training.", time: "11:04 AM" },
    { from: "ai", text: "Thanks for the demo. We're ready to move forward with the annual plan.", time: "11:06 AM" },
  ],
  "cn-004": [
    { from: "ai", text: "Just wanted to share some feedback - the HubSpot integration has been working perfectly.", time: "3:00 PM" },
    { from: "user", text: "That's great to hear, Sophie! Are all your leads syncing properly between the two platforms?", time: "3:01 PM" },
    { from: "ai", text: "Yes, everything is syncing in real-time. We've already seen a 30% improvement in lead response time.", time: "3:03 PM" },
    { from: "ai", text: "The integration with HubSpot was seamless. Our team loves it so far.", time: "3:05 PM" },
  ],
  "cn-005": [
    { from: "ai", text: "Hi, I was exploring the automation features and had a question about lead scoring workflows.", time: "1:00 PM" },
    { from: "user", text: "Happy to help, Ryan! What specifically would you like to know about the lead scoring?", time: "1:02 PM" },
    { from: "ai", text: "Is there a way to set up automated follow-up sequences based on lead score?", time: "1:03 PM" },
    { from: "user", text: "Yes! You can create trigger-based sequences that automatically send personalized follow-ups when a lead reaches a certain score threshold.", time: "1:05 PM" },
    { from: "ai", text: "Perfect. Can you show me how to set that up?", time: "1:06 PM" },
  ],
  "cn-006": [
    { from: "ai", text: "Hi, we're experiencing an issue with the analytics dashboard. The data doesn't seem to be updating.", time: "4:00 PM" },
    { from: "user", text: "I'm sorry to hear that, Jennifer. Let me look into this for you right away. Can you tell me which specific metrics are affected?", time: "4:01 PM" },
    { from: "ai", text: "The conversation count and lead scoring charts seem stuck on yesterday's data.", time: "4:02 PM" },
    { from: "ai", text: "We're seeing an issue with the analytics dashboard not updating in real-time.", time: "4:03 PM" },
    { from: "user", text: "I've identified the issue - it's related to a sync delay with the reporting service. Our team is deploying a fix now. Should be resolved within 30 minutes.", time: "4:05 PM" },
  ],
};

function getDefaultMessages(conv: Conversation) {
  if (chatMessages[conv.id]) return chatMessages[conv.id];
  return [
    { from: "ai" as const, text: conv.lastMessage, time: conv.time.replace(" ago", "") },
  ];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export default function ConversationsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [localConversations, setLocalConversations] = useState(conversations);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!search) return localConversations;
    const q = search.toLowerCase();
    return localConversations.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q)
    );
  }, [search, localConversations]);

  const selected = useMemo(
    () => localConversations.find((c) => c.id === selectedId) ?? null,
    [selectedId, localConversations]
  );

  const messages = useMemo(
    () => (selected ? getDefaultMessages(selected) : []),
    [selected]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedId]);

  const activeContacts = useMemo(
    () => filtered.filter((c) => c.status === "online" || c.status === "away"),
    [filtered]
  );

  const otherContacts = useMemo(
    () => filtered.filter((c) => c.status === "offline"),
    [filtered]
  );

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setLocalConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c))
    );
  };

  const handleSend = () => {
    if (!messageInput.trim()) return;
    setMessageInput("");
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] -m-6 md:-m-8 overflow-hidden">
      <div className="w-[380px] flex-shrink-0 border-r border-white/[0.05] flex flex-col bg-background">
        <div className="p-4 border-b border-white/[0.05]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <Input
              placeholder="Search conversations..."
              className="pl-10 h-9 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeContacts.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-medium text-white/30 uppercase tracking-wider">
                Active
              </div>
              {activeContacts.map((conv) => {
                const PlatformIcon = platformIcons[conv.platform];
                const isSelected = selectedId === conv.id;

                return (
                  <button
                    key={conv.id}
                    onClick={() => handleSelect(conv.id)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-all hover:bg-white/[0.03] ${
                      isSelected ? "bg-white/[0.06] border-l-2 border-l-sky-400" : ""
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] border border-white/[0.08]">
                        <span className="text-xs font-bold text-white/60">
                          {getInitials(conv.name)}
                        </span>
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${statusColors[conv.status]}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-white truncate">
                          {conv.name}
                        </span>
                        <span className="text-[10px] text-white/30 shrink-0 ml-2">
                          {conv.time}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs text-white/40 truncate max-w-[180px]">
                          {conv.lastMessage}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {PlatformIcon && (
                            <PlatformIcon className={`h-3 w-3 ${platformColors[conv.platform] ?? "text-white/40"}`} />
                          )}
                          {conv.unread > 0 && (
                            <Badge className="h-5 min-w-5 px-1.5 flex items-center justify-center bg-sky-500/20 text-sky-400 text-[10px] rounded-full">
                              {conv.unread}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {otherContacts.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-medium text-white/30 uppercase tracking-wider">
                Other
              </div>
              {otherContacts.map((conv) => {
                const PlatformIcon = platformIcons[conv.platform];
                const isSelected = selectedId === conv.id;

                return (
                  <button
                    key={conv.id}
                    onClick={() => handleSelect(conv.id)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-all hover:bg-white/[0.03] ${
                      isSelected ? "bg-white/[0.06] border-l-2 border-l-sky-400" : ""
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] border border-white/[0.08]">
                        <span className="text-xs font-bold text-white/60">
                          {getInitials(conv.name)}
                        </span>
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${statusColors[conv.status]}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-white truncate">
                          {conv.name}
                        </span>
                        <span className="text-[10px] text-white/30 shrink-0 ml-2">
                          {conv.time}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs text-white/40 truncate max-w-[180px]">
                          {conv.lastMessage}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {PlatformIcon && (
                            <PlatformIcon className={`h-3 w-3 ${platformColors[conv.platform] ?? "text-white/40"}`} />
                          )}
                          {conv.unread > 0 && (
                            <Badge className="h-5 min-w-5 px-1.5 flex items-center justify-center bg-sky-500/20 text-sky-400 text-[10px] rounded-full">
                              {conv.unread}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-white/30">
              <MessageSquare className="h-10 w-10 mb-3" />
              <p className="text-sm">No conversations found</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-[#0a0a0a]">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                <MessageSquare className="h-10 w-10 text-white/20" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-white/40">
                  Select a conversation
                </p>
                <p className="text-sm text-white/20 mt-1">
                  Choose a contact from the left panel to start messaging
                </p>
              </div>
            </motion.div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05] bg-background">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] border border-white/[0.08]">
                    <span className="text-xs font-bold text-white/60">
                      {getInitials(selected.name)}
                    </span>
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${statusColors[selected.status]}`}
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">
                      {selected.name}
                    </span>
                    {platformIcons[selected.platform] &&
                      (() => {
                        const PIcon = platformIcons[selected.platform];
                        return (
                          <PIcon className={`h-3.5 w-3.5 ${platformColors[selected.platform] ?? "text-white/40"}`} />
                        );
                      })()}
                  </div>
                  <span className="text-xs text-white/40 capitalize">
                    {selected.status === "online"
                      ? "Online"
                      : selected.status === "away"
                        ? "Away"
                        : "Offline"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-white/40 hover:text-white/80"
                >
                  <Phone className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-white/40 hover:text-white/80"
                >
                  <Video className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-white/40 hover:text-white/80"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-6 space-y-4">
              <AnimatePresence>
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05, duration: 0.2 }}
                    className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                        msg.from === "user"
                          ? "bg-blue-500/20 border border-blue-500/20 text-white rounded-br-md"
                          : "bg-white/[0.04] border border-white/[0.06] text-white/80 rounded-bl-md"
                      }`}
                    >
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                      <p className="text-[10px] text-white/30 mt-1 text-right">
                        {msg.time}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-white/[0.05] bg-background">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-white/30 hover:text-white/60 shrink-0"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Input
                  placeholder={`Message ${selected.name}...`}
                  className="h-9 text-sm flex-1"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSend();
                  }}
                />
                <Button
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={handleSend}
                  disabled={!messageInput.trim()}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
