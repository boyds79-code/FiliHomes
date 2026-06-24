-- Drop the obsolete trigger and function that crashes job order completion due to column name mismatch
DROP TRIGGER IF EXISTS trg_auto_bill_maintenance ON public.job_orders;
DROP FUNCTION IF EXISTS handle_job_order_completion();
