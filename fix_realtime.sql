-- Enable realtime for job_orders table
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_orders;

-- Verify it was added
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'job_orders';
