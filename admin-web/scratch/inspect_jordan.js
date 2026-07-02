// inspect_jordan.js
const { createClient } = require('@supabase/supabase-js');
const dns = require('dns');

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const supabaseUrl = 'https://asqgyncyqnbmitkubjwq.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspect() {
  console.log("🔍 Searching for profiles with name 'Michael Jordan'...");
  const { data: profiles, error: pError } = await supabase
    .from('profiles')
    .select('*')
    .ilike('full_name', '%Michael Jordan%');

  if (pError) {
    console.error("❌ Profile fetch error:", pError);
    return;
  }

  console.log("📊 Found profiles count:", profiles.length);
  for (const p of profiles) {
    console.log(`\n👤 Profile ID: ${p.id}, FullName: ${p.full_name}, Email: ${p.email}`);
    
    // Mappings
    const { data: mappings, error: mError } = await supabase
      .from('user_units')
      .select('id, unit_id, role, status, units(unit_number)')
      .eq('user_id', p.id);
      
    if (mError) {
      console.error("  ❌ user_units error:", mError);
      continue;
    }
    
    console.log(`  📊 user_units mappings (${mappings.length}):`);
    mappings.forEach(m => {
      console.log(`    - ID: ${m.id}, Unit: ${m.units?.unit_number || m.unit_id}, Role: ${m.role}, Status: ${m.status}`);
    });
  }
}

inspect();
