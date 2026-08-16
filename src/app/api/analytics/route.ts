import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeOverview, computeDailyBuckets } from "@/lib/dashboard/metrics";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(Number(searchParams.get("days") ?? "30"), 7), 90);

    const [overview, buckets] = await Promise.all([
      computeOverview(supabase, user.id),
      computeDailyBuckets(supabase, user.id, days),
    ]);

    return NextResponse.json({
      overview,
      buckets,
      hasData: buckets.some(
        (b: any) => b.leads > 0 || b.conversations > 0 || b.messages > 0 || b.meetings > 0
      ),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
