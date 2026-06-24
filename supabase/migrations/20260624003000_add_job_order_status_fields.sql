-- Add missing status timestamps and photo URLs to job_orders table
ALTER TABLE public.job_orders 
ADD COLUMN IF NOT EXISTS before_photo_url TEXT,
ADD COLUMN IF NOT EXISTS after_photo_url TEXT,
ADD COLUMN IF NOT EXISTS status_filed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status_reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status_scheduling_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status_booked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status_finished_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status_closed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status_visiting_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status_estimate_submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS status_in_progress_at TIMESTAMPTZ;
