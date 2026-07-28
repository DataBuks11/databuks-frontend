-- WhatsApp Messages table for AI agent access
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  remote_jid TEXT NOT NULL,
  from_me BOOLEAN DEFAULT false,
  message_id TEXT,
  message_type TEXT DEFAULT 'text',
  message_text TEXT,
  timestamp TIMESTAMPTZ DEFAULT now(),
  push_name TEXT,
  raw_data JSONB,
  processed BOOLEAN DEFAULT false,
  ai_response TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast AI agent queries
CREATE INDEX IF NOT EXISTS idx_wa_messages_user_id ON public.whatsapp_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_remote_jid ON public.whatsapp_messages(user_id, remote_jid);
CREATE INDEX IF NOT EXISTS idx_wa_messages_timestamp ON public.whatsapp_messages(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_wa_messages_unprocessed ON public.whatsapp_messages(user_id, processed) WHERE processed = false;

-- RLS
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view own messages" ON public.whatsapp_messages
    FOR SELECT USING (auth.uid() = user_id);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service can manage messages" ON public.whatsapp_messages
    FOR ALL USING (true);
  EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
