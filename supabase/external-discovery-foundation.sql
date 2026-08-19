-- ============================================================
-- DATABUKS - EXTERNAL DISCOVERY FOUNDATION COMPATIBILITY
-- Additive reconciliation for discovery routes already deployed.
-- Safe to run after the existing AI/growth/discovery migrations.
-- ============================================================

-- Discovery handoff route compatibility. These fields are used by the
-- discovery handoff APIs but were not included in the original migration.
ALTER TABLE public.handoff_requests
  ADD COLUMN IF NOT EXISTS discovered_lead_id UUID REFERENCES public.discovered_leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS context JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_handoff_requests_discovered_lead
  ON public.handoff_requests(user_id, discovered_lead_id)
  WHERE discovered_lead_id IS NOT NULL;

-- `processed` remains the legacy boolean; `processing_status` records the
-- richer lifecycle used by the current processor without changing old rows.
ALTER TABLE public.social_events
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'RECEIVED';

CREATE INDEX IF NOT EXISTS idx_social_events_processing_status
  ON public.social_events(user_id, processing_status, created_at DESC);

