const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local in admin-web
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ GEMINI_API_KEY is missing from .env.local!");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

// Helper to convert local file to Generative Part
function fileToGenerativePart(filePath, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
      mimeType
    },
  };
}

async function run() {
  const imagePath = "/Users/chriskim/Downloads/Gemini_Generated_Image_ep29l9ep29l9ep29.jpeg";
  const outputPath = "/Users/chriskim/Downloads/Gemini_Generated_Image_ep29l9ep29l9ep29.csv";

  console.log(`📖 Reading image file: ${imagePath}`);
  if (!fs.existsSync(imagePath)) {
    console.error(`❌ Image file not found at: ${imagePath}`);
    process.exit(1);
  }

  // Use gemini-2.5-flash for general OCR/Vision tasks
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const imagePart = fileToGenerativePart(imagePath, "image/jpeg");

  const prompt = `You are a data extraction expert. Extract the bank transaction table from the provided image into a structured CSV format.
Rules:
1. Provide ONLY the CSV content inside a markdown code block starting with \`\`\`csv or as raw text. Do not include any conversational explanation before or after.
2. Structure the CSV with standard transaction columns like:
   Transaction ID, Date/Time, Description, Amount, Reference Number (adjust the header names to match the columns shown in the image).
3. The Amount column should be a raw number (e.g. 1500.00 or -350.00) without currency symbols.
4. Ensure no trailing blank columns or syntax errors.`;

  console.log("🤖 Sending image to Gemini API for CSV extraction...");
  try {
    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const responseText = response.text();
    
    // Parse the CSV out of the response text
    let csvContent = responseText;
    if (responseText.includes("```csv")) {
      csvContent = responseText.split("```csv")[1].split("```")[0];
    } else if (responseText.includes("```")) {
      csvContent = responseText.split("```")[1].split("```")[0];
      if (csvContent.startsWith("csv\n")) {
        csvContent = csvContent.slice(4);
      }
    }
    
    csvContent = csvContent.trim();
    
    fs.writeFileSync(outputPath, csvContent, 'utf8');
    console.log(`\n🎉 Extraction Complete!`);
    console.log(`Saved CSV file to: ${outputPath}`);
    console.log("\n--- CSV Content Preview ---");
    console.log(csvContent);
    console.log("---------------------------");
  } catch (error) {
    console.error("❌ Error during vision processing:", error);
  }
}

run();
