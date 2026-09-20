/**
 * Image generation: configured Cloudflare Worker (if reachable) with
 * automatic fallback to Pollinations FLUX (free, keyless, photorealistic).
 * Every post gets a real image — never a silent 1px placeholder.
 *
 * Env vars (optional — pipeline works without them via fallback):
 *   IMAGE_API_URL — e.g. https://image-gen.example.workers.dev
 *   IMAGE_API_KEY — bearer token configured in the Worker's API_KEY env
 */

export interface GeneratedImage {
  url: string; // data URL OR remote URL (depending on storage)
  base64?: string; // raw base64 (if data URL)
  mimeType: string; // image/jpeg, image/png
  prompt: string;
  bytes: number;
  provider: string; // "worker" | "pollinations" | "placeholder"
}

const FETCH_TIMEOUT_MS = 120_000;

/** Strip everything that poisons image models: hashtags, mentions, emojis, URLs, CTAs. */
export function cleanVisualText(input: string): string {
  return (input ?? "")
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/@[\p{L}\p{N}_.]+/gu, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, " ")
    .replace(/\b(DM|comment|link in bio|call now|order now|shop now|book now|swipe up|tap to|click)\b[^.!?]{0,40}/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchImageBuffer(url: string, init?: RequestInit): Promise<{ buf: Buffer; mime: string } | null> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 5000) return null; // error pixels / tiny junk
    return { buf, mime: contentType };
  } catch {
    return null;
  }
}

/** Google Gemini image generation (free tier key) — strong prompt adherence. */
async function generateViaGemini(
  prompt: string,
  aspect: "square" | "portrait"
): Promise<GeneratedImage | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Photorealistic image, ${aspect === "portrait" ? "vertical 3:4 portrait orientation" : "square 1:1"}: ${prompt}` }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    );
    if (!res.ok) {
      console.warn(`[image-generator] gemini ${res.status}, trying next provider`);
      return null;
    }
    const data = await res.json().catch(() => null);
    const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find((p: any) => p?.inlineData?.data);
    if (!imgPart) return null;
    const mimeType: string = imgPart.inlineData.mimeType || "image/png";
    const base64: string = imgPart.inlineData.data;
    const buf = Buffer.from(base64, "base64");
    if (buf.length < 5000) return null;
    return {
      url: `data:${mimeType};base64,${base64}`,
      base64,
      mimeType,
      prompt,
      bytes: buf.length,
      provider: "gemini",
    };
  } catch (err: any) {
    console.warn(`[image-generator] gemini failed (${err?.message ?? err}), trying next provider`);
    return null;
  }
}

/** HuggingFace Inference — FLUX.1-schnell, free tier with HF_API_KEY.
 *  Real FLUX quality, no watermark. Set HF_API_KEY env to enable. */
async function generateViaHuggingFace(
  prompt: string,
  aspect: "square" | "portrait"
): Promise<GeneratedImage | null> {
  const key = process.env.HF_API_KEY;
  if (!key) return null;
  const w = aspect === "portrait" ? 768 : 1024;
  const h = aspect === "portrait" ? 1344 : 1024;
  try {
    const res = await fetch("https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { width: w, height: h, num_inference_steps: 4 },
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[image-generator] huggingface ${res.status}, trying next provider`);
      return null;
    }
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 5000) return null;
    const base64 = buf.toString("base64");
    return {
      url: `data:${contentType};base64,${base64}`,
      base64,
      mimeType: contentType,
      prompt,
      bytes: buf.length,
      provider: "huggingface",
    };
  } catch (err: any) {
    console.warn(`[image-generator] huggingface failed (${err?.message ?? err}), trying next provider`);
    return null;
  }
}

