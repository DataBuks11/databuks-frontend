// Minimal debug route - just returns success
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  return NextResponse.json({ ok: true, env: { has_maps_key: !!process.env.GOOGLE_MAPS_API_KEY, maps_key_length: process.env.GOOGLE_MAPS_API_KEY?.length ?? 0 } });
}

export async function POST(request: NextRequest) {
  return NextResponse.json({ ok: true, env: { has_maps_key: !!process.env.GOOGLE_MAPS_API_KEY, maps_key_length: process.env.GOOGLE_MAPS_API_KEY?.length ?? 0 } });
}
