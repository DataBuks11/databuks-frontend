import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/ai/discovery/handoff — List pending handoff requests
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "PENDING";

    let query = supabase
      .from("handoff_requests")
      .select("*, discovered_leads!handoff_requests_discovered_lead_id_fkey(*)")
      .eq("user_id", user.id);

    if (status.toLowerCase() !== "all") {
      query = query.in("status", [status.toUpperCase(), status.toLowerCase()]);
    }

    const { data, error } = await query.order("created_at", { ascending: false }).limit(50);

    if (error) {
      // If the FK join fails (table might not have the column yet), fallback
      const { data: fallback, error: fallbackError } = await supabase
        .from("handoff_requests")
        .select("*")
        .eq("user_id", user.id)
        .in("status", status.toLowerCase() === "all" ? ["PENDING", "pending", "APPROVED", "approved", "REJECTED", "rejected", "DEFERRED", "deferred"] : [status.toUpperCase(), status.toLowerCase()])
        .order("created_at", { ascending: false })
        .limit(50);
      if (fallbackError) return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      return NextResponse.json({ handoff_requests: fallback ?? [] });
    }

    return NextResponse.json({ handoff_requests: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/ai/discovery/handoff — Create a WhatsApp handoff request
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();

    if (!body.discovered_lead_id) {
      return NextResponse.json({ error: "discovered_lead_id is required" }, { status: 400 });
    }

    // Get the discovered lead
    const { data: lead } = await supabase
      .from("discovered_leads")
      .select("*")
      .eq("id", body.discovered_lead_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!lead) {
      return NextResponse.json({ error: "Discovered lead not found" }, { status: 404 });
    }

    // Get conversation thread
    const { data: thread } = await supabase
      .from("conversation_threads")
      .select("messages, total_messages")
      .eq("discovered_lead_id", lead.id)
      .eq("user_id", user.id)
      .maybeSingle();

    const messages = Array.isArray(thread?.messages) ? thread.messages : [];
    const latestMessages = messages.slice(-10);

    // Build handoff context
    const handoffContext = {
      discovered_lead_id: lead.id,
      lead_id: lead.lead_id,
      opportunity_id: lead.opportunity_id,
      platform: lead.source_platform,
      prospect_name: lead.author_name ?? lead.author_handle ?? null,
      profile_url: lead.author_profile_url,
      original_requirement: lead.detected_requirement,
      detected_intent: lead.recommended_next_action,
      lead_score: lead.lead_score,
      intent_score: lead.intent_score,
      confidence: lead.confidence,
      evidence: lead.evidence,
      conversation_summary: lead.conversation_summary,
      latest_messages: latestMessages,
      objections: body.objections ?? [],
      why_qualified: body.why_qualified ?? lead.evidence?.reason ?? "AI qualified based on discovery signals",
      recommended_next_step: body.recommended_next_step ?? "Schedule a call to discuss requirements",
    };

    // Create handoff request
    const { data: handoff, error } = await supabase
      .from("handoff_requests")
      .insert({
        user_id: user.id,
        lead_id: lead.lead_id,
        opportunity_id: lead.opportunity_id,
        source: "discovery",
        status: "pending",
        context: handoffContext,
        reason: `Discovery handoff: ${lead.detected_requirement ?? "Meeting intent detected"}`,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Update discovered lead stage
    await supabase
      .from("discovered_leads")
      .update({
        conversation_stage: "WHATSAPP_HANDOFF",
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    // ─── Owner WhatsApp notification ───
    // Human approval is needed — ping the owner's assistant chat instantly.
    after(async () => {
      try {
        const baseUrl = process.env.BAILEYS_SERVER_URL;
        const apiKey = process.env.BAILEYS_API_KEY || "dev-key";
        if (!baseUrl) return;
        const ownerPhone = (process.env.OWNER_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
        const jid = ownerPhone ? `${ownerPhone}@s.whatsapp.net` : null;
        if (!jid) return;
        const prospect = lead.author_name ?? lead.author_handle ?? "a lead";
        const score = lead.lead_score ?? "?";
        const msg =
          `🔔 Human approval chahiye!\n` +
          `Lead: ${prospect} (${score}pt)\n` +
          `Reason: ${lead.detected_requirement ?? "meeting intent"}\n` +
          `Reply "pending approvals" yahan, phir "approve 1" ya "reject 1".`;
        await fetch(`${baseUrl.replace(/\/+$/, "")}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify({ userId: user.id, jid, message: msg }),
        });
      } catch (err: any) {
        console.error(`[API:ai/discovery/handoff] owner notification failed: ${err?.message}`);
      }
    });

    return NextResponse.json({ handoff_request: handoff, context: handoffContext }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
