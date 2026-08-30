/**
 * Email adapter — Resend.com transactional email.
 *
 * Resend (https://resend.com) provides a simple HTTPS API:
 *   POST https://api.resend.com/emails
 *   Authorization: Bearer <RESEND_API_KEY>
 *   Body: { from, to, subject, html/text }
 *
 * Free tier: 100 emails/day, 3000/month — enough for personal-assistant
 * outreach volume. If RESEND_API_KEY is not set, the adapter is a no-op
 * (returns ok=false) so the orchestrator can skip email gracefully.
 */

export interface EmailSendInput {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML body — falls back to text */
  html?: string;
  /** Override From address; defaults to a configured "from" or a generic one */
  from?: string;
}

export interface EmailSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean;
}

export async function sendEmail(input: EmailSendInput): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = input.from || process.env.RESEND_FROM || "DataBuks <hello@databuks.org>";

  if (!apiKey) {
    return { ok: false, skipped: true, error: "RESEND_API_KEY not configured" };
  }
  if (!input.to || !input.subject) {
    return { ok: false, error: "missing to/subject" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html ?? `<p>${escapeHtml(input.text).replace(/\n/g, "<br/>")}</p>`,
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, messageId: data.id };
  } catch (err: any) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
