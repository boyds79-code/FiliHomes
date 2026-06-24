-- SQL migration script to set up ad_campaigns and platform_issues
-- Run this script in the Supabase SQL Editor.

-- 1. Create Ad Campaigns Table
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    image_url TEXT NOT NULL,
    link_url TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK (target_type IN ('GLOBAL', 'CONDO')),
    condo_id UUID REFERENCES public.condos(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'EXPIRED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Platform Issues Table (Reported by PMOs)
CREATE TABLE IF NOT EXISTS public.platform_issues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES public.condos(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    reported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reported_by_name TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
    priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Enable RLS and setup basic policies (Bypass checks for simplicity if needed, or define access)
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_issues ENABLE ROW LEVEL SECURITY;

-- Select policies
CREATE POLICY "Allow public select on ad_campaigns" ON public.ad_campaigns
    FOR SELECT USING (true);

CREATE POLICY "Allow authenticated read/write on ad_campaigns" ON public.ad_campaigns
    FOR ALL TO service_role USING (true);

CREATE POLICY "Allow read/write on platform_issues" ON public.platform_issues
    FOR ALL TO service_role USING (true);

-- Enable public/anon read/write policies for simulated local use if needed
CREATE POLICY "Allow public read/write on ad_campaigns_local" ON public.ad_campaigns
    FOR ALL USING (true);

CREATE POLICY "Allow public read/write on platform_issues_local" ON public.platform_issues
    FOR ALL USING (true);

-- 4. Create Subscription Payments Table
CREATE TABLE IF NOT EXISTS public.subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES public.condos(id) ON DELETE CASCADE,
    billing_period TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    receipt_url TEXT NOT NULL,
    reference_no TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Create Ad Payments Table (Advertiser Ledger)
CREATE TABLE IF NOT EXISTS public.ad_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advertiser_name TEXT NOT NULL,
    campaign_id UUID REFERENCES public.ad_campaigns(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL,
    payment_method TEXT NOT NULL,
    receipt_url TEXT,
    reference_no TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PAID', 'PENDING', 'APPROVED', 'REJECTED')),
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Enable RLS and setup basic policies for the new tables
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read/write on subscription_payments" ON public.subscription_payments
    FOR ALL USING (true);

CREATE POLICY "Allow public read/write on ad_payments" ON public.ad_payments
    FOR ALL USING (true);

-- 7. Create Subscription Contracts Table
CREATE TABLE IF NOT EXISTS public.subscription_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL REFERENCES public.condos(id) ON DELETE CASCADE,
    subscription_fee NUMERIC NOT NULL,
    billing_start_date DATE NOT NULL,
    contract_duration_years INTEGER NOT NULL,
    special_notes TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PENDING', 'EXPIRED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Create HQ Staff Table (FiliCondo Company Staff)
CREATE TABLE IF NOT EXISTS public.hq_staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    hourly_rate NUMERIC NOT NULL,
    hire_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Create HQ Attendance Table (FiliCondo Staff Work Hours)
CREATE TABLE IF NOT EXISTS public.hq_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.hq_staff(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    hours_worked NUMERIC NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. Create HQ Payroll Table (FiliCondo Staff Payroll Ledger)
CREATE TABLE IF NOT EXISTS public.hq_payroll (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.hq_staff(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_hours NUMERIC NOT NULL,
    gross_pay NUMERIC NOT NULL,
    net_pay NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'PAID' CHECK (status IN ('PAID', 'PENDING')),
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS and setup public/anon read/write policies for local development
ALTER TABLE public.subscription_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hq_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hq_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hq_payroll ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read/write on subscription_contracts" ON public.subscription_contracts FOR ALL USING (true);
CREATE POLICY "Allow public read/write on hq_staff" ON public.hq_staff FOR ALL USING (true);
CREATE POLICY "Allow public read/write on hq_attendance" ON public.hq_attendance FOR ALL USING (true);
CREATE POLICY "Allow public read/write on hq_payroll" ON public.hq_payroll FOR ALL USING (true);

