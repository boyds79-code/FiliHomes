-- Create unit_invitations table
CREATE TABLE IF NOT EXISTS public.unit_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES public.condos(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    invite_code VARCHAR(6) NOT NULL UNIQUE,
    role VARCHAR(50) NOT NULL DEFAULT 'tenant',
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    expired_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    used_at TIMESTAMP WITH TIME ZONE
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.unit_invitations ENABLE ROW LEVEL SECURITY;

-- Policy 1: Service Role / Admins can do all operations
CREATE POLICY "Admins have full access to unit_invitations" 
ON public.unit_invitations
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy 2: Public/Anon can read unused, unexpired invitations to verify codes during sign-up
CREATE POLICY "Public/Anon can verify unused invitations" 
ON public.unit_invitations
FOR SELECT
TO anon, authenticated
USING (is_used = FALSE AND expired_at > NOW());
