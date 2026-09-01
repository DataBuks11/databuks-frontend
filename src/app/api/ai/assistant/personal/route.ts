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
    const { enabled, jid } = body as { enabled?: boolean; jid?: string };
    const update: Record<string, any> = { updated_at: new Date().toISOString() };
    if (typeof enabled === "boolean") update.personal_assistant_enabled = enabled;
    if (typeof jid === "string") update.personal_whatsapp_jid = jid || null;

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
