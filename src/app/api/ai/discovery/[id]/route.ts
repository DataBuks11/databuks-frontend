import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/ai/discovery/[id] — Get single discovered lead with full details
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // Get discovered lead
    const { data: lead, error } = await supabase
      .from("discovered_leads")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Get conversation thread
    const { data: thread } = await supabase
      .from("conversation_threads")
      .select("*")
      .eq("discovered_lead_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    // Get linked lead info if available
    let linkedLead = null;
    if (lead.lead_id) {
      const { data } = await supabase
        .from("leads")
        .select("id, name, company, email, phone, lead_score, status, funnel_stage")
        .eq("id", lead.lead_id)
        .maybeSingle();
      linkedLead = data;
    }

    return NextResponse.json({
      discovered_lead: lead,
      conversation_thread: thread ?? null,
      linked_lead: linkedLead,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/ai/discovery/[id] — Update discovered lead stage, notes, actions
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();

    const allowedFields = [
      "conversation_stage",
      "conversation_summary",
      "closed_reason",
      "recommended_next_action",
    ];

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    const { data, error } = await supabase
      .from("discovered_leads")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
