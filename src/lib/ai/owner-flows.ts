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

type State = "idle" | "awaiting_post_count" | "generating_posts" | "awaiting_outreach_count" | "doing_outreach" | "posts_queued" | "outreach_queued";

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
    .replace(/\b(mujhe|mere|liye|ke liye|for|instagram|facebook|linkedin|whatsapp|telegram|post|posts|reel|reels|story|stories|content|leads?|ko|message|msg|bhejo|bhej|chalao|bana|banake|banao|karo|kar|do|de|dijiye|chaiye|chahiye|please|plz|ek|aaj|roz|daily)\b/gi, " ")
    .replace(/\b\d{1,2}\b/g, " ")
    .replace(/[.,!?;|]+/g, "\n");
  const topics = cleaned
    .split("\n")
    .map((s) => s.replace(/^(pehli|dusri|teesri|1st|2nd|3rd|\d+[).:-])\s*/i, "").trim())
    .filter((s) => s.length >= 3);
  return topics.slice(0, 15);
}

const POST_NOUNS = "(post|posts|content|reel|reels|story|stories|update|kahani)";
const POST_VERBS = "(banao|create|generate|kar|karo|bana|banake|banaa|daalo|banana|lagao|publish|do|de|dijiye|chaiye|chahiye|bhej|bhejo)";
const POST_TRIGGERS = new RegExp(
  `\\b${POST_NOUNS}\\b.{0,40}\\b${POST_VERBS}\\b|\\b${POST_VERBS}\\b.{0,40}\\b${POST_NOUNS}\\b`,
  "i"
);
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
  text: string,
  opts: { replyJid?: string; slot?: "business" | "personal" } = {}
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
        return await runPostGeneration(supabase, userId, count, session.data, briefs, opts);
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
        return await runOutreach(supabase, userId, count, opts);
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
      return await runPostGeneration(supabase, userId, inline, {}, briefs, opts);
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
      return await runOutreach(supabase, userId, inline, opts);
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
  briefTopics: string[] = [],
  opts: { replyJid?: string; slot?: "business" | "personal" } = {}
): Promise<{ kind: "action"; text: string }> {
  const n = Math.min(Math.max(count, 1), 15);
  // ALL generation goes through the queue: even 1-2 posts with images can
  // exceed Vercel's 60s webhook window (LLM + image worker), dying mid-way
  // with drafts saved but nothing pushed. Queue → instant ack → worker
  // (poll bridge, ~2 min) completes in chunks and pushes each batch.
  await setSession(supabase, userId, "posts_queued", {
    job: "posts",
    count: n,
    briefs: briefTopics.slice(0, 15),
    done: 0,
    replyJid: opts.replyJid ?? null,
    slot: opts.slot ?? "personal",
    requestedAt: new Date().toISOString(),
  });
  return {
    kind: "action",
    text:
      n === 1
        ? `1 post queue kar diya ✓ banate hi yahin bhejunga review ke liye (yes/no/edit reply karna). 2-3 min lag sakte hain.`
        : `${n} post queue kar diye ✓ banaate hi ek-ek karke yahin bhejunga review ke liye (yes/no/edit reply karna). 3-5 min lag sakte hain.`,
  };
}

