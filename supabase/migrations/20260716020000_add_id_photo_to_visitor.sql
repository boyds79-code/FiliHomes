-- Migration to add id_photo_url to visitor_passes
ALTER TABLE public.visitor_passes ADD COLUMN IF NOT EXISTS id_photo_url TEXT;
