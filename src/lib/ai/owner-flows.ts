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
import { resolveUserJid } from "@/lib/whatsapp/jid-utils";

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

/** Parse Hinglish/English numbers 1-15 from a short reply. */
export function parseCount(text: string): number | null {
  const t = text.trim().toLowerCase();

  // Direct digit "1" / "2 posts" / "15"
  const numMatch = t.match(/^(\d+)/) || t.match(/\b(\d{1,2})\b/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    if (n >= 1 && n <= 15) return n;
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
    gyarah: 11, eleven: 11,
    barah: 12, twelve: 12,
    terah: 13, thirteen: 13,
    chaudah: 14, fourteen: 14,
    pandrah: 15, fifteen: 15,
  };
  for (const [w, n] of Object.entries(words)) {
    if (new RegExp(`\\b${w}\\b`).test(t)) return n;
  }
  return null;
}

/**
 * "mujhe 10 post bana ke de", "15 leads ko msg kar" — trigger message me hi
 * count ho to turant action lo, dobara "kitni?" mat pucho.
 * Baaki bacha text per-post/per-lead brief hota hai
 * ("pehli price pe, dusri testimonial pe").
 */
export function extractBriefTopics(text: string): string[] {
  const cleaned = text
    .replace(/\b(mujhe|mere|liye|ke liye|for|instagram|facebook|linkedin|whatsapp|telegram|post|posts|reel|reels|story|stories|content|leads?|ko|message|msg|bhejo|bhej|chalao|bana|banake|banao|karo|kar|do|de|dijiye|please|plz|ek|aaj|roz|daily)\b/gi, " ")
    .replace(/\b\d{1,2}\b/g, " ")
    .replace(/[.,!?;|]+/g, "\n");
  const topics = cleaned
    .split("\n")
    .map((s) => s.replace(/^(pehli|dusri|teesri|1st|2nd|3rd|\d+[).:-])\s*/i, "").trim())
    .filter((s) => s.length >= 3);
  return topics.slice(0, 15);
}

const POST_TRIGGERS =
  /\b(post|posts|content|reel|story|update|create|make|generate|kahani|stories)\b.{0,30}\b(banao|create|generate|kar|karo|bana|banake|banaa|daalo|banana|banao|lagao|publish|karo|do)\b/i;
const POST_QUESTION = /\b(kitne|kitna|kitni)\s*(post|posts|content|reel|story|stories)\b/i;
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
        // Got the count — generate posts (brief bhi ho to topics me lo)
        const briefs = extractBriefTopics(text);
        return await runPostGeneration(supabase, userId, count, session.data, briefs);
      }
      // Not a number — remind
      return {
        kind: "prompt",
        text: "1 se 15 ke beech number bhej (1, 2, 3...)",
      };
    }
    if (session.state === "awaiting_outreach_count") {
      const count = parseCount(lower);
      if (count !== null) {
        return await runOutreach(supabase, userId, count);
      }
      return {
        kind: "prompt",
        text: "1 se 15 ke beech number bhej (3, 5, 12...)",
      };
    }
  }

  // ===== Daily auto-posting schedule ("roz subah 10 baje post", "daily 2 post") =====
  const dailySetup = await handleDailyScheduleMessage(supabase, userId, text);
  if (dailySetup) return dailySetup;

  // ===== Start new flow =====
  if (POST_TRIGGERS.test(lower) || POST_QUESTION.test(lower)) {
    // Count message me hi hai ("10 post bana ke de") to turant generate karo.
    const inline = parseCount(lower);
    if (inline !== null) {
      const briefs = extractBriefTopics(text);
      return await runPostGeneration(supabase, userId, inline, {}, briefs);
    }
    // No session — start the conversation
    await setSession(supabase, userId, "awaiting_post_count", {});
    return {
      kind: "prompt",
      text: "aaj kitni post banaani hain? 1 se 15 ke beech number bhej (1, 2, 10...) — saath me topic brief bhi likh sakte ho",
    };
  }

  if (OUTREACH_TRIGGERS.test(lower) || OUTREACH_QUESTION.test(lower)) {
    const inline = parseCount(lower);
    if (inline !== null) {
      return await runOutreach(supabase, userId, inline);
    }
    await setSession(supabase, userId, "awaiting_outreach_count", {});
    return {
      kind: "prompt",
      text: "kitne leads ko message bhejun? 1-15 number bhej (roz 10-15 best leads automatic bhi jaate hain)",
    };
  }

  return null;
}

