import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCapabilitiesForConnection, getWhatsAppCapabilities } from "@/lib/social/capabilities";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: connections } = await supabase
      .from("social_connections")
      .select("platform, status, connection_id, handle")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const accounts: Record<string, any> = {};
    for (const connection of connections ?? []) {
      if (connection.platform === "whatsapp") continue;
      const key = `${connection.platform}:${connection.connection_id ?? "unknown"}`;
      if (accounts[key]) continue;
      accounts[key] = getCapabilitiesForConnection({
        platform: connection.platform,
        status: connection.status,
        connection_id: connection.connection_id ?? null,
      });
    }

    const { data: waSession } = await supabase
      .from("whatsapp_sessions")
      .select("connected, phone_number")
      .eq("user_id", user.id)
      .maybeSingle();
    if (waSession) {
      accounts[`whatsapp:${waSession.phone_number ?? "session"}`] = getWhatsAppCapabilities(
        waSession.connected === true,
        waSession.phone_number ?? null
      );
    }

    return NextResponse.json({ accounts: Object.values(accounts) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
