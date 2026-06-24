// [admin-web/lib/supabaseClient.ts]
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://asqgyncyqnbmitkubjwq.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjUzOTIsImV4cCI6MjA5NDg0MTM5Mn0.0D7aoNbgXnhGCpqVSA2B34ttfLliTzTibwr1-LzV2ac';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);