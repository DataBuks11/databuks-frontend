import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveProvider } from "@/lib/ai/providers";
import { normalizeBusinessContext } from "@/lib/ai/context/business-context";

export const maxDuration = 60;

/**
 * POST /api/ai/onboarding/ingest
 * Body: { message: string, confirmed?: boolean }
 *
 * For users WITHOUT a website (or anyone who wants to feed business info
 * directly). Takes a free-form description of the business, uses the LLM to
 * extract structured fields, merges with any existing business_context row,
 * and returns the merged snapshot for the user to confirm.
 *
 * When `confirmed: true` and the user clicked "save", the data is persisted
 * to business_context. Until then, the response is a preview only.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => null);
    const message = String(body?.message ?? "").trim();
    const confirmed = body?.confirmed === true;
    if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });
    if (message.length > 4000) return NextResponse.json({ error: "message too long" }, { status: 400 });

    const provider = getActiveProvider();
    const existing = await fetchExistingContext(supabase, user.id);

    // 1. Extract structured business context via LLM
    const extracted = await extractContext(provider, message, existing);

    if (!confirmed) {
      return NextResponse.json({
        ok: true,
        confirmed: false,
        extracted,
        preview: extracted,
        prompt: followupPrompt(extracted),
      });
    }

    // 2. Persist to business_context
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (extracted.business_name) updates.business_name = extracted.business_name;
    if (typeof extracted.description === "string") updates.description = extracted.description;
    if (Array.isArray(extracted.services) && extracted.services.length > 0) {
      updates.services = extracted.services.map((s: any) => ({
        name: s.name,
        description: s.description ?? null,
      }));
    }
    if (Array.isArray(extracted.products) && extracted.products.length > 0) {
      updates.products = extracted.products.map((p: any) => ({
        name: p.name,
        description: p.description ?? null,
      }));
    }
    if (Array.isArray(extracted.target_audience) && extracted.target_audience.length > 0) {
      updates.target_audience = extracted.target_audience.map((t: any) => ({
        segment: t.segment,
        description: t.description ?? null,
        pain_points: t.pain_points ?? [],
      }));
    }
    if (Array.isArray(extracted.industries) && extracted.industries.length > 0) {
      updates.industries = extracted.industries;
    }
    if (Array.isArray(extracted.locations) && extracted.locations.length > 0) {
      updates.locations = extracted.locations;
    }
    if (Array.isArray(extracted.brand_voice) && extracted.brand_voice.length > 0) {
      updates.brand_voice = extracted.brand_voice;
    }
    if (extracted.tone) updates.tone = extracted.tone;
    if (Array.isArray(extracted.preferred_channels) && extracted.preferred_channels.length > 0) {
      updates.preferred_channels = extracted.preferred_channels;
    }

    const { data: row, error } = await supabase
      .from("business_context")
      .upsert({ user_id: user.id, ...updates }, { onConflict: "user_id" })
      .select()
      .single();
    if (error) {
      console.error(`[API:ai/onboarding/ingest] save failed: ${error.message}`);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      confirmed: true,
      extracted: normalizeBusinessContext(row),
      saved: true,
    });
  } catch (err: any) {
    console.error(`[API:ai/onboarding/ingest] ${err?.message}`);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}

async function fetchExistingContext(supabase: any, userId: string): Promise<Record<string, any> | null> {
  try {
    const { data } = await supabase
      .from("business_context")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

interface Extracted {
  business_name: string | null;
  description: string | null;
  services: { name: string; description?: string }[];
  products: { name: string; description?: string }[];
  target_audience: { segment: string; description?: string; pain_points?: string[] }[];
  industries: string[];
  locations: string[];
  brand_voice: string[];
  tone: string | null;
  preferred_channels: string[];
  missing_fields: string[];
}

const EXTRACTION_SCHEMA_INSTRUCTIONS = [
  "You are extracting business context from a free-form message the user typed.",
  "Be honest: only extract what the user actually said. If they didn't mention a field, leave it null or empty.",
  "NEVER invent pricing, client names, capabilities, awards, or past work.",
  "If the user is vague (e.g. 'I do marketing'), use that as the description but don't fill in services unless they specified.",
  "Return JSON matching the requested schema.",
].join("\n");

async function extractContext(
  provider: ReturnType<typeof getActiveProvider>,
  message: string,
  existing: Record<string, any> | null
): Promise<Extracted> {
  const user = [
    "User's free-form message:",
    message,
    "",
    existing ? `Existing business_context (preserve any non-conflicting fields): ${JSON.stringify({
      business_name: existing.business_name,
      description: existing.description,
      services: existing.services,
      target_audience: existing.target_audience,
      industries: existing.industries,
      locations: existing.locations,
      brand_voice: existing.brand_voice,
      tone: existing.tone,
    })}` : "No existing context — fresh extraction.",
    "",
    "Return JSON:",
    JSON.stringify({
      business_name: "string or null",
      description: "string or null",
      services: [{ name: "string", description: "string or null" }],
      products: [{ name: "string", description: "string or null" }],
      target_audience: [{ segment: "string", description: "string or null", pain_points: ["string"] }],
      industries: ["string"],
      locations: ["string"],
      brand_voice: ["string"],
      tone: "casual|professional|playful|formal|string or null",
      preferred_channels: ["whatsapp|instagram|facebook|linkedin|email"],
      missing_fields: ["list of fields the user did NOT mention"],
    }),
  ].join("\n");

  try {
    const raw = await provider.completeJson({
      system: EXTRACTION_SCHEMA_INSTRUCTIONS,
      user,
      temperature: 0.1,
      maxTokens: 800,
      timeoutMs: 25_000,
    });
    return sanitize(raw);
  } catch (err: any) {
    console.warn(`[API:ai/onboarding/ingest] LLM extraction failed: ${err?.message}`);
    return sanitize({
      business_name: null,
      description: message.slice(0, 280),
      services: [],
      products: [],
      target_audience: [],
      industries: [],
      locations: [],
      brand_voice: [],
      tone: null,
      preferred_channels: [],
      missing_fields: ["all — extraction failed, please retry"],
    });
  }
}

function sanitize(raw: any): Extracted {
  return {
    business_name: typeof raw?.business_name === "string" ? raw.business_name.trim() : null,
    description: typeof raw?.description === "string" ? raw.description.trim() : null,
    services: Array.isArray(raw?.services) ? raw.services.filter((s: any) => s?.name).slice(0, 8) : [],
    products: Array.isArray(raw?.products) ? raw.products.filter((p: any) => p?.name).slice(0, 8) : [],
    target_audience: Array.isArray(raw?.target_audience) ? raw.target_audience.filter((t: any) => t?.segment).slice(0, 5) : [],
    industries: Array.isArray(raw?.industries) ? raw.industries.filter((s: any) => typeof s === "string").slice(0, 8) : [],
    locations: Array.isArray(raw?.locations) ? raw.locations.filter((s: any) => typeof s === "string").slice(0, 8) : [],
    brand_voice: Array.isArray(raw?.brand_voice) ? raw.brand_voice.filter((s: any) => typeof s === "string").slice(0, 6) : [],
    tone: typeof raw?.tone === "string" ? raw.tone : null,
    preferred_channels: Array.isArray(raw?.preferred_channels) ? raw.preferred_channels.filter((s: any) => typeof s === "string") : [],
    missing_fields: Array.isArray(raw?.missing_fields) ? raw.missing_fields : [],
  };
}

function followupPrompt(extracted: Extracted): string {
  if (extracted.missing_fields?.length) {
    const fields = extracted.missing_fields.slice(0, 3).join(", ");
    return `saved a draft. kuch aur cheezein chahiye: ${fields}. bas 1-2 line me likh de, baaki pehle se samajh aa gaya`;
  }
  return "all set. ab dashboard pe leads/content check kar sakte ho";
}
