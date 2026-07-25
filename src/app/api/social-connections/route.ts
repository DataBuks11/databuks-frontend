import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    if (!userId) return NextResponse.json({ connections: [] });

    const { data, error } = await supabaseAdmin
      .from("social_connections")
      .select("*")
      .eq("user_id", userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ connections: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, platform, connection_id, display_name, status } = body;

    if (!userId || !platform) {
      return NextResponse.json({ error: "userId and platform are required" }, { status: 400 });
    }

    const p = platform.toLowerCase();

    const { data: existing } = await supabaseAdmin
      .from("social_connections")
      .select("id")
      .eq("user_id", userId)
      .eq("platform", p)
      .maybeSingle();

    let result;
    if (existing) {
      const { data: updated, error } = await supabaseAdmin
        .from("social_connections")
        .update({
          connection_id: connection_id || null,
          handle: display_name || `${p}_composio`,
          status: status || "connected",
          last_sync: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        console.error("[social-connections POST] UPDATE error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      result = updated;
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("social_connections")
        .insert({
          user_id: userId,
          platform: p,
          connection_id: connection_id || null,
          handle: display_name || `${p}_composio`,
          status: status || "connected",
          last_sync: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error("[social-connections POST] INSERT error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      result = inserted;
    }

    console.log("[social-connections POST] SUCCESS:", result);
    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    console.error("[social-connections POST] CATCH:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
