-- Track personal-assistant mode per user (default: business mode)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assistant_mode TEXT DEFAULT 'business'
    CHECK (assistant_mode IN ('business','personal')),
  ADD COLUMN IF NOT EXISTS assistant_mode_updated_at TIMESTAMPTZ DEFAULT now();
