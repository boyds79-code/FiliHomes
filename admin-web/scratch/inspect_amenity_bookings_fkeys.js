const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  try {
    const { error: insertError } = await supabase
      .from('amenity_bookings')
      .insert([{
        unit_id: '00000000-0000-0000-0000-000000000000',
        user_id: '045d6444-f94c-462f-9a84-66e6e12ca0db',
        amenity_id: 'gym',
        booking_date: '2026-01-01',
        slot_time: '09:00 AM - 11:00 AM',
        status: 'PENDING'
      }]);
    console.log("Insert Error with bad unit_id:", insertError);
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
