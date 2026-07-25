import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getConnectionById } from "@/lib/composio";

const CB = (tag: string, data?: any) => {
  if (data !== undefined) console.log(`[API:composio/callback:${tag}]`, typeof data === "object" ? JSON.stringify(data) : data);
  else console.log(`[API:composio/callback:${tag}] TRIGGERED`);
};

const BASE = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://databuks-frontend.vercel.app";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");
    const userId = searchParams.get("userId");
    const origin = searchParams.get("origin");
    const redirectBase = origin || BASE;

    CB("ENTRY", { platform, userId, origin, redirectBase });

    if (!userId || !platform) {
      CB("MISSING_PARAMS", { userId, platform });
      return NextResponse.redirect(`${redirectBase}/dashboard/socials`);
    }

    const { data: pending, error: pendingErr } = await supabaseAdmin
      .from("social_connections")
      .select("id, connection_id, status")
      .eq("user_id", userId)
      .eq("platform", platform.toLowerCase())
      .maybeSingle();

    CB("PENDING_ROW", { found: !!pending, row: pending, error: pendingErr?.message });

    let verified = false;

    if (pending?.connection_id) {
      try {
        const conn = await getConnectionById(pending.connection_id);
        CB("COMPOSIO_VERIFY", { connId: pending.connection_id, status: conn?.status, found: !!conn });
        if (conn && (conn.status === "ACTIVE" || conn.status === "INITIATED")) {
          const { error: upErr } = await supabaseAdmin
            .from("social_connections")
            .update({
              status: "connected",
              connection_id: conn.id,
              handle: conn.app_name || `${platform}_composio`,
              last_sync: new Date().toISOString(),
            })
            .eq("user_id", userId)
            .eq("platform", platform.toLowerCase());
          if (upErr) CB("UPDATE_ERROR", { message: upErr.message, code: (upErr as any).code });
          else { verified = true; CB("UPDATE_SUCCESS", { platform }); }
        }
      } catch (e: any) { CB("VERIFY_ERROR", { message: e.message }); }
    }

    if (!verified) {
      CB("FALLBACK", "No pending row or verify failed, querying Composio for active connections");
      try {
        const { getConnections } = await import("@/lib/composio");
        const connections = await getConnections(userId);
        CB("FALLBACK_CONNECTIONS", { count: connections.length, items: connections.map(c => ({ id: c.id, app: c.app_name, status: c.status })) });
        const active = connections.find(
          (c) =>
            (c.app_name?.toLowerCase() === platform.toLowerCase() ||
              c.integration_id?.toLowerCase() === platform.toLowerCase()) &&
            (c.status === "ACTIVE" || c.status === "INITIATED")
        );
        CB("FALLBACK_ACTIVE", { found: !!active, id: active?.id, status: active?.status });
        if (active) {
          const { data: existing } = await supabaseAdmin
            .from("social_connections")
            .select("id")
            .eq("user_id", userId)
            .eq("platform", platform.toLowerCase())
            .maybeSingle();

          if (existing) {
            const { error: upErr } = await supabaseAdmin.from("social_connections").update({
              connection_id: active.id,
              status: "connected",
              handle: active.app_name || `${platform}_composio`,
              last_sync: new Date().toISOString(),
            }).eq("id", existing.id);
            if (upErr) CB("FALLBACK_UPDATE_ERROR", { message: upErr.message });
            else CB("FALLBACK_UPDATE_SUCCESS", { id: existing.id });
          } else {
            const { error: insErr } = await supabaseAdmin.from("social_connections").insert({
              user_id: userId,
              platform: platform.toLowerCase(),
              connection_id: active.id,
              handle: active.app_name || `${platform}_composio`,
              status: "connected",
              last_sync: new Date().toISOString(),
            });
            if (insErr) CB("FALLBACK_INSERT_ERROR", { message: insErr.message });
            else CB("FALLBACK_INSERT_SUCCESS", { platform });
          }
        }
      } catch (e: any) { CB("FALLBACK_ERROR", { message: e.message }); }
    }

    // Verify final state
    const { data: finalRow } = await supabaseAdmin
      .from("social_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("platform", platform.toLowerCase())
      .maybeSingle();
    CB("FINAL_STATE", { row: finalRow });

    return NextResponse.redirect(`${redirectBase}/dashboard/socials?platform=${platform}`);
  } catch (e: any) {
    CB("FATAL_ERROR", { message: e.message });
    return NextResponse.redirect(`${BASE}/dashboard/socials`);
  }
}

