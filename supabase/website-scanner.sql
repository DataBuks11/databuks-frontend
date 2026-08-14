-- ============================================================
-- DATABUKS - PUBLIC WEB INTELLIGENCE SCANNER MIGRATION
-- Run in Supabase SQL Editor. Idempotent - safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.website_scans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (
    status IN ('QUEUED','SCANNING','EXTRACTING','ANALYZING','COMPLETED','PARTIAL','FAILED')
  ),
  pages_crawled INTEGER NOT NULL DEFAULT 0,
  results JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  context_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.website_scans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own website scans" ON public.website_scans
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can manage own website scans" ON public.website_scans
    FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_website_scans_user_created ON public.website_scans(user_id, created_at DESC);

-- DONE
