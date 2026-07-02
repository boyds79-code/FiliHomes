// test_receipt_upload.js
const { createClient } = require('@supabase/supabase-js');
const dns = require('dns');

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const supabaseUrl = 'https://asqgyncyqnbmitkubjwq.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const billingId = 39;
  const receiptUrl = 'https://asqgyncyqnbmitkubjwq.supabase.co/storage/v1/object/public/receipts/mock-receipt.jpg';
  
  console.log(`🏁 Starting mock receipt upload for billing ${billingId}...`);

  try {
    console.log("1. Trying to insert into 'receipts' table...");
    const { data: rec, error: insertError } = await adminClient
      .from('receipts')
      .insert([{
        billing_id: billingId,
        receipt_image_url: receiptUrl,
        status: 'PENDING_MATCHING'
      }])
      .select();

    if (insertError) {
      console.error("❌ Receipts table INSERT failed!");
      console.error("Message:", insertError.message);
      console.error("Details:", insertError.details);
      console.error("Hint:", insertError.hint);
      console.error("Code:", insertError.code);
      return;
    }

    console.log("✅ Insert into receipts table succeeded:", rec);

    console.log("2. Trying to update status in 'billings' table...");
    const { data: bill, error: updateError } = await adminClient
      .from('billings')
      .update({ status: 'REQUESTED' })
      .eq('id', billingId)
      .select();

    if (updateError) {
      console.error("❌ Billings table UPDATE failed!");
      console.error("Message:", updateError.message);
      console.error("Details:", updateError.details);
      console.error("Hint:", updateError.hint);
      console.error("Code:", updateError.code);
      return;
    }

    console.log("✅ Update status in billings table succeeded:", bill);
    console.log("🎉 All actions completed successfully!");
  } catch (err) {
    console.error("🔥 Unexpected error:", err);
  }
}

run();
