"use client";

import { useState, useEffect, useCallback } from "react";
import type { Conversation } from "@/types";

interface Message {
  id: string;
  conversation_id: string;
  content: string;
  sender: "user" | "ai";
  created_at: string;
}

function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function deriveStatus(dbStatus: string, updatedAt: string): Conversation["status"] {
  if (!updatedAt) return "offline";
  const diff = Date.now() - new Date(updatedAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 30) return "online";
  if (mins < 120) return "away";
  return "offline";
}

function toCamelCase(conv: any): Conversation {
  return {
    id: conv.id,
    name: conv.contact_name || conv.name || "",
    lastMessage: conv.last_message || "",
    time: formatTimeAgo(conv.updated_at || conv.created_at),
    unread: conv.unread ?? 0,
    platform: (conv.platform as Conversation["platform"]) || "instagram",
    status: deriveStatus(conv.status || "active", conv.updated_at || conv.created_at),
    tags: conv.tags || undefined,
  };
}

export function useConversations(params?: { platform?: string; status?: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const searchParams = new URLSearchParams();
  if (params?.platform && params.platform !== "all") searchParams.set("platform", params.platform);
  if (params?.status && params.status !== "all") searchParams.set("status", params.status);
  const qs = searchParams.toString();
  const url = `/api/conversations${qs ? `?${qs}` : ""}`;

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch conversations");
      setConversations((json.conversations || []).map(toCamelCase));
      setTotal(json.total ?? 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  return { conversations, total, loading, error, refetch: fetchConversations };
}

export function useConversationMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) { setMessages([]); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch messages");
      setMessages(json.messages || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  return { messages, loading, error, refetch: fetchMessages };
}

export function useConversationMutations() {
  const [loading, setLoading] = useState(false);

  const sendMessage = async (conversationId: string, content: string, sender: "user" | "ai" = "user") => {
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, sender }),
      });
      const json = await res.json();
      setLoading(false);
      if (!res.ok) throw new Error(json.error || "Failed to send message");
      return json;
    } catch (err: any) {
      setLoading(false);
      throw err;
    }
  };

  const createConversation = async (data: Partial<Conversation>) => {
    setLoading(true);
    const body: any = {};
    if (data.name) body.contact_name = data.name;
    if (data.platform) body.platform = data.platform;
    if (data.lastMessage) body.last_message = data.lastMessage;
    body.unread = data.unread ?? 0;
    body.status = data.status || "active";

    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) throw new Error(json.error || "Failed to create conversation");
    return json;
  };

  return { sendMessage, createConversation, loading };
}
