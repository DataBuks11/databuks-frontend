import type { EvidenceLevel } from "./external/types";

export interface EvidenceRecord {
  claim: string;
  evidence_type: EvidenceLevel;
  source_type: "website" | "google_search" | "google_maps" | "justdial" | "directory" | "social";
  source_url: string | null;
  evidence_text: string | null;
  retrieved_at: string;
  freshness: "FRESH" | "MODERATE" | "STALE" | "UNKNOWN";
  reason: string;
  strength: number; // 0-100
}

const FRESH_DAYS = 30;
const MODERATE_DAYS = 180;

export function classifyFreshness(retrievedAt: string): "FRESH" | "MODERATE" | "STALE" | "UNKNOWN" {
  const ageDays = (Date.now() - new Date(retrievedAt).getTime()) / 86400000;
  if (!Number.isFinite(ageDays)) return "UNKNOWN";
  if (ageDays <= FRESH_DAYS) return "FRESH";
  if (ageDays <= MODERATE_DAYS) return "MODERATE";
  return "STALE";
}

export function evidenceStrength(e: EvidenceRecord): number {
  let base = 0;
  switch (e.evidence_type) {
    case "VERIFIED_DIRECT": base = 90; break;
    case "STRONG_INFERRED": base = 65; break;
    case "WEAK_SIGNAL": base = 35; break;
    case "CONFLICTING": base = 15; break;
    default: return 0;
  }
  switch (e.freshness) {
    case "FRESH": break;
    case "MODERATE": base -= 15; break;
    case "STALE": base -= 30; break;
    default: base -= 20; break;
  }
  return Math.max(0, Math.min(100, base));
}

export function detectConflicts(items: { field: string; value: string }[]): {
  field: string;
  values: string[];
}[] {
  const byField = new Map<string, Set<string>>();
  for (const item of items) {
    if (!item.value) continue;
    if (!byField.has(item.field)) byField.set(item.field, new Set());
    byField.get(item.field)!.add(item.value);
  }
  const conflicts: { field: string; values: string[] }[] = [];
  for (const [field, values] of byField) {
    if (values.size > 1) conflicts.push({ field, values: [...values] });
  }
  return conflicts;
}

export function strongestEvidence(records: EvidenceRecord[]): EvidenceRecord | null {
  if (records.length === 0) return null;
  return records.reduce((best, cur) => (evidenceStrength(cur) > evidenceStrength(best) ? cur : best));
}
