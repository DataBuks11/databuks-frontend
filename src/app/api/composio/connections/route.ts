import { NextRequest, NextResponse } from "next/server";
import {
  initiateConnection,
  getConnections,
  disconnectConnection,
} from "@/lib/composio";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId query parameter is required" }, { status: 400 });
    }

    const connections = await getConnections(userId);
    return NextResponse.json({ connections });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch connections";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { appName, entityId, userId, redirectUri } = body;

    if (!appName) {
      return NextResponse.json({ error: "appName is required" }, { status: 400 });
    }

    const uid = userId || entityId;
    if (!uid || uid === "default") {
      return NextResponse.json({
        error: "A valid authenticated user ID is required. Please ensure you are logged in.",
      }, { status: 400 });
    }

    const result = await initiateConnection(appName, uid, redirectUri);

    return NextResponse.json({
      connectedAccountId: result.connectionId,
      connectionStatus: "INITIATED",
      redirectUrl: result.redirectUrl,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to initiate connection";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get("id");

    if (!connectionId) {
      return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
    }

    await disconnectConnection(connectionId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to disconnect";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
