-- ============================================================
-- DATABUKS - CRAWLER SERVICE UPGRADE (Crawl4AI rendering)
-- Run in Supabase SQL Editor. Idempotent - safe to re-run.
-- ============================================================

-- Per-page rendering/extraction metrics (additive)
ALTER TABLE public.website_scan_pages ADD COLUMN IF NOT EXISTS rendered BOOLEAN DEFAULT false;
ALTER TABLE public.website_scan_pages ADD COLUMN IF NOT EXISTS render_method TEXT;
ALTER TABLE public.website_scan_pages ADD COLUMN IF NOT EXISTS word_count INTEGER DEFAULT 0;
ALTER TABLE public.website_scan_pages ADD COLUMN IF NOT EXISTS links_found INTEGER DEFAULT 0;
ALTER TABLE public.website_scan_pages ADD COLUMN IF NOT EXISTS final_url TEXT;
ALTER TABLE public.website_scan_pages ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE public.website_scan_pages ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.website_scan_pages ADD COLUMN IF NOT EXISTS emails JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.website_scan_pages ADD COLUMN IF NOT EXISTS phones JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.website_scan_pages ADD COLUMN IF NOT EXISTS structured_data JSONB DEFAULT '[]'::jsonb;

-- Scan-level rendering metric (additive)
ALTER TABLE public.website_scans ADD COLUMN IF NOT EXISTS pages_rendered INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_scan_pages_rendered ON public.website_scan_pages(scan_id, rendered);

-- DONE
