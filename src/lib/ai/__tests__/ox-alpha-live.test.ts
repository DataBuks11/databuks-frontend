import { afterAll, describe, expect, it } from "vitest";
import { OxAlphaProvider } from "@/lib/ai/providers/ox-alpha";

const API_KEY = process.env.OX_ALPHA_API_KEY ?? "";
const isConfigured =
  process.env.RUN_LIVE === "1" &&
  API_KEY.length > 10 &&
  !API_KEY.toLowerCase().includes("placeholder");

/**
 * Live verification of the Ox Alpha provider against the real endpoint.
 * Skipped unless RUN_LIVE=1 and a real OX_ALPHA_API_KEY is present.
 */
afterAll(() => {});

describe.skipIf(!isConfigured)("Ox Alpha provider - live", () => {
  it("completes a trivial JSON task over the real API", async () => {
    const provider = new OxAlphaProvider();
    expect(provider.id).toBe("ox_alpha");

    const result = await provider.completeJson({
      system: 'You output only JSON. Respond with {"ok": true} exactly.',
      user: "ping",
      temperature: 0,
    });

    expect(result).toBeTypeOf("object");
    expect(result).not.toBeNull();
  });
});
