-- ============================================================
-- DATABUKS - SOCIAL AI AGENT FOUNDATION
-- Run in Supabase SQL Editor. Idempotent - safe to re-run.
-- ============================================================

-- 1. SOCIAL EVENTS (normalized incoming social activity)
CREATE TABLE IF NOT EXISTS public.social_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  account_id TEXT,
  external_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  author_id TEXT,
  author_name TEXT,
  post_id TEXT,
  comment_id TEXT,
  content TEXT,
  url TEXT,
  timestamp TIMESTAMPTZ,
  raw_reference JSONB DEFAULT '{}'::jsonb,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.social_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own social events" ON public.social_events FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own social events" ON public.social_events FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_events_external ON public.social_events(user_id, provider, external_event_id);
CREATE INDEX IF NOT EXISTS idx_social_events_user_time ON public.social_events(user_id, created_at DESC);

-- 2. SOCIAL ACTIONS (audited AI-driven provider actions)
CREATE TABLE IF NOT EXISTS public.social_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  account_id TEXT,
  action_type TEXT NOT NULL,
  target_id TEXT,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','EXECUTING','SUCCESS','FAILED','BLOCKED','SKIPPED')),
  provider_response JSONB DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  ai_decision_id UUID,
  idempotency_key TEXT,
  requested_at TIMESTAMPTZ DEFAULT now(),
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.social_actions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own social actions" ON public.social_actions FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own social actions" ON public.social_actions FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_actions_idempotency ON public.social_actions(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_actions_user_time ON public.social_actions(user_id, created_at DESC);

-- 3. SOCIAL POSTS / CONTENT ITEMS
CREATE TABLE IF NOT EXISTS public.social_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  account_id TEXT,
  content_type TEXT NOT NULL DEFAULT 'post',
  topic TEXT,
  draft TEXT,
  caption TEXT,
  hashtags JSONB DEFAULT '[]'::jsonb,
  cta TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEW','APPROVED','SCHEDULED','PUBLISHING','PUBLISHED','FAILED','REJECTED')),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  provider_post_id TEXT,
  ai_decision_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own social posts" ON public.social_posts FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own social posts" ON public.social_posts FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_social_posts_user_status ON public.social_posts(user_id, status);

-- 4. SOCIAL LEAD SIGNALS (evidence of lead interest from social activity)
CREATE TABLE IF NOT EXISTS public.social_lead_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  account_id TEXT,
  event_id TEXT,
  signal_type TEXT NOT NULL,
  intent_score REAL,
  lead_score INTEGER,
  sentiment TEXT,
  evidence JSONB DEFAULT '{}'::jsonb,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.social_lead_signals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own lead signals" ON public.social_lead_signals FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own lead signals" ON public.social_lead_signals FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_lead_signals_user ON public.social_lead_signals(user_id, created_at DESC);

-- DONE
