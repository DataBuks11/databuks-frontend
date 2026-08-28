-- Add remote_jid and lead_id to conversations so the dashboard chat
-- can send messages via Baileys to the actual WhatsApp number.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS remote_jid TEXT,
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

-- Index for fast lookup when sending
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON public.conversations (lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_remote_jid ON public.conversations (remote_jid);
