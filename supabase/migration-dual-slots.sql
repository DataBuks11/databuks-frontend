-- ============================================
-- DATABUKS - DUAL WHATSAPP SLOTS MIGRATION
-- Business + Personal numbers simultaneously
-- Supabase SQL Editor me ek baar run karo (idempotent)
-- ============================================

-- 1. whatsapp_sessions me slot column (business / personal)
ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS slot TEXT NOT NULL DEFAULT 'business';

-- 2. Purana single-column UNIQUE(user_id) hatao (nahi to 2nd slot insert fail hoga),
--    uski jagah UNIQUE(user_id, slot) lagao
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.whatsapp_sessions'::regclass
      AND c.contype = 'u'
    GROUP BY c.conname
    HAVING count(*) = 1 AND max(a.attname::text) = 'user_id'
  LOOP
    EXECUTE format('ALTER TABLE public.whatsapp_sessions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DO $$ BEGIN
  ALTER TABLE public.whatsapp_sessions
    ADD CONSTRAINT whatsapp_sessions_user_slot_unique UNIQUE (user_id, slot);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. whatsapp_messages me slot column (kaunsa number / kaunsa engine)
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS slot TEXT NOT NULL DEFAULT 'business';

CREATE INDEX IF NOT EXISTS idx_wa_messages_user_slot
  ON public.whatsapp_messages(user_id, slot);

-- DONE. Verify:
-- SELECT user_id, slot, connected, phone_number FROM public.whatsapp_sessions;
