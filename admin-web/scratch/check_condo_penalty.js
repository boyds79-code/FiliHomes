const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://asqgyncyqnbmitkubjwq.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const condoId = 'c1111111-1111-1111-1111-111111111111';

async function main() {
  console.log("🔍 Fetching condo settings from Supabase...");
  
  const { data: condo, error } = await supabase
    .from('condos')
    .select('*')
    .eq('id', condoId)
    .single();

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("Condo penalty_rate:", condo.penalty_rate);
  console.log("Condo Full Row:", condo);
}

main();
