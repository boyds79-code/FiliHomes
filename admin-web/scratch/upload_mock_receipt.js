const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load env variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://asqgyncyqnbmitkubjwq.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ";

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function run() {
  const localImagePath = "/Users/chriskim/Downloads/Gemini_Generated_Image_ep29l9ep29l9ep29.jpeg";
  const destinationFileName = "mock-receipt.jpg";

  console.log(`📖 Reading local image from: ${localImagePath}`);
  if (!fs.existsSync(localImagePath)) {
    console.error(`❌ Local image file not found!`);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(localImagePath);

  console.log(`📤 Uploading to Supabase Storage: receipts/${destinationFileName}...`);
  
  // Upload file (upsert: true to overwrite if it already exists)
  const { data, error } = await supabase.storage
    .from('receipts')
    .upload(destinationFileName, fileBuffer, {
      contentType: 'image/jpeg',
      upsert: true
    });

  if (error) {
    console.error("❌ Upload failed:", error);
    process.exit(1);
  }

  console.log(`✅ Upload Succeeded!`);
  console.log(`Data:`, data);
  console.log(`Public URL: ${supabaseUrl}/storage/v1/object/public/receipts/${destinationFileName}`);
}

run();
