-- Migration to add PMO active business hours to condo_settings

-- 1. Add columns to condo_settings
ALTER TABLE public.condo_settings ADD COLUMN IF NOT EXISTS pmo_hours_start VARCHAR(5) DEFAULT '09:00';
ALTER TABLE public.condo_settings ADD COLUMN IF NOT EXISTS pmo_hours_end VARCHAR(5) DEFAULT '18:00';
