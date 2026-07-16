-- Migration to add visitor_entry_mode to condo_settings
ALTER TABLE public.condo_settings ADD COLUMN IF NOT EXISTS visitor_entry_mode VARCHAR(50) DEFAULT 'QR_CODE' NOT NULL;
