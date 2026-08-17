import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/ai/discovery — List discovered leads with filtering
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform") || "";
    const stage = searchParams.get("stage") || "";
    const minScore = parseInt(searchParams.get("min_score") || "0");
    const maxScore = parseInt(searchParams.get("max_score") || "100");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("discovered_leads")
      .select("*", { count: "exact" })
      .eq("user_id", user.id);

    if (platform && platform !== "all") {
      query = query.eq("source_platform", platform);
    }
    if (stage && stage !== "all") {
      query = query.eq("conversation_stage", stage);
    }
    if (minScore > 0) {
      query = query.gte("lead_score", minScore);
    }
    if (maxScore < 100) {
      query = query.lte("lead_score", maxScore);
    }

    const { data: leads, count, error } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      discovered_leads: leads || [],
      total: count ?? 0,
      page,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/ai/discovery — Manually submit a discovery signal
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    // Validate required fields
    if (!body.source_platform || !body.source_content) {
      return NextResponse.json(
        { error: "source_platform and source_content are required" },
        { status: 400 }
      );
    }

    const { processDiscoveredSignal } = await import("@/lib/discovery/pipeline");

    const result = await processDiscoveredSignal(supabase, user.id, {
      source_platform: body.source_platform,
      source_url: body.source_url ?? null,
      source_content: body.source_content,
      source_content_type: body.source_content_type ?? "other",
      external_author_id: body.external_author_id ?? null,
      author_name: body.author_name ?? null,
      author_handle: body.author_handle ?? null,
      author_profile_url: body.author_profile_url ?? null,
      parent_content: body.parent_content ?? null,
      timestamp: body.timestamp ?? null,
      metadata: body.metadata ?? {},
      idempotency_key: body.idempotency_key ?? null,
    });

    const statusCode = result.status === "CREATED" ? 201
      : result.status === "DUPLICATE" ? 200
      : result.status === "IGNORED" ? 200
      : 500;

    return NextResponse.json(result, { status: statusCode });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
