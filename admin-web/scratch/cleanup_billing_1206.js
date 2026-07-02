// cleanup_billing_1206.js
const { createClient } = require('@supabase/supabase-js');
const dns = require('dns');

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const supabaseUrl = 'https://asqgyncyqnbmitkubjwq.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const unitId = '1dba72f2-2edc-41ae-98d4-53dec93f2bf1';
  
  console.log("🔍 Querying 2026-06 billings with total_due = 7230...");
  const { data: target, error: fError } = await supabase
    .from('billings')
    .select('id, total_due, status')
    .eq('unit_id', unitId)
    .eq('billing_month', '2026-06')
    .eq('total_due', 7230)
    .maybeSingle();

  if (fError) {
    console.error("❌ Fetch error:", fError);
    return;
  }

  if (target) {
    console.log(`📌 Found duplicate 6월 billing to delete: ID=${target.id}, TotalDue=${target.total_due}, Status=${target.status}`);
    
    const { error: dError } = await supabase
      .from('billings')
      .delete()
      .eq('id', target.id);

    if (dError) {
      console.error("❌ Delete error:", dError);
      return;
    }
    console.log("✅ Successfully deleted duplicate 6월 billing!");
  } else {
    console.log("ℹ️ No duplicate 6월 billing with total_due = 7230 found.");
  }

  // Double check remaining billings for 2026-06
  console.log("🔍 Checking remaining billings for 2026-06...");
  const { data: remaining } = await supabase
    .from('billings')
    .select('*')
    .eq('unit_id', unitId)
    .eq('billing_month', '2026-06');
    
  console.log("📊 Remaining 6월 billings count:", remaining ? remaining.length : 0);
  if (remaining) {
    remaining.forEach(r => {
      console.log(JSON.stringify(r, null, 2));
    });
  }
}

run();
