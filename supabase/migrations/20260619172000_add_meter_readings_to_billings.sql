-- Add previous and current meter reading columns for electricity and water to the billings table
ALTER TABLE public.billings ADD COLUMN IF NOT EXISTS electricity_prev_meter NUMERIC DEFAULT 0;
ALTER TABLE public.billings ADD COLUMN IF NOT EXISTS electricity_curr_meter NUMERIC DEFAULT 0;
ALTER TABLE public.billings ADD COLUMN IF NOT EXISTS water_prev_meter NUMERIC DEFAULT 0;
ALTER TABLE public.billings ADD COLUMN IF NOT EXISTS water_curr_meter NUMERIC DEFAULT 0;
