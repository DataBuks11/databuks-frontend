import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/ai/discovery/capabilities — Returns platform capabilities with connection status
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { getAllPlatformCapabilities } = await import("@/lib/social/capability-registry");
    const capabilities = await getAllPlatformCapabilities(supabase, user.id);

    return NextResponse.json({ platforms: capabilities });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
