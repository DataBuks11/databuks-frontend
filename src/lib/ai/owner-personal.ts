/**
 * PERSONAL-ASSISTANT MODE
 *
 * When the user is in "personal" mode, the assistant responds casually
 * WITHOUT injecting the business snapshot. This is the same WhatsApp
 * number — no separate connection needed. The user toggles modes with
 * keywords: "personal" / "off record" / "back to business".
 *
 * In personal mode the system prompt explicitly forbids any concrete
 * numbers or contact info — the AI either gives a generic answer or
 * says "share your email, I'll send it".
 */

import { getActiveProvider } from "./providers";
import type { SupabaseClient } from "@supabase/supabase-js";

const PERSONAL_TRIGGERS = /\b(personal|off record|chill mode|as a friend|not business|just chat|normal chat|back to personal)\b/i;
const BUSINESS_TRIGGERS = /\b(back to business|business mode|back to work|back to databuks)\b/i;

export async function isUserInPersonalMode(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("assistant_mode")
      .eq("id", userId)
      .maybeSingle();
    return (data as any)?.assistant_mode === "personal";
  } catch {
    return false;
  }
}

export async function setAssistantMode(
  supabase: SupabaseClient,
  userId: string,
  mode: "business" | "personal"
): Promise<void> {
  try {
    await supabase
      .from("profiles")
      .update({
        assistant_mode: mode,
        assistant_mode_updated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  } catch (err: any) {
    console.warn(`[owner-personal] setAssistantMode failed: ${err?.message}`);
  }
}

export interface PersonalChatOpts {
  supabase: SupabaseClient;
  userId: string;
  messageText: string;
  isSticky?: boolean;
}

export async function handlePersonalChat(opts: PersonalChatOpts): Promise<string> {
  const { supabase, userId, messageText } = opts;
  const text = messageText.trim();
  const lower = text.toLowerCase();

  // Mode toggles
  if (BUSINESS_TRIGGERS.test(lower)) {
    await setAssistantMode(supabase, userId, "business");
    return "business mode on. ab business data-aware replies dunga. 'leads count', 'business status' sab puch sakte ho.";
  }
  if (PERSONAL_TRIGGERS.test(lower)) {
    await setAssistantMode(supabase, userId, "personal");
    return "ok personal mode on. abhi casual chat, koi business data inject nahi karunga.";
  }

  // Otherwise, normal LLM chat without business context
  const provider = getActiveProvider();
  try {
    const out = await provider.completeJson({
      system: [
        "You are the user's casual personal WhatsApp assistant — NOT a business bot.",
        "Be warm, brief, human. No bullet points, no corporate language, no marketing fluff.",
        "CRITICAL: do NOT invent IDs, passwords, account numbers, OTPs, company registration numbers, employee names, client names, ticket numbers, or any concrete identifier.",
        "If asked for credentials, account info, or anything you don't have, say 'share your email, I'll send it' or 'check your email'.",
        "If asked 'who are you' or 'what is your business': say 'your casual personal assistant, not a business tool'.",
        "If asked something outside your knowledge, just say you're not sure and suggest checking it out.",
        "Keep replies short — 1-2 sentences max. Match the user's language (English / Hinglish / Hindi).",
        "Reply as JSON: { \"reply\": \"your short casual message here\" }",
      ].join("\n"),
      user: text,
      temperature: 0.6,
      maxTokens: 400,
    });
    return String((out as any)?.reply ?? "").trim() || "hmm, kuch samjha nahi. thoda aur bata?";
  } catch (err: any) {
    return `network issue — try again. (${err?.message ?? "unknown"})`;
  }
}
