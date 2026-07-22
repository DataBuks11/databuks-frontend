import { NextRequest, NextResponse } from "next/server";
import { initiateConnection, getConnections, disconnectConnection } from "@/lib/composio";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get("userId") ?? "default";

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
    const { appName, entityId } = body;

    if (!appName) {
      return NextResponse.json({ error: "appName is required" }, { status: 400 });
    }

    const result = await initiateConnection(appName, entityId ?? "default");
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
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await disconnectConnection(connectionId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to disconnect";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
