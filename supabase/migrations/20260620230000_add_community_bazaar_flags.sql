-- Migration to add community and bazaar feature flags to condo_settings
-- All comments are in English as per rules.

ALTER TABLE public.condo_settings ADD COLUMN IF NOT EXISTS is_community_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.condo_settings ADD COLUMN IF NOT EXISTS is_bazaar_enabled BOOLEAN DEFAULT true;

-- Update the default row
UPDATE public.condo_settings 
SET 
  is_community_enabled = true,
  is_bazaar_enabled = true
WHERE condo_id = 'c1111111-1111-1111-1111-111111111111';