/**
 * Daily auto-post setup via WhatsApp:
 *   "roz subah 10 baje 1 post" / "daily 2 post" / "roz 12 baje post kar"
 *   "daily post band" / "auto post off" → disable
 * Default time subah 10:00 (Asia/Kolkata).
 */
const DAILY_ON = /\b(roz|daily|automatic|auto)\b.{0,40}\b(post|content)\b/i;
const DAILY_OFF = /\b(daily post band|auto post (band|off)|roz post band|stop daily|daily off)\b/i;

async function handleDailyScheduleMessage(
  supabase: SupabaseClient,
  userId: string,
  text: string
): Promise<{ kind: "prompt" | "action"; text: string } | null> {
  const lower = text.toLowerCase();
  if (DAILY_OFF.test(lower)) {
    try {
      const { data: p } = await supabase.from("profiles").select("post_preferences").eq("id", userId).maybeSingle();
      const prefs = { ...((p as any)?.post_preferences ?? {}), daily_enabled: false };
      await supabase.from("profiles").update({ daily_post_count: 0, post_preferences: prefs }).eq("id", userId);
    } catch { /* ignore */ }
    return { kind: "action", text: "daily auto-post band kar diya ✓ jab chahiye ho to 'roz subah 10 baje post' likh dena." };
  }
  if (!DAILY_ON.test(lower)) return null;

  // count: time-expression hatane ke baad jo number bache wahi count hai
  // ("10 baje 2 post" → time=10, count=2; "daily 2 post" → count=2, time=default)
  const noTime = lower
    .replace(/\b\d{1,2}(?::\d{2})?\s*(baje|am|pm)\b/g, " ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/\b(subah|shaam|sham|morning|evening|raat)\s+\d{1,2}\b/g, " ");
  const count = Math.min(Math.max(parseCount(noTime) ?? 1, 1), 15);

  // time: sirf explicit marker wala number time hai (baje/am/pm/colon/subah N)
  let hour = 10;
  let minute = 0;
  const hm =
    lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(baje|am|pm)\b/) ||
    lower.match(/\b(\d{1,2}):(\d{2})\b/);
  const hmWord = !hm ? lower.match(/\b(subah|shaam|sham|morning|evening|raat)\s+(\d{1,2})\b/) : null;
  const rawH = hm ? hm[1] : hmWord ? hmWord[2] : null;
  const rawM = hm ? hm[2] : null;
  if (rawH !== null) {
    hour = Math.min(23, Math.max(0, parseInt(rawH, 10)));
    minute = rawM ? Math.min(59, parseInt(rawM, 10)) : 0;
    const isPM = /pm|shaam|sham|evening|raat/.test(lower);
    const isAM = /am|subah|morning/.test(lower);
    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
  }
  const postTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  try {
    const { data: p } = await supabase.from("profiles").select("post_preferences").eq("id", userId).maybeSingle();
    const prefs = {
      ...((p as any)?.post_preferences ?? {}),
      daily_enabled: true,
      post_time: postTime,
      post_timezone: "Asia/Kolkata",
    };
    await supabase.from("profiles").update({ daily_post_count: Math.min(Math.max(count, 1), 15), post_preferences: prefs }).eq("id", userId);
  } catch (err: any) {
    return { kind: "action", text: `schedule save nahi ho paya: ${err?.message ?? "db error"}` };
  }
  return {
    kind: "action",
    text: `done ✓ roz ${postTime} baje ${count} post auto-generate hogi aur approval ke liye WhatsApp pe aayegi. time badalna ho to "roz 12 baje post" jaisa likh do.`,
  };
}

async function runPostGeneration(
  supabase: SupabaseClient,
  userId: string,
  count: number,
  _sessionData: Record<string, any>,
  briefTopics: string[] = []
): Promise<{ kind: "action"; text: string }> {
  await setSession(supabase, userId, "generating_posts", { count });
  try {
    const { generateDailyPostsForUser } = await import("@/lib/ai/content/daily-generator");
    const { pushDailyPostsToWhatsApp } = await import("@/lib/ai/content/push-whatsapp");

    const result = await generateDailyPostsForUser(supabase, userId, {
      maxPosts: Math.min(Math.max(count, 1), 15),
      overrideTopics: briefTopics.length > 0 ? briefTopics : undefined,
    });
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
      const jid = await resolveUserJid(supabase, userId);
      if (jid) {
        await pushDailyPostsToWhatsApp(
          baseUrl,
          process.env.BAILEYS_API_KEY || "dev-key",
          userId,
          jid,
          result.posts
        );
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
      limit: Math.min(Math.max(count, 1), 15),
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
