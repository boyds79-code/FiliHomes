-- 1. Enable pg_cron if not enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Create the monthly billing finalization function
CREATE OR REPLACE FUNCTION finalize_previous_month_billings()
RETURNS VOID SECURITY DEFINER AS $$
DECLARE
    finalized_count INTEGER := 0;
    cutoff_month VARCHAR(7);
BEGIN
    cutoff_month := to_char(now(), 'YYYY-MM');
    
    RAISE NOTICE 'Starting monthly billing finalization for bills before: %', cutoff_month;
    
    -- Update all UNPAID bills of previous months to FINALIZED
    -- Also apply the condo's penalty rate (defaults to 2% if not set)
    UPDATE public.billings b
    SET status = 'FINALIZED',
        penalty_amount = COALESCE(b.penalty_amount, 0) + (COALESCE(b.total_due, 0) * COALESCE(c.penalty_rate, 0.02)),
        total_due = COALESCE(b.total_due, 0) + (COALESCE(b.total_due, 0) * COALESCE(c.penalty_rate, 0.02)),
        description = COALESCE(b.description || E'\n', '') || 'Finalized with penalty (' || (COALESCE(c.penalty_rate, 0.02) * 100) || '% applied).'
    FROM public.condos c
    WHERE b.condo_id = c.id
      AND b.status = 'UNPAID'
      AND b.billing_month < cutoff_month;

    GET DIAGNOSTICS finalized_count = ROW_COUNT;
    
    RAISE NOTICE 'Billing finalization complete. Finalized bills count: %', finalized_count;
END;
$$ LANGUAGE plpgsql;

-- 3. Register pg_cron Job to run at 12:00 AM on the 1st of every month
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Unschedule existing job if exists to avoid duplicates
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-billing-finalize-job') THEN
            PERFORM cron.unschedule('monthly-billing-finalize-job');
        END IF;
        
        -- Schedule the job: 0 0 1 * * (At 00:00 on day-of-month 1)
        PERFORM cron.schedule(
            'monthly-billing-finalize-job',
            '0 0 1 * *',
            'SELECT finalize_previous_month_billings();'
        );
    END IF;
END $$;
