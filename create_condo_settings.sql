CREATE TABLE IF NOT EXISTS condo_settings (
    id SERIAL PRIMARY KEY,
    condo_name VARCHAR(255) DEFAULT 'FiliHomes',
    parking_mode VARCHAR(50) DEFAULT 'Manual',
    visitor_parking_billing BOOLEAN DEFAULT true,
    approval_required BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
INSERT INTO condo_settings (id, condo_name, parking_mode, visitor_parking_billing, approval_required) 
VALUES (1, 'FiliHomes', 'Manual', true, true)
ON CONFLICT (id) DO UPDATE SET
    parking_mode = EXCLUDED.parking_mode,
    visitor_parking_billing = EXCLUDED.visitor_parking_billing,
    approval_required = EXCLUDED.approval_required;
