import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const industry = searchParams.get("industry") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .eq("user_id", user.id);

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,company.ilike.%${search}%,email.ilike.%${search}%`
      );
    }
    if (status && status !== "all") query = query.eq("status", status);
    if (industry && industry !== "all") query = query.eq("industry", industry);

    const { data: leads, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      leads: leads || [],
      total: count ?? 0,
      page,
      totalPages: Math.ceil((count ?? 0) / limit),
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
      .from("leads")
      .insert({
        user_id: user.id,
        name: body.name,
        company: body.company || null,
        email: body.email || null,
        phone: body.phone || null,
        industry: body.industry || null,
        lead_score: body.lead_score ?? 0,
        status: body.status || "new",
        location: body.location || null,
        notes: body.notes || null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
