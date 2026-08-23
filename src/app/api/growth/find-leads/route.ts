import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runFindLeads } from "@/lib/growth/orchestrator";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const minScore = Number(searchParams.get("min_score") ?? "0");
    const status = searchParams.get("status") ?? "";
    const limit = Math.min(Number(searchParams.get("limit") ?? "30"), 100);

    let query = supabase
      .from("discovered_leads")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status && status !== "all") {
      query = query.contains("metadata", { quality_gate: status });
    }
    if (minScore > 0) {
      query = query.gte("metadata->>final_score", String(minScore));
    }

    const { data: leads, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: runs } = await supabase
      .from("discovery_runs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    return NextResponse.json({
      leads: leads ?? [],
      total: (leads ?? []).length,
      latest_run: runs?.[0] ?? null,
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

    const body = await request.json().catch(() => ({}));
    const VALID_SCOPES = ["LOCAL", "STATE", "COUNTRY", "GLOBAL"];
    const scopes = Array.isArray(body?.scopes)
      ? body.scopes.filter((s: string) => VALID_SCOPES.includes(s))
      : [];
    const result = await runFindLeads(supabase, user.id, {
      max_queries: Math.min(Number(body?.max_queries ?? 15), 50),
      max_pages: Math.min(Number(body?.max_pages ?? 100), 200),
      scopes: scopes.length > 0 ? scopes : ["LOCAL", "STATE", "COUNTRY", "GLOBAL"],
    });

    return NextResponse.json(result);
  } catch (err: any) {
    console.error(`[API:growth/find-leads] ${err?.message}`);
    return NextResponse.json({ error: "Discovery failed" }, { status: 500 });
  }
}
