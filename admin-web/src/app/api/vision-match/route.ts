import { ImageAnnotatorClient } from '@google-cloud/vision';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

// 1. Vision Client Setup: Read JSON file from lib directly
const keyPath = path.join(process.cwd(), 'src/lib/service-account.json');
const credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const visionClient = new ImageAnnotatorClient({ credentials });

// Attempt to load environment variable directly
const apiKey = process.env.GEMINI_API_KEY || ""; 
const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(req: Request) {
  try {
    // Return error if key is empty
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing!");
      return NextResponse.json({ error: "API Key not configured" }, { status: 500 });
    }

    const { imageUrl, type } = await req.json();
    
    if (!imageUrl) {
      return NextResponse.json({ error: "Image URL is missing" }, { status: 400 });
    }

    // A. Extract text using Vision AI
    const [result] = await visionClient.textDetection(imageUrl);
    const fullText = result.textAnnotations?.[0]?.description || '';
    
    if (!fullText) {
      return NextResponse.json({ error: "No text detected in image" }, { status: 400 });
    }

    // B. Request Gemini to extract reference numbers depending on type
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    if (type === 'statement') {
      const prompt = `
        Extract all transaction Reference Numbers from the following bank statement text.
        - Reference numbers are typically long numbers, between 10 to 15 digits.
        - Return the results as a JSON array of strings, for example: ["1234567890", "9876543210"]
        - If no reference numbers are found, return an empty array: []
        - Provide ONLY the raw JSON array (do not wrap in markdown like \`\`\`json).
        - Do not output any conversational text or other keys.

        Text:
        ${fullText}
      `;

      const aiResult = await model.generateContent(prompt);
      const rawText = aiResult.response.text().trim();
      let refNos: string[] = [];
      try {
        const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        refNos = JSON.parse(cleaned);
      } catch (err) {
        console.error("JSON parse error for statement ref list:", err);
        // regex fallback
        const matches = rawText.match(/\b\d{10,15}\b/g);
        if (matches) {
          refNos = Array.from(new Set(matches));
        }
      }

      return NextResponse.json({
        success: true,
        refNos: refNos || [],
        fullText: fullText
      });
    } else {
      const prompt = `
        Extract the payment Reference Number from the following receipt text.
        - It is a long number, typically 10 to 15 digits.
        - Return ONLY the extracted numbers.
        - If no reference number is found, return "null".
        - Provide no other explanation, just the result.

        Text:
        ${fullText}
      `;

      const aiResult = await model.generateContent(prompt);
      let refNo = aiResult.response.text().trim();

      if (refNo.toLowerCase() === "null") refNo = "";

      return NextResponse.json({ 
        success: true, 
        refNo: refNo || null,
        fullText: fullText 
      });
    }
  } catch (error: any) {
    console.error("Vision/Gemini Match Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}