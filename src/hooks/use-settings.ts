"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface WorkspaceSettings {
  business_name: string | null;
  brand_voice: string | null;
  target_audience: string | null;
  notifications: {
    emailAlerts: boolean;
    pushNotifications: boolean;
    leadNotifications: boolean;
    contentNotifications: boolean;
    weeklyReport: boolean;
  } | null;
  updated_at: string | null;
}

export function useSettings() {
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSettings = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", { signal: controller.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch settings");
      setSettings(json);
    } catch (err: any) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchSettings]);

  return { settings, loading, error, refetch: fetchSettings };
}

export function useSettingsMutations() {
  const [loading, setLoading] = useState(false);

  const updateSettings = async (updates: Partial<WorkspaceSettings>) => {
    setLoading(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) throw new Error(data.error || "Failed to update settings");
    return data as WorkspaceSettings;
  };

  return { updateSettings, loading };
}
