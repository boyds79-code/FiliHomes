const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  try {
    const { data: staff, error } = await supabase
      .from('staff_profiles')
      .select('*');
    
    if (error) throw error;
    
    console.log("=== STAFF PROFILES ===");
    for (const member of staff) {
      // Find matching email in profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', member.id)
        .maybeSingle();
      
      console.log(`ID: ${member.id} | Name: ${member.full_name} | Staff Role: ${member.role} | Email: ${profile?.email || 'N/A'}`);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
