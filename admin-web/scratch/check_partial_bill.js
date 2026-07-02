const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://asqgyncyqnbmitkubjwq.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const unitId = '1dba72f2-2edc-41ae-98d4-53dec93f2bf1'; // Unit 1206 ID

async function main() {
  console.log("🔍 Querying Unit 1206 billing record from Supabase...");
  
  const { data: billings, error } = await supabase
    .from('billings')
    .select('*')
    .eq('unit_id', unitId)
    .order('billing_month', { ascending: false });

  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("\nBilling Rows for Unit 1206:");
  billings.forEach(b => {
    console.log(`\nMonth: ${b.billing_month}`);
    console.log(`Status: ${b.status}`);
    console.log(`Condo Dues: ${b.condo_dues}`);
    console.log(`Electricity: ${b.electricity}`);
    console.log(`Water: ${b.water}`);
    console.log(`Parking: ${b.parking_fee}`);
    console.log(`Job Order: ${b.job_order_fee}`);
    console.log(`Previous Balance: ${b.previous_balance}`);
    console.log(`Penalty Amount: ${b.penalty_amount}`);
    console.log(`Amenity Fee: ${b.amenity_fee}`);
    console.log(`Description: ${b.description}`);
  });
}

main();
