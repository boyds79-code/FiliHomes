const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const unitId = '1dba72f2-2edc-41ae-98d4-53dec93f2bf1'; // Unit 1206 ID

async function main() {
  console.log(`🔄 Updating billing statement for Unit 1206 (ID: ${unitId}) to ₱3,900 base + ₱400 amenity = ₱4,300 total...`);

  // Update the row for 2026-06
  const { data, error } = await supabase
    .from('billings')
    .update({
      previous_balance: 3900,
      total_due: 4300
    })
    .eq('unit_id', unitId)
    .eq('billing_month', '2026-06')
    .select();

  if (error) {
    console.error("❌ Failed to update billing:", error.message);
  } else {
    console.log("✅ Billing updated successfully!");
    console.log("Updated record details:", data);
  }
}

main();
