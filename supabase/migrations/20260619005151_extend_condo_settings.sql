-- Migration to extend condo_settings with custom billing types, penalty due days, parcel delivery policies, and amenity settings
ALTER TABLE public.condo_settings ADD COLUMN IF NOT EXISTS billing_types JSONB DEFAULT '["Electricity", "Water", "Association Dues", "Parking"]';
ALTER TABLE public.condo_settings ADD COLUMN IF NOT EXISTS penalty_due_day INTEGER DEFAULT 5;
ALTER TABLE public.condo_settings ADD COLUMN IF NOT EXISTS parcel_delivery_policy VARCHAR(50) DEFAULT 'GUARD_HOUSE';
ALTER TABLE public.condo_settings ADD COLUMN IF NOT EXISTS amenity_settings JSONB DEFAULT '{"Gym": {"enabled": true, "max_capacity": 10}, "Spa": {"enabled": true, "max_capacity": 5}, "Pool": {"enabled": true, "max_capacity": 15}}';

-- Update the default row
UPDATE public.condo_settings 
SET 
  billing_types = '["Electricity", "Water", "Association Dues", "Parking"]',
  penalty_due_day = 5,
  parcel_delivery_policy = 'GUARD_HOUSE',
  amenity_settings = '{"Gym": {"enabled": true, "max_capacity": 10}, "Spa": {"enabled": true, "max_capacity": 5}, "Pool": {"enabled": true, "max_capacity": 15}}'
WHERE condo_id = 'c1111111-1111-1111-1111-111111111111';
