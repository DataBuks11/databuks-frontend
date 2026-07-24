"use client";

import { useState, useEffect, useCallback } from "react";

export interface AnalyticsData {
  totalLeads: number;
  qualifiedLeads: number;
  convertedLeads: number;
  avgLeadScore: number;
  totalContent: number;
  publishedContent: number;
  activeConversations: number;
  totalMessages: number;
  reach: number;
  impressions: number;
  followers: number;
  replies: number;
  meetings: number;
  revenue: number;
  growth: number;
  reachChart: { date: string; value: number }[];
  impressionsChart: { date: string; value: number }[];
  followersChart: { date: string; value: number }[];
  engagementChart: { date: string; value: number }[];
}

export function useAnalytics(range: string = "30d") {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const url = `/api/analytics?range=${range}`;

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch analytics");
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

  return { data, loading, error, refetch: fetchAnalytics };
}
