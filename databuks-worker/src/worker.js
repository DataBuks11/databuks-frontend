export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Image serving endpoint (Public)
    if (request.method === "GET" && url.pathname.startsWith("/images/")) {
      const key = url.pathname.slice("/images/".length);
      if (!key) return json({ error: "bad key" }, 400);

      const kv = env.DATABUKS_IMAGES || env.IMAGES_KV;
      if (!kv) return json({ error: "KV storage not configured" }, 500);

      const val = await kv.get(key, { type: "arrayBuffer" });
      if (!val) return json({ error: "not found" }, 404);

      return new Response(val, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=604800, immutable",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // 2. Debug endpoint
    if (request.method === "GET" && url.pathname === "/debug") {
      return json({
        ok: true,
        hasAI: typeof env.AI !== "undefined" && env.AI !== null,
        hasKV: typeof (env.DATABUKS_IMAGES || env.IMAGES_KV) !== "undefined",
        apiKeyValue: env.API_KEY || null,
        apiKeyLength: env.API_KEY ? env.API_KEY.length : 0,
        envKeys: Object.keys(env)
      });
    }

    // 3. Auth check
    const API_KEY = env.API_KEY;
    const auth = request.headers.get("Authorization");
    const xApiKey = request.headers.get("x-api-key");
    const isAuthed = !API_KEY || auth === `Bearer ${API_KEY}` || xApiKey === API_KEY;

    if (!isAuthed) {
      return json({ error: "Unauthorized" }, 401);
    }

    // 4. Image Generation endpoint
    if (request.method !== "POST" || (url.pathname !== "/" && url.pathname !== "/generate")) {
      return json({ error: "Not allowed" }, 405);
    }

    try {
      const body = await request.json().catch(() => ({}));
      const prompt = (body?.prompt || "").trim();
      if (!prompt) return json({ error: "Prompt is required" }, 400);

      let result = null;
      let usedModel = "@cf/black-forest-labs/flux-1-schnell";
      let fluxError = null;

      // Primary: FLUX.1-schnell (4-8 steps)
      try {
        result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
          prompt: prompt,
          steps: 8
        });
      } catch (err1) {
        try {
          // Retry FLUX with default steps
          result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
            prompt: prompt
          });
        } catch (err2) {
          fluxError = `FLUX attempts failed: ${err1?.message || err1} | ${err2?.message || err2}`;
          console.warn("[Worker] FLUX.1-schnell failed:", fluxError);
        }
      }

      // Fallback: SDXL full quality parameters (max num_steps is 20 on CF Workers AI)
      if (!result) {
        usedModel = "@cf/stabilityai/stable-diffusion-xl-base-1.0";
        const enhancedPrompt = `${prompt}, 8k uhd, photorealistic, professional photography, highly detailed, soft natural lighting`;
        const negativePrompt = "blurry, low quality, distorted, deformed, watermark, text, logo, bad anatomy, bad eyes, extra limbs, ugly, oversaturated, amateur";

        result = await env.AI.run("@cf/stabilityai/stable-diffusion-xl-base-1.0", {
          prompt: enhancedPrompt,
          negative_prompt: negativePrompt,
          num_steps: 20,
          guidance: 7.5,
          width: 1024,
          height: 1024
        });
      }

      let bytesBuf;
      if (result instanceof ArrayBuffer) {
        bytesBuf = result;
      } else if (ArrayBuffer.isView(result)) {
        bytesBuf = result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength);
      } else if (result && typeof result.getReader === "function") {
        const reader = result.getReader();
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const total = chunks.reduce((a, c) => a + c.length, 0);
        const merged = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
          merged.set(c, off);
          off += c.length;
        }
        bytesBuf = merged.buffer;
      } else if (result && typeof result.arrayBuffer === "function") {
        bytesBuf = await result.arrayBuffer();
      } else if (result && typeof result.image === "string") {
        const binaryString = atob(result.image);
        const len = binaryString.length;
        const u8 = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          u8[i] = binaryString.charCodeAt(i);
        }
        bytesBuf = u8.buffer;
      } else {
        return json({
          error: "unexpected AI result format",
          type: String(result?.constructor?.name),
          keys: result ? Object.keys(result).join(",") : "null"
        }, 500);
      }

      const kv = env.DATABUKS_IMAGES || env.IMAGES_KV;
      const key = crypto.randomUUID().replace(/-/g, "");

      if (kv) {
        await kv.put(key, bytesBuf, {
          metadata: {
            prompt,
            model: usedModel,
            created: new Date().toISOString()
          },
          expirationTtl: 60 * 60 * 24 * 30 // 30 days
        });
      }

      const base = url.origin;
      const imageUrl = `${base}/images/${key}`;

      // Check if client expects raw binary
      const acceptHeader = request.headers.get("Accept") || "";
      if (acceptHeader.includes("image/") && !acceptHeader.includes("application/json")) {
        return new Response(bytesBuf, {
          headers: {
            "Content-Type": "image/jpeg",
            "X-Image-Key": key,
            "X-Image-Url": imageUrl
          }
        });
      }

      return json({
        ok: true,
        key,
        url: imageUrl,
        model: usedModel,
        prompt,
        bytes: bytesBuf.byteLength,
        fluxError: fluxError || undefined
      });
    } catch (err) {
      return json({
        error: "Failed to generate image",
        details: String(err?.message ?? err),
        stack: String(err?.stack ?? "").slice(0, 500)
      }, 500);
    }
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
