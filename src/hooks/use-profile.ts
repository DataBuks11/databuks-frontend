"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface Profile {
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  company_name: string | null;
  website: string | null;
  phone: string | null;
  role: string | null;
  created_at: string | null;
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchProfile = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", { signal: controller.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch profile");
      setProfile(json);
    } catch (err: any) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchProfile]);

  return { profile, loading, error, refetch: fetchProfile };
}

export function useProfileMutations() {
  const [loading, setLoading] = useState(false);

  const updateProfile = async (updates: Partial<Profile>) => {
    setLoading(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) throw new Error(data.error || "Failed to update profile");
    return data as Profile;
  };

  return { updateProfile, loading };
}