async function runOutreach(
  supabase: SupabaseClient,
  userId: string,
  count: number,
  opts: { replyJid?: string; slot?: "business" | "personal" } = {}
): Promise<{ kind: "action"; text: string }> {
  const n = Math.min(Math.max(count, 1), 15);
  // Outreach sends real messages + LLM calls — too slow for 60s webhook
  // when count is large. Queue big runs, worker completes + summarizes.
  if (n > 3) {
    await setSession(supabase, userId, "outreach_queued", {
      job: "outreach",
      count: n,
      replyJid: opts.replyJid ?? null,
      slot: opts.slot ?? "personal",
      requestedAt: new Date().toISOString(),
    });
    return {
      kind: "action",
      text: `${n} leads ka outreach queue kar diya ✓ complete hote hi summary bhejunga.`,
    };
  }
  await setSession(supabase, userId, "doing_outreach", { count: n });
  try {
    const { runMultiChannelOutreachForUser } = await import(
      "@/lib/ai/outreach/multi-channel"
    );
    const result = await runMultiChannelOutreachForUser(supabase, userId, {
      limit: n,
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

/** Send a plain text to the owner's chat (queued-job updates, summaries). */
async function sendOwnerText(
  supabase: SupabaseClient,
  userId: string,
  data: Record<string, any>,
  text: string
): Promise<void> {
  try {
    const jid: string | null = data.replyJid ?? (await resolveUserJid(supabase, userId));
    if (!jid) return;
    const { sendViaBaileys } = await import("@/lib/whatsapp/jid-utils");
    await sendViaBaileys({
      userId,
      jid,
      message: text,
      slot: data.slot === "business" ? "business" : "personal",
    });
  } catch (err: any) {
    console.warn(`[owner-flow] owner notify failed: ${err?.message}`);
  }
}

const JOB_STALE_MS = 6 * 3600 * 1000;

/** Stash a timed-out personal reply for regeneration by the poll worker. */
export async function queuePersonalRetry(
  supabase: SupabaseClient,
  userId: string,
  jid: string,
  text: string
): Promise<void> {
  try {
    const { data: sess } = await supabase
      .from("assistant_session")
      .select("state, data")
      .eq("user_id", userId)
      .maybeSingle();
    const data = (sess?.data ?? {}) as Record<string, any>;
    const list = Array.isArray(data.pending_personal) ? data.pending_personal : [];
    const now = Date.now();
    const fresh = list.filter((e: any) => now - new Date(e.at ?? 0).getTime() < 20 * 60 * 1000).slice(-4);
    fresh.push({ jid, text: text.slice(0, 500), at: new Date().toISOString(), attempts: 0, slot: "personal" });
    if (sess) {
      await supabase
        .from("assistant_session")
        .update({ data: { ...data, pending_personal: fresh }, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
    } else {
      await supabase.from("assistant_session").insert({
        user_id: userId,
        state: "idle",
        data: { pending_personal: fresh },
        expires_at: new Date(now + 24 * 3600 * 1000).toISOString(),
      });
    }
  } catch (err: any) {
    console.warn(`[owner-flow] queue retry failed: ${err?.message}`);
  }
}

async function runPendingPersonalRetries(supabase: SupabaseClient): Promise<number> {
  let done = 0;
  let rows: any[] = [];
  try {
    const { data, error } = await supabase.from("assistant_session").select("user_id, data").limit(25);
    if (error) throw error;
    rows = (data ?? []).filter((r: any) => Array.isArray(r?.data?.pending_personal) && r.data.pending_personal.length > 0);
  } catch {
    return 0;
  }
  const { handlePersonalChat } = await import("@/lib/ai/owner-personal");
  const { sendViaBaileys } = await import("@/lib/whatsapp/jid-utils");
  for (const row of rows) {
    const data = row.data ?? {};
    const pending = (data.pending_personal ?? []) as any[];
    const kept: any[] = [];
    for (const e of pending) {
      const age = Date.now() - new Date(e.at ?? 0).getTime();
      if (age > 20 * 60 * 1000 || (e.attempts ?? 0) >= 2) continue; // drop stale/retried
      try {
        const reply = await Promise.race([
          handlePersonalChat({ supabase, userId: row.user_id, messageText: e.text ?? "", isSticky: true }),
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error("retry-timeout")), 40000)),
        ]);
        await sendViaBaileys({ userId: row.user_id, jid: e.jid, message: reply, slot: "personal" });
        done += 1;
      } catch {
        kept.push({ ...e, attempts: (e.attempts ?? 0) + 1 });
      }
    }
    try {
      const next = { ...data };
      if (kept.length === 0) delete next.pending_personal;
      else next.pending_personal = kept;
      await supabase
        .from("assistant_session")
        .update({ data: next, updated_at: new Date().toISOString() })
        .eq("user_id", row.user_id);
    } catch {}
  }
  return done;
}

/**
 * Background worker for queued heavy jobs (called by the /poll bridge every
 * ~2 min). Chunked + idempotent: session.done tracks progress, each run does
 * one small batch so it fits in serverless limits. Stale jobs (>6h) dropped.
 */
export async function processQueuedJobs(supabase: SupabaseClient): Promise<{ processed: number; errors: string[] }> {
  const out = { processed: 0, errors: [] as string[] };
  let rows: any[] = [];
  try {
    const { data, error } = await supabase
      .from("assistant_session")
      .select("user_id, state, data, updated_at")
      .limit(25);
    if (error) throw error;
    rows = data ?? [];
  } catch (err: any) {
    return out; // table missing etc. — nothing to do
  }

  // Personal retry queue first (cheap), then heavy job states.
  try {
    out.processed += await runPendingPersonalRetries(supabase);
  } catch (err: any) {
    out.errors.push(`personal-retries: ${err?.message ?? "unknown"}`);
  }

  for (const row of rows) {
    if (!["posts_queued", "outreach_queued", "generating_posts"].includes(row.state)) continue;
    const userId = row.user_id;
    const data = row.data ?? {};
    try {
      const age = Date.now() - new Date(data.requestedAt ?? row.updated_at).getTime();
      if (age > JOB_STALE_MS) {
        await resetSession(supabase, userId);
        continue;
      }
      // Claim check: concurrent poll runs (bridge 2-min + manual + cron)
      // must not process the same job twice. Stamp a worker token; proceed
      // only if our stamp won the race.
      const token = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
      try {
        await supabase
          .from("assistant_session")
          .update({ data: { ...data, worker: token }, updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("state", row.state);
        // Jitter so overlapping workers don't both read-then-stamp past
        // each other — loser sees the winner's token and backs off.
        await new Promise((r) => setTimeout(r, 400 + Math.floor(Math.random() * 900)));
        const { data: check } = await supabase
          .from("assistant_session")
          .select("data, state")
          .eq("user_id", userId)
          .maybeSingle();
        if (!check || (check as any).state !== row.state || (check as any).data?.worker !== token) {
          continue; // another worker claimed it — skip quietly
        }
      } catch {
        continue;
      }
      const jobData = { ...data, worker: token };
      if (row.state === "posts_queued") {
        await runQueuedPostsBatch(supabase, userId, jobData);
        out.processed += 1;
      } else if (row.state === "generating_posts") {
        // Abandoned inline run (webhook killed mid-generation): adopt it as
        // a queued job ONLY if it looks stuck (>3 min old). Fresh ones may
        // still be running inside their webhook.
        if (age > 3 * 60 * 1000 && (data as any).count) {
          await runQueuedPostsBatch(supabase, userId, {
            job: "posts",
            count: (data as any).count,
            briefs: [],
            done: 0,
            replyJid: null,
            slot: "personal",
            requestedAt: (data as any).requestedAt ?? row.updated_at,
          });
          out.processed += 1;
        }
      } else if (row.state === "outreach_queued") {
        await runQueuedOutreach(supabase, userId, jobData);
        out.processed += 1;
      }
    } catch (err: any) {
      out.errors.push(`${userId}: ${err?.message ?? "unknown"}`);
    }
  }
  return out;
}

async function runQueuedPostsBatch(supabase: SupabaseClient, userId: string, data: Record<string, any>) {
  const count = Math.min(Math.max(parseInt(data.count ?? "0", 10) || 0, 1), 15);
  let done = Math.max(parseInt(data.done ?? "0", 10) || 0, 0);
  const briefs: string[] = Array.isArray(data.briefs) ? data.briefs : [];
  if (done >= count) {
    await resetSession(supabase, userId);
    return;
  }
  const { generateDailyPostsForUser } = await import("@/lib/ai/content/daily-generator");
  const { pushDailyPostsToWhatsApp } = await import("@/lib/ai/content/push-whatsapp");

  const baseUrl = process.env.BAILEYS_SERVER_URL;
  const pushJid = data.replyJid ?? (await resolveUserJid(supabase, userId));
  const pushSlot = data.slot === "business" ? "business" : "personal";
  // Time-boxed per-post loop: each post saved + pushed + counted immediately,
  // so a serverless kill mid-run resumes EXACTLY (no duplicates, no loss).
  // Budget ~30s so the whole poll run stays under Hobby's 60s cap.
  const deadline = Date.now() + 30000;
  let madeThisRun = 0;
  while (done < count && Date.now() < deadline) {
    const result = await generateDailyPostsForUser(supabase, userId, {
      maxPosts: 1,
      startIndex: done,
      overrideTopics: briefs.length > 0 ? briefs.slice(done, done + 1) : undefined,
    });
    if (result.count === 0) break; // generator stuck (context? topics?) — retry next run
    done += result.count;
    madeThisRun += result.count;
    if (baseUrl && pushJid && result.posts.length > 0) {
      try {
        await pushDailyPostsToWhatsApp(
          baseUrl,
          process.env.BAILEYS_API_KEY || "dev-key",
          userId,
          pushJid,
          result.posts,
          pushSlot
        );
      } catch (err: any) {
        console.warn(`[owner-flow] batch push failed: ${err?.message}`);
      }
    }
    await setSession(supabase, userId, "posts_queued", { ...data, done });
  }

  if (done >= count) {
    await resetSession(supabase, userId);
    await sendOwnerText(
      supabase, userId, data,
      `sab ${count} post ready ✓ review ke liye upar bhej diye — yes/no/edit reply kar.`
    );
  } else if (madeThisRun === 0) {
    // Nothing moved this run (generator erroring?) — don't spin forever.
    await sendOwnerText(
      supabase, userId, data,
      `posts atak gaye (${done}/${count} ready). business context check karke dobara bolo.`
    );
    await resetSession(supabase, userId);
  } else {
    await sendOwnerText(supabase, userId, data, `${done}/${count} post ready, baaki bana raha hoon...`);
  }
}

async function runQueuedOutreach(supabase: SupabaseClient, userId: string, data: Record<string, any>) {
  const count = Math.min(Math.max(parseInt(data.count ?? "0", 10) || 0, 1), 15);
  const { runMultiChannelOutreachForUser } = await import("@/lib/ai/outreach/multi-channel");
  const result = await runMultiChannelOutreachForUser(supabase, userId, { limit: count });
  await resetSession(supabase, userId);
  await sendOwnerText(
    supabase, userId, data,
    result.processed === 0
      ? `outreach complete: 0 contact ho paye, ${result.skipped} skip (no contact info).`
      : `outreach complete ✓ ${result.processed} leads contacted, ${result.failed} fail, ${result.skipped} skip.`
  );
}
