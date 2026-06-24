-- 1. 알림(notifications) 테이블 생성 (없을 경우)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'INFO',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- (중요) 대시보드 Database -> Publications 설정에서 notifications 테이블의 Realtime을 켜주세요.

-- 2. Job Order 취소 감지 트리거 함수 생성
CREATE OR REPLACE FUNCTION notify_job_cancellation()
RETURNS TRIGGER AS $$
BEGIN
  -- 상태가 CANCELED로 변경되었을 때 작동
  IF (NEW.status = 'CANCELED' AND OLD.status != 'CANCELED') THEN
    -- 1) 기술자가 배정되어 있었다면 해당 기술자의 user_id로 알림 생성
    IF NEW.assigned_technician_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (NEW.assigned_technician_id, 'Job Cancelled ❌', 'Your assigned job order was cancelled by the resident.', 'URGENT');
    END IF;
    
    -- 2) 어드민(PMO)을 위한 전역 알림 생성 (user_id 없음, type='ADMIN')
    INSERT INTO public.notifications (title, message, type)
    VALUES ('Job Order Cancelled', 'A job order for Unit ' || COALESCE((SELECT unit_number FROM public.units WHERE id = NEW.unit_id), 'Unknown') || ' has been cancelled by the resident.', 'ADMIN');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. job_orders 테이블에 트리거 부착
DROP TRIGGER IF EXISTS trg_job_cancellation ON public.job_orders;
CREATE TRIGGER trg_job_cancellation
AFTER UPDATE ON public.job_orders
FOR EACH ROW EXECUTE FUNCTION notify_job_cancellation();