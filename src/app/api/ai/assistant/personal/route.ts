import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/ai/assistant/personal
 * Returns the personal-assistant settings for the current user, but only
 * if the user's email is the allowed admin (databuksllc@gmail.com). All other
 * users get 403 — they cannot use the personal WhatsApp feature.
 */
const ALLOWED_ADMIN_EMAILS = ["databuksllc@gmail.com"];

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!user.email || !ALLOWED_ADMIN_EMAILS.includes(user.email)) {
      return NextResponse.json({
        ok: false,
        error: "personal_assistant_not_available",
        message: "Personal WhatsApp Assistant is only available for the admin account.",
      }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("personal_whatsapp_jid, personal_assistant_enabled, assistant_mode")
      .eq("id", user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      is_admin: true,
      enabled: (data as any)?.personal_assistant_enabled ?? false,
      jid: (data as any)?.personal_whatsapp_jid ?? null,
      mode: (data as any)?.assistant_mode ?? "business",
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!user.email || !ALLOWED_ADMIN_EMAILS.includes(user.email)) {
      return NextResponse.json({
        ok: false,
        error: "personal_assistant_not_available",
      }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { enabled, jid, mode, test_message } = body as {
      enabled?: boolean;
      jid?: string;
      mode?: "business" | "personal";
      test_message?: boolean;
    };

    // Real WhatsApp test send to the owner's number via Baileys. The old
    // "Send Test Message" button only returned ok without sending anything —
    // this actually forwards to Baileys /send so the user SEES the message.
    if (test_message === true) {
      const baseUrl = process.env.BAILEYS_SERVER_URL;
      const apiKey = process.env.BAILEYS_API_KEY || "dev-key";
      const ownerPhone = (process.env.OWNER_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
      if (!baseUrl || ownerPhone.length < 10) {
        return NextResponse.json({ ok: false, error: "Baileys URL or owner number not configured" }, { status: 500 });
      }
      try {
        const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify({
            userId: user.id,
            jid: `${ownerPhone}@s.whatsapp.net`,
            message: `hi ${(user.user_metadata?.full_name ?? "boss").split(" ")[0]}, DataBuks AI assistant yahan hai. ye test message aapke personal WhatsApp par aaya hai. reply karke dekh sakte ho.`,
          }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          return NextResponse.json({ ok: false, error: `Baileys ${res.status}: ${t.slice(0, 160)}` }, { status: 502 });
        }
        return NextResponse.json({ ok: true, sent: true });
      } catch (err: any) {
        return NextResponse.json({ ok: false, error: err?.message ?? "send failed" }, { status: 500 });
      }
    }

    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (typeof enabled === "boolean") update.personal_assistant_enabled = enabled;
    if (typeof jid === "string") update.personal_whatsapp_jid = jid || null;
    if (mode === "business" || mode === "personal") update.assistant_mode = mode;

    const { error } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
