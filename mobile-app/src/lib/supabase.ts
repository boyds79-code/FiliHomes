import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://asqgyncyqnbmitkubjwq.supabase.co";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjUzOTIsImV4cCI6MjA5NDg0MTM5Mn0.0D7aoNbgXnhGCpqVSA2B34ttfLliTzTibwr1-LzV2ac";

console.log("🛠️ Initializing SUPABASE client...");
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage, // This part is crucial
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
console.log("✅ SUPABASE client created.");

// Add: Set to log on every auth call
supabase.auth.onAuthStateChange((event, session) => {
  console.log("🚀 Auth Event:", event, session ? "Logged In" : "Logged Out");
});