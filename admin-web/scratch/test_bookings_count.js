const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  try {
    const { data: pendingBookings, error: pendingError } = await supabase
      .from('amenity_bookings')
      .select('id, unit_id')
      .eq('status', 'PENDING');
    
    if (pendingError) throw pendingError;
    
    if (pendingBookings && pendingBookings.length > 0) {
      const unitIds = Array.from(new Set(pendingBookings.map(b => b.unit_id).filter(Boolean)));
      if (unitIds.length > 0) {
        const { data: unitsData, error: unitsError } = await supabase
          .from('units')
          .select('id, condo_id')
          .in('id', unitIds)
          .eq('condo_id', 'c1111111-1111-1111-1111-111111111111');
        
        if (unitsError) throw unitsError;
        
        const matchedUnitIds = new Set(unitsData.map(u => u.id));
        const count = pendingBookings.filter(b => b.unit_id && matchedUnitIds.has(b.unit_id)).length;
        console.log("Success! Pending bookings count for condo:", count);
      } else {
        console.log("No unit IDs in pending bookings. Count is 0.");
      }
    } else {
      console.log("No pending bookings in table. Count is 0.");
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
