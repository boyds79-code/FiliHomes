// inspect_requests.js
const { createClient } = require('@supabase/supabase-js');
const dns = require('dns');

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const supabaseUrl = 'https://asqgyncyqnbmitkubjwq.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspect() {
  console.log("🔍 Fetching pending requests...");
  const { data: requests, error: rError } = await supabase
    .from('occupant_modification_requests')
    .select('*')
    .eq('status', 'pending');

  if (rError) {
    console.error("❌ occupant_modification_requests fetch error:", rError);
    return;
  }

  console.log("📊 Pending requests found:", requests.length);
  for (const r of requests) {
    console.log(`\n📌 Request ID: ${r.id}`);
    console.log(`- Full Name: ${r.full_name}, Phone: ${r.phone}, Requested Role: ${r.role}`);
    console.log(`- Mapping ID: ${r.mapping_id}`);
    
    // Fetch mapping
    const { data: m, error: mError } = await supabase
      .from('user_units')
      .select('id, user_id, unit_id, role, status, units(unit_number)')
      .eq('id', r.mapping_id)
      .maybeSingle();

    if (mError || !m) {
      console.error(`  ❌ user_units fetch error for mapping_id ${r.mapping_id}:`, mError || "Not found");
      continue;
    }

    console.log(`  🔗 user_units: ID=${m.id}, UserID=${m.user_id}, Unit=${m.units?.unit_number || m.unit_id}, Role=${m.role}, Status=${m.status}`);
    
    // Fetch profile
    const { data: p } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', m.user_id)
      .maybeSingle();

    if (p) {
      console.log(`  👤 Profile: ID=${p.id}, FullName=${p.full_name}, Email=${p.email}, UnitID=${p.unit_id}`);
    } else {
      console.log(`  👤 Profile: Not found in profiles table for user_id ${m.user_id}`);
    }

    // Check if there are other user_units mappings for this user_id and unit_id
    const { data: others } = await supabase
      .from('user_units')
      .select('id, role, status')
      .eq('user_id', m.user_id)
      .eq('unit_id', m.unit_id);
    
    console.log(`  📊 All user_units for UserID ${m.user_id} and UnitID ${m.unit_id}:`, others ? others.length : 0);
    if (others) {
      others.forEach(o => {
        console.log(`    - ID: ${o.id}, Role: ${o.role}, Status: ${o.status}`);
      });
    }
  }
}

inspect();
