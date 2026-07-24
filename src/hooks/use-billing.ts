"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { BillingData } from "@/types";

export function useBilling() {
  const [data, setData] = useState<BillingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchBilling = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing", { signal: controller.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch billing data");
      setData(json);
    } catch (err: any) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBilling();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchBilling]);

  return { data, loading, error, refetch: fetchBilling };
}
