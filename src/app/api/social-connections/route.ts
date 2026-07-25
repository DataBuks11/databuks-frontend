import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const API = (tag: string, data?: any) => {
  if (data !== undefined) console.log(`[API:social-connections:${tag}]`, typeof data === "object" ? JSON.stringify(data) : data);
  else console.log(`[API:social-connections:${tag}] TRIGGERED`);
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    API("GET", { userId });
    if (!userId) { API("GET_NO_USER"); return NextResponse.json({ connections: [] }); }

    const { data, error } = await supabaseAdmin
      .from("social_connections")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      API("GET_ERROR", { message: error.message, code: error.code, details: error.details, hint: error.hint });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    API("GET_RESULT", { count: data?.length, rows: data?.map((r:any) => ({ id: r.id, user_id: r.user_id, platform: r.platform, status: r.status, connection_id: r.connection_id })) });
    return NextResponse.json({ connections: data || [] });
  } catch (err: any) {
    API("GET_CATCH", { message: err.message, stack: err.stack });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, platform, connection_id, display_name, status } = body;

    API("POST_RECEIVED", { userId, platform, connection_id, status });

    if (!userId || !platform) {
      API("POST_MISSING_FIELDS");
      return NextResponse.json({ error: "userId and platform are required" }, { status: 400 });
    }

    const p = platform.toLowerCase();
    API("POST_NORMALIZED", { platform: p });

    // Check existing
    const { data: existing, error: findErr } = await supabaseAdmin
      .from("social_connections")
      .select("id,user_id,platform,status,connection_id")
      .eq("user_id", userId)
      .eq("platform", p)
      .maybeSingle();

    if (findErr) {
      API("POST_FIND_ERROR", { message: findErr.message, code: findErr.code });
      return NextResponse.json({ error: findErr.message }, { status: 500 });
    }

    API("POST_EXISTING", { existing });

    let result;
    if (existing) {
      const updatePayload = {
        connection_id: connection_id || null,
        handle: display_name || `${p}_composio`,
        status: status || "connected",
        last_sync: new Date().toISOString(),
      };
      API("POST_UPDATE", { id: existing.id, payload: updatePayload });

      const { data: updated, error } = await supabaseAdmin
        .from("social_connections")
        .update(updatePayload)
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        API("POST_UPDATE_ERROR", { message: error.message, code: error.code, details: error.details, hint: error.hint });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      result = updated;
      API("POST_UPDATE_SUCCESS", { result });
    } else {
      const insertPayload = {
        user_id: userId,
        platform: p,
        connection_id: connection_id || null,
        handle: display_name || `${p}_composio`,
        status: status || "connected",
        last_sync: new Date().toISOString(),
      };
      API("POST_INSERT", { payload: insertPayload });

      const { data: inserted, error } = await supabaseAdmin
        .from("social_connections")
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        API("POST_INSERT_ERROR", { message: error.message, code: error.code, details: error.details, hint: error.hint });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      result = inserted;
      API("POST_INSERT_SUCCESS", { result });
    }

    // Immediate re-read to verify persistence
    const { data: verifyData, error: verifyErr } = await supabaseAdmin
      .from("social_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("platform", p)
      .maybeSingle();

    API("POST_VERIFY_AFTER_WRITE", {
      found: !!verifyData,
      row: verifyData,
      error: verifyErr ? { message: verifyErr.message, code: verifyErr.code } : null,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    API("POST_CATCH", { message: err.message, stack: err.stack });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
