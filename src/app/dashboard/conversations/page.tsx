"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useConversations, useConversationMessages, useConversationMutations } from "@/hooks/use-conversations";
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

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

function ConversationSkeleton() {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
  );
}

export default function ConversationsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [messageInput, setMessageInput] = useState("");

  const { conversations, loading: convLoading, error: convError, refetch } = useConversations();
  const { sendMessage, loading: sendLoading } = useConversationMutations();
  const { messages: apiMessages, loading: messagesLoading, refetch: refetchMessages } = useConversationMessages(selectedId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!search) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      (c) =>
        (c.name ?? "").toLowerCase().includes(q) ||
        (c.lastMessage ?? "").toLowerCase().includes(q)
    );
  }, [search, conversations]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [selectedId, conversations]
  );

  const messages = useMemo(() => {
    if (apiMessages.length > 0) {
      return apiMessages.map((m) => ({
        from: m.sender as "ai" | "user",
        text: m.content,
        time: new Date(m.created_at).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
      }));
    }
    if (selected) {
      return [
        {
          from: "ai" as const,
          text: selected.lastMessage,
          time: selected.time,
        },
      ];
    }
    return [];
  }, [apiMessages, selected]);

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
  };

  const handleSend = useCallback(async () => {
    if (!messageInput.trim() || !selectedId) return;
    const text = messageInput.trim();
    setMessageInput("");
    try {
      await sendMessage(selectedId, text, "user");
      refetchMessages();
      refetch();
    } catch {}
  }, [messageInput, selectedId, sendMessage, refetch, refetchMessages]);

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
          {convLoading ? (
            <div className="space-y-0">
              {Array.from({ length: 8 }).map((_, i) => (
                <ConversationSkeleton key={i} />
              ))}
            </div>
          ) : convError ? (
            <div className="flex flex-col items-center justify-center py-16 text-white/30">
              <MessageSquare className="h-10 w-10 mb-3" />
              <p className="text-sm text-red-400/60">Failed to load conversations</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-white/50"
                onClick={() => refetch()}
              >
                Retry
              </Button>
            </div>
          ) : (
            <>
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

              {filtered.length === 0 && !convLoading && (
                <div className="flex flex-col items-center justify-center py-16 text-white/30">
                  <MessageSquare className="h-10 w-10 mb-3" />
                  <p className="text-sm">No conversations found</p>
                </div>
              )}
            </>
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
              {messagesLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                      <Skeleton className={`h-12 rounded-2xl ${i % 2 === 0 ? "w-3/5" : "w-2/5"}`} />
                    </div>
                  ))}
                </div>
              ) : (
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
              )}
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
                  disabled={!messageInput.trim() || sendLoading}
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
