-- ============================================================
-- DATABUKS - AI SALES AGENT FOUNDATION MIGRATION
-- Run in Supabase SQL Editor. Idempotent - safe to re-run.
-- Adds funnel state machine, AI intelligence, audit and meeting
-- foundation to the existing schema. Does NOT alter existing
-- tables beyond minimal additive columns.
-- ============================================================

-- 1. LEADS: canonical funnel stage + opt-out flag (additive)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS funnel_stage TEXT NOT NULL DEFAULT 'DISCOVERED';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS opted_out BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.leads ADD CONSTRAINT leads_funnel_stage_check CHECK (
    funnel_stage IN (
      'DISCOVERED','ENRICHED','QUALIFIED','PRIORITIZED','OUTREACH_READY',
      'CONTACTED','CONVERSATION','MEETING_INTENT','MEETING_BOOKED',
      'MEETING_HELD','WON','LOST'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE public.leads SET funnel_stage = CASE status
  WHEN 'converted' THEN 'WON'
  WHEN 'lost' THEN 'LOST'
  WHEN 'qualified' THEN 'QUALIFIED'
  WHEN 'contacted' THEN 'CONTACTED'
  WHEN 'nurturing' THEN 'ENRICHED'
  ELSE 'DISCOVERED'
END
WHERE funnel_stage = 'DISCOVERED' AND status IN ('converted','lost','qualified','contacted','nurturing');

CREATE INDEX IF NOT EXISTS idx_leads_funnel_stage ON public.leads(user_id, funnel_stage);

-- 2. CONVERSATIONS: link to lead (additive)
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON public.conversations(lead_id);

-- 3. MESSAGES: idempotency key (additive)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_idempotency ON public.messages(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 4. BUSINESS CONTEXT
CREATE TABLE IF NOT EXISTS public.business_context (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT,
  description TEXT,
  products JSONB DEFAULT '[]'::jsonb,
  services JSONB DEFAULT '[]'::jsonb,
  target_audience JSONB DEFAULT '[]'::jsonb,
  ideal_customer_profile JSONB DEFAULT '{}'::jsonb,
  locations JSONB DEFAULT '[]'::jsonb,
  industries JSONB DEFAULT '[]'::jsonb,
  offer JSONB DEFAULT '{}'::jsonb,
  pricing JSONB DEFAULT '{}'::jsonb,
  brand_voice JSONB DEFAULT '[]'::jsonb,
  tone TEXT,
  constraints JSONB DEFAULT '{}'::jsonb,
  excluded_industries JSONB DEFAULT '[]'::jsonb,
  excluded_lead_types JSONB DEFAULT '[]'::jsonb,
  preferred_channels JSONB DEFAULT '[]'::jsonb,
  monthly_meeting_target INTEGER NOT NULL DEFAULT 20,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.business_context ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own business context" ON public.business_context FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own business context" ON public.business_context FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. LEAD INTELLIGENCE
CREATE TABLE IF NOT EXISTS public.lead_intelligence (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL UNIQUE REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  icp_fit_score INTEGER,
  intent_score INTEGER,
  urgency_score INTEGER,
  buying_signal_score INTEGER,
  problem_severity_score INTEGER,
  timing_score INTEGER,
  reachability_score INTEGER,
  evidence_quality_score INTEGER,
  overall_score INTEGER,
  confidence REAL,
  why_now TEXT,
  evidence JSONB DEFAULT '[]'::jsonb,
  recommended_channel TEXT,
  recommended_action TEXT,
  model_name TEXT,
  model_version TEXT,
  prompt_version TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.lead_intelligence ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own lead intelligence" ON public.lead_intelligence FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own lead intelligence" ON public.lead_intelligence FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_lead_intelligence_user_id ON public.lead_intelligence(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_intelligence_overall ON public.lead_intelligence(user_id, overall_score DESC);

-- 6. AI DECISIONS (audit trail)
CREATE TABLE IF NOT EXISTS public.ai_decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL,
  model TEXT,
  model_version TEXT,
  prompt_version TEXT,
  input_context JSONB DEFAULT '{}'::jsonb,
  output JSONB DEFAULT '{}'::jsonb,
  ai_decision TEXT,
  rule_result JSONB DEFAULT '{}'::jsonb,
  action TEXT,
  action_status TEXT,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.ai_decisions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own AI decisions" ON public.ai_decisions FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can insert own AI decisions" ON public.ai_decisions FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_ai_decisions_user_task ON public.ai_decisions(user_id, task_type);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_lead ON public.ai_decisions(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_created ON public.ai_decisions(user_id, created_at DESC);

-- 7. FUNNEL EVENTS
CREATE TABLE IF NOT EXISTS public.funnel_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_stage TEXT,
  to_stage TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own funnel events" ON public.funnel_events FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can insert own funnel events" ON public.funnel_events FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_funnel_events_main ON public.funnel_events(user_id, lead_id, event_type, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_funnel_events_idempotency ON public.funnel_events(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 8. AI TASKS
CREATE TABLE IF NOT EXISTS public.ai_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED','BLOCKED')),
  input JSONB DEFAULT '{}'::jsonb,
  output JSONB DEFAULT '{}'::jsonb,
  model TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  idempotency_key TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.ai_tasks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own AI tasks" ON public.ai_tasks FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own AI tasks" ON public.ai_tasks FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_ai_tasks_user_status ON public.ai_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_user_type ON public.ai_tasks(user_id, task_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_tasks_idempotency ON public.ai_tasks(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 9. MEETINGS
CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','scheduled','confirmed','held','cancelled','no_show')),
  scheduled_at TIMESTAMPTZ,
  duration_minutes INTEGER DEFAULT 30,
  medium TEXT CHECK (medium IN ('call','video','in_person','chat')),
  location TEXT,
  notes TEXT,
  idempotency_key TEXT,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view own meetings" ON public.meetings FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own meetings" ON public.meetings FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_meetings_user_status ON public.meetings(user_id, status);
CREATE INDEX IF NOT EXISTS idx_meetings_lead ON public.meetings(lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_idempotency ON public.meetings(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- DONE
