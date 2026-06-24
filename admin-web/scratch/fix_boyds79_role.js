const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  try {
    const targetUserId = '045d6444-f94c-462f-9a84-66e6e12ca0db'; // boyds79@gmail.com
    
    console.log(`Deleting user ID: ${targetUserId} (boyds79@gmail.com) from staff_profiles table...`);
    
    const { data, error } = await supabase
      .from('staff_profiles')
      .delete()
      .eq('id', targetUserId)
      .select();
      
    if (error) throw error;
    
    console.log("Success! Deleted records:", data);
  } catch (err) {
    console.error("Error fixing role:", err);
  }
}

run();
