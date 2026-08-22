-- ============================================================
-- DATABUKS - EXTERNAL LEAD DISCOVERY (idempotent)
-- ============================================================

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
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.canonical_businesses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own businesses" ON public.canonical_businesses FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own businesses" ON public.canonical_businesses FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_identity ON public.canonical_businesses(user_id, identity_key);
CREATE INDEX IF NOT EXISTS idx_canonical_domain ON public.canonical_businesses(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_canonical_updated ON public.canonical_businesses(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.discovery_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','COMPLETED','PARTIAL','FAILED')),
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
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.discovery_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own discovery runs" ON public.discovery_runs FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own discovery runs" ON public.discovery_runs FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_discovery_runs_user ON public.discovery_runs(user_id, created_at DESC);
