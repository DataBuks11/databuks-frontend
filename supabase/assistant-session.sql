-- Persistent state for owner-assistant multi-step conversations
-- (e.g. "aaj kitne post?" -> user replies 3 -> generate 3 posts)
-- When a new conversation starts, the row is created; when the flow ends
-- (posts generated, outreach sent, etc.) the state resets to 'idle'.

CREATE TABLE IF NOT EXISTS public.assistant_session (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'idle'
    CHECK (state IN ('idle', 'awaiting_post_count', 'generating_posts', 'awaiting_outreach_count', 'doing_outreach')),
  data JSONB DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '24 hours'),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_session_state
  ON public.assistant_session (state, updated_at DESC)
  WHERE state <> 'idle';