/** Pollinations FLUX — free, keyless, photorealistic. Automatic fallback. */
async function generateViaPollinations(prompt: string, aspect: "square" | "portrait"): Promise<GeneratedImage | null> {
  const w = aspect === "portrait" ? 768 : 1024;
  const h = aspect === "portrait" ? 1344 : 1024;
  const seed = Math.floor(Math.random() * 999999);
  // NOTE: no enhance=true — the prompt-enhancer LLM rewrites prompts and
  // causes total subject mismatches (tunnels/tigers for business topics).
  // Our prompts are already engineered; send them verbatim.
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?model=flux&width=${w}&height=${h}&seed=${seed}&nologo=true&safe=true`;
  const got = await fetchImageBuffer(url);
  if (!got) return null;
  const base64 = got.buf.toString("base64");
  return {
    url: `data:${got.mime};base64,${base64}`,
    base64,
    mimeType: got.mime,
    prompt,
    bytes: got.buf.length,
    provider: "pollinations",
  };
}

export async function generateImage(
  prompt: string,
  aspect: "square" | "portrait" = "square"
): Promise<GeneratedImage> {
  const url = process.env.IMAGE_API_URL;
  const key = process.env.IMAGE_API_KEY;

  // 1. Configured worker first (best when the user hosts FLUX/SDXL).
  if (url) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) {
        const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
        // V2 upstream returns JSON: { ok, key, url } — image persisted with
        // a public URL. Prefer that: no base64 bloat, directly publishable.
        if (contentType.includes("json")) {
          const data = await res.json().catch(() => null);
          if (data && typeof data.url === "string" && /^https?:\/\//i.test(data.url)) {
            return {
              url: data.url,
              mimeType: "image/jpeg",
              prompt,
              bytes: Number(data.bytes ?? 0),
              provider: "worker",
            };
          }
          console.warn(`[image-generator] upstream JSON without url: ${JSON.stringify(data).slice(0, 200)}`);
        } else {
          // V1 upstream returns raw binary image
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length >= 5000) {
            const mimeType = contentType || "image/jpeg";
            const base64 = buf.toString("base64");
            return {
              url: `data:${mimeType};base64,${base64}`,
              base64,
              mimeType,
              prompt,
              bytes: buf.length,
              provider: "worker",
            };
          }
        }
      } else {
        console.warn(`[image-generator] worker ${res.status}, falling back to FLUX`);
      }
    } catch (err: any) {
      console.warn(`[image-generator] worker failed (${err?.message ?? err}), falling back to FLUX`);
    }
  }

  // 2. HuggingFace FLUX-schnell (free tier key, no watermark).
  try {
    const img = await generateViaHuggingFace(prompt, aspect);
    if (img) return img;
  } catch (err: any) {
    console.warn(`[image-generator] huggingface error: ${err?.message ?? err}`);
  }

  // 3. Google Gemini image generation (free tier key, strong adherence).
  try {
    const img = await generateViaGemini(prompt, aspect);
    if (img) return img;
  } catch (err: any) {
    console.warn(`[image-generator] gemini error: ${err?.message ?? err}`);
  }

  // 4. Pollinations FLUX fallback (free, keyless). Temporary — remove once
  //    a keyed provider is configured (user asked to move off pollinations).
  try {
    const img = await generateViaPollinations(prompt, aspect);
    if (img) return img;
  } catch (err: any) {
    console.warn(`[image-generator] pollinations failed: ${err?.message ?? err}`);
  }

  // 4. Last resort placeholder (keeps the row valid).
  return placeholderImage(prompt);
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
    provider: "placeholder",
  };
}

/**
 * Build a professional image prompt. Prefers the LLM-written visual scene
 * (concrete, photographable) over raw topic/caption text; caption
 * hashtags/emojis/CTAs are stripped (they poison image models with text
 * artifacts). Photographic direction is appended in all cases.
 */
export function buildImagePrompt(topic: string, caption: string, visual?: string): string {
  const firstLine = (caption ?? "").split(/[.!?\n]/)[0] ?? "";
  const cleanedTopic =
    cleanVisualText(`${topic ?? ""}. ${firstLine}`.trim()).slice(0, 220) || "small business growth";
  const subject = cleanVisualText(visual ?? "").slice(0, 300) || cleanedTopic;
  const detailRaw = cleanVisualText((caption ?? "").slice(0, 200));
  const scene =
    detailRaw && detailRaw.toLowerCase() !== subject.toLowerCase()
      ? ` Scene details: ${detailRaw}.`
      : "";
  return (
    `Ultra-photorealistic professional photograph: ${subject}.${scene} ` +
    `Candid documentary style, natural ambient daylight, real environment with authentic details, ` +
    `real human skin texture, natural colors, sharp focus, balanced composition with copy space, ` +
    `shot on 35mm lens, shallow depth of field, high detail, 4k quality. ` +
    `Absolutely no text, no words, no letters, no watermark, no logo, no cartoon, no illustration, ` +
    `no CGI look, no plastic skin, no blurry faces, no distorted hands.`
  );
}
