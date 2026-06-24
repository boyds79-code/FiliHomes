-- Add time_change_request column to job_orders table
ALTER TABLE public.job_orders 
ADD COLUMN IF NOT EXISTS time_change_request TEXT;
