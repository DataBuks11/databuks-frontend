-- Personal WhatsApp assistant fields for each user.
-- Only the special admin user (databuksllc@gmail.com) is allowed to
-- use the personal assistant; the dashboard enforces this via RBAC checks.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS personal_whatsapp_jid TEXT,
  ADD COLUMN IF NOT EXISTS personal_assistant_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS assistant_mode TEXT DEFAULT 'business'
    CHECK (assistant_mode IN ('business','personal')),
  ADD COLUMN IF NOT EXISTS assistant_mode_updated_at TIMESTAMPTZ DEFAULT now();
