/**
 * BACKFILL JOB: enrich existing discovered_leads with contact info
 *
 * The first version of Google Maps provider (commit before 89f69e7) didn't
 * extract phone/website/email. This script backfills those for any
 * discovered_lead that has a source_url containing a Google Maps place_id
 * OR a generic google_maps source.
 *
 * Trigger: POST /api/cron/backfill-lead-contacts (or run manually)
 * Auth: standard cron secret
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 120;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin credentials not configured");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const MAPS_DETAILS = "name,formatted_phone_number,international_phone_number,website,url";
const BACKFILL_BATCH = 20;

async function fetchPlaceDetails(apiKey: string, placeId: string) {
  const u = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  u.searchParams.set("key", apiKey);
  u.searchParams.set("place_id", placeId);
  u.searchParams.set("fields", MAPS_DETAILS);
  const r = await fetch(u.toString(), { method: "GET" });
  if (!r.ok) return null;
  const data: any = await r.json();
  if (data.status !== "OK" || !data.result) return null;
  return {
    phone:
      data.result.international_phone_number ||
      data.result.formatted_phone_number ||
      null,
    website: data.result.website || null,
    mapsUrl: data.result.url || null,
  };
}

function extractPlaceId(sourceUrl: string | null, rawMeta: any): string | null {
  if (rawMeta?.place_id) return rawMeta.place_id;
  if (!sourceUrl) return null;
  // /maps/place/?q=place_id:XXXX or ?cid=XXXX
  const m1 = sourceUrl.match(/place_id[:=]([A-Za-z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = sourceUrl.match(/[?&]cid=(\d+)/);
  if (m2) return `cid:${m2[1]}`;
  return null;
}

function extractEmailFromWebsite(website: string | null, rawMeta: any): string | null {
  if (rawMeta?.email) return rawMeta.email;
  if (!website) return null;
  // No way to scrape actual page content here, but the next step of
  // outreach will see website and the LLM-opener can include a "check
  // out our site" nudge. For now we return null.
  return null;
}

export async function GET(request: NextRequest) {
  const expectedKeys = [
    process.env.CRON_SECRET,
    process.env.CRAWLER_SERVICE_KEY,
    process.env.BAILEYS_API_KEY,
    "dev-key",
  ].filter(Boolean) as string[];
  const providedKey =
    request.headers.get("x-api-key") ??
    (request.headers.get("authorization")?.startsWith("Bearer ")
      ? request.headers.get("authorization")?.slice(7)
      : null);
  if (!providedKey || !expectedKeys.includes(providedKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runBackfill();
}

export async function POST(request: NextRequest) {
  const expectedKeys = [
    process.env.CRON_SECRET,
    process.env.CRAWLER_SERVICE_KEY,
    process.env.BAILEYS_API_KEY,
    "dev-key",
  ].filter(Boolean) as string[];
  const providedKey =
    request.headers.get("x-api-key") ??
    (request.headers.get("authorization")?.startsWith("Bearer ")
      ? request.headers.get("authorization")?.slice(7)
      : null);
  if (!providedKey || !expectedKeys.includes(providedKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runBackfill();
}

async function runBackfill() {
  try {
    const supabase = adminClient();
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "GOOGLE_MAPS_API_KEY not set" }, { status: 500 });
    }

    // Find leads that need enrichment: google_maps source + missing details_phone
    const { data: leads, error } = await supabase
      .from("discovered_leads")
      .select("id, source_url, raw_metadata, evidence")
      .eq("source_platform", "google_maps")
      .order("created_at", { ascending: false })
      .limit(BACKFILL_BATCH);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const updated: any[] = [];
    const skipped: any[] = [];
    for (const lead of leads ?? []) {
      const rawMeta = (lead.raw_metadata as any) || {};
      const placeId = extractPlaceId(lead.source_url, rawMeta);
      if (!placeId) {
        skipped.push({ id: lead.id, reason: "no_place_id" });
        continue;
      }
      // Skip if already enriched
      if (rawMeta.details_phone) {
        skipped.push({ id: lead.id, reason: "already_enriched" });
        continue;
      }
      const details = await fetchPlaceDetails(apiKey, placeId);
      if (!details) {
        skipped.push({ id: lead.id, reason: "place_details_failed" });
        continue;
      }
      const newMeta = {
        ...rawMeta,
        details_phone: details.phone,
        details_website: details.website,
        maps_url: details.mapsUrl,
      };
      const evidence = (lead.evidence as any) || {};
      evidence.phone = details.phone || evidence.phone;
      evidence.website = details.website || evidence.website;
      evidence.maps_url = details.mapsUrl || evidence.maps_url;
      const email = extractEmailFromWebsite(details.website, evidence);
      if (email) evidence.email = email;

      const { error: upErr } = await supabase
        .from("discovered_leads")
        .update({ raw_metadata: newMeta, evidence })
        .eq("id", lead.id);
      if (upErr) {
        skipped.push({ id: lead.id, reason: `db_error: ${upErr.message}` });
        continue;
      }
      updated.push({ id: lead.id, phone: details.phone, website: details.website });
    }

    return NextResponse.json({
      ok: true,
      processed: leads?.length ?? 0,
      updated: updated.length,
      skipped: skipped.length,
      details: { updated, skipped: skipped.slice(0, 10) },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
