import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLeadIntelligence } from "@/lib/ai/intelligence/lead-intelligence";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const intelligence = await getLeadIntelligence(supabase, user.id, id);
    if (!intelligence) return NextResponse.json({ error: "No intelligence for lead" }, { status: 404 });
    return NextResponse.json(intelligence);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
