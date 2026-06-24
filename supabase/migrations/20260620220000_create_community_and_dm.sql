-- Migration to add Community database tables and Direct Message (DM) system
-- All comments are in English as per rules.

-- 1. Create COMMUNITY_POSTS Table
CREATE TABLE IF NOT EXISTS public.community_posts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    unit_number VARCHAR(50) NOT NULL,
    image_url TEXT,
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for community_posts
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

-- Policies for community_posts
CREATE POLICY community_posts_select ON public.community_posts
    FOR SELECT TO authenticated USING (true);

CREATE POLICY community_posts_insert ON public.community_posts
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY community_posts_update ON public.community_posts
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY community_posts_delete ON public.community_posts
    FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- 2. Create COMMUNITY_REPORTS Table
CREATE TABLE IF NOT EXISTS public.community_reports (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    post_id BIGINT REFERENCES public.community_posts(id) ON DELETE CASCADE NOT NULL,
    reporter_id UUID REFERENCES auth.users(id) DEFAULT auth.uid() NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for community_reports
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

-- Policies for community_reports
CREATE POLICY community_reports_insert ON public.community_reports
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY community_reports_select ON public.community_reports
    FOR SELECT TO authenticated USING (
        auth.uid() = reporter_id 
        OR EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = auth.uid() AND is_active = true)
    );


-- 3. Create COMMUNITY_BLOCKS Table
CREATE TABLE IF NOT EXISTS public.community_blocks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    blocker_id UUID REFERENCES auth.users(id) DEFAULT auth.uid() NOT NULL,
    blocked_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_blocker_blocked UNIQUE (blocker_id, blocked_user_id)
);

-- Enable RLS for community_blocks
ALTER TABLE public.community_blocks ENABLE ROW LEVEL SECURITY;

-- Policies for community_blocks
CREATE POLICY community_blocks_select ON public.community_blocks
    FOR SELECT TO authenticated USING (auth.uid() = blocker_id);

CREATE POLICY community_blocks_insert ON public.community_blocks
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY community_blocks_delete ON public.community_blocks
    FOR DELETE TO authenticated USING (auth.uid() = blocker_id);


-- 4. Create DIRECT_CHATS Table (For User-to-User DMs)
CREATE TABLE IF NOT EXISTS public.direct_chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id UUID REFERENCES auth.users(id) NOT NULL,
    user2_id UUID REFERENCES auth.users(id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_direct_chat_users UNIQUE (user1_id, user2_id)
);

-- Enable RLS for direct_chats
ALTER TABLE public.direct_chats ENABLE ROW LEVEL SECURITY;

-- Policies for direct_chats
CREATE POLICY direct_chats_select ON public.direct_chats
    FOR SELECT TO authenticated USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY direct_chats_insert ON public.direct_chats
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);


-- 5. Create DIRECT_MESSAGES Table
CREATE TABLE IF NOT EXISTS public.direct_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    chat_id UUID REFERENCES public.direct_chats(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES auth.users(id) DEFAULT auth.uid() NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for direct_messages
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- Policies for direct_messages
CREATE POLICY direct_messages_select ON public.direct_messages
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.direct_chats 
            WHERE id = chat_id AND (user1_id = auth.uid() OR user2_id = auth.uid())
        )
    );

CREATE POLICY direct_messages_insert ON public.direct_messages
    FOR INSERT TO authenticated WITH CHECK (
        auth.uid() = sender_id AND
        EXISTS (
            SELECT 1 FROM public.direct_chats 
            WHERE id = chat_id AND (user1_id = auth.uid() OR user2_id = auth.uid())
        )
    );


-- 6. Enable Realtime for direct_messages in supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'direct_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'community_posts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_posts;
  END IF;
END $$;


-- 7. Insert some Seed Data for community_posts
INSERT INTO public.community_posts (category, title, content, unit_number, created_at)
VALUES
('JOBS', '📌 Recommended Stay-out Maid (Ate)?', 'Looking for a reliable maid for Unit 1204. Mostly general cleaning and laundry twice a week.', '1204', now() - interval '1 hour'),
('LOST_FOUND', '🍕 Found Black Umbrella at Tower 2 Lobby', 'Left near the receptionist desk this afternoon. Passed it to the security guard on duty so you can claim it there.', '1502', now() - interval '3 hours'),
('REAL_ESTATE', '🔑 Studio Unit for Re-lease (Tower 1)', 'Urgent contract takeover for Studio Unit on 8th floor. Fully furnished, ₱18,000/month. PM for viewing.', '0804', now() - interval '5 hours');
