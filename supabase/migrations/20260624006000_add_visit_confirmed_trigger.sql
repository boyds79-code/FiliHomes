-- 1. Create the trigger function to notify resident when visit is confirmed
CREATE OR REPLACE FUNCTION notify_resident_visit_confirmed()
RETURNS TRIGGER AS $$
DECLARE
  tech_name TEXT := 'a Technician';
  display_time TEXT := '';
  visit_time TIMESTAMPTZ;
BEGIN
  -- 상태가 'VISIT_CONFIRMED'로 변경된 경우에만 실행
  IF NEW.status = 'VISIT_CONFIRMED' AND (OLD.status IS NULL OR OLD.status != 'VISIT_CONFIRMED') THEN
    -- 1) 기술자 이름 가져오기
    IF NEW.assigned_technician_id IS NOT NULL THEN
      SELECT full_name INTO tech_name 
      FROM public.staff_profiles 
      WHERE id = NEW.assigned_technician_id;
    END IF;

    -- 2) 방문 시간 결정 및 포맷팅
    visit_time := COALESCE(NEW.proposed_visit_time, OLD.proposed_visit_time, OLD.time_change_request);
    IF visit_time IS NOT NULL THEN
      display_time := ' for ' || to_char(visit_time AT TIME ZONE 'Asia/Manila', 'Mon DD, HH:MI AM');
    END IF;

    -- 3) 알림 생성
    INSERT INTO public.notifications (
      user_id,
      title, 
      message, 
      type, 
      created_at
    )
    VALUES (
      NEW.user_id, 
      '📅 Visit Confirmed', 
      'Your visit is confirmed' || display_time || '. Technician ' || tech_name || ' will visit your unit.', 
      'RESIDENT', 
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Drop trigger if exists and attach it to job_orders table
DROP TRIGGER IF EXISTS trg_notify_visit_confirmed ON public.job_orders;
CREATE TRIGGER trg_notify_visit_confirmed
AFTER UPDATE ON public.job_orders
FOR EACH ROW EXECUTE FUNCTION notify_resident_visit_confirmed();
