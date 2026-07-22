import { NextRequest, NextResponse } from "next/server";
import {
  startWhatsAppConnection,
  disconnectWhatsApp,
  getWhatsAppStatus,
  sendWhatsAppMessage,
  getActiveQrCode,
} from "@/lib/whatsapp";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  try {
    if (action === "status") {
      const status = await getWhatsAppStatus(userId);
      return NextResponse.json(status);
    }

    if (action === "qr") {
      const currentQr = getActiveQrCode();
      if (currentQr) {
        return NextResponse.json({ qrCode: currentQr });
      }
      return NextResponse.json({ qrCode: null, message: "No active QR code. Start a connection first." });
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
      const result = await startWhatsAppConnection(userId);
      return NextResponse.json(result);
    }

    if (action === "disconnect") {
      const result = await disconnectWhatsApp(userId);
      return NextResponse.json(result);
    }

    if (action === "send") {
      if (!jid || !message) {
        return NextResponse.json({ error: "jid and message required" }, { status: 400 });
      }
      const result = await sendWhatsAppMessage(userId, jid, message);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
