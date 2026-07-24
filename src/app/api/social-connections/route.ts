import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("social_connections")
      .select("*")
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ connections: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { platform, connection_id, auth_config_id, account_id, display_name, status } = body;

    if (!platform) return NextResponse.json({ error: "platform is required" }, { status: 400 });

    const { data: existing } = await supabase
      .from("social_connections")
      .select("id")
      .eq("user_id", user.id)
      .eq("platform", platform.toLowerCase())
      .maybeSingle();

    let result;
    if (existing) {
      const { data: updated, error } = await supabase
        .from("social_connections")
        .update({
          connection_id: connection_id || null,
          auth_config_id: auth_config_id || null,
          account_id: account_id || null,
          handle: display_name || `${platform}_composio`,
          status: status || "connected",
          last_sync: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      result = updated;
    } else {
      const { data: inserted, error } = await supabase
        .from("social_connections")
        .insert({
          user_id: user.id,
          platform: platform.toLowerCase(),
          connection_id: connection_id || null,
          auth_config_id: auth_config_id || null,
          account_id: account_id || null,
          handle: display_name || `${platform}_composio`,
          status: status || "connected",
          last_sync: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      result = inserted;
    }

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
