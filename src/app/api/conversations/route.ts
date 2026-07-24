import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform") || "";
    const status = searchParams.get("status") || "";

    let query = supabase
      .from("conversations")
      .select("*", { count: "exact" })
      .eq("user_id", user.id);

    if (platform && platform !== "all") query = query.eq("platform", platform);
    if (status && status !== "all") query = query.eq("status", status);

    const { data, count, error } = await query.order("updated_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      conversations: data || [],
      total: count ?? 0,
    });
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

    const { data, error } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
        contact_name: body.contact_name || body.name,
        platform: body.platform || null,
        last_message: body.last_message || body.lastMessage || null,
        unread: body.unread ?? 0,
        status: body.status || "active",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
