/**
 * OWNER-ASSISTANT CONVERSATIONAL FLOWS
 *
 * Multi-step workflows that the owner triggers from WhatsApp:
 *
 *   1. "post banao" / "aaj ki post" / "naya content" → ask count → generate N
 *   2. "outreach chalao" / "leads ko msg kar" → ask count → run multi-channel
 *   3. "yes" / "no" / "edit: ..." / "schedule: HH:MM" → approval (handled in approval-handler.ts)
 *
 * State is persisted in `assistant_session` so conversations survive
 * across webhook calls. The `expires_at` column auto-cleans via cron.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type State = "idle" | "awaiting_post_count" | "generating_posts" | "awaiting_outreach_count" | "doing_outreach";

interface SessionRow {
  user_id: string;
  state: State;
  data: Record<string, any>;
  expires_at: string;
  updated_at: string;
}

export async function getSession(supabase: SupabaseClient, userId: string): Promise<SessionRow | null> {
  try {
    const { data } = await supabase
      .from("assistant_session")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (data && new Date(data.expires_at).getTime() < Date.now()) {
      // expired — reset
      await resetSession(supabase, userId);
      return null;
    }
    return (data as SessionRow) ?? null;
  } catch {
    return null;
  }
}

export async function setSession(
  supabase: SupabaseClient,
  userId: string,
  state: State,
  data: Record<string, any> = {}
): Promise<void> {
  try {
    await supabase
      .from("assistant_session")
      .upsert(
        {
          user_id: userId,
          state,
          data,
          updated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        },
        { onConflict: "user_id" }
      );
  } catch (err: any) {
    console.warn(`[owner-flow] setSession failed: ${err?.message}`);
  }
}

export async function resetSession(supabase: SupabaseClient, userId: string): Promise<void> {
  await setSession(supabase, userId, "idle", {});
}

/** Parse Hinglish/English numbers 1-10 from a short reply. */
export function parseCount(text: string): number | null {
  const t = text.trim().toLowerCase();

  // Direct digit "1" / "2 posts" / "3"
  const numMatch = t.match(/^(\d+)/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    if (n >= 1 && n <= 10) return n;
  }

  // Words
  const words: Record<string, number> = {
    ek: 1, uno: 1, one: 1,
    do: 2, two: 2,
    teen: 3, three: 3, tran: 3,
    char: 4, four: 4,
    paanch: 5, panch: 5, five: 5,
    chhe: 6, six: 6, cheh: 6,
    saat: 7, seven: 7,
    aath: 8, eight: 8, aat: 8,
    nau: 9, nine: 9, no: 9,
    das: 10, ten: 10, dus: 10,
  };
  for (const [w, n] of Object.entries(words)) {
    if (new RegExp(`\\b${w}\\b`).test(t)) return n;
  }
  return null;
}

const POST_TRIGGERS = /\b(post|content|reel|story|update|create|make)\b.*\b(banao|create|generate|kar|karo|bana|karo|daalo|banana|banao|lagao|publish|karo)\b/i;
const POST_QUESTION = /\b(kitne|kitna|kitni)\s*(post|posts|content|reel|story)\b/i;
const POST_AFFIRM = /^(ha|haan|ok|okay|kar|karo|banao|sure|ji|yes|y|chal|karo ab)$/i;

const OUTREACH_TRIGGERS = /\b(outreach|outreach\s*chalao|leads\s*ko|leads\s*se|message\s*leads|discovered\s*leads|baat\s*karo|baat\s*kar|msg\s*bhejo|contact\s*leads|ping\s*leads)\b/i;
const OUTREACH_QUESTION = /\b(kitne|kitna|kitni)\s*(lead|leads|ko)\b/i;

/**
 * Main entry: process the owner's WhatsApp message in the context of any
 * active flow. Returns either:
 *  - { kind: "prompt", text } — we should ask the user something
 *  - { kind: "action", text } — we did something, here's a summary
 *  - null — no flow matched, fall through to normal assistant
 */
