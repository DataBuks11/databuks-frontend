import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["GOOGLE_MAPS_API_KEY"] as const;
let savedEnv: Record<string, string | undefined>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function loadProvider() {
  const mod = await import("@/lib/discovery/providers/google-maps");
  return new mod.GoogleMapsProvider();
}

const QUERY: any = [
  { query: "hotels in Nagpur", query_type: "LOCAL_DISCOVERY", priority: 1, rationale: "smoke", best_platform: "google_maps" },
];

describe("GoogleMapsProvider API status surfacing", () => {
  it("reports REQUEST_DENIED as an explicit error instead of silent zero candidates", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, { status: "REQUEST_DENIED", error_message: "This API key is not authorized to use this service or API." })
      )
    );

    const provider = await loadProvider();
    const result = await provider.discover(QUERY);

    expect(result.candidates).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("REQUEST_DENIED");
    expect(result.errors[0].error).toContain("not authorized");
  });

  it("treats ZERO_RESULTS as a legitimate empty result without an error", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { status: "ZERO_RESULTS" })));

    const provider = await loadProvider();
    const result = await provider.discover(QUERY);

    expect(result.candidates).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("maps OK responses into candidates with provenance", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any) => {
        if (String(url).includes("details")) {
          return jsonResponse(200, { status: "ZERO_RESULTS" });
        }
        return jsonResponse(200, {
          status: "OK",
          results: [
            {
              name: "Test Hotel",
              formatted_address: "Sitabuldi, Nagpur",
              place_id: "abc123",
              rating: 4.2,
              user_ratings_total: 100,
            },
          ],
        });
      })
    );

    const provider = await loadProvider();
    const result = await provider.discover(QUERY);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].source).toBe("google_maps");
    expect(result.candidates[0].title).toBe("Test Hotel");
    expect(result.errors).toHaveLength(0);
  });

  it("enriches candidates via Place Details (website + phone)", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    const fetchMock = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("textsearch")) {
        return jsonResponse(200, {
          status: "OK",
          results: [
            { name: "Hotel A", formatted_address: "Nagpur", place_id: "pid_1" },
          ],
        });
      }
      return jsonResponse(200, {
        status: "OK",
        result: {
          website: "https://hotela.example.com/",
          international_phone_number: "+91 90000 00000",
          url: "https://maps.google.com/?cid=123",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = await loadProvider();
    const result = await provider.discover(QUERY);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].website_url).toBe("https://hotela.example.com/");
    expect(result.candidates[0].raw_metadata?.details_phone).toBe("+91 90000 00000");
    expect(result.candidates[0].source_url).toBe("https://maps.google.com/?cid=123");
    expect(result.errors).toHaveLength(0);
  });

  it("keeps candidates usable (soft-fail) when all detail lookups fail, but reports why", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: any) => {
        const u = String(url);
        if (u.includes("textsearch")) {
          return jsonResponse(200, {
            status: "OK",
            results: [{ name: "Hotel B", formatted_address: "Nagpur", place_id: "pid_2" }],
          });
        }
        return jsonResponse(200, { status: "REQUEST_DENIED", error_message: "not authorized" });
      })
    );

    const provider = await loadProvider();
    const result = await provider.discover(QUERY);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].website_url).toBeNull();
    expect(result.errors.some((e) => e.error.includes("place-details"))).toBe(true);
  });

  it("reports HTTP failures explicitly", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(403, {})));

    const provider = await loadProvider();
    const result = await provider.discover(QUERY);

    expect(result.candidates).toHaveLength(0);
    expect(result.errors[0].error).toContain("HTTP 403");
  });
});
