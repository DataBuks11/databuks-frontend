import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConnections } from "@/lib/composio";

const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://databuks-frontend.vercel.app";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");
    const userId = searchParams.get("userId");
    const connectedAccountId = searchParams.get("connectedAccountId") || searchParams.get("connected_account_id");
    const status = searchParams.get("status");

    if (!userId || !platform) {
      return NextResponse.redirect(`${BASE_URL}/dashboard/socials`);
    }

    const supabase = await createClient();

    if (connectedAccountId) {
      const { data: existing } = await supabase
        .from("social_connections")
        .select("id")
        .eq("user_id", userId)
        .eq("platform", platform.toLowerCase())
        .maybeSingle();

      if (existing) {
        await supabase
          .from("social_connections")
          .update({
            status: "connected",
            last_sync: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("social_connections").insert({
          user_id: userId,
          platform: platform.toLowerCase(),
          handle: `${platform}_composio`,
          status: "connected",
          last_sync: new Date().toISOString(),
        });
      }
    } else {
      try {
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
            await supabase
              .from("social_connections")
              .update({
                status: "connected",
                last_sync: new Date().toISOString(),
              })
              .eq("id", existing.id);
          } else {
            await supabase.from("social_connections").insert({
              user_id: userId,
              platform: platform.toLowerCase(),
              handle: `${platform}_composio`,
              status: "connected",
              last_sync: new Date().toISOString(),
            });
          }
        }
      } catch {}
    }

    return NextResponse.redirect(`${BASE_URL}/dashboard/socials?platform=${platform}&callback=done`);
  } catch {
    return NextResponse.redirect(`${BASE_URL}/dashboard/socials`);
  }
}
