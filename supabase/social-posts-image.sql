-- Add image_url to social_posts so generated images can be stored with the post.
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS image_prompt TEXT;
