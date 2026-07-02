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
  console.log(`🔍 Checking database for Unit 1206 (ID: ${unitId})...`);

  // 1. Fetch current month billings
  const { data: billings, error: billErr } = await supabase
    .from('billings')
    .select('*')
    .eq('unit_id', unitId);

  if (billErr) {
    console.error("❌ Error fetching billings:", billErr.message);
  } else {
    console.log(`\n💵 Billing Statements found (${billings.length}):`);
    billings.forEach(b => {
      console.log(`- Month: ${b.billing_month}`);
      console.log(`  Status: ${b.status}`);
      console.log(`  Outstanding Balance (Previous): ₱${b.previous_balance}`);
      console.log(`  Amenity Fee: ₱${b.amenity_fee}`);
      console.log(`  Total Due: ₱${b.total_due}`);
      console.log(`  Description: "${b.description}"`);
      console.log('-----------------------------------');
    });
  }

  // 2. Fetch completed amenity bookings
  const { data: bookings, error: bookErr } = await supabase
    .from('amenity_bookings')
    .select('*')
    .eq('unit_id', unitId)
    .eq('status', 'COMPLETED');

  if (bookErr) {
    console.error("❌ Error fetching amenity bookings:", bookErr.message);
  } else {
    console.log(`\n🏊 Completed Amenity Bookings found (${bookings.length}):`);
    bookings.forEach(b => {
      console.log(`- Date: ${b.booking_date}`);
      console.log(`  Amenity: ${b.amenity_id}`);
      console.log(`  Slot Time: ${b.slot_time}`);
      console.log(`  Status: ${b.status}`);
      console.log('-----------------------------------');
    });
  }
}

main();
