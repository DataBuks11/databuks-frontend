import { NextRequest, NextResponse } from "next/server";
import { initiateConnection, getConnections, getConnectionById, disconnectConnection } from "@/lib/composio";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const connId = searchParams.get("id");
    const userId = searchParams.get("userId");

    if (action === "verify" && connId) {
      const conn = await getConnectionById(connId);
      if (!conn) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ connection: conn });
    }

    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const connections = await getConnections(userId);
    return NextResponse.json({ connections });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { appName, entityId, userId } = body;
    if (!appName) return NextResponse.json({ error: "appName required" }, { status: 400 });
    const uid = userId || entityId;
    if (!uid || uid === "default") return NextResponse.json({ error: "Valid user ID required." }, { status: 400 });

    const result = await initiateConnection(appName, uid);

    if (result.connectionId) {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: existing } = await supabase
        .from("social_connections")
        .select("id")
        .eq("user_id", uid)
        .eq("platform", appName.toLowerCase())
        .maybeSingle();

      if (existing) {
        await supabase.from("social_connections").update({
          connection_id: result.connectionId,
          status: "pending",
          last_sync: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("social_connections").insert({
          user_id: uid,
          platform: appName.toLowerCase(),
          connection_id: result.connectionId,
          handle: `${appName}_composio`,
          status: "pending",
          last_sync: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({
      connectedAccountId: result.connectionId,
      connectionStatus: "INITIATED",
      redirectUrl: result.redirectUrl,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
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
