const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://asqgyncyqnbmitkubjwq.supabase.co";
const supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log("Fetching latest 10 notifications...");
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error("Error fetching notifications:", error);
  } else {
    console.log("=== LATEST NOTIFICATIONS ===");
    console.log(JSON.stringify(data, null, 2));
  }
}

run();
