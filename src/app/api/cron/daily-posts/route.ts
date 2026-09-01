import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

/**
 * GET/POST /api/cron/daily-posts
 * Vercel Cron handler: daily at 10:00 UTC (3:30 PM IST). For every user
 * with daily_post_count > 0, generate that many posts and push them to
 * the user's personal-assistant WhatsApp number for approval.
 *
 * The user then replies "yes" / "no" / "edit: ..." / "schedule: ..."
 * and the WhatsApp engine's approval-handler applies the decision.
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
  const providedKey =
    request.headers.get("x-api-key") ??
    (request.headers.get("authorization")?.startsWith("Bearer ")
      ? request.headers.get("authorization")?.slice(7)
      : null);
  return providedKey === expectedKey;
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

    let userIds: string[] = [];
    if (userIdParam) {
      userIds = [userIdParam];
    } else {
      // All users with daily_post_count > 0
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id")
        .gt("daily_post_count", 0);
      userIds = (profiles ?? []).map((p: any) => p.id);
    }

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
        const result = await generateDailyPostsForUser(supabase, userId);
        summary.users_processed += 1;
        summary.total_posts += result.count;
        if (result.errors.length > 0) {
          summary.details.push({ userId, errors: result.errors });
        }
        if (result.posts.length === 0 || !baseUrl) continue;

        // Look up the user's WhatsApp-bound phone
        const { data: profile } = await supabase
          .from("profiles")
          .select("phone")
          .eq("id", userId)
          .maybeSingle();
        const phone = (profile as any)?.phone;
        if (!phone) continue;
        const digits = String(phone).replace(/\D/g, "");
        if (digits.length < 10) continue;
        const jid = `${digits}@s.whatsapp.net`;

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
