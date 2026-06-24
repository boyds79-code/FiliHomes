const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('/Users/chriskim/Documents/FiliCondo/admin-web/.env.local'));
const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envConfig.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  const { data: messages, error } = await supabase
    .from('intercom_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  
  if (error) {
    console.error("Error fetching messages:", error);
    return;
  }
  
  console.log("Recent messages:", JSON.stringify(messages, null, 2));
}

main();
