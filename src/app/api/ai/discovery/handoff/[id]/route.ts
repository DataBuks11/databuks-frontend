import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/ai/discovery/handoff/[id] — Approve, reject, or defer a handoff request
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

    const action = body.action;
    if (!action || !["approve", "reject", "defer"].includes(action)) {
      return NextResponse.json(
        { error: "action must be 'approve', 'reject', or 'defer'" },
        { status: 400 }
      );
    }

    // Verify handoff exists and belongs to user
    const { data: handoff } = await supabase
      .from("handoff_requests")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!handoff) {
      return NextResponse.json({ error: "Handoff request not found" }, { status: 404 });
    }

    const statusMap: Record<string, string> = {
      approve: "approved",
      reject: "rejected",
      defer: "deferred",
    };

    const updates: Record<string, any> = {
      status: statusMap[action],
      updated_at: new Date().toISOString(),
    };

    if (body.notes) {
      updates.notes = body.notes;
    }

    const { data: updated, error } = await supabase
      .from("handoff_requests")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // If approved, update the discovered lead stage to MEETING
    if (action === "approve") {
      const context = handoff.context as Record<string, any> | null;
      if (context?.discovered_lead_id) {
        await supabase
          .from("discovered_leads")
          .update({
            conversation_stage: "MEETING",
            updated_at: new Date().toISOString(),
          })
          .eq("id", context.discovered_lead_id)
          .eq("user_id", user.id);
      }
    }

    // If rejected, close the discovered lead
    if (action === "reject") {
      const context = handoff.context as Record<string, any> | null;
      if (context?.discovered_lead_id) {
        await supabase
          .from("discovered_leads")
          .update({
            conversation_stage: "CLOSED",
            closed_reason: body.notes ?? "handoff_rejected_by_human",
            updated_at: new Date().toISOString(),
          })
          .eq("id", context.discovered_lead_id)
          .eq("user_id", user.id);
      }
    }

    return NextResponse.json({ handoff_request: updated, action });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
