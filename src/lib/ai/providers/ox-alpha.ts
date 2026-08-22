import type { AiCompletionInput, AiProvider } from "./types";

const OX_ALPHA_API_KEY = process.env.OX_ALPHA_API_KEY;
const OX_ALPHA_MODEL = process.env.OX_ALPHA_MODEL || "ox-alpha";
const OX_ALPHA_BASE_URL = (process.env.OX_ALPHA_BASE_URL || "").replace(/\/+$/, "");

export class OxAlphaProvider implements AiProvider {
  readonly id = "ox_alpha";
  readonly model = OX_ALPHA_MODEL;
  readonly modelVersion = "ox-alpha";

  async completeJson(input: AiCompletionInput): Promise<Record<string, any>> {
    if (!OX_ALPHA_API_KEY) {
      throw new Error("OX_ALPHA_API_KEY is not configured on the server");
    }
    if (!OX_ALPHA_BASE_URL) {
      throw new Error("OX_ALPHA_BASE_URL is not configured on the server");
    }

    const response = await fetch(`${OX_ALPHA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OX_ALPHA_API_KEY}`,
      },
      body: JSON.stringify({
        model: OX_ALPHA_MODEL,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
        temperature: input.temperature ?? 0.2,
        response_format: { type: "json_object" },
        ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ox Alpha API error ${response.status}: ${errorText.slice(0, 500)}`);
    }

    const data = await response.json();
    const content: unknown = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new Error("Ox Alpha returned no content");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      const cleaned = content
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        throw new Error("Ox Alpha response is not valid JSON");
      }
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Ox Alpha response is not a JSON object");
    }

    return parsed as Record<string, any>;
  }
}
