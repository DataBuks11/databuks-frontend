import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;
const COMPOSIO_BASE = "https://backend.composio.dev";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!COMPOSIO_API_KEY) {
      return NextResponse.json({ error: "COMPOSIO_API_KEY not configured" }, { status: 500 });
    }

    const response = await fetch(
      `${COMPOSIO_BASE}/api/v3.1/connected_accounts?user_id=${encodeURIComponent(user.id)}`,
      { headers: { "x-api-key": COMPOSIO_API_KEY } }
    );
    if (!response.ok) {
      return NextResponse.json({ error: `Composio API error (${response.status})` }, { status: 500 });
    }

    const data = await response.json();
    const accounts = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];

    // OWNERSHIP FILTER (critical): Composio ignores the user_id query filter
    // and returns EVERY account under the API key. Only accounts whose
    // Composio-side user_id matches our session user may touch their rows —
    // otherwise User A auto-claims User B's live Instagram (seen live).
    const owned = accounts.filter((a: any) => a?.user_id === user.id);
    if (owned.length !== accounts.length) {
      console.log(`[API:composio/sync] ownership filter dropped ${accounts.length - owned.length}/${accounts.length} foreign accounts for user ${user.id}`);
    }

    const platforms: Record<string, { connectionId: string; handle: string | null; status: string }[]> = {};
    for (const account of owned) {
      const slug = account?.toolkit?.slug ?? account?.app_name ?? "unknown";
      if (!platforms[slug]) platforms[slug] = [];
      platforms[slug].push({
        connectionId: account.id,
        handle: account?.word_id ?? account?.alias ?? null,
        status: account?.status ?? "unknown",
      });
    }

    const activeAccounts = owned.filter((a: any) => a?.status === "ACTIVE");
    const activeIds = activeAccounts.map((a: any) => a.id);

    const summary: Record<string, string> = {};

    for (const account of activeAccounts) {
      const slug = account?.toolkit?.slug ?? account?.app_name ?? "unknown";
      if (!["instagram", "facebook", "whatsapp", "telegram", "linkedin"].includes(slug)) continue;

      const { data: existing } = await supabase
        .from("social_connections")
        .select("id")
        .eq("user_id", user.id)
        .eq("connection_id", account.id)
        .maybeSingle();

      const payload = {
        user_id: user.id,
        platform: slug,
        handle: account?.word_id ?? account?.alias ?? `${slug}_composio`,
        connection_id: account.id,
        status: "connected",
        last_sync: new Date().toISOString(),
      };

      if (existing) {
        await supabase.from("social_connections").update({ status: "connected", last_sync: new Date().toISOString(), handle: payload.handle }).eq("id", existing.id);
      } else {
        await supabase.from("social_connections").insert(payload);
      }
      summary[slug] = "connected";
    }

    // Expire stale rows: connected rows pointing at connections that are no
    // longer in THIS user's owned active set (covers foreign-connection rows
    // written before the ownership filter existed).
    if (activeIds.length > 0) {
      await supabase
        .from("social_connections")
        .update({ status: "expired", last_sync: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("status", "connected")
        .not("connection_id", "in", `(${activeIds.join(",")})`);
    } else {
      // User owns nothing active: any "connected" Composio row is bogus.
      // (Baileys WhatsApp rows have null connection_id — untouched.)
      const { data: bogus } = await supabase
        .from("social_connections")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "connected")
        .not("connection_id", "is", null);
      for (const row of bogus ?? []) {
        await supabase
          .from("social_connections")
          .update({ status: "expired", last_sync: new Date().toISOString() })
          .eq("id", (row as any).id);
      }
      if ((bogus ?? []).length > 0) {
        console.log(`[API:composio/sync] expired ${(bogus ?? []).length} bogus connected row(s) for user ${user.id}`);
      }
    }

    for (const slug of ["instagram", "facebook"]) {
      if (!summary[slug]) summary[slug] = "disconnected";
    }

    return NextResponse.json({ synced: true, summary, platforms });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
