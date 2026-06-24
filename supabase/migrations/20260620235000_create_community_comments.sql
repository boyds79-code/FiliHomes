-- Migration to add Community Comments table
-- All comments are in English as per rules.

CREATE TABLE IF NOT EXISTS public.community_comments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    post_id BIGINT REFERENCES public.community_posts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid() NOT NULL,
    unit_number VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for community_comments
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;

-- Policies for community_comments
CREATE POLICY community_comments_select ON public.community_comments
    FOR SELECT TO authenticated USING (true);

CREATE POLICY community_comments_insert ON public.community_comments
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY community_comments_delete ON public.community_comments
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Enable Realtime for community_comments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'community_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_comments;
  END IF;
END $$;
