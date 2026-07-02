const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://asqgyncyqnbmitkubjwq.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const unitId = '1dba72f2-2edc-41ae-98d4-53dec93f2bf1'; // Unit 1206 ID

async function main() {
  console.log("🔄 Resetting Unit 1206 June 2026 billing row in Supabase...");
  
  // 1. Reset bill to REQUESTED and restore original amounts
  const { data: bill, error: billErr } = await supabase
    .from('billings')
    .update({
      status: 'REQUESTED',
      previous_balance: 3900,
      condo_dues: 0,
      amenity_fee: 400,
      penalty_amount: 0,
      description: `Monthly billing statement for 2026-06\n-- Amenity Sessions --\nspa Session: ₱200\nspa Session: ₱200`
    })
    .eq('unit_id', unitId)
    .eq('billing_month', '2026-06')
    .select();

  if (billErr) {
    console.error("❌ Error resetting bill:", billErr);
    return;
  }

  console.log("✅ Bill reset successfully:", bill);
}

main();
