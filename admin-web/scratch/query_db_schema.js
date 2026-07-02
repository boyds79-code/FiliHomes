const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://asqgyncyqnbmitkubjwq.supabase.co";
const supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const sql = `
    SELECT 
      trg.tgname AS trigger_name,
      tbl.relname AS table_name,
      p.proname AS function_name,
      p.prosrc AS function_source
    FROM pg_trigger trg
    JOIN pg_class tbl ON trg.tgrelid = tbl.oid
    JOIN pg_proc p ON trg.tgfoid = p.oid
    WHERE tbl.relname = 'visitor_passes';
  `;

  console.log("Querying database triggers on visitor_passes...");
  const { data, error } = await supabase.rpc('exec_sql', { sql });

  if (error) {
    console.error("Error executing query:", error);
  } else {
    console.log("=== TRIGGERS FOUND ON VISITOR_PASSES ===");
    console.log(JSON.stringify(data, null, 2));
  }
}

run();
