-- Migration to add missing columns to staff_profiles for payroll and condo info
ALTER TABLE public.staff_profiles 
ADD COLUMN IF NOT EXISTS condo_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS payroll_settings JSONB DEFAULT '{"base_rate_type": "hourly", "base_rate": 80, "additions": []}'::jsonb;
