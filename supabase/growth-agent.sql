-- ============================================================
-- DATABUKS - UNIFIED AI GROWTH AGENT (idempotent)
-- ============================================================

-- 1. OPPORTUNITIES (unified lead-discovery queue across channels)
CREATE TABLE IF NOT EXISTS public.opportunities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  source TEXT NOT NULL,
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'OTHER',
  external_event_id TEXT,
  actor_id TEXT,
  actor_name TEXT,
  actor_handle TEXT,
  content TEXT,
  source_url TEXT,
  parent_content TEXT,
  timestamp TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  relevance_score INTEGER,
  intent_score INTEGER,
  lead_score INTEGER,
  urgency_score INTEGER,
  confidence REAL,
  detected_requirement TEXT,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (
    status IN ('NEW','ANALYZING','QUALIFIED','CONVERSING','NURTURING','MEETING_INTENT','MEETING_BOOKED','CONVERTED','LOST','IGNORED','ESCALATED','HANDOFF_READY')
  ),
  recommended_next_action TEXT,
  evidence JSONB DEFAULT '{}'::jsonb,
  conversation_summary TEXT,
  requirements JSONB DEFAULT '[]'::jsonb,
  objections JSONB DEFAULT '[]'::jsonb,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own opportunities" ON public.opportunities FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own opportunities" ON public.opportunities FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunities_idempotency ON public.opportunities(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_user_status ON public.opportunities(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opportunities_actor ON public.opportunities(user_id, channel, actor_id);

-- 2. LEAD CONVERSATION MEMORY (per-lead compact memory)
CREATE TABLE IF NOT EXISTS public.lead_conversation_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL UNIQUE REFERENCES public.leads(id) ON DELETE CASCADE,
  business_need TEXT,
  desired_outcome TEXT,
  services_discussed JSONB DEFAULT '[]'::jsonb,
  budget TEXT,
  urgency TEXT,
  objections JSONB DEFAULT '[]'::jsonb,
  preferences JSONB DEFAULT '[]'::jsonb,
  previous_questions JSONB DEFAULT '[]'::jsonb,
  conversation_summary TEXT,
  previous_promises JSONB DEFAULT '[]'::jsonb,
  meeting_status TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.lead_conversation_memory ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own lead memory" ON public.lead_conversation_memory FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own lead memory" ON public.lead_conversation_memory FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. HUMAN HANDOFF CHECKPOINTS (approval before meeting stage)
CREATE TABLE IF NOT EXISTS public.handoff_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  platform TEXT,
  profile_url TEXT,
  original_requirement TEXT,
  intent TEXT,
  lead_score INTEGER,
  conversation_summary TEXT,
  requirements JSONB DEFAULT '[]'::jsonb,
  objections JSONB DEFAULT '[]'::jsonb,
  evidence JSONB DEFAULT '{}'::jsonb,
  recommended_next_step TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','DEFERRED')),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.handoff_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own handoffs" ON public.handoff_requests FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own handoffs" ON public.handoff_requests FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_handoffs_user_status ON public.handoff_requests(user_id, status, created_at DESC);

-- DONE
