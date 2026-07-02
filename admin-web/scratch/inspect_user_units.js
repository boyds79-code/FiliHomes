// inspect_user_units.js
const { createClient } = require('@supabase/supabase-js');
const dns = require('dns');

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const supabaseUrl = 'https://asqgyncyqnbmitkubjwq.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspect() {
  const email = 'mj23@bulls.com';
  console.log(`🔍 Inspecting email: ${email}`);
  
  const { data: profile, error: pError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('email', email)
    .maybeSingle();

  if (pError || !profile) {
    console.error("❌ Profile not found or error:", pError);
    return;
  }

  console.log(`👤 User profile: ID=${profile.id}, Name=${profile.full_name}`);

  console.log("🔗 Querying all user_units mappings for this user...");
  const { data: mappings, error: mError } = await supabase
    .from('user_units')
    .select('id, unit_id, role, status, units(unit_number)')
    .eq('user_id', profile.id);

  if (mError) {
    console.error("❌ user_units fetch error:", mError);
    return;
  }

  console.log("📊 user_units mappings found:", mappings.length);
  mappings.forEach(m => {
    console.log(`- Mapping ID: ${m.id}, Unit: ${m.units?.unit_number || m.unit_id}, Role: ${m.role}, Status: ${m.status}`);
  });

  console.log("📝 Querying pending occupant modification requests for this user...");
  const mappingIds = mappings.map(m => m.id);
  const { data: requests, error: rError } = await supabase
    .from('occupant_modification_requests')
    .select('id, mapping_id, role, status, full_name')
    .in('mapping_id', mappingIds);

  if (rError) {
    console.error("❌ occupant_modification_requests fetch error:", rError);
    return;
  }

  console.log("📊 occupant_modification_requests found:", requests.length);
  requests.forEach(r => {
    console.log(`- Request ID: ${r.id}, Mapping ID: ${r.mapping_id}, Requested Role: ${r.role}, Status: ${r.status}`);
  });
}

inspect();
