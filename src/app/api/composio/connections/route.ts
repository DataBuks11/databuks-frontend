import { NextRequest, NextResponse } from "next/server";
import { initiateConnection, getConnections, getConnectionById, disconnectConnection } from "@/lib/composio";

const API = (tag: string, data?: any) => {
  if (data !== undefined) console.log(`[API:composio/connections:${tag}]`, JSON.stringify(data));
  else console.log(`[API:composio/connections:${tag}] TRIGGERED`);
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const connId = searchParams.get("id");
    const userId = searchParams.get("userId");

    API("GET", { action, connId, userId });

    if (action === "verify" && connId) {
      API("VERIFY_BY_ID", { connectionId: connId });
      const conn = await getConnectionById(connId);
      API("VERIFY_RESULT", { found: !!conn, status: conn?.status, full: conn });
      if (!conn) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ connection: conn });
    }

    if (!userId) {
      API("GET_MISSING_USERID");
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    API("GET_CONNECTIONS", { userId });
    const connections = await getConnections(userId);
    API("GET_CONNECTIONS_RESULT", { count: connections.length, items: connections.map(c => ({ id: c.id, app: c.app_name || c.integration_id, status: c.status })) });
    return NextResponse.json({ connections });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    API("GET_ERROR", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { appName, entityId, userId } = body;
    const uid = userId || entityId;

    API("POST", { appName, userId_passed: uid, fullBody: body });

    if (!appName) {
      API("POST_MISSING_APPNAME");
      return NextResponse.json({ error: "appName required" }, { status: 400 });
    }
    if (!uid || uid === "default") {
      API("POST_INVALID_USER", { uid });
      return NextResponse.json({ error: "Valid user ID required." }, { status: 400 });
    }

    API("CALLING_COMPOSIO_LINK", { appName, uid });
    const result = await initiateConnection(appName, uid);
    API("COMPOSIO_LINK_RESULT", { connectionId: result.connectionId, redirectUrl: result.redirectUrl });

    if (result.connectionId) {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const userRes = await supabase.auth.getUser();
      API("SUPABASE_AUTH_USER", { userId: userRes.data.user?.id, email: userRes.data.user?.email });

      const { data: existing } = await supabase
        .from("social_connections")
        .select("id")
        .eq("user_id", uid)
        .eq("platform", appName.toLowerCase())
        .maybeSingle();

      if (existing) {
        API("UPSERT", { action: "UPDATE", existingId: existing.id, platform: appName.toLowerCase(), connectionId: result.connectionId });
        const { error: upErr } = await supabase.from("social_connections").update({
          connection_id: result.connectionId,
          status: "pending",
          last_sync: new Date().toISOString(),
        }).eq("id", existing.id);
        if (upErr) API("UPSERT_ERROR", { error: upErr.message, code: (upErr as any).code, details: (upErr as any).details });
        else API("UPSERT_SUCCESS", { action: "UPDATE", id: existing.id });
      } else {
        const insertRow = {
          user_id: uid,
          platform: appName.toLowerCase(),
          connection_id: result.connectionId,
          handle: `${appName}_composio`,
          status: "pending",
          last_sync: new Date().toISOString(),
        };
        API("UPSERT", { action: "INSERT", row: insertRow });
        const { error: insErr } = await supabase.from("social_connections").insert(insertRow);
        if (insErr) API("UPSERT_ERROR", { error: insErr.message, code: (insErr as any).code, details: (insErr as any).details });
        else API("UPSERT_SUCCESS", { action: "INSERT" });
      }

      // Verify the row exists
      const { data: verifyRow } = await supabase
        .from("social_connections")
        .select("*")
        .eq("user_id", uid)
        .eq("platform", appName.toLowerCase())
        .maybeSingle();
      API("VERIFY_ROW_EXISTS", { row: verifyRow });
    }

    return NextResponse.json({
      connectedAccountId: result.connectionId,
      connectionStatus: "INITIATED",
      redirectUrl: result.redirectUrl,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    API("POST_ERROR", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get("id");
    if (!connectionId) return NextResponse.json({ error: "id required" }, { status: 400 });
    await disconnectConnection(connectionId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
