const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testJobStatus() {
  console.log("1. Trying CANCELED (one L)...");
  const { data: d1, error: e1 } = await supabase
    .from('job_orders')
    .update({ status: 'CANCELED' })
    .eq('id', 1) // Just a dummy update to see constraint check on status value
    .select();

  if (e1) {
    console.log("CANCELED Error:", e1.message);
  } else {
    console.log("CANCELED Success:", d1);
  }

  console.log("2. Trying CANCELLED (two Ls)...");
  const { data: d2, error: e2 } = await supabase
    .from('job_orders')
    .update({ status: 'CANCELLED' })
    .eq('id', 1)
    .select();

  if (e2) {
    console.log("CANCELLED Error:", e2.message);
  } else {
    console.log("CANCELLED Success:", d2);
  }
}

testJobStatus();
