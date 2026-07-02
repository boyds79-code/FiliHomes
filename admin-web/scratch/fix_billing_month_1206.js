// fix_billing_month_1206.js
const { createClient } = require('@supabase/supabase-js');
const dns = require('dns');

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const supabaseUrl = 'https://asqgyncyqnbmitkubjwq.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const billingId = 39;
  
  console.log(`⚡ Updating billing id ${billingId} to June 2026 and setting total_due...`);
  
  const { data: updated, error: uError } = await supabase
    .from('billings')
    .update({
      billing_month: '2026-06',
      due_date: '2026-07-29',
      total_due: 4300,
      job_order_fee: 4300
    })
    .eq('id', billingId)
    .select();

  if (uError) {
    console.error("❌ Update error:", uError);
    return;
  }

  console.log("✅ Update complete!");
  console.log(JSON.stringify(updated, null, 2));
}

run();
