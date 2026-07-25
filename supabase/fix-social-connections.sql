-- ============================================
-- MIGRATION: Fix social_connections schema
-- Run this in Supabase SQL Editor
-- Safe to re-run (idempotent)
-- ============================================

-- 1. Add missing connection_id column
ALTER TABLE public.social_connections
ADD COLUMN IF NOT EXISTS connection_id TEXT;

-- 2. Update status CHECK constraint to include 'pending'
ALTER TABLE public.social_connections
DROP CONSTRAINT IF EXISTS social_connections_status_check;

ALTER TABLE public.social_connections
ADD CONSTRAINT social_connections_status_check
CHECK (status IN ('connected', 'disconnected', 'expired', 'error', 'pending'));
