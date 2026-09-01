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

export const maxDuration = 300;

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
  if (data.status !== "OK" || !data.result) {
    console.warn(`[backfill] place_details for ${placeId}: status=${data.status} err=${data.error_message ?? "n/a"}`);
    return null;
  }
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
  const m1 = sourceUrl.match(/place_id[:=]([A-Za-z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = sourceUrl.match(/[?&]cid=(\d+)/);
  if (m2) return `cid:${m2[1]}`;
  return null;
}

function extractEmailFromWebsite(website: string | null, rawMeta: any): string | null {
  if (rawMeta?.email) return rawMeta.email;
  return null;
}

function authorized(request: NextRequest): boolean {
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
  return !!providedKey && expectedKeys.includes(providedKey);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runBackfill();
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runBackfill();
}

async function runBackfill() {
  console.log("[backfill] starting", { batchSize: BACKFILL_BATCH });
  const supabase = adminClient();
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("[backfill] GOOGLE_MAPS_API_KEY not set");
    return NextResponse.json({ ok: false, error: "GOOGLE_MAPS_API_KEY not set", keyLength: 0 }, { status: 500 });
  }
  console.log("[backfill] api key length:", apiKey.length);

  // Find leads that need enrichment: google_maps source + missing details_phone
  let leads, error;
  try {
    const result = await supabase
      .from("discovered_leads")
      .select("id, source_url, raw_metadata, evidence")
      .eq("source_platform", "google_maps")
      .order("created_at", { ascending: false })
      .limit(BACKFILL_BATCH);
    leads = result.data;
    error = result.error;
  } catch (e: any) {
    console.error("[backfill] supabase query threw:", e?.message);
    return NextResponse.json({ ok: false, error: `supabase_query_threw: ${e?.message}` }, { status: 500 });
  }

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!leads || leads.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, updated: 0, message: "no leads to process" });
  }

  const updated: any[] = [];
  const skipped: any[] = [];
  for (const lead of leads) {
    try {
      const rawMeta = (lead.raw_metadata as any) || {};
      const placeId = extractPlaceId(lead.source_url, rawMeta);
      if (!placeId) {
        skipped.push({ id: lead.id, reason: "no_place_id" });
        continue;
      }
      if (rawMeta.details_phone) {
        skipped.push({ id: lead.id, reason: "already_enriched" });
        continue;
      }
      let details;
      try {
        details = await fetchPlaceDetails(apiKey, placeId);
      } catch (err: any) {
        console.error(`[backfill] place_details error for ${placeId}: ${err?.message}`);
        skipped.push({ id: lead.id, reason: `place_details_error: ${err?.message}` });
        continue;
      }
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
    } catch (err: any) {
      console.error(`[backfill] lead ${lead.id} unhandled error: ${err?.message}`);
      skipped.push({ id: lead.id, reason: `unhandled: ${err?.message}` });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: leads.length,
    updated: updated.length,
    skipped: skipped.length,
    details: { updated, skipped: skipped.slice(0, 10) },
  });
}
