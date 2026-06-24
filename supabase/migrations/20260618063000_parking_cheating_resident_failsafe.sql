-- 1. Add resident reporting tracking columns to visitor_logs
ALTER TABLE public.visitor_logs ADD COLUMN IF NOT EXISTS is_resident_reported BOOLEAN DEFAULT false;
ALTER TABLE public.visitor_logs ADD COLUMN IF NOT EXISTS resident_reported_exit_time TIMESTAMP WITH TIME ZONE;

-- 2. Create trigger to send notification on cron 24h parking alert
CREATE OR REPLACE FUNCTION notify_24h_parking()
RETURNS TRIGGER AS $$
DECLARE
    target_unit_id UUID;
    visitor_name TEXT;
    plate_no TEXT;
    admin_user RECORD;
BEGIN
    -- This trigger function can be invoked manually or via background process
    -- Fetch details from visitor_passes
    SELECT unit_id, visitor_name, plate_number INTO target_unit_id, visitor_name, plate_no
    FROM public.visitor_passes
    WHERE id = NEW.pass_id;

    IF target_unit_id IS NOT NULL THEN
        -- Insert warning notification for the resident unit
        INSERT INTO public.notifications (
            user_id,
            unit_id,
            title,
            message,
            type,
            data
        )
        SELECT 
            p.id,
            target_unit_id,
            '⚠️ Long-stay Parking Alert',
            'Your visitor ' || COALESCE(visitor_name, 'Guest') || COALESCE(' (' || plate_no || ')', '') || ' has been parked for over 24 hours. Please confirm if they are still inside or report their exit time.',
            'PARKING_ALERT',
            jsonb_build_object(
                'visitor_log_id', NEW.id,
                'pass_id', NEW.pass_id,
                'plate_number', plate_no,
                'alert_type', '24H_EXCEED'
            )
        FROM public.profiles p
        WHERE p.unit_id = target_unit_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Modify cron job to scan and flag long stays, triggering notifications instead of auto-closing immediately
CREATE OR REPLACE FUNCTION auto_close_expired_visitor_logs()
RETURNS VOID SECURITY DEFINER AS $$
DECLARE
    expired_record RECORD;
    expired_count INTEGER := 0;
    max_stay_hours INTEGER := 24; -- Alert after 24 hours
    hard_cutoff_hours INTEGER := 48; -- Hard close after 48 hours
    capped_fee NUMERIC := 300; -- Max daily fee cap (₱300)
BEGIN
    RAISE NOTICE 'Starting auto-expiration and alert check for unclosed visitor logs.';

    -- Phase A: Send Alert Notifications for logs open between 24 and 48 hours (if not already alerted)
    FOR expired_record IN (
        SELECT vl.id, vl.access_time, vl.pass_id
        FROM public.visitor_logs vl
        WHERE vl.exit_time IS NULL
          AND vl.access_time < now() - INTERVAL '24 hours'
          AND NOT EXISTS (
              SELECT 1 FROM public.notifications n
              WHERE n.data->>'visitor_log_id' = vl.id::text
                AND n.type = 'PARKING_ALERT'
          )
    ) LOOP
        -- Trigger notification
        PERFORM notify_24h_parking_for_record(expired_record.id, expired_record.pass_id);
    END LOOP;

    -- Phase B: Hard close records older than 48 hours (if the resident never responded)
    FOR expired_record IN (
        SELECT id, access_time, pass_id
        FROM public.visitor_logs
        WHERE exit_time IS NULL
          AND access_time < now() - INTERVAL '48 hours'
    ) LOOP
        -- Close the log, cap fee, charge to resident
        UPDATE public.visitor_logs
        SET exit_time = access_time + (hard_cutoff_hours || ' hours')::INTERVAL,
            parking_fee = capped_fee,
            is_paid = false
        WHERE id = expired_record.id;

        expired_count := expired_count + 1;
        
        RAISE WARNING 'Auto-expired unclosed stay (Log ID: %) older than 48 hours. Capped fee of ₱300 applied.', expired_record.id;
    END LOOP;

    RAISE NOTICE 'Auto-expiration complete. Hard closed % records.', expired_count;
END;
$$ LANGUAGE plpgsql;

-- Helper function to trigger notification for a specific record
CREATE OR REPLACE FUNCTION notify_24h_parking_for_record(log_uuid UUID, pass_bigint BIGINT)
RETURNS VOID AS $$
DECLARE
    target_unit_id UUID;
    v_name TEXT;
    p_no TEXT;
    profile_record RECORD;
BEGIN
    SELECT unit_id, visitor_name, plate_number INTO target_unit_id, v_name, p_no
    FROM public.visitor_passes
    WHERE id = pass_bigint;

    IF target_unit_id IS NOT NULL THEN
        FOR profile_record IN (SELECT id FROM public.profiles WHERE unit_id = target_unit_id) LOOP
            INSERT INTO public.notifications (
                user_id,
                unit_id,
                title,
                message,
                type,
                data
            ) VALUES (
                profile_record.id,
                target_unit_id,
                '⚠️ Long-stay Parking Alert',
                'Your visitor ' || COALESCE(v_name, 'Guest') || COALESCE(' (' || p_no || ')', '') || ' has been parked for over 24 hours. Please confirm if they are still inside or report their exit time.',
                'PARKING_ALERT',
                jsonb_build_object(
                    'visitor_log_id', log_uuid,
                    'pass_id', pass_bigint,
                    'plate_number', p_no,
                    'alert_type', '24H_EXCEED'
                )
            );
        END LOOP;
        RAISE NOTICE 'Dispatched 24h parking alert notification to unit %', target_unit_id;
    END IF;
END;
$$ LANGUAGE plpgsql;
