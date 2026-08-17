/**
 * Discovery Cooldown & Anti-Spam
 * Prevents repeated outreach to the same person and enforces conversation limits.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { COOLDOWN_HOURS_DEFAULT, MAX_AUTONOMOUS_TURNS } from "./types";

/**
 * Check if a discovered lead is currently in cooldown.
 */
export async function isInCooldown(
  supabase: SupabaseClient,
  userId: string,
  discoveredLeadId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("discovered_leads")
    .select("cooldown_until")
    .eq("id", discoveredLeadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.cooldown_until) return false;
  return new Date(data.cooldown_until) > new Date();
}

/**
 * Check cooldown by author identity on a specific platform.
 */
export async function isAuthorInCooldown(
  supabase: SupabaseClient,
  userId: string,
  platform: string,
  authorId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("discovered_leads")
    .select("cooldown_until")
    .eq("user_id", userId)
    .eq("source_platform", platform)
    .eq("external_author_id", authorId)
    .not("cooldown_until", "is", null)
    .order("cooldown_until", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.cooldown_until) return false;
  return new Date(data.cooldown_until) > new Date();
}

/**
 * Set cooldown on a discovered lead.
 */
export async function setCooldown(
  supabase: SupabaseClient,
  userId: string,
  discoveredLeadId: string,
  hours: number = COOLDOWN_HOURS_DEFAULT
): Promise<void> {
  const cooldownUntil = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  await supabase
    .from("discovered_leads")
    .update({ cooldown_until: cooldownUntil, updated_at: new Date().toISOString() })
    .eq("id", discoveredLeadId)
    .eq("user_id", userId);
}

/**
 * Check if the conversation thread has reached max autonomous turns.
 */
export async function hasReachedMaxTurns(
  supabase: SupabaseClient,
  userId: string,
  discoveredLeadId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("conversation_threads")
    .select("total_messages, max_turns_reached")
    .eq("user_id", userId)
    .eq("discovered_lead_id", discoveredLeadId)
    .maybeSingle();
  if (!data) return false;
  if (data.max_turns_reached) return true;
  return data.total_messages >= MAX_AUTONOMOUS_TURNS * 2; // *2 because both sides
}

/**
 * Check if the last N agent messages are identical (loop detection).
 */
export function detectMessageLoop(
  messages: Array<{ role: string; content: string }>,
  proposedMessage: string,
  windowSize: number = 3
): boolean {
  const agentMessages = messages
    .filter((m) => m.role === "agent")
    .slice(-windowSize)
    .map((m) => normalizeForComparison(m.content));

  const normalized = normalizeForComparison(proposedMessage);
  const duplicateCount = agentMessages.filter((m) => m === normalized).length;
  return duplicateCount >= 2;
}

/**
 * Detect if the prospect has opted out or shown clear disinterest.
 */
export function detectOptOut(messages: Array<{ role: string; content: string }>): boolean {
  const lastUserMessages = messages
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => m.content.toLowerCase());

  const optOutSignals = [
    "not interested",
    "no thanks",
    "no thank you",
    "stop",
    "unsubscribe",
    "don't contact",
    "dont contact",
    "leave me alone",
    "stop messaging",
    "not looking",
    "nahi chahiye",
    "nahi chaiye",
    "mujhe nahi",
    "nahi",
    "nope",
    "please stop",
    "remove me",
  ];

  for (const msg of lastUserMessages) {
    for (const signal of optOutSignals) {
      if (msg.includes(signal)) return true;
    }
  }

  return false;
}

/**
 * Detect if the prospect hasn't responded within the expected window.
 */
export function detectNoResponse(
  lastAgentMessageAt: string | null,
  lastUserMessageAt: string | null,
  hoursThreshold: number = 48
): boolean {
  if (!lastAgentMessageAt) return false;
  if (!lastUserMessageAt) {
    // Agent sent message but never got a response
    const agentTime = new Date(lastAgentMessageAt).getTime();
    return Date.now() - agentTime > hoursThreshold * 3600 * 1000;
  }
  const agentTime = new Date(lastAgentMessageAt).getTime();
  const userTime = new Date(lastUserMessageAt).getTime();
  // Agent's last message is newer and user hasn't responded
  if (agentTime > userTime) {
    return Date.now() - agentTime > hoursThreshold * 3600 * 1000;
  }
  return false;
}

function normalizeForComparison(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
