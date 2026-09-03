/**
 * Shared WhatsApp JID resolution + send helpers.
 *
 * Most push flows (daily summary, post reviews, follow-ups, reports) target
 * the user's own WhatsApp number. The number lives on profiles.phone, but
 * historically it was left unset — so nothing reached the owner. These
 * helpers centralize resolution with a hard fallback to OWNER_WHATSAPP_NUMBER
 * so the admin account always receives its notifications.
 */

export function phoneToJid(phone: unknown): string | null {
  if (phone == null) return null;
  // JIDs carry device suffixes before @ (e.g. "918788606608.0:64@s.whatsapp.net").
  // Strip the @-domain first, then any .device / :device suffix, THEN digits.
  let str = String(phone).trim();
  str = str.split("@")[0];          // drop domain part
  str = str.replace(/[.:].*$/, ""); // drop device/landline suffix (first . or :)
  const digits = str.replace(/\D/g, "");
  return digits.length >= 10 ? `${digits}@s.whatsapp.net` : null;
}

export async function resolveUserJid(
  supabase: any,
  userId: string
): Promise<string | null> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone")
      .eq("id", userId)
      .maybeSingle();
    const fromProfile = phoneToJid((profile as any)?.phone);
    if (fromProfile) return fromProfile;
  } catch {
    // fall through to env fallback
  }
  // Fallback: the bound owner number. Only meaningful for the admin account,
  // but harmless for others (their sends would go to that same number).
  return phoneToJid(process.env.OWNER_WHATSAPP_NUMBER);
}

export async function sendViaBaileys(input: {
  userId: string;
  jid: string;
  message: string;
}): Promise<void> {
  const baseUrl = process.env.BAILEYS_SERVER_URL;
  if (!baseUrl) throw new Error("BAILEYS_SERVER_URL not configured");
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.BAILEYS_API_KEY || "dev-key",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`WhatsApp send failed (${res.status}): ${t.slice(0, 160)}`);
  }
}