-- SQL Migration to support separated intercom channels by team.
-- Add channel column to intercom_chats table.
ALTER TABLE public.intercom_chats ADD COLUMN IF NOT EXISTS channel text DEFAULT 'SECURITY';
