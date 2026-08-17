-- ============================================================
-- DATABUKS - LEAD DISCOVERY SYSTEM MIGRATION
-- Idempotent — safe to re-run. Additive only.
-- ============================================================

-- 1. DISCOVERY SOURCES (tracks each discovery source configuration)
CREATE TABLE IF NOT EXISTS public.discovery_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'own_account',
  source_identifier TEXT,
  discovery_method TEXT NOT NULL DEFAULT 'provider_api',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  sync_cursor TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.discovery_sources ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own discovery sources" ON public.discovery_sources FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own discovery sources" ON public.discovery_sources FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_discovery_sources_user ON public.discovery_sources(user_id, platform);

-- 2. DISCOVERED LEADS (normalized lead candidates from all sources)
CREATE TABLE IF NOT EXISTS public.discovered_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_platform TEXT NOT NULL,
  source_url TEXT,
  source_content TEXT,
  source_content_type TEXT,
  external_author_id TEXT,
  author_name TEXT,
  author_handle TEXT,
  author_profile_url TEXT,
  detected_requirement TEXT,
  business_context_match TEXT,
  relevance_score INTEGER DEFAULT 0,
  intent_score INTEGER DEFAULT 0,
  lead_score INTEGER DEFAULT 0,
  urgency_score INTEGER DEFAULT 0,
  confidence REAL DEFAULT 0,
  evidence JSONB DEFAULT '{}'::jsonb,
  recommended_next_action TEXT,
  conversation_stage TEXT NOT NULL DEFAULT 'DISCOVER' CHECK (
    conversation_stage IN (
      'DISCOVER','QUALIFY','CONVERSATION','NURTURE',
      'INTEREST_CONFIRMED','MEETING_INTENT','WHATSAPP_HANDOFF','MEETING','CLOSED','IGNORED'
    )
  ),
  conversation_summary TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  total_messages INTEGER NOT NULL DEFAULT 0,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  discovery_source_id UUID REFERENCES public.discovery_sources(id) ON DELETE SET NULL,
  cooldown_until TIMESTAMPTZ,
  closed_reason TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.discovered_leads ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own discovered leads" ON public.discovered_leads FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own discovered leads" ON public.discovered_leads FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_discovered_leads_idempotency ON public.discovered_leads(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_discovered_leads_user_stage ON public.discovered_leads(user_id, conversation_stage, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovered_leads_author ON public.discovered_leads(user_id, source_platform, external_author_id);
CREATE INDEX IF NOT EXISTS idx_discovered_leads_score ON public.discovered_leads(user_id, lead_score DESC);

-- 3. PLATFORM CAPABILITIES (runtime capability registry per platform/account)
CREATE TABLE IF NOT EXISTS public.platform_capabilities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  account_id TEXT,
  provider TEXT NOT NULL DEFAULT 'composio',
  connected BOOLEAN NOT NULL DEFAULT false,
  can_read_posts BOOLEAN NOT NULL DEFAULT false,
  can_read_comments BOOLEAN NOT NULL DEFAULT false,
  can_read_media BOOLEAN NOT NULL DEFAULT false,
  can_search_discovery BOOLEAN NOT NULL DEFAULT false,
  can_read_messages BOOLEAN NOT NULL DEFAULT false,
  can_send_messages BOOLEAN NOT NULL DEFAULT false,
  can_reply_comments BOOLEAN NOT NULL DEFAULT false,
  can_publish_posts BOOLEAN NOT NULL DEFAULT false,
  can_like BOOLEAN NOT NULL DEFAULT false,
  can_follow BOOLEAN NOT NULL DEFAULT false,
  capability_status TEXT NOT NULL DEFAULT 'UNAVAILABLE' CHECK (
    capability_status IN ('AVAILABLE','SUPPORTED_BUT_NOT_CONNECTED','SUPPORTED_BUT_NOT_VERIFIED','UNAVAILABLE')
  ),
  verified_capabilities JSONB DEFAULT '{}'::jsonb,
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.platform_capabilities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own platform capabilities" ON public.platform_capabilities FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own platform capabilities" ON public.platform_capabilities FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_capabilities_unique ON public.platform_capabilities(user_id, platform) WHERE account_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_capabilities_account ON public.platform_capabilities(user_id, platform, account_id) WHERE account_id IS NOT NULL;

-- 4. CONVERSATION THREADS (cross-platform conversation tracking for discovered leads)
CREATE TABLE IF NOT EXISTS public.conversation_threads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discovered_lead_id UUID NOT NULL REFERENCES public.discovered_leads(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  thread_id TEXT,
  messages JSONB DEFAULT '[]'::jsonb,
  total_messages INTEGER NOT NULL DEFAULT 0,
  last_agent_message_at TIMESTAMPTZ,
  last_user_message_at TIMESTAMPTZ,
  loop_prevention_hash TEXT,
  max_turns_reached BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.conversation_threads ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own conversation threads" ON public.conversation_threads FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own conversation threads" ON public.conversation_threads FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_threads_lead ON public.conversation_threads(discovered_lead_id, platform);
CREATE INDEX IF NOT EXISTS idx_conversation_threads_user ON public.conversation_threads(user_id, platform, updated_at DESC);

-- 5. ADDITIVE COLUMNS ON EXISTING TABLES (safe — uses IF NOT EXISTS pattern)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS source_platform TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS discovery_source_id UUID REFERENCES public.discovery_sources(id) ON DELETE SET NULL;
ALTER TABLE public.opportunities ADD COLUMN IF NOT EXISTS discovered_lead_id UUID REFERENCES public.discovered_leads(id) ON DELETE SET NULL;

-- DONE
