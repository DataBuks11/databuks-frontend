"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Lead } from "@/types";

function toCamelCase(lead: any): Lead {
  return {
    id: lead.id,
    name: lead.name,
    company: lead.company || "",
    email: lead.email || "",
    phone: lead.phone || "",
    industry: lead.industry || "",
    leadScore: lead.lead_score ?? 0,
    status: lead.status || "new",
    location: lead.location || "",
    createdAt: lead.created_at || "",
    lastContact: lead.updated_at || lead.created_at || "",
    notes: lead.notes || undefined,
    updated_at: lead.updated_at,
    created_at: lead.created_at,
    lead_score: lead.lead_score,
  };
}

interface LeadQueryParams {
  search?: string;
  status?: string;
  industry?: string;
  page?: number;
  limit?: number;
}

interface LeadsResponse {
  leads: Lead[];
  total: number;
  page: number;
  totalPages: number;
}

export function useLeads(params: LeadQueryParams = {}) {
  const [data, setData] = useState<LeadsResponse>({ leads: [], total: 0, page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set("search", params.search);
  if (params.status && params.status !== "all") searchParams.set("status", params.status);
  if (params.industry && params.industry !== "all") searchParams.set("industry", params.industry);
  if (params.page && params.page > 1) searchParams.set("page", String(params.page));
  if (params.limit) searchParams.set("limit", String(params.limit));

  const queryString = searchParams.toString();
  const url = `/api/leads${queryString ? `?${queryString}` : ""}`;

  const fetchLeads = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to fetch leads");
      setData({
        leads: (json.leads || []).map(toCamelCase),
        total: json.total ?? 0,
        page: json.page ?? 1,
        totalPages: json.totalPages ?? 1,
      });
    } catch (err: any) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { fetchLeads(); return () => { abortRef.current?.abort(); }; }, [fetchLeads]);

  return { ...data, loading, error, refetch: fetchLeads };
}

export function useLeadMutations() {
  const [loading, setLoading] = useState(false);

  const createLead = async (leadData: Partial<Lead>) => {
    setLoading(true);
    const body: any = { ...leadData };
    if (body.leadScore !== undefined) { body.lead_score = body.leadScore; delete body.leadScore; }
    delete body.id;
    delete body.lastContact;
    delete body.createdAt;
    delete body.updated_at;
    delete body.created_at;

    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) throw new Error(data.error || "Failed to create lead");
    return toCamelCase(data);
  };

  const updateLead = async (id: string, updates: Partial<Lead>) => {
    setLoading(true);
    const body: any = { ...updates };
    if (body.leadScore !== undefined) { body.lead_score = body.leadScore; delete body.leadScore; }
    delete body.id;
    delete body.lastContact;
    delete body.createdAt;
    delete body.updated_at;
    delete body.created_at;
    delete body.lead_score;

    if (body.lead_score !== undefined) body.lead_score = Number(body.lead_score);

    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) throw new Error(data.error || "Failed to update lead");
    return toCamelCase(data);
  };

  const deleteLead = async (id: string) => {
    setLoading(true);
    const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to delete lead");
    }
    return true;
  };

  return { createLead, updateLead, deleteLead, loading };
}
