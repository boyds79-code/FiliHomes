-- 1. Enable pg_cron if not enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Create archive tables with identical structures to active log tables
-- archived_visitor_passes
CREATE TABLE IF NOT EXISTS archived_visitor_passes (
    id BIGINT,
    user_id UUID,
    visitor_name VARCHAR(100),
    visit_type VARCHAR(20),
    plate_number VARCHAR(20),
    vehicle_type VARCHAR(50),
    purpose TEXT,
    visit_date DATE,
    status VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE,
    qr_code_value TEXT,
    unit_id UUID,
    time_in TIMESTAMP WITH TIME ZONE,
    time_out TIMESTAMP WITH TIME ZONE,
    vehicle_model TEXT,
    entry_time TIMESTAMP WITH TIME ZONE,
    exit_time TIMESTAMP WITH TIME ZONE,
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- archived_visitor_logs
CREATE TABLE IF NOT EXISTS archived_visitor_logs (
    id UUID,
    pass_id BIGINT,
    access_time TIMESTAMP WITH TIME ZONE,
    gate_location TEXT,
    verifier_id UUID,
    exit_time TIMESTAMP WITH TIME ZONE,
    parking_fee NUMERIC,
    is_paid BOOLEAN,
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- archived_guard_activity_logs
CREATE TABLE IF NOT EXISTS archived_guard_activity_logs (
    id UUID,
    created_at TIMESTAMP WITH TIME ZONE,
    guard_id UUID,
    action TEXT,
    details TEXT,
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Enable RLS on archived tables
ALTER TABLE archived_visitor_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE archived_visitor_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE archived_guard_activity_logs ENABLE ROW LEVEL SECURITY;

-- 4. Setup RLS Policies for Archived Tables (Only Admin and Guard roles can SELECT/READ)
-- Helper function to check if the current user has guard or admin role in profiles
CREATE OR REPLACE FUNCTION current_user_is_guard_or_admin()
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('guard', 'admin')
  );
END;
$$ LANGUAGE plpgsql;

CREATE POLICY "Guards and Admins can view archived passes"
ON archived_visitor_passes FOR SELECT
USING (current_user_is_guard_or_admin());

CREATE POLICY "Guards and Admins can view archived visitor logs"
ON archived_visitor_logs FOR SELECT
USING (current_user_is_guard_or_admin());

CREATE POLICY "Guards and Admins can view archived activity logs"
ON archived_guard_activity_logs FOR SELECT
USING (current_user_is_guard_or_admin());

-- 5. Core archiving function
CREATE OR REPLACE FUNCTION archive_old_logs(retention_months INTEGER)
RETURNS VOID SECURITY DEFINER AS $$
DECLARE
    cutoff_time TIMESTAMP WITH TIME ZONE;
    archived_pass_count INTEGER := 0;
    archived_log_count INTEGER := 0;
    archived_activity_count INTEGER := 0;
BEGIN
    cutoff_time := now() - (retention_months || ' months')::INTERVAL;
    
    RAISE NOTICE 'Starting log archiving. Cutoff time: %', cutoff_time;
    
    -- A) Archive & delete from guard_activity_logs
    INSERT INTO archived_guard_activity_logs (id, created_at, guard_id, action, details)
    SELECT id, created_at, guard_id, action, details
    FROM guard_activity_logs
    WHERE created_at < cutoff_time;
    
    GET DIAGNOSTICS archived_activity_count = ROW_COUNT;
    
    DELETE FROM guard_activity_logs
    WHERE created_at < cutoff_time;

    -- B) Archive visitor logs & passes
    -- First, copy old visitor logs to archive (they reference passes)
    INSERT INTO archived_visitor_logs (id, pass_id, access_time, gate_location, verifier_id, exit_time, parking_fee, is_paid)
    SELECT id, pass_id, access_time, gate_location, verifier_id, exit_time, parking_fee, is_paid
    FROM visitor_logs
    WHERE access_time < cutoff_time;
    
    GET DIAGNOSTICS archived_log_count = ROW_COUNT;
    
    -- Second, copy referenced visitor passes to archive
    INSERT INTO archived_visitor_passes (
        id, user_id, visitor_name, visit_type, plate_number, vehicle_type, 
        purpose, visit_date, status, created_at, qr_code_value, unit_id, 
        time_in, time_out, vehicle_model, entry_time, exit_time
    )
    SELECT 
        id, user_id, visitor_name, visit_type, plate_number, vehicle_type, 
        purpose, visit_date, status, created_at, qr_code_value, unit_id, 
        time_in, time_out, vehicle_model, entry_time, exit_time
    FROM visitor_passes
    WHERE created_at < cutoff_time;
    
    GET DIAGNOSTICS archived_pass_count = ROW_COUNT;
    
    -- Third, delete the entries from active tables
    -- Delete from visitor_logs first to satisfy foreign key constraints
    DELETE FROM visitor_logs
    WHERE access_time < cutoff_time;
    
    DELETE FROM visitor_passes
    WHERE created_at < cutoff_time;
    
    RAISE NOTICE 'Archiving complete. Passes archived: %, Logs archived: %, Guard activities archived: %', 
        archived_pass_count, archived_log_count, archived_activity_count;
END;
$$ LANGUAGE plpgsql;

-- 6. Register Cron Job using pg_cron to run daily at 2:00 AM (Archiving records older than 6 months)
-- Check if cron is installed and active
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Unschedule existing job if exists to avoid duplicates
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'archive-old-logs-job') THEN
            PERFORM cron.unschedule('archive-old-logs-job');
        END IF;
        
        -- Schedule the new job (every day at 2:00 AM)
        -- Truncates data older than 6 months (180 days)
        PERFORM cron.schedule(
            'archive-old-logs-job',
            '0 2 * * *',
            'SELECT archive_old_logs(6);'
        );
    END IF;
END $$;
