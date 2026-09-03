/**
 * Free image generation via Cloudflare Workers (saurav-z/free-image-generation-api).
 *
 * Env vars (set in Vercel once the user deploys their own Worker):
 *   IMAGE_API_URL    — e.g. https://image-gen.example.workers.dev
 *   IMAGE_API_KEY    — bearer token configured in the Worker's API_KEY env
 *
 * POST <IMAGE_API_URL> with JSON body { "prompt": "..." } returns binary image
 * (image/jpeg or image/png). We read it as a Buffer and return base64 data URL
 * for simple storage in our social_posts.image_url column. For production-grade
 * storage, the Worker should be paired with R2/S3 and return a public URL.
 */

export interface GeneratedImage {
  url: string;       // data URL OR remote URL (depending on storage)
  base64?: string;  // raw base64 (if data URL)
  mimeType: string;  // image/jpeg, image/png
  prompt: string;
  bytes: number;
}

export async function generateImage(prompt: string): Promise<GeneratedImage> {
  const url = process.env.IMAGE_API_URL;
  const key = process.env.IMAGE_API_KEY;

  if (!url) {
    // No image API configured — return a graceful placeholder so the post
    // generation flow still works (text + caption will be saved without image).
    return placeholderImage(prompt);
  }

  const timeoutMs = 120_000;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.warn(`[image-generator] upstream ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return placeholderImage(prompt);
    }
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();

    // V2 upstream returns JSON: { ok, key, url } — image already persisted to
    // KV/R2 with a public URL. Prefer that: no base64 bloat in the DB, and the
    // URL is directly usable by Composio for publishing.
    if (contentType.includes("json")) {
      const data = await res.json().catch(() => null);
      if (data && typeof data.url === "string" && /^https?:\/\//i.test(data.url)) {
        return {
          url: data.url,
          mimeType: "image/jpeg",
          prompt,
          bytes: Number(data.bytes ?? 0),
        };
      }
      console.warn(`[image-generator] upstream JSON without url: ${JSON.stringify(data).slice(0, 200)}`);
      return placeholderImage(prompt);
    }

    // V1 upstream returns raw binary image
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) {
      // Some upstream errors return tiny JSON even on non-2xx; treat as failure
      return placeholderImage(prompt);
    }
    const mimeType = contentType || "image/jpeg";
    const base64 = buf.toString("base64");
    return {
      url: `data:${mimeType};base64,${base64}`,
      base64,
      mimeType,
      prompt,
      bytes: buf.length,
    };
  } catch (err: any) {
    console.warn(`[image-generator] fetch failed: ${err?.message ?? err}`);
    return placeholderImage(prompt);
  }
}

function placeholderImage(prompt: string): GeneratedImage {
  // 1×1 transparent PNG — keeps the row valid without a real image
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  return {
    url: `data:image/png;base64,${png}`,
    base64: png,
    mimeType: "image/png",
    prompt,
    bytes: 0,
  };
}

/** Build a concise image prompt from a social post caption + topic. */
export function buildImagePrompt(topic: string, caption: string): string {
  const t = (topic ?? "").trim();
  const c = (caption ?? "").trim();
  // Keep it short, concrete, and style-aware. Caller can override.
  const parts: string[] = [];
  if (t) parts.push(t);
  if (c) parts.push(c.slice(0, 200));
  parts.push("editorial photography, soft natural light, modern minimal");
  return parts.join(", ");
}
