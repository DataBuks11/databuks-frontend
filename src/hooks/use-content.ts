"use client";

import { useState, useEffect, useCallback } from "react";
import type { ContentItem } from "@/types";

interface ContentQueryParams {
  status?: string;
  type?: string;
  platform?: string;
}

function toCamelCase(item: any): ContentItem {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    platform: item.platform,
    status: item.status,
    date: item.scheduled_date || item.created_at || "",
    author: item.author || "",
    created_at: item.created_at,
    scheduled_date: item.scheduled_date,
    updated_at: item.updated_at,
  };
}

export function useContent(params: ContentQueryParams = {}) {
  const [content, setContent] = useState<ContentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const searchParams = new URLSearchParams();
  if (params.status && params.status !== "all") searchParams.set("status", params.status);
  if (params.type && params.type !== "all") searchParams.set("type", params.type);
  if (params.platform && params.platform !== "all") searchParams.set("platform", params.platform);
  const qs = searchParams.toString();
  const url = `/api/content${qs ? `?${qs}` : ""}`;

  const fetchContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch content");
      setContent((json.content || []).map(toCamelCase));
      setTotal(json.total ?? 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  return { content, total, loading, error, refetch: fetchContent };
}

export function useContentMutations() {
  const [loading, setLoading] = useState(false);

  const createContent = async (data: Partial<ContentItem>) => {
    setLoading(true);
    const res = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    setLoading(false);
    if (!res.ok) throw new Error(result.error || "Failed to create content");
    return toCamelCase(result);
  };

  const updateContent = async (id: string, updates: Partial<ContentItem>) => {
    setLoading(true);
    const res = await fetch(`/api/content/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const result = await res.json();
    setLoading(false);
    if (!res.ok) throw new Error(result.error || "Failed to update content");
    return toCamelCase(result);
  };

  const deleteContent = async (id: string) => {
    setLoading(true);
    const res = await fetch(`/api/content/${id}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) throw new Error("Failed to delete content");
    return true;
  };

  return { createContent, updateContent, deleteContent, loading };
}
