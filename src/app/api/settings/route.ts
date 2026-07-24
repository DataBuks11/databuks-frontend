import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("workspace_settings")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      business_name: data?.business_name ?? null,
      brand_voice: data?.brand_voice ?? null,
      target_audience: data?.target_audience ?? null,
      notifications: data?.notifications ?? null,
      updated_at: data?.updated_at ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const allowedFields = ["business_name", "brand_voice", "target_audience", "notifications"];
    const updates: Record<string, any> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("workspace_settings")
      .select("user_id")
      .eq("user_id", user.id)
      .single();

    let data;

    if (existing) {
      const result = await supabase
        .from("workspace_settings")
        .update(updates)
        .eq("user_id", user.id)
        .select("*")
        .single();
      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
      data = result.data;
    } else {
      const result = await supabase
        .from("workspace_settings")
        .insert({ user_id: user.id, ...updates })
        .select("*")
        .single();
      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
      data = result.data;
    }

    return NextResponse.json({
      business_name: data.business_name ?? null,
      brand_voice: data.brand_voice ?? null,
      target_audience: data.target_audience ?? null,
      notifications: data.notifications ?? null,
      updated_at: data.updated_at ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
