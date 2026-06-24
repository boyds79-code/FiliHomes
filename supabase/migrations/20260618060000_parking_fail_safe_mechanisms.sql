-- 1. Create function for Self-Healing: Auto-Close on Re-entry
-- If a vehicle enters but the previous entry has no exit_time, auto-close the previous log with a 4-hour default stay.
CREATE OR REPLACE FUNCTION auto_close_on_reentry()
RETURNS TRIGGER AS $$
DECLARE
    new_plate_number VARCHAR(20);
    old_log_id UUID;
    old_access_time TIMESTAMP WITH TIME ZONE;
    old_pass_id BIGINT;
    old_fee NUMERIC;
    calculated_hours INTEGER;
BEGIN
    -- Fetch plate_number of the incoming visitor log from visitor_passes
    SELECT plate_number INTO new_plate_number
    FROM public.visitor_passes
    WHERE id = NEW.pass_id;

    -- Only proceed if the incoming log has a valid plate_number
    IF new_plate_number IS NOT NULL AND new_plate_number <> '' THEN
        -- Check if there is an unclosed visitor_log for the same plate_number
        SELECT vl.id, vl.access_time, vl.pass_id 
        INTO old_log_id, old_access_time, old_pass_id
        FROM public.visitor_logs vl
        JOIN public.visitor_passes vp ON vl.pass_id = vp.id
        WHERE vp.plate_number = new_plate_number
          AND vl.exit_time IS NULL
          AND vl.id <> NEW.id -- avoid self
        ORDER BY vl.access_time DESC
        LIMIT 1;

        IF old_log_id IS NOT NULL THEN
            -- Auto-close the previous unclosed record
            -- Set exit_time to entry time of previous stay + 4 hours (default estimated duration)
            calculated_hours := 4;
            old_fee := calculated_hours * 50; -- ₱50 per hour

            UPDATE public.visitor_logs
            SET exit_time = old_access_time + INTERVAL '4 hours',
                parking_fee = old_fee,
                is_paid = false -- Billed to resident since guard missed it at the gate
            WHERE id = old_log_id;

            RAISE WARNING 'Auto-closed unclosed stay (Log ID: %) for plate: % due to new entry (Log ID: %). ₱% billed to unit.', 
                old_log_id, new_plate_number, NEW.id, old_fee;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Bind the re-entry trigger
DROP TRIGGER IF EXISTS trigger_auto_close_on_reentry ON public.visitor_logs;
CREATE TRIGGER trigger_auto_close_on_reentry
BEFORE INSERT ON public.visitor_logs
FOR EACH ROW
EXECUTE FUNCTION auto_close_on_reentry();


-- 2. Create function for Cron Auto-Expiration: Auto-Close records older than 24 hours
-- Set exit_time to access_time + 24 hours, cap fee at ₱300, bill to resident.
CREATE OR REPLACE FUNCTION auto_close_expired_visitor_logs()
RETURNS VOID SECURITY DEFINER AS $$
DECLARE
    expired_record RECORD;
    expired_count INTEGER := 0;
    max_stay_hours INTEGER := 24; -- Auto-close after 24 hours
    capped_fee NUMERIC := 300; -- Max daily fee cap (₱300)
BEGIN
    RAISE NOTICE 'Starting auto-expiration check for unclosed visitor logs.';

    -- Loop through all unclosed logs older than max_stay_hours (24 hours)
    FOR expired_record IN (
        SELECT id, access_time, pass_id
        FROM public.visitor_logs
        WHERE exit_time IS NULL
          AND access_time < now() - INTERVAL '24 hours'
    ) LOOP
        -- Close the log, cap fee to ₱300, is_paid = false (charge to resident)
        UPDATE public.visitor_logs
        SET exit_time = access_time + (max_stay_hours || ' hours')::INTERVAL,
            parking_fee = capped_fee,
            is_paid = false
        WHERE id = expired_record.id;

        expired_count := expired_count + 1;
        
        RAISE WARNING 'Auto-expired unclosed stay (Log ID: %) older than 24 hours. Capped fee of ₱300 applied.', expired_record.id;
    END LOOP;

    RAISE NOTICE 'Auto-expiration complete. Closed % unclosed visitor records.', expired_count;
END;
$$ LANGUAGE plpgsql;


-- 3. Register pg_cron Job to run daily at 1:00 AM to sweep and close expired logs
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Unschedule existing job if exists to avoid duplicates
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-parking-cleanup-job') THEN
            PERFORM cron.unschedule('daily-parking-cleanup-job');
        END IF;
        
        -- Schedule the job: 0 1 * * * (Every day at 1:00 AM)
        PERFORM cron.schedule(
            'daily-parking-cleanup-job',
            '0 1 * * *',
            'SELECT auto_close_expired_visitor_logs();'
        );
    END IF;
END $$;
