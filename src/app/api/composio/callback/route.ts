import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConnectionById } from "@/lib/composio";

const BASE = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://databuks-frontend.vercel.app";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");
    const userId = searchParams.get("userId");

    if (!userId || !platform) {
      return NextResponse.redirect(`${BASE}/dashboard/socials`);
    }

    const supabase = await createClient();

    const { data: pending } = await supabase
      .from("social_connections")
      .select("connection_id")
      .eq("user_id", userId)
      .eq("platform", platform.toLowerCase())
      .maybeSingle();

    let verified = false;

    if (pending?.connection_id) {
      try {
        const conn = await getConnectionById(pending.connection_id);
        if (conn && (conn.status === "ACTIVE" || conn.status === "INITIATED")) {
          await supabase
            .from("social_connections")
            .update({
              status: "connected",
              connection_id: conn.id,
              handle: conn.app_name || `${platform}_composio`,
              last_sync: new Date().toISOString(),
            })
            .eq("user_id", userId)
            .eq("platform", platform.toLowerCase());
          verified = true;
        }
      } catch {}
    }

    if (!verified) {
      try {
        const { getConnections } = await import("@/lib/composio");
        const connections = await getConnections(userId);
        const active = connections.find(
          (c) =>
            (c.app_name?.toLowerCase() === platform.toLowerCase() ||
              c.integration_id?.toLowerCase() === platform.toLowerCase()) &&
            (c.status === "ACTIVE" || c.status === "INITIATED")
        );
        if (active) {
          const { data: existing } = await supabase
            .from("social_connections")
            .select("id")
            .eq("user_id", userId)
            .eq("platform", platform.toLowerCase())
            .maybeSingle();

          if (existing) {
            await supabase.from("social_connections").update({
              connection_id: active.id,
              status: "connected",
              handle: active.app_name || `${platform}_composio`,
              last_sync: new Date().toISOString(),
            }).eq("id", existing.id);
          } else {
            await supabase.from("social_connections").insert({
              user_id: userId,
              platform: platform.toLowerCase(),
              connection_id: active.id,
              handle: active.app_name || `${platform}_composio`,
              status: "connected",
              last_sync: new Date().toISOString(),
            });
          }
        }
      } catch {}
    }

    return NextResponse.redirect(`${BASE}/dashboard/socials?platform=${platform}`);
  } catch {
    return NextResponse.redirect(`${BASE}/dashboard/socials`);
  }
}
