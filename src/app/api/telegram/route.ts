import { NextRequest, NextResponse } from "next/server";
import {
  connectTelegramBot,
  disconnectTelegramBot,
  getTelegramBotStatus,
  sendTelegramMessage,
  getTelegramUpdates,
  verifyBotToken,
  setTelegramWebhook,
} from "@/lib/telegram";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  try {
    if (action === "status") {
      const status = await getTelegramBotStatus(userId);
      return NextResponse.json(status);
    }

    if (action === "updates") {
      const updates = await getTelegramUpdates(userId);
      return NextResponse.json(updates);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, userId, token, chatId, message, webhookUrl } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    if (action === "connect") {
      if (!token) {
        return NextResponse.json({ error: "token required" }, { status: 400 });
      }
      const result = await connectTelegramBot(userId, token);
      return NextResponse.json(result);
    }

    if (action === "disconnect") {
      const result = await disconnectTelegramBot(userId);
      return NextResponse.json(result);
    }

    if (action === "send") {
      if (!chatId || !message) {
        return NextResponse.json({ error: "chatId and message required" }, { status: 400 });
      }
      const result = await sendTelegramMessage(userId, chatId, message);
      return NextResponse.json(result);
    }

    if (action === "verify") {
      if (!token) {
        return NextResponse.json({ error: "token required" }, { status: 400 });
      }
      const result = await verifyBotToken(token);
      return NextResponse.json(result);
    }

    if (action === "webhook") {
      if (!webhookUrl) {
        return NextResponse.json({ error: "webhookUrl required" }, { status: 400 });
      }
      const result = await setTelegramWebhook(userId, webhookUrl);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
