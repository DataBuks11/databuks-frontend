import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BAILEYS_URL = process.env.BAILEYS_SERVER_URL || "http://localhost:3001";
const BAILEYS_KEY = process.env.BAILEYS_API_KEY || "dev-key";

async function proxyGet(path: string) {
  const res = await fetch(`${BAILEYS_URL}${path}`, {
    headers: { "x-api-key": BAILEYS_KEY },
  });
  return res.json();
}

async function proxyPost(path: string, body: Record<string, any>) {
  const res = await fetch(`${BAILEYS_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": BAILEYS_KEY,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  try {
    if (action === "status") {
      const data = await proxyGet(`/status/${userId}`);
      return NextResponse.json(data);
    }

    if (action === "qr") {
      const data = await proxyGet(`/qr/${userId}`);
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, userId, jid, message } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    if (action === "connect") {
      const data = await proxyPost("/connect", { userId });
      return NextResponse.json(data);
    }

    if (action === "disconnect") {
      const data = await proxyPost("/disconnect", { userId });
      return NextResponse.json(data);
    }

    if (action === "send") {
      if (!jid || !message) {
        return NextResponse.json({ error: "jid and message required" }, { status: 400 });
      }
      const data = await proxyPost("/send", { userId, jid, message });
      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
