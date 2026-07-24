"use client";

import { useState, useEffect, useCallback } from "react";
import type { AutomationTask } from "@/types";

export function useAutomation() {
  const [tasks, setTasks] = useState<AutomationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/automation");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setTasks(json.tasks || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  return { tasks, loading, error, refetch: fetchTasks };
}

export function useAutomationMutations() {
  const [loading, setLoading] = useState(false);

  const createTask = async (data: Partial<AutomationTask>) => {
    setLoading(true);
    const res = await fetch("/api/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await res.json();
    setLoading(false);
    if (!res.ok) throw new Error(result.error);
    return result;
  };

  const updateTask = async (id: string, updates: Partial<AutomationTask>) => {
    setLoading(true);
    const res = await fetch(`/api/automation/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    const result = await res.json();
    setLoading(false);
    if (!res.ok) throw new Error(result.error);
    return result;
  };

  const deleteTask = async (id: string) => {
    setLoading(true);
    const res = await fetch(`/api/automation/${id}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) throw new Error("Failed");
    return true;
  };

  return { createTask, updateTask, deleteTask, loading };
}
