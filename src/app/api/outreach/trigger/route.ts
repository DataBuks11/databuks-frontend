import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

/**
 * POST /api/outreach/trigger
 * Body: { userId?: string, limit?: number }
 *
 * Manual trigger for the multi-channel outreach orchestrator. By default
 * the Vercel cron at 0 9 * * * runs this for every user, but the user can
 * also kick it off manually from the dashboard or via this endpoint.
 *
 * Auth: requires an authenticated session (same as the dashboard).
 */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin credentials not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest) {
  try {
    // Session auth — only the logged-in user can trigger for themselves
    const { createClient: createServerClient } = await import("@/lib/supabase/server");
    const serverSupabase = await createServerClient();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = adminClient();
    const body = await request.json().catch(() => ({}));
    const userId = body?.userId ?? user.id;
    const limit = Number(body?.limit ?? 3);

    if (userId !== user.id) {
      return NextResponse.json({ error: "Cannot trigger outreach for other users" }, { status: 403 });
    }

    const { runMultiChannelOutreachForUser } = await import(
      "@/lib/ai/outreach/multi-channel"
    );
    const result = await runMultiChannelOutreachForUser(supabase, userId, { limit });

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error(`[API:outreach/trigger] ${err?.message}`);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
