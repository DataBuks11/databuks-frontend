import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");
    const userId = searchParams.get("userId");
    const connectedAccountId = searchParams.get("connectedAccountId");
    const status = searchParams.get("status");

    if (!userId || !platform) {
      return NextResponse.redirect(
        `${process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://databuks-frontend.vercel.app"}/dashboard/socials`
      );
    }

    if (connectedAccountId && status === "success") {
      const supabase = await createClient();

      await supabase.from("social_connections").upsert(
        {
          user_id: userId,
          platform: platform.toLowerCase(),
          handle: `${platform}_composio`,
          status: "connected",
          last_sync: new Date().toISOString(),
        },
        { onConflict: "user_id,platform" }
      );
    }

    return NextResponse.redirect(
      `${process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://databuks-frontend.vercel.app"}/dashboard/socials?platform=${platform}&success=true`
    );
  } catch {
    return NextResponse.redirect(
      `${process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://databuks-frontend.vercel.app"}/dashboard/socials`
    );
  }
}
