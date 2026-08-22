-- ============================================================
-- DATABUKS - EXTERNAL LEAD DISCOVERY (idempotent)
-- Handles pre-existing tables from earlier sessions by adding
-- missing columns via ALTER TABLE.
-- ============================================================

-- 1. CANONICAL BUSINESSES
CREATE TABLE IF NOT EXISTS public.canonical_businesses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_key TEXT NOT NULL,
  business_name TEXT NOT NULL,
  business_category TEXT,
  domain TEXT,
  website_url TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  address TEXT,
  phones JSONB DEFAULT '[]'::jsonb,
  emails JSONB DEFAULT '[]'::jsonb,
  instagram_url TEXT,
  facebook_url TEXT,
  linkedin_url TEXT,
  rating REAL,
  review_count INTEGER,
  source_records JSONB DEFAULT '[]'::jsonb,
  evidence JSONB DEFAULT '[]'::jsonb,
  enriched BOOLEAN DEFAULT false,
  enrichment_data JSONB DEFAULT '{}'::jsonb,
  discovered_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.canonical_businesses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own businesses" ON public.canonical_businesses FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own businesses" ON public.canonical_businesses FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS identity_key TEXT;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS business_category TEXT;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS phones JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS emails JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS facebook_url TEXT;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS rating REAL;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS review_count INTEGER;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS source_records JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS evidence JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS enriched BOOLEAN DEFAULT false;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS enrichment_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.canonical_businesses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_identity ON public.canonical_businesses(user_id, identity_key);
CREATE INDEX IF NOT EXISTS idx_canonical_domain ON public.canonical_businesses(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_canonical_updated ON public.canonical_businesses(user_id, updated_at DESC);

-- 2. DISCOVERY RUNS
CREATE TABLE IF NOT EXISTS public.discovery_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  providers_attempted JSONB DEFAULT '[]'::jsonb,
  providers_successful JSONB DEFAULT '[]'::jsonb,
  providers_failed JSONB DEFAULT '[]'::jsonb,
  queries_generated INTEGER DEFAULT 0,
  raw_candidates INTEGER DEFAULT 0,
  normalized_count INTEGER DEFAULT 0,
  canonical_count INTEGER DEFAULT 0,
  enriched_count INTEGER DEFAULT 0,
  qualified_count INTEGER DEFAULT 0,
  needs_review_count INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.discovery_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own discovery runs" ON public.discovery_runs FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own discovery runs" ON public.discovery_runs FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.discovery_runs ADD COLUMN IF NOT EXISTS providers_attempted JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.discovery_runs ADD COLUMN IF NOT EXISTS providers_successful JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.discovery_runs ADD COLUMN IF NOT EXISTS providers_failed JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.discovery_runs ADD COLUMN IF NOT EXISTS queries_generated INTEGER DEFAULT 0;
ALTER TABLE public.discovery_runs ADD COLUMN IF NOT EXISTS raw_candidates INTEGER DEFAULT 0;
ALTER TABLE public.discovery_runs ADD COLUMN IF NOT EXISTS normalized_count INTEGER DEFAULT 0;
ALTER TABLE public.discovery_runs ADD COLUMN IF NOT EXISTS canonical_count INTEGER DEFAULT 0;
ALTER TABLE public.discovery_runs ADD COLUMN IF NOT EXISTS enriched_count INTEGER DEFAULT 0;
ALTER TABLE public.discovery_runs ADD COLUMN IF NOT EXISTS qualified_count INTEGER DEFAULT 0;
ALTER TABLE public.discovery_runs ADD COLUMN IF NOT EXISTS needs_review_count INTEGER DEFAULT 0;
ALTER TABLE public.discovery_runs ADD COLUMN IF NOT EXISTS errors JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.discovery_runs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE public.discovery_runs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.discovery_runs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_discovery_runs_user ON public.discovery_runs(user_id, created_at DESC);
