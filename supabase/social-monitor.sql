-- ============================================================
-- DATABUKS - SOCIAL MONITORING PHASE (idempotent)
-- ============================================================

ALTER TABLE public.social_events ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'RECEIVED';
DO $$ BEGIN
  ALTER TABLE public.social_events DROP CONSTRAINT IF EXISTS social_events_processing_check;
  ALTER TABLE public.social_events ADD CONSTRAINT social_events_processing_check CHECK (
    processing_status IN ('RECEIVED','PROCESSING','PROCESSED','IGNORED','FAILED')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_social_events_processing ON public.social_events(user_id, processing_status, created_at);
CREATE INDEX IF NOT EXISTS idx_social_events_author ON public.social_events(user_id, provider, author_id, created_at);
