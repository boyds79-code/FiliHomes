-- 1. Drop the old trigger and replace the function to use user_id instead of resident_id
DROP TRIGGER IF EXISTS trg_notify_estimate ON public.job_orders;

CREATE OR REPLACE FUNCTION notify_resident_estimate_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- 상태가 'ESTIMATE_SUBMITTED'로 변경된 경우에만 실행
  IF NEW.status = 'ESTIMATE_SUBMITTED' AND (OLD.status IS NULL OR OLD.status != 'ESTIMATE_SUBMITTED') THEN
    INSERT INTO public.notifications (
      user_id,
      title, 
      message, 
      type, 
      created_at
    )
    VALUES (
      NEW.user_id, 
      '🛠️ Estimate Cost Approval Needed', 
      'Technician has submitted a cost estimate. Please review and approve it to start the repair.', 
      'RESIDENT', 
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Attach the updated trigger
CREATE TRIGGER trg_notify_estimate
AFTER UPDATE ON public.job_orders
FOR EACH ROW EXECUTE FUNCTION notify_resident_estimate_approval();

-- 3. Drop temporary inspection table if exists
DROP TABLE IF EXISTS public.temp_triggers_inspect;
