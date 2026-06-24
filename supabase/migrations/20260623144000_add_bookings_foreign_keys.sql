-- Migration: Add missing foreign key constraints for amenity_bookings
-- Adds fk constraints between amenity_bookings -> profiles and amenity_bookings -> units.

-- 1. Add Foreign Key between amenity_bookings.user_id and profiles.id
ALTER TABLE public.amenity_bookings
DROP CONSTRAINT IF EXISTS fk_amenity_bookings_profiles,
ADD CONSTRAINT fk_amenity_bookings_profiles
FOREIGN KEY (user_id) REFERENCES public.profiles(id)
ON DELETE CASCADE;

-- 2. Add Foreign Key between amenity_bookings.unit_id and units.id
ALTER TABLE public.amenity_bookings
DROP CONSTRAINT IF EXISTS fk_amenity_bookings_units,
ADD CONSTRAINT fk_amenity_bookings_units
FOREIGN KEY (unit_id) REFERENCES public.units(id)
ON DELETE CASCADE;
