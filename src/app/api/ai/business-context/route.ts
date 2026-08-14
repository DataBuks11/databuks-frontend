import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildBusinessContext } from "@/lib/ai/context/business-context";

const ALLOWED_FIELDS = [
  "business_name",
  "description",
  "products",
  "services",
  "target_audience",
  "ideal_customer_profile",
  "locations",
  "industries",
  "offer",
  "pricing",
  "brand_voice",
  "tone",
  "constraints",
  "excluded_industries",
  "excluded_lead_types",
  "preferred_channels",
  "monthly_meeting_target",
];

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const context = await buildBusinessContext(supabase, user.id);
    return NextResponse.json(context);
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
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const field of ALLOWED_FIELDS) {
      if (body[field] !== undefined) updates[field] = body[field];
    }
    if (Object.keys(updates).length === 1) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("business_context")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    let row;
    if (existing) {
      const result = await supabase
        .from("business_context")
        .update(updates)
        .eq("user_id", user.id)
        .select()
        .single();
      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
      row = result.data;
    } else {
      const result = await supabase
        .from("business_context")
        .insert({ user_id: user.id, ...updates })
        .select()
        .single();
      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
      row = result.data;
    }

    return NextResponse.json(row);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
