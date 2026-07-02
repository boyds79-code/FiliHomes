// inspect_updated_billing.js
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
  console.log(`🔍 Fetching latest billings for Unit ID ${unitId} in real-time...`);
  
  const { data: billings, error } = await supabase
    .from('billings')
    .select('*')
    .eq('unit_id', unitId)
    .order('billing_month', { ascending: false });

  if (error) {
    console.error("❌ Error fetching billings:", error);
    return;
  }

  console.log(`📊 Billings found: ${billings.length}`);
  billings.forEach(b => {
    console.log(`- Month: ${b.billing_month}, Status: ${b.status}, JobOrderFee: ${b.job_order_fee}, TotalDue: ${b.total_due}, ReceiptURL: ${b.receipt_url}`);
  });
}

run();
