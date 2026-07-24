import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      email: user.email,
      full_name: profile?.full_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      company_name: profile?.company_name ?? null,
      website: profile?.website ?? null,
      phone: profile?.phone ?? null,
      role: profile?.role ?? null,
      created_at: profile?.created_at ?? user.created_at,
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
    const allowedFields = ["full_name", "avatar_url", "company_name", "website", "phone"];
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
      .from("profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .single();

    let data;

    if (existing) {
      const result = await supabase
        .from("profiles")
        .update(updates)
        .eq("user_id", user.id)
        .select("*")
        .single();
      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
      data = result.data;
    } else {
      const result = await supabase
        .from("profiles")
        .insert({ user_id: user.id, ...updates })
        .select("*")
        .single();
      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
      data = result.data;
    }

    return NextResponse.json({
      email: user.email,
      full_name: data.full_name ?? null,
      avatar_url: data.avatar_url ?? null,
      company_name: data.company_name ?? null,
      website: data.website ?? null,
      phone: data.phone ?? null,
      role: data.role ?? null,
      created_at: data.created_at ?? user.created_at,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
