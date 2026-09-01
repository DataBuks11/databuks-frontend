-- Daily AI post generation preferences (Phase 1 of "user as personal assistant" flow)
-- The user (Piyush) sets:
--   daily_post_count  — how many posts AI should auto-generate per day (1-10)
--   daily_post_time   — what time to generate + send to WhatsApp for approval
--   post_preferences   — style, topics, tone, do-not-mention list
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_post_count INTEGER DEFAULT 3 CHECK (daily_post_count BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS daily_post_time TEXT DEFAULT '15:30',  -- 24h IST format
  ADD COLUMN IF NOT EXISTS post_preferences JSONB DEFAULT '{}'::jsonb;

-- For the WhatsApp approval flow: track which post the user is reviewing
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected','edited')),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_message_id TEXT,
  ADD COLUMN IF NOT EXISTS edit_suggestion TEXT;

-- Indexes for the daily-post cron to find users due for post generation
CREATE INDEX IF NOT EXISTS idx_profiles_daily_post
  ON public.profiles (daily_post_count, daily_post_time)
  WHERE daily_post_count > 0;

CREATE INDEX IF NOT EXISTS idx_social_posts_approval
  ON public.social_posts (user_id, approval_status, created_at DESC)
  WHERE approval_status = 'pending';
