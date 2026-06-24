-- Migration to add visitor_parking_enabled and amenity_booking_enabled to condo_settings
ALTER TABLE public.condo_settings ADD COLUMN IF NOT EXISTS visitor_parking_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.condo_settings ADD COLUMN IF NOT EXISTS amenity_booking_enabled BOOLEAN DEFAULT true;

-- Update existing default record to have these flags enabled
UPDATE public.condo_settings 
SET visitor_parking_enabled = true, amenity_booking_enabled = true
WHERE condo_id = 'c1111111-1111-1111-1111-111111111111';
