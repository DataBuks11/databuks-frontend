import type { AiCompletionInput, AiProvider } from "./types";

const DEFAULT_MODEL = "gemini-2.5-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Gemini fast lane (Google AI Studio REST, JSON mode).
 *
 * This is the PRIMARY provider for latency: Flash answers in 1-4s when the
 * key has quota. Single attempt, tight timeout, instant fail → the
 * FailoverProvider chain (Apmix → TokenHarbor) catches anything else, so a
 * dead/empty key NEVER slows a reply, it just skips to the next lane.
 * NOTE: the key needs funded AI Studio billing — unfunded keys 402 in <1s
 * and are skipped just as fast.
 */
export class GeminiProvider implements AiProvider {
  readonly id = "gemini";
  readonly model: string;
  readonly modelVersion: string;
  private readonly apiKey: string | undefined;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.apiKey = env.GEMINI_API_KEY;
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    this.model = env.GEMINI_MODEL || DEFAULT_MODEL;
    this.modelVersion = this.model;
  }

  async completeJson(input: AiCompletionInput): Promise<Record<string, any>> {
    const timeoutMs = Math.max(5_000, Math.min(input.timeoutMs ?? 20_000, 60_000));
    const url = `${ENDPOINT}/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey!)}`;
    let response: Response;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: input.system }] },
            contents: [{ parts: [{ text: input.user }] }],
            generationConfig: {
              responseMimeType: "application/json",
              ...(input.maxTokens ? { maxOutputTokens: input.maxTokens } : {}),
              temperature: input.temperature ?? 0.2,
            },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (error: any) {
      throw new Error(
        `Gemini request failed: ${error?.name === "AbortError" ? `aborted after ${timeoutMs}ms` : (error?.message ?? "unknown")}`
      );
    }
    if (!response.ok) {
      const t = await response.text().catch(() => "");
      throw new Error(`Gemini API error ${response.status}: ${t.slice(0, 200)}`);
    }
    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("");
    const clean = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
      const parsed = JSON.parse(clean);
      if (parsed && typeof parsed === "object") return parsed;
      throw new Error("non-object");
    } catch {
      throw new Error(`Gemini returned non-JSON: ${clean.slice(0, 200)}`);
    }
  }
}
