-- RLS Policies for Intercom and User Units Tables to Support Guard App
-- All comments are in English as per rules.

-- 1. USER_UNITS RLS policies
ALTER TABLE public.user_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_units_select_policy ON public.user_units;
DROP POLICY IF EXISTS select_policy ON public.user_units;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.user_units;
DROP POLICY IF EXISTS user_units_select_all ON public.user_units;

CREATE POLICY user_units_select_all ON public.user_units
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.staff_profiles WHERE id = auth.uid() AND is_active = true
    )
  );

-- 2. UNITS RLS policies
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS units_select_policy ON public.units;
DROP POLICY IF EXISTS units_select_all ON public.units;

CREATE POLICY units_select_all ON public.units
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. INTERCOM_CHATS RLS policies
ALTER TABLE public.intercom_chats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intercom_chats_select_policy ON public.intercom_chats;
DROP POLICY IF EXISTS intercom_chats_select ON public.intercom_chats;
DROP POLICY IF EXISTS intercom_chats_insert ON public.intercom_chats;
DROP POLICY IF EXISTS intercom_chats_update ON public.intercom_chats;

-- Allow select for the chat owner (resident) or any active staff member (guard/pmo)
CREATE POLICY intercom_chats_select ON public.intercom_chats
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.staff_profiles WHERE id = auth.uid() AND is_active = true
    )
  );

-- Allow insert for the chat owner (resident) or any active staff member (guard/pmo)
CREATE POLICY intercom_chats_insert ON public.intercom_chats
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.staff_profiles WHERE id = auth.uid() AND is_active = true
    )
  );

-- Allow update for the chat owner (resident) or any active staff member (guard/pmo)
CREATE POLICY intercom_chats_update ON public.intercom_chats
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.staff_profiles WHERE id = auth.uid() AND is_active = true
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.staff_profiles WHERE id = auth.uid() AND is_active = true
    )
  );

-- 4. INTERCOM_MESSAGES RLS policies
ALTER TABLE public.intercom_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intercom_messages_select_policy ON public.intercom_messages;
DROP POLICY IF EXISTS intercom_messages_select ON public.intercom_messages;
DROP POLICY IF EXISTS intercom_messages_insert ON public.intercom_messages;

-- Allow select if user is the chat owner or any active staff member
CREATE POLICY intercom_messages_select ON public.intercom_messages
  FOR SELECT
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
  );

-- Allow insert if user is the chat owner or any active staff member
CREATE POLICY intercom_messages_insert ON public.intercom_messages
  FOR INSERT
  TO authenticated
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

-- 5. Enable Realtime for intercom tables in supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'intercom_chats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.intercom_chats;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'intercom_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.intercom_messages;
  END IF;
END $$;
