const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://asqgyncyqnbmitkubjwq.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("🔍 Fetching all billing rows from Supabase...");
  
  const { data: billings, error } = await supabase
    .from('billings')
    .select('id, unit_id, billing_month, condo_dues, previous_balance, status');

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log(`Total Billing Statements: ${billings.length}`);
  billings.forEach(b => {
    console.log(`ID: ${b.id} | Unit ID: ${b.unit_id} | Month: ${b.billing_month} | Dues: ${b.condo_dues} | Prev Bal: ${b.previous_balance} | Status: ${b.status}`);
  });
}

main();
