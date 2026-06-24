-- Migration to add max_visitor_parking_fee and parking_grace_period_mins, and update parking triggers dynamically

-- 1. Add columns to condos table if not exists
ALTER TABLE public.condos ADD COLUMN IF NOT EXISTS max_visitor_parking_fee NUMERIC DEFAULT 300;
ALTER TABLE public.condos ADD COLUMN IF NOT EXISTS parking_grace_period_mins INTEGER DEFAULT 15;

-- 2. Create helper functions for dynamic fee calculation
CREATE OR REPLACE FUNCTION calculate_parking_fee(
    target_condo_id UUID,
    p_entry TIMESTAMP WITH TIME ZONE,
    p_exit TIMESTAMP WITH TIME ZONE
) RETURNS NUMERIC AS $$
DECLARE
    v_hourly_rate NUMERIC;
    v_max_daily_fee NUMERIC;
    v_grace_mins INTEGER;
    v_stayed_mins INTEGER;
    v_days INTEGER;
    v_rem_hours INTEGER;
    v_fee NUMERIC := 0;
BEGIN
    -- Get policy values
    SELECT COALESCE(visitor_parking_fee_per_hour, 50), COALESCE(max_visitor_parking_fee, 300), COALESCE(parking_grace_period_mins, 15)
    INTO v_hourly_rate, v_max_daily_fee, v_grace_mins
    FROM public.condos
    WHERE id = target_condo_id;

    IF v_hourly_rate IS NULL THEN v_hourly_rate := 50; END IF;
    IF v_max_daily_fee IS NULL THEN v_max_daily_fee := 300; END IF;
    IF v_grace_mins IS NULL THEN v_grace_mins := 15; END IF;

    -- Calculate difference in minutes
    v_stayed_mins := EXTRACT(EPOCH FROM (p_exit - p_entry)) / 60;

    -- Check grace period
    IF v_stayed_mins <= v_grace_mins THEN
        RETURN 0;
    END IF;

    -- Compute full 24h days and remaining hours
    v_days := v_stayed_mins / (24 * 60);
    v_rem_hours := CEIL((v_stayed_mins % (24 * 60))::numeric / 60.0);

    -- Calculate fee: (days * daily max) + min(rem_hours * hourly, daily max)
    v_fee := (v_days * v_max_daily_fee) + LEAST(v_rem_hours * v_hourly_rate, v_max_daily_fee);

    RETURN v_fee;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calculate_parking_fee_for_pass(
    target_pass_id BIGINT,
    p_entry TIMESTAMP WITH TIME ZONE,
    p_exit TIMESTAMP WITH TIME ZONE
) RETURNS NUMERIC AS $$
DECLARE
    target_condo_id UUID;
BEGIN
    SELECT u.condo_id INTO target_condo_id
    FROM public.visitor_passes vp
    JOIN public.units u ON vp.unit_id = u.id
    WHERE vp.id = target_pass_id;

    IF target_condo_id IS NULL THEN
        -- Fallback to default policy calculations if no condo is mapped
        DECLARE
            v_stayed_mins INTEGER := EXTRACT(EPOCH FROM (p_exit - p_entry)) / 60;
            v_days INTEGER;
            v_rem_hours INTEGER;
        BEGIN
            IF v_stayed_mins <= 15 THEN
                RETURN 0;
            END IF;
            v_days := v_stayed_mins / (24 * 60);
            v_rem_hours := CEIL((v_stayed_mins % (24 * 60))::numeric / 60.0);
            RETURN (v_days * 300) + LEAST(v_rem_hours * 50, 300);
        END;
    END IF;

    RETURN calculate_parking_fee(target_condo_id, p_entry, p_exit);
END;
$$ LANGUAGE plpgsql;

-- 3. Update auto-close on re-entry logic to dynamically resolve fees
CREATE OR REPLACE FUNCTION auto_close_on_reentry()
RETURNS TRIGGER AS $$
DECLARE
    new_plate_number VARCHAR(20);
    old_log_id UUID;
    old_access_time TIMESTAMP WITH TIME ZONE;
    old_pass_id BIGINT;
    old_fee NUMERIC;
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
            old_fee := calculate_parking_fee_for_pass(old_pass_id, old_access_time, old_access_time + INTERVAL '4 hours');

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

-- 4. Update auto_close_expired_visitor_logs to use dynamic calculations
CREATE OR REPLACE FUNCTION auto_close_expired_visitor_logs()
RETURNS VOID SECURITY DEFINER AS $$
DECLARE
    expired_record RECORD;
    expired_count INTEGER := 0;
    max_stay_hours INTEGER := 24; -- Alert after 24 hours
    hard_cutoff_hours INTEGER := 48; -- Hard close after 48 hours
    dynamic_max_fee NUMERIC;
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
        -- Close the log, calculate dynamic fee (incorporates grace period and recurring cap), charge to resident
        dynamic_max_fee := calculate_parking_fee_for_pass(expired_record.pass_id, access_time, access_time + (hard_cutoff_hours || ' hours')::INTERVAL);

        UPDATE public.visitor_logs
        SET exit_time = access_time + (hard_cutoff_hours || ' hours')::INTERVAL,
            parking_fee = dynamic_max_fee,
            is_paid = false
        WHERE id = expired_record.id;

        expired_count := expired_count + 1;
        
        RAISE WARNING 'Auto-expired unclosed stay (Log ID: %) older than 48 hours. Capped fee of ₱% applied.', expired_record.id, dynamic_max_fee;
    END LOOP;

    RAISE NOTICE 'Auto-expiration complete. Hard closed % records.', expired_count;
END;
$$ LANGUAGE plpgsql;
