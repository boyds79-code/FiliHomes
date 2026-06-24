-- setup_condo_settings.sql
-- Run this SQL in your Supabase SQL Editor to create the condo_settings table.
CREATE TABLE IF NOT EXISTS condo_settings (
    condo_id UUID PRIMARY KEY,
    parking_mode VARCHAR(50) DEFAULT 'Manual',
    visitor_parking_policy VARCHAR(50) DEFAULT 'BILLING_ENABLED',
    approval_policy VARCHAR(50) DEFAULT 'REQUIRED',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Insert a default row if it doesn't exist for the demo condo
INSERT INTO condo_settings (condo_id, parking_mode, visitor_parking_policy, approval_policy) 
VALUES ('c1111111-1111-1111-1111-111111111111', 'Manual', 'BILLING_ENABLED', 'REQUIRED')
ON CONFLICT (condo_id) DO UPDATE SET
    parking_mode = EXCLUDED.parking_mode,
    visitor_parking_policy = EXCLUDED.visitor_parking_policy,
    approval_policy = EXCLUDED.approval_policy;

-- Grant access to anon and authenticated roles
ALTER TABLE condo_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read access to all" ON condo_settings FOR SELECT USING (true);
CREATE POLICY "Allow update access to all" ON condo_settings FOR UPDATE USING (true);
CREATE POLICY "Allow insert access to all" ON condo_settings FOR INSERT WITH CHECK (true);
