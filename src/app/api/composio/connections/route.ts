import { NextRequest, NextResponse } from "next/server";
import {
  initiateConnection,
  getConnections,
  disconnectConnection,
  reinitiateConnection,
} from "@/lib/composio";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get("userId");

    if (!entityId) {
      return NextResponse.json({ error: "userId query parameter is required" }, { status: 400 });
    }

    const connections = await getConnections(entityId);
    return NextResponse.json({ connections });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch connections";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { appName, entityId, redirectUri } = body;

    if (!appName) {
      return NextResponse.json({ error: "appName is required" }, { status: 400 });
    }

    if (!entityId || entityId === "default") {
      return NextResponse.json({
        error: "A valid authenticated user ID is required. Please ensure you are logged in.",
      }, { status: 400 });
    }

    const result = await initiateConnection(appName, entityId, redirectUri);
    return NextResponse.json(result);
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
