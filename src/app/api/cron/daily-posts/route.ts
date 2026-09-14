import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

/**
 * GET/POST /api/cron/daily-posts
 * Hourly cron. Har user ke post_preferences me post_time (default 10:00)
 * + post_timezone (default Asia/Kolkata) hota hai. Jiska time is hour me
 * match kare AUR aaj abhi tak post generate nahi hui, uske liye utne posts
 * generate karke personal-assistant WhatsApp number par approval ke liye push.
 *
 * Owner WhatsApp se: "roz subah 10 baje 2 post" → schedule set.
 * "daily post band" → disable. Manual test: ?userId=...&force=1
 *
 * Approval via WhatsApp replies:
 *   "yes" / "ok" / "done"    → approved, ready to publish
 *   "no" / "cancel"          → rejected (+ auto replacement)
 *   "edit: <text>"           → edited
 *   "schedule: <time>"       → scheduled
 */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin credentials not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function authorized(request: NextRequest): boolean {
  const expectedKey =
    process.env.CRON_SECRET || process.env.CRAWLER_SERVICE_KEY || process.env.BAILEYS_API_KEY || "dev-key";
  const baileysKey = process.env.BAILEYS_API_KEY || "";
  const providedKey =
    request.headers.get("x-api-key") ??
    (request.headers.get("authorization")?.startsWith("Bearer ")
      ? request.headers.get("authorization")?.slice(7)
      : null);
  return providedKey === expectedKey || (baileysKey !== "" && providedKey === baileysKey);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run(request);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return run(request);
}

async function run(request: NextRequest) {
  try {
    const supabase = adminClient();
    const { generateDailyPostsForUser } = await import("@/lib/ai/content/daily-generator");
    const { pushDailyPostsToWhatsApp } = await import("@/lib/ai/content/push-whatsapp");

    // Optional: target a single user via ?userId=... for testing
    const url = new URL(request.url);
    const userIdParam = url.searchParams.get("userId");
    const force = url.searchParams.get("force") === "1";

    let profiles: any[] = [];
    if (userIdParam) {
      const { data } = await supabase
        .from("profiles")
        .select("id, daily_post_count, post_preferences")
        .eq("id", userIdParam);
      profiles = data ?? [];
    } else {
      // All users with daily_post_count > 0
      const { data } = await supabase
        .from("profiles")
        .select("id, daily_post_count, post_preferences")
        .gt("daily_post_count", 0);
      profiles = data ?? [];
    }
    const userIds = profiles.map((p: any) => p.id);
    const prefsByUser = new Map(profiles.map((p: any) => [p.id, p.post_preferences ?? {}]));

    const summary: {
      users_processed: number;
      total_posts: number;
      total_pushed: number;
      total_failed: number;
      details: any[];
    } = { users_processed: 0, total_posts: 0, total_pushed: 0, total_failed: 0, details: [] };

    const baseUrl = process.env.BAILEYS_SERVER_URL;
    const apiKey = process.env.BAILEYS_API_KEY || "dev-key";

    for (const userId of userIds) {
      try {
        const prefs: any = prefsByUser.get(userId) ?? {};

        // --- Time gate: sirf jiska post_time is hour me hai (default 10:00 IST) ---
        if (!force && !isDueNow(prefs.post_time ?? "10:00", prefs.post_timezone ?? "Asia/Kolkata")) {
          summary.details.push({ userId, skipped: "not due yet" });
          continue;
        }

        // --- Idempotency: aaj already generate ho gayi to dobara nahi ---
        if (!force) {
          const startOfDay = new Date();
          startOfDay.setHours(0, 0, 0, 0);
          const { count: doneToday } = await supabase
            .from("social_posts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .gte("created_at", startOfDay.toISOString());
          if ((doneToday ?? 0) > 0) {
            summary.details.push({ userId, skipped: "already posted today" });
            continue;
          }
        }

        const result = await generateDailyPostsForUser(supabase, userId);
        summary.users_processed += 1;
        summary.total_posts += result.count;
        if (result.errors.length > 0) {
          summary.details.push({ userId, errors: result.errors });
        }
        if (result.posts.length === 0 || !baseUrl) continue;

        const { resolveUserJid } = await import("@/lib/whatsapp/jid-utils");
        const jid = await resolveUserJid(supabase, userId);
        if (!jid) continue;

        const pushResult = await pushDailyPostsToWhatsApp(baseUrl, apiKey, userId, jid, result.posts);
        summary.total_pushed += pushResult.sent;
        summary.total_failed += pushResult.failed;
        summary.details.push({ userId, jid, posts: result.count, pushed: pushResult.sent, failed: pushResult.failed });
      } catch (err: any) {
        summary.details.push({ userId, error: err?.message ?? "unknown" });
      }
    }

    return NextResponse.json({ ok: true, ...summary });
  } catch (err: any) {
    console.error(`[API:cron/daily-posts] ${err?.message}`);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}

/** "10:00" + timezone user ke local time me is hour me hai kya? */
function isDueNow(postTime: string, timeZone: string, now = new Date()): boolean {
  try {
    const m = String(postTime).match(/(\d{1,2}):(\d{2})/);
    if (!m) return now.getHours() === 10;
    const wantH = parseInt(m[1], 10);
    const fmt = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone,
    });
    const [h] = fmt.format(now).split(":").map(Number);
    return h === wantH;
  } catch {
    return now.getHours() === 10;
  }
}
