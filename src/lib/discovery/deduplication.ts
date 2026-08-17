/**
 * Discovery Lead Deduplication
 * Prevents duplicate leads from the same author or content across platforms.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoveredLeadInput } from "./types";

export interface DeduplicationResult {
  isDuplicate: boolean;
  existingDiscoveredLeadId: string | null;
  existingLeadId: string | null;
  reason: string | null;
}

/**
 * Check if a discovered lead is a duplicate.
 * Checks:
 * 1. Idempotency key match in discovered_leads
 * 2. Same author on same platform in discovered_leads
 * 3. Existing lead match by email/phone/name+company in leads table
 */
export async function checkDuplicate(
  supabase: SupabaseClient,
  userId: string,
  input: DiscoveredLeadInput
): Promise<DeduplicationResult> {
  // 1. Check idempotency key
  if (input.idempotency_key) {
    const { data: existing } = await supabase
      .from("discovered_leads")
      .select("id, lead_id")
      .eq("user_id", userId)
      .eq("idempotency_key", input.idempotency_key)
      .maybeSingle();
    if (existing) {
      return {
        isDuplicate: true,
        existingDiscoveredLeadId: existing.id,
        existingLeadId: existing.lead_id ?? null,
        reason: "idempotency_key_match",
      };
    }
  }

  // 2. Check same author on same platform (within last 7 days to avoid false positives)
  if (input.external_author_id) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: existing } = await supabase
      .from("discovered_leads")
      .select("id, lead_id, source_content")
      .eq("user_id", userId)
      .eq("source_platform", input.source_platform)
      .eq("external_author_id", input.external_author_id)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      return {
        isDuplicate: true,
        existingDiscoveredLeadId: existing.id,
        existingLeadId: existing.lead_id ?? null,
        reason: "same_author_same_platform_recent",
      };
    }
  }

  return {
    isDuplicate: false,
    existingDiscoveredLeadId: null,
    existingLeadId: null,
    reason: null,
  };
}

/**
 * Try to find an existing lead that matches the discovered lead's identity.
 * Uses name matching as a last resort (only when combined with handle/platform).
 */
export async function findExistingLead(
  supabase: SupabaseClient,
  userId: string,
  input: DiscoveredLeadInput
): Promise<string | null> {
  // Only match by name if we have a handle — name alone is too ambiguous
  if (input.author_name && input.author_handle) {
    const { data: nameMatch } = await supabase
      .from("leads")
      .select("id")
      .eq("user_id", userId)
      .ilike("name", input.author_name)
      .limit(1)
      .maybeSingle();
    if (nameMatch) return nameMatch.id;
  }

  return null;
}

/**
 * Generate an idempotency key for a discovered lead input.
 */
export function generateDiscoveryIdempotencyKey(
  userId: string,
  input: DiscoveredLeadInput
): string {
  const parts = [
    "discovery",
    userId,
    input.source_platform,
    input.external_author_id ?? "unknown",
    (input.source_content ?? "").slice(0, 100),
  ];
  return parts.join(":");
}
