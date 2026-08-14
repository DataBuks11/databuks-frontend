-- ============================================================
-- DATABUKS - COMPREHENSIVE WEBSITE SCANNER UPGRADE
-- Run in Supabase SQL Editor. Idempotent - safe to re-run.
-- Adds per-page storage + progress tracking to website_scans.
-- ============================================================

-- 1. Progress columns on website_scans (additive)
ALTER TABLE public.website_scans ADD COLUMN IF NOT EXISTS pages_discovered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.website_scans ADD COLUMN IF NOT EXISTS pages_scanned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.website_scans ADD COLUMN IF NOT EXISTS analysis_mode TEXT;

-- 2. website_scan_pages (per-page crawl records)
CREATE TABLE IF NOT EXISTS public.website_scan_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES public.website_scans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  canonical_url TEXT,
  page_title TEXT,
  page_type TEXT,
  depth INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'crawled' CHECK (
    status IN ('crawled','failed','duplicate','disallowed','depth_limited')
  ),
  http_status INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.website_scan_pages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own scan pages" ON public.website_scan_pages
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can manage own scan pages" ON public.website_scan_pages
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_scan_pages_scan ON public.website_scan_pages(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_pages_user ON public.website_scan_pages(user_id, created_at DESC);

-- DONE
