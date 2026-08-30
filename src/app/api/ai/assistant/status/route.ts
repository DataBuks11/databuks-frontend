import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/ai/assistant/status
 * Returns whether the user has a business context set up. The chat widget
 * uses this to decide whether to show the onboarding prompt ("tell me
 * about your business") vs the normal command-center greeting.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: row } = await supabase
      .from("business_context")
      .select("business_name, description, services, target_audience, industries, locations, brand_voice, tone")
      .eq("user_id", user.id)
      .maybeSingle();

    const hasName = !!row?.business_name && String(row.business_name).trim().length > 0;
    const hasDesc = !!row?.description && String(row.description).trim().length > 20;
    const hasServices = Array.isArray(row?.services) && row.services.length > 0;
    const ready = hasName && hasDesc;

    return NextResponse.json({
      ok: true,
      has_context: ready,
      partial: !ready && (hasName || hasDesc || hasServices),
      data: row ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
