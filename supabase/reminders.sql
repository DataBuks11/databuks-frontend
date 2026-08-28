-- Reminders / scheduled follow-ups table
-- Stores pending reminders that the cron route picks up and sends via Baileys.

CREATE TABLE IF NOT EXISTS public.reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  remote_jid TEXT NOT NULL,
  message_text TEXT NOT NULL,
  send_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for the cron: fast lookup of pending reminders due now
CREATE INDEX IF NOT EXISTS idx_reminders_due
  ON public.reminders (send_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_reminders_user
  ON public.reminders (user_id, status);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own reminders"
    ON public.reminders FOR SELECT USING (auth.uid() = user_id);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access on reminders"
    ON public.reminders FOR ALL USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
