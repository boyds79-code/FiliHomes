-- 20260702120000_admin_auth_schema.sql
-- Enables public sign-up and auto-creation of condos and PMO staff profiles.

-- 1. Enable RLS on condos (if not already enabled) and setup policies
ALTER TABLE public.condos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select on condos" ON public.condos
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert on condos" ON public.condos
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on condos" ON public.condos
    FOR UPDATE USING (true);

-- 2. Adjust RLS on staff_profiles
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select on staff_profiles" ON public.staff_profiles
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert on staff_profiles" ON public.staff_profiles
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on staff_profiles" ON public.staff_profiles
    FOR UPDATE USING (true);

CREATE POLICY "Allow public delete on staff_profiles" ON public.staff_profiles
    FOR DELETE USING (true);

-- 3. Adjust RLS on profiles (ensuring registration flow doesn't fail)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select on profiles" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert on profiles" ON public.profiles
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on profiles" ON public.profiles
    FOR UPDATE USING (true);

-- 4. Ensure condo_settings can be initialized
ALTER TABLE public.condo_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select on condo_settings" ON public.condo_settings
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert on condo_settings" ON public.condo_settings
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update on condo_settings" ON public.condo_settings
    FOR UPDATE USING (true);