export async function handleFlowMessage(
  supabase: SupabaseClient,
  userId: string,
  text: string
): Promise<{ kind: "prompt" | "action"; text: string } | null> {
  const lower = text.trim().toLowerCase();
  const session = await getSession(supabase, userId);

  // ===== Resume existing flow =====
  if (session) {
    if (session.state === "awaiting_post_count") {
      const count = parseCount(lower);
      if (count !== null) {
        // Got the count — generate posts
        return await runPostGeneration(supabase, userId, count, session.data);
      }
      // Not a number — remind
      return {
        kind: "prompt",
        text: "1 se 10 ke beech number bhej (1, 2, 3...)",
      };
    }
    if (session.state === "awaiting_outreach_count") {
      const count = parseCount(lower);
      if (count !== null) {
        return await runOutreach(supabase, userId, count);
      }
      return {
        kind: "prompt",
        text: "1 se 10 ke beech number bhej (1, 2, 3...)",
      };
    }
  }

  // ===== Start new flow =====
  if (POST_TRIGGERS.test(lower) || POST_QUESTION.test(lower)) {
    // No session — start the conversation
    await setSession(supabase, userId, "awaiting_post_count", {});
    return {
      kind: "prompt",
      text: "aaj kitni post banaani hain? 1 se 10 ke beech number bhej (1, 2, 3...)",
    };
  }

  if (OUTREACH_TRIGGERS.test(lower) || OUTREACH_QUESTION.test(lower)) {
    await setSession(supabase, userId, "awaiting_outreach_count", {});
    return {
      kind: "prompt",
      text: "kitne leads ko message bhejun? 1-10 number bhej (3, 5, 7...)",
    };
  }

  return null;
}

async function runPostGeneration(
  supabase: SupabaseClient,
  userId: string,
  count: number,
  _sessionData: Record<string, any>
): Promise<{ kind: "action"; text: string }> {
  await setSession(supabase, userId, "generating_posts", { count });
  try {
    const { generateDailyPostsForUser } = await import("@/lib/ai/content/daily-generator");
    const { pushDailyPostsToWhatsApp } = await import("@/lib/ai/content/push-whatsapp");

    const result = await generateDailyPostsForUser(supabase, userId, { maxPosts: count });
    await resetSession(supabase, userId);

    if (result.count === 0) {
      return {
        kind: "action",
        text: "kuch generate nahi ho paya. business context check karo.",
      };
    }

    // Push to WhatsApp
    const baseUrl = process.env.BAILEYS_SERVER_URL;
    if (baseUrl) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone")
        .eq("id", userId)
        .maybeSingle();
      const phone = (profile as any)?.phone;
      if (phone) {
        const digits = String(phone).replace(/\D/g, "");
        if (digits.length >= 10) {
          const jid = `${digits}@s.whatsapp.net`;
          await pushDailyPostsToWhatsApp(
            baseUrl,
            process.env.BAILEYS_API_KEY || "dev-key",
            userId,
            jid,
            result.posts
          );
        }
      }
    }

    return {
      kind: "action",
      text: `${result.count} post ready. WhatsApp pe review ke liye bhej diye — yes/no/edit reply kar.`,
    };
  } catch (err: any) {
    return {
      kind: "action",
      text: `post generation fail: ${err?.message ?? "unknown"}`,
    };
  }
}

async function runOutreach(
  supabase: SupabaseClient,
  userId: string,
  count: number
): Promise<{ kind: "action"; text: string }> {
  await setSession(supabase, userId, "doing_outreach", { count });
  try {
    const { runMultiChannelOutreachForUser } = await import(
      "@/lib/ai/outreach/multi-channel"
    );
    const result = await runMultiChannelOutreachForUser(supabase, userId, {
      limit: Math.min(count, 10),
    });
    await resetSession(supabase, userId);

    const channelSummary = result.results
      .flatMap((r) => r.channels)
      .filter((c) => c.ok)
      .map((c) => c.channel)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(", ");

    if (result.processed === 0) {
      return {
        kind: "action",
        text: `0 leads contact ho paye. ${result.skipped} skip kiye (no contact info).`,
      };
    }
    return {
      kind: "action",
      text: `${result.processed} leads ko contact kiya${channelSummary ? ` (${channelSummary})` : ""}. ${result.failed} fail, ${result.skipped} skip.`,
    };
  } catch (err: any) {
    return {
      kind: "action",
      text: `outreach fail: ${err?.message ?? "unknown"}`,
    };
  }
}
