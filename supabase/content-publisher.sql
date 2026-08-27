-- Content auto-publishing support (additive, safe migration)
-- Run in Supabase SQL editor.

ALTER TABLE public.content ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.content ADD COLUMN IF NOT EXISTS publish_error TEXT;

CREATE INDEX IF NOT EXISTS content_scheduled_due_idx
  ON public.content (scheduled_date)
  WHERE status = 'scheduled';
