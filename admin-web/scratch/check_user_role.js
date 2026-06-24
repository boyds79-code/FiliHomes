const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  try {
    // 1. Get profile of user by email
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', 'boyds79@gmail.com')
      .maybeSingle();

    if (profileError) throw profileError;
    console.log("=== PROFILES TABLE ===");
    console.log(profile);

    if (profile) {
      // 2. Check if user is in staff_profiles
      const { data: staff, error: staffError } = await supabase
        .from('staff_profiles')
        .select('*')
        .eq('id', profile.id)
        .maybeSingle();
      
      if (staffError) throw staffError;
      console.log("\n=== STAFF_PROFILES TABLE ===");
      console.log(staff);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
