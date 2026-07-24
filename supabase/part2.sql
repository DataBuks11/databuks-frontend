-- PART 2: Telegram Bots Table

CREATE TABLE IF NOT EXISTS public.telegram_bots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  bot_token TEXT NOT NULL,
  bot_id BIGINT,
  bot_username TEXT,
  bot_name TEXT,
  connected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.telegram_bots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "Users can view own telegram bot" ON public.telegram_bots FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can manage own telegram bot" ON public.telegram_bots FOR ALL USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
