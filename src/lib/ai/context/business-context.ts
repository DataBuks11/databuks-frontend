import type { BusinessContext } from "../types";

const BUSINESS_CONTEXT_FIELDS = [
  "business_name",
  "description",
  "products",
  "services",
  "target_audience",
  "ideal_customer_profile",
  "locations",
  "industries",
  "offer",
  "pricing",
  "brand_voice",
  "tone",
  "constraints",
  "excluded_industries",
  "excluded_lead_types",
  "preferred_channels",
  "monthly_meeting_target",
] as const;

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
  return [];
}

function asObjectArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(
      (v) => v !== null && typeof v === "object" && !Array.isArray(v)
    ) as Record<string, unknown>[];
  }
  return [];
}

function asObject(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function normalizeBusinessContext(raw: Record<string, any> | null): BusinessContext {
  const ctx = raw ?? {};
  const normalized: BusinessContext = {
    business_name: typeof ctx.business_name === "string" && ctx.business_name.trim() !== "" ? ctx.business_name : null,
    description: typeof ctx.description === "string" && ctx.description.trim() !== "" ? ctx.description : null,
    products: asObjectArray(ctx.products),
    services: asObjectArray(ctx.services),
    target_audience: asObjectArray(ctx.target_audience),
    ideal_customer_profile: asObject(ctx.ideal_customer_profile),
    locations: asStringArray(ctx.locations),
    industries: asStringArray(ctx.industries),
    offer: asObject(ctx.offer),
    pricing: asObject(ctx.pricing),
    brand_voice: asStringArray(ctx.brand_voice),
    tone: typeof ctx.tone === "string" && ctx.tone.trim() !== "" ? ctx.tone : null,
    constraints: asObject(ctx.constraints),
    excluded_industries: asStringArray(ctx.excluded_industries),
    excluded_lead_types: asStringArray(ctx.excluded_lead_types),
    preferred_channels: asStringArray(ctx.preferred_channels),
    monthly_meeting_target:
      typeof ctx.monthly_meeting_target === "number" && ctx.monthly_meeting_target > 0
        ? ctx.monthly_meeting_target
        : 20,
    available: false,
    missing_fields: [],
  };

  const required = ["business_name", "description", "products", "services", "target_audience"];
  normalized.missing_fields = required.filter((field) => {
    const value = normalized[field as keyof BusinessContext];
    if (Array.isArray(value)) return value.length === 0;
    return !value;
  });
  normalized.available = normalized.missing_fields.length < required.length;

  return normalized;
}

export async function buildBusinessContext(
  supabase: any,
  userId: string
): Promise<BusinessContext> {
  const [businessRow, settingsRow, profileRow] = await Promise.all([
    supabase.from("business_context").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("workspace_settings").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("profiles").select("company_name, website").eq("id", userId).maybeSingle(),
  ]);

  const merged: Record<string, any> = {};

  for (const field of BUSINESS_CONTEXT_FIELDS) {
    if (businessRow.data && businessRow.data[field] !== undefined && businessRow.data[field] !== null) {
      merged[field] = businessRow.data[field];
    }
  }

  if (!merged.business_name && settingsRow.data?.business_name) {
    merged.business_name = settingsRow.data.business_name;
  }
  if (!Array.isArray(merged.brand_voice) || merged.brand_voice.length === 0) {
    const legacyVoice = settingsRow.data?.brand_voice;
    if (Array.isArray(legacyVoice)) merged.brand_voice = legacyVoice;
    else if (typeof legacyVoice === "string" && legacyVoice.trim() !== "") merged.brand_voice = [legacyVoice];
  }
  if (!Array.isArray(merged.target_audience) || merged.target_audience.length === 0) {
    const legacyAudience = settingsRow.data?.target_audience;
    if (Array.isArray(legacyAudience)) merged.target_audience = legacyAudience;
  }
  if (!merged.business_name && profileRow.data?.company_name) {
    merged.business_name = profileRow.data.company_name;
  }
  if (profileRow.data?.website) {
    merged.website = profileRow.data.website;
  }

  return normalizeBusinessContext(merged);
}
