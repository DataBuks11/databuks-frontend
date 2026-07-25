import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const results: string[] = [];

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    results.push(`URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30)}...`);
    results.push(`KEY exists: ${!!process.env.SUPABASE_SERVICE_ROLE_KEY}`);

    const testRow = {
      user_id: "00000000-0000-0000-0000-000000000000",
      platform: "test_" + Date.now(),
      status: "test",
      last_sync: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("social_connections")
      .insert(testRow)
      .select();

    if (error) {
      results.push(`INSERT ERROR: ${error.code} - ${error.message} - ${error.details}`);
    } else {
      results.push(`INSERT OK: ${JSON.stringify(data)}`);
      await supabase.from("social_connections").delete().eq("platform", testRow.platform);
    }

    const { data: list, error: listErr } = await supabase
      .from("social_connections")
      .select("platform, status")
      .limit(5);

    if (listErr) {
      results.push(`SELECT ERROR: ${listErr.code} - ${listErr.message}`);
    } else {
      results.push(`SELECT OK: found ${list?.length} rows`);
    }

    return NextResponse.json({ results });
  } catch (e: any) {
    results.push(`CATCH: ${e.message}`);
    return NextResponse.json({ results, error: e.message }, { status: 500 });
  }
}
