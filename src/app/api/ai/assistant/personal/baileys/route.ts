import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Admin-only proxy to the Baileys WhatsApp server for the PERSONAL
 * assistant number (QR pairing + status + disconnect). The Baileys server
 * already has /connect, /qr/:userId, /status/:userId, /disconnect — we just
 * bridge them behind the app's auth so the dashboard can drive pairing.
 */
const ALLOWED_ADMIN_EMAILS = ["databuksllc@gmail.com"];

async function adminOnly(request: NextRequest): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return !!user?.email && ALLOWED_ADMIN_EMAILS.includes(user.email);
  } catch {
    return false;
  }
}

function baileysBase(): string | null {
  return process.env.BAILEYS_SERVER_URL ?? null;
}

/**
 * NOTE (dual slots): sessions are namespaced on the Baileys server as
 * "personal__<userId>" (business lives in "biz__<userId>"). Both numbers
 * stay connected simultaneously — connecting personal NEVER touches the
 * business session. Supabase writes use the raw UUID + slot column.
 */
function personalScope(userId: string): string {
  return /^(biz|business|personal)__/.test(userId) ? userId : `personal__${userId}`;
}

function baileysHeaders() {
  return {
    "Content-Type": "application/json",
    "x-api-key": process.env.BAILEYS_API_KEY || "dev-key",
  };
}

export async function GET(request: NextRequest) {
  if (!(await adminOnly(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = request.nextUrl.searchParams.get("userId");
  const action = request.nextUrl.searchParams.get("action");
  const base = baileysBase();
  if (!base) return NextResponse.json({ error: "BAILEYS_SERVER_URL not configured" }, { status: 500 });
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const scope = personalScope(userId);

  try {
    if (action === "qr") {
      // Poll baileys for a QR after connect was requested. NOTE: baileys
      // returns the QR under `qrCode`, not `qr` — reading the wrong field
      // here made the dashboard show "preparing QR..." forever.
      const res = await fetch(`${base.replace(/\/+$/, "")}/qr/${scope}`, {
        headers: baileysHeaders(),
        cache: "no-store",
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return NextResponse.json({ ok: false, error: `baileys ${res.status}: ${t.slice(0, 200)}` }, { status: res.status });
      }
      const data = await res.json();
      return NextResponse.json({ ok: true, qr: data?.qrCode ?? null, connected: data?.connected ?? false });
    }
    if (action === "status") {
      const res = await fetch(`${base.replace(/\/+$/, "")}/status/${scope}`, {
        headers: baileysHeaders(),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({
        ok: res.ok,
        connected: data?.connected ?? false,
        hasQr: data?.hasQr ?? false,
        phone: data?.phoneNumber ?? data?.phone ?? null,
        error: res.ok ? null : String(data?.error ?? "status failed").slice(0, 200),
      });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "baileys proxy failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await adminOnly(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { userId, action } = body as { userId?: string; action?: string };
  const base = baileysBase();
  if (!base) return NextResponse.json({ error: "BAILEYS_SERVER_URL not configured" }, { status: 500 });
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const scope = personalScope(userId);
  try {
    if (action === "connect") {
      const baseUrl = base.replace(/\/+$/, "");
      // Independent slot: business session is untouched, both stay live.
      const res = await fetch(`${baseUrl}/connect`, {
        method: "POST",
        headers: baileysHeaders(),
        body: JSON.stringify({ userId: scope, slot: "personal", fresh: true, deviceName: "DataBuks Personal" }),
      });
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({ ok: res.ok, qr: data?.qrCode ?? null, error: res.ok ? null : String(data?.error ?? "connect failed").slice(0, 200) });
    }
    if (action === "pair") {
      // QR ke bina link — phone number par 8-char code. Baileys /pair khud
      // fresh session banata hai, toota session bhi theek ho jata hai.
      const phoneNumber = String((body as any)?.phoneNumber ?? "").replace(/\D/g, "");
      if (phoneNumber.length < 10 || phoneNumber.length > 15) {
        return NextResponse.json({ error: "phoneNumber required (country code + number, bina +)" }, { status: 400 });
      }
      const res = await fetch(`${base.replace(/\/+$/, "")}/pair`, {
        method: "POST",
        headers: baileysHeaders(),
        body: JSON.stringify({ userId: scope, slot: "personal", phoneNumber }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.pairingCode) {
        return NextResponse.json({ error: String(data?.error ?? "pairing code failed").slice(0, 200) }, { status: res.ok ? 500 : res.status });
      }
      return NextResponse.json({ ok: true, pairingCode: data.pairingCode });
    }
    if (action === "disconnect") {
      const res = await fetch(`${base.replace(/\/+$/, "")}/disconnect`, {
        method: "POST",
        headers: baileysHeaders(),
        body: JSON.stringify({ userId: scope }),
      });
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({ ok: res.ok, error: res.ok ? null : String(data?.error ?? "disconnect failed").slice(0, 200) });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "baileys proxy failed" }, { status: 500 });
  }
}