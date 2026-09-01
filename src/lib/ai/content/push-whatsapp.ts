/**
 * Pushes a generated post to the user's personal-assistant WhatsApp number
 * for approval. Each post is sent as ONE WhatsApp message that ends with
 * "yes/no/edit" prompts the engine can recognize.
 */
import type { DailyPost } from "./daily-generator";

export interface WhatsAppPushResult {
  sent: number;
  failed: number;
  messageIds: string[];
  errors: string[];
}

const APPROVAL_INSTRUCTIONS = `
👆 Reply with:
  • "yes"  → approve
  • "no"   → reject
  • "edit: <text>" → save edit suggestion
  • "schedule: <time>" → approve + schedule`;

function buildPostMessage(p: DailyPost, index: number, total: number): string {
  const lines: string[] = [];
  lines.push(`📝 Post ${index + 1}/${total} ready for review`);
  lines.push(`📌 Topic: ${p.topic}`);
  lines.push(`📐 Type: ${p.content_type}`);
  lines.push("");
  if (p.caption) {
    lines.push("📝 Caption:");
    lines.push(p.caption);
    lines.push("");
  }
  if (p.hashtags?.length) {
    lines.push("🏷️ Hashtags: " + p.hashtags.join(" "));
  }
  if (p.cta) {
    lines.push("🎯 CTA: " + p.cta);
  }
  if (p.image_url && p.image_url.startsWith("data:")) {
    lines.push("");
    lines.push(`🖼️ Image generated (${Math.round(p.image_url.length / 1024)} KB base64 — visible in dashboard)`);
  } else if (p.image_url) {
    lines.push("");
    lines.push("🖼️ Image: " + p.image_url);
  } else {
    lines.push("");
    lines.push("🖼️ No image — placeholder saved (you can attach manually)");
  }
  lines.push(APPROVAL_INSTRUCTIONS);
  return lines.join("\n");
}

export async function pushDailyPostsToWhatsApp(
  baseUrl: string,
  apiKey: string,
  userId: string,
  jid: string,
  posts: DailyPost[]
): Promise<WhatsAppPushResult> {
  const result: WhatsAppPushResult = { sent: 0, failed: 0, messageIds: [], errors: [] };

  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const body = buildPostMessage(p, i, posts.length);
    try {
      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({ userId, jid, message: body }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        result.failed += 1;
        result.errors.push(`post ${i + 1}: ${res.status} ${t.slice(0, 120)}`);
        continue;
      }
      const data: any = await res.json().catch(() => ({}));
      result.sent += 1;
      if (data?.id) result.messageIds.push(data.id);
    } catch (err: any) {
      result.failed += 1;
      result.errors.push(`post ${i + 1}: ${err?.message ?? "unknown"}`);
    }
  }

  return result;
}

export async function pushDailyPostsToOwnerEmail(
  apiKey: string,
  email: string,
  posts: DailyPost[]
): Promise<WhatsAppPushResult> {
  // Optional parallel path: email digest of all posts. Currently a stub;
  // wire up Resend if EMAIL_API is set.
  return { sent: 0, failed: posts.length, messageIds: [], errors: ["email not yet wired"] };
}
