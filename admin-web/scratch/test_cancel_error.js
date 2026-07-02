// test_cancel_error.js
const { createClient } = require('@supabase/supabase-js');
const dns = require('dns');

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const supabaseUrl = 'https://asqgyncyqnbmitkubjwq.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testCancel() {
  console.log("🔍 Fetching a non-canceled job order...");
  const { data: job, error: fetchError } = await supabase
    .from('job_orders')
    .select('id, status, title')
    .neq('status', 'CANCELED')
    .limit(1)
    .single();

  if (fetchError || !job) {
    console.error("❌ Failed to fetch job order:", fetchError || "No active jobs found.");
    return;
  }

  console.log(`📌 Found Job Order: ID=${job.id}, Title="${job.title}", Current Status=${job.status}`);
  console.log("⚡ Attempting to update status to CANCELED...");

  const { data: updated, error: updateError } = await supabase
    .from('job_orders')
    .update({ status: 'CANCELED' })
    .eq('id', job.id);

  if (updateError) {
    console.error("❌ Database Error during cancel update:");
    console.error("Message:", updateError.message);
    console.error("Details:", updateError.details);
    console.error("Hint:", updateError.hint);
    console.error("Code:", updateError.code);
  } else {
    console.log("✅ Successfully updated to CANCELED!");
    // Rollback status to prevent data pollution
    console.log("🔄 Rolling back to original status:", job.status);
    await supabase.from('job_orders').update({ status: job.status }).eq('id', job.id);
  }
}

testCancel();
