import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://asqgyncyqnbmitkubjwq.supabase.co/rest/v1/rpc/exec_sql"
headers = {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ",
    "Content-Type": "application/json"
}

sql = """
-- 1. Add multiplier columns to condo_settings
ALTER TABLE public.condo_settings 
ADD COLUMN IF NOT EXISTS default_regular_holiday_multiplier NUMERIC DEFAULT 2.0;

ALTER TABLE public.condo_settings 
ADD COLUMN IF NOT EXISTS default_special_holiday_multiplier NUMERIC DEFAULT 1.3;

ALTER TABLE public.condo_settings 
ADD COLUMN IF NOT EXISTS default_ot_multiplier NUMERIC DEFAULT 1.25;

-- 2. Create philippine_holidays table
CREATE TABLE IF NOT EXISTS public.philippine_holidays (
    id SERIAL PRIMARY KEY,
    holiday_date DATE UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('regular', 'special'))
);

-- 3. Seed default holidays
INSERT INTO public.philippine_holidays (holiday_date, name, type)
VALUES 
  ('2026-01-01', 'New Year''s Day', 'regular'),
  ('2026-02-25', 'EDSA People Power Anniversary', 'special'),
  ('2026-04-02', 'Maundy Thursday', 'regular'),
  ('2026-04-03', 'Good Friday', 'regular'),
  ('2026-04-04', 'Black Saturday', 'special'),
  ('2026-04-09', 'Araw ng Kagitingan', 'regular'),
  ('2026-05-01', 'Labor Day', 'regular'),
  ('2026-06-12', 'Independence Day', 'regular'),
  ('2026-08-21', 'Ninoy Aquino Day', 'special'),
  ('2026-08-31', 'National Heroes Day', 'regular'),
  ('2026-11-01', 'All Saints'' Day', 'special'),
  ('2026-11-02', 'All Souls'' Day', 'special'),
  ('2026-11-30', 'Bonifacio Day', 'regular'),
  ('2026-12-08', 'Immaculate Conception', 'special'),
  ('2026-12-25', 'Christmas Day', 'regular'),
  ('2026-12-30', 'Rizal Day', 'regular'),
  ('2026-12-31', 'Last Day of Year', 'special')
ON CONFLICT (holiday_date) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type;

-- 4. RLS Configuration for philippine_holidays
ALTER TABLE public.philippine_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to all" ON public.philippine_holidays;
CREATE POLICY "Allow read access to all" ON public.philippine_holidays FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow update access to all" ON public.philippine_holidays;
CREATE POLICY "Allow update access to all" ON public.philippine_holidays FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow insert access to all" ON public.philippine_holidays;
CREATE POLICY "Allow insert access to all" ON public.philippine_holidays FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete access to all" ON public.philippine_holidays;
CREATE POLICY "Allow delete access to all" ON public.philippine_holidays FOR DELETE USING (true);
"""

data = {"sql": sql}
req = urllib.request.Request(url, json.dumps(data).encode('utf-8'), headers)

try:
    with urllib.request.urlopen(req, context=ctx) as response:
        print("✅ Migration response:")
        print(response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(f"❌ Error: {e.code} - {e.read().decode('utf-8')}")
except Exception as e:
    print(f"❌ Exception: {e}")
