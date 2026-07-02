const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://asqgyncyqnbmitkubjwq.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

const unitId = '1dba72f2-2edc-41ae-98d4-53dec93f2bf1'; // Unit 1206 ID

async function main() {
  console.log("🔍 Fetching billing & receipt for Unit 1206...");
  
  const { data: billing } = await supabase
    .from('billings')
    .select('id, status')
    .eq('unit_id', unitId)
    .single();

  if (!billing) {
    console.log("❌ Billing not found.");
    return;
  }

  const { data: receipts } = await supabase
    .from('receipts')
    .select('*')
    .eq('billing_id', billing.id);

  if (!receipts || receipts.length === 0) {
    console.log("❌ No receipts found for this billing.");
    return;
  }

  const imageUrl = receipts[0].receipt_image_url;
  console.log("📷 Image URL found:", imageUrl);

  // Read local file or fetch URL
  let imagePart;
  if (imageUrl.startsWith('http')) {
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
    const response = await fetch(imageUrl);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = response.headers.get("content-type") || "image/jpeg";
    imagePart = {
      inlineData: {
        data: buffer.toString("base64"),
        mimeType: mimeType
      }
    };
  } else {
    // If it's a local file path
    const fs = require('fs');
    if (fs.existsSync(imageUrl)) {
      const buffer = fs.readFileSync(imageUrl);
      imagePart = {
        inlineData: {
          data: buffer.toString("base64"),
          mimeType: "image/jpeg"
        }
      };
    } else {
      console.log("❌ Local file path does not exist:", imageUrl);
      return;
    }
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `
    You are an AI receipt analyzer.
    Identify the Reference Number / Transaction No and the total amount paid (in PHP/Pesos) from this receipt image.
    Please look at the image very closely.
    - Transcribe the reference number carefully digit-by-digit.
    - Transcribe the payment/transfer amount paid (excluding any currency symbols).
    - Return the results as a raw JSON object, for example: {"refNo": "1234567890", "amount": 4300}
    - If no reference number is found, set "refNo" to null.
    - If no amount is found, set "amount" to null.
    - Provide ONLY the raw JSON object (do not wrap in markdown like \`\`\`json).
    - Do not output any conversational text or other keys.
  `;

  console.log("🚀 Sending to Gemini...");
  const aiResult = await model.generateContent([prompt, imagePart]);
  const rawText = aiResult.response.text().trim();
  console.log("\n💬 Raw Gemini Response:\n", rawText);
}

main();
