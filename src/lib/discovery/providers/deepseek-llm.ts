import type { DiscoveryQuery } from "../query-generator";
import type {
  DiscoveryProvider,
  DiscoveryProviderResult,
  ProviderConfig,
  RawDiscoveryCandidate,
} from "./types";

/**
 * DeepSeek LLM discovery provider (name: "deepseek_llm").
 *
 * Google Custom Search needs keys the user may not have — so DeepSeek
 * v4.1 Flash proposes REAL candidate businesses per category (hotels,
 * hospitals, retail, manufacturers, professionals…) from its knowledge,
 * and EVERY suggestion is live-verified (website fetches with HTTP 200 +
 * real HTML) before becoming a candidate. Unverifiable = dropped, so the
 * LLM can never inject fabricated leads into the pipeline.
 */

interface LlmBusiness {
  business: { name: string; industries: string[]; services: string[]; locations: string[] };
}

const VERIFY_TIMEOUT_MS = 12_000;
const MAX_SUGGESTIONS = 14;

async function fetchOk(url: string): Promise<{ ok: boolean; title: string; bytes: number }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DataBuksDiscovery/1.0)" },
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, title: "", bytes: 0 };
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!ct.includes("html")) return { ok: false, title: "", bytes: 0 };
    const html = await res.text();
    if (html.length < 2000) return { ok: false, title: "", bytes: html.length };
    const m = html.match(/<title[^>]*>(.*?)<\/title>/i);
    const title = m ? m[1].replace(/<[^>]+>/g, "").trim().slice(0, 150) : "";
    return { ok: true, title, bytes: html.length };
  } catch {
    return { ok: false, title: "", bytes: 0 };
  }
}

function normalizeDomain(raw: string): string | null {
  let d = String(raw ?? "").trim().toLowerCase();
  if (!d) return null;
  if (!/^https?:\/\//i.test(d)) d = "https://" + d;
  try {
    const u = new URL(d);
    if (!u.hostname.includes(".")) return null;
    return `https://${u.hostname}`;
  } catch {
    return null;
  }
}

export class DeepSeekDiscoveryProvider implements DiscoveryProvider {
  readonly name = "deepseek_llm";

  isConfigured(): boolean {
    // Uses the app's existing LLM provider — no extra key needed.
    return true;
  }

  async discover(
    queries: DiscoveryQuery[],
    config: ProviderConfig = {}
  ): Promise<DiscoveryProviderResult> {
    const discoveredAt = new Date().toISOString();
    const errors: { query: string; error: string }[] = [];
    const biz = (config.business ?? {}) as LlmBusiness["business"];

    const categories = [
      "hotels & hospitality",
      "hospitals & clinics",
      "retail stores & showrooms",
      "manufacturers & distributors",
      "restaurants & cafes",
      "professional services (CA, legal, consultants)",
    ];
    const locations: string[] = Array.isArray((config as any).locations) && (config as any).locations.length > 0
      ? (config as any).locations.slice(0, 2)
      : ["Nagpur, India"];

    let suggestions: { name: string; domain: string; city: string; why: string }[] = [];
    try {
      const { getActiveProvider } = await import("../../ai/providers");
      const provider = getActiveProvider();
      const out: any = await provider.completeJson({
        system: [
          "You suggest REAL, currently-operating businesses as sales prospects.",
          "Only name businesses you are confident actually exist (well-known local chains, established firms). Never invent names, domains, or details.",
          "Each must plausibly need our services (websites, software, automation, marketing). Prefer businesses with weak/no digital presence.",
          "Respond ONLY with JSON: {\"businesses\": [{\"name\": string, \"domain\": string (bare domain only, no path), \"city\": string, \"why\": one line}]}.",
        ].join("\n"),
        user: [
          `OUR BUSINESS: ${(biz as any)?.name ?? "a digital agency"}`,
          `OUR SERVICES: ${((biz as any)?.services ?? []).join(", ") || "web, software, automation"}`,
          `LOCATIONS: ${locations.join(" | ")}`,
          `CATEGORIES (2-3 businesses EACH): ${categories.join(" | ")}`,
          `Return 10-${MAX_SUGGESTIONS} businesses total, spread across categories.`,
        ].join("\n"),
        temperature: 0.2,
        maxTokens: 2000,
        reasoningEffort: "low",
        timeoutMs: 45_000,
        maxAttempts: 2,
      });
      const list = Array.isArray(out?.businesses) ? out.businesses : [];
      suggestions = list
        .filter((b: any) => b && typeof b.name === "string" && typeof b.domain === "string")
        .slice(0, MAX_SUGGESTIONS)
        .map((b: any) => ({
          name: String(b.name).slice(0, 150),
          domain: String(b.domain).slice(0, 150),
          city: String(b.city ?? "").slice(0, 80),
          why: String(b.why ?? "").slice(0, 300),
        }));
    } catch (err: any) {
      return {
        provider: this.name,
        candidates: [],
        total_queries_executed: 0,
        total_queries_requested: queries.length,
        errors: [{ query: "llm-suggest", error: err?.message ?? "LLM suggestion failed" }],
        rate_limit_hit: false,
      };
    }

    // Live-verify every suggestion in parallel — only real websites survive.
    const settled = await Promise.all(
      suggestions.map(async (s) => {
        const site = normalizeDomain(s.domain);
        if (!site) return null;
        const check = await fetchOk(site);
        if (!check.ok) return null;
        const candidate: RawDiscoveryCandidate = {
          source: this.name,
          source_url: site,
          title: s.name,
          snippet: `${s.why} (AI-suggested, website verified live${check.title ? `: ${check.title}` : ""})`.slice(0, 500),
          website_url: site,
          query: `llm-category-discovery (${s.city || "India"})`,
          query_type: "BUSINESS_DISCOVERY",
          discovered_at: discoveredAt,
          raw_metadata: { provider: this.name, scope: "LOCAL", verified: true, city: s.city },
        };
        return candidate;
      })
    );

    const candidates = settled.filter((c): c is RawDiscoveryCandidate => c !== null);
    if (candidates.length === 0 && suggestions.length > 0) {
      errors.push({ query: "llm-verify", error: `all ${suggestions.length} LLM suggestions failed live verification` });
    }

    return {
      provider: this.name,
      candidates,
      total_queries_executed: 1,
      total_queries_requested: queries.length,
      errors,
      rate_limit_hit: false,
    };
  }
}
