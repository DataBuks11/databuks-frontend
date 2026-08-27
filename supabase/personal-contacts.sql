-- Personal contacts whitelist — contacts the AI should NEVER auto-reply to.
-- Users can add friends, family, colleagues here via dashboard.

CREATE TABLE IF NOT EXISTS personal_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jid TEXT,           -- WhatsApp JID (e.g. "223656244441296@lid")
  phone TEXT,         -- Phone digits (e.g. "918788606608")
  name TEXT,          -- Display name (optional)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup during webhook processing
CREATE INDEX IF NOT EXISTS idx_personal_contacts_user_id ON personal_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_contacts_jid ON personal_contacts(user_id, jid);
CREATE INDEX IF NOT EXISTS idx_personal_contacts_phone ON personal_contacts(user_id, phone);

-- RLS
ALTER TABLE personal_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own contacts"
  ON personal_contacts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow service role full access
CREATE POLICY "Service role full access"
  ON personal_contacts FOR ALL
  USING (auth.role() = 'service_role');
