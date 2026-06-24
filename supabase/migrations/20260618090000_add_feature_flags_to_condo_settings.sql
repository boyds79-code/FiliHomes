-- Migration to add feature flags to condo_settings for server-driven UI configuration

-- 1. Add columns to condo_settings
ALTER TABLE public.condo_settings ADD COLUMN IF NOT EXISTS visitor_scope VARCHAR(50) DEFAULT 'MAIN_GATE_ONLY';
ALTER TABLE public.condo_settings ADD COLUMN IF NOT EXISTS parcel_lockers_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.condo_settings ADD COLUMN IF NOT EXISTS amenity_booking_required BOOLEAN DEFAULT true;
