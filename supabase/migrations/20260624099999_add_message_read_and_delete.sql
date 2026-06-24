-- SQL Migration to support message read receipt, read time, and deletion.
-- 1. Add read_at and is_deleted columns to intercom_messages table.
ALTER TABLE public.intercom_messages ADD COLUMN IF NOT EXISTS read_at timestamp with time zone;
ALTER TABLE public.intercom_messages ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;

-- 2. Add UPDATE policy for intercom_messages to allow residents and guards/staff to update read_at and is_deleted.
DROP POLICY IF EXISTS intercom_messages_update ON public.intercom_messages;

CREATE POLICY intercom_messages_update ON public.intercom_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.intercom_chats 
      WHERE intercom_chats.id = chat_id 
        AND (
          intercom_chats.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.staff_profiles WHERE id = auth.uid() AND is_active = true
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.intercom_chats 
      WHERE intercom_chats.id = chat_id 
        AND (
          intercom_chats.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.staff_profiles WHERE id = auth.uid() AND is_active = true
          )
        )
    )
  );
-- 3. Add database constraint trigger to enforce that already-read messages cannot be deleted.
CREATE OR REPLACE FUNCTION check_message_not_read_before_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_deleted = false AND NEW.is_deleted = true THEN
    IF OLD.read_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot delete a message that has already been read';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_message_not_read_before_delete ON public.intercom_messages;

CREATE TRIGGER trg_check_message_not_read_before_delete
BEFORE UPDATE ON public.intercom_messages
FOR EACH ROW
EXECUTE FUNCTION check_message_not_read_before_delete();
