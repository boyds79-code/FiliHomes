import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

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

    // 1. Fetch the image and convert to base64 for Gemini Multimodal
    let imagePart;
    try {
      let finalUrl = imageUrl;
      if (imageUrl.startsWith('/')) {
        const host = req.headers.get('host') || 'localhost:3000';
        const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
        finalUrl = `${protocol}://${host}${imageUrl}`;
      }

      console.log("Vision API (Gemini): Fetching image from URL:", finalUrl);
      const imageResponse = await fetch(finalUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image from URL: ${imageResponse.status} ${imageResponse.statusText}`);
      }
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";
      
      imagePart = {
        inlineData: {
          data: imageBuffer.toString("base64"),
          mimeType: mimeType
        }
      };
    } catch (fetchErr: any) {
      console.error("Failed to fetch image from URL, attempting local file path fallback:", fetchErr);
      if (fs.existsSync(imageUrl)) {
        const imageBuffer = fs.readFileSync(imageUrl);
        imagePart = {
          inlineData: {
            data: imageBuffer.toString("base64"),
            mimeType: "image/jpeg"
          }
        };
      } else {
        throw fetchErr;
      }
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    if (type === 'statement') {
      const prompt = `
        You are an AI bank statement analyzer.
        Look at this bank statement image and extract all transaction Reference Numbers.
        - Reference numbers are typically long numbers, between 10 to 15 digits.
        - Be extremely precise with repeating numbers (e.g. check if there are two or three 9s).
        - Return the results as a JSON array of strings, for example: ["1234567890", "9876543210"]
        - If no reference numbers are found, return an empty array: []
        - Provide ONLY the raw JSON array (do not wrap in markdown like \`\`\`json).
        - Do not output any conversational text or other keys.
      `;

      console.log("Vision API (Gemini): Sending bank statement image to model...");
      const aiResult = await model.generateContent([prompt, imagePart]);
      const rawText = aiResult.response.text().trim();
      console.log("Vision API (Gemini) Response:", rawText);

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
        fullText: rawText
      });
    } else {
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

      console.log("Vision API (Gemini): Sending receipt image to model...");
      const aiResult = await model.generateContent([prompt, imagePart]);
      const rawText = aiResult.response.text().trim();
      console.log("Vision API (Gemini) Response:", rawText);

      let refNo = null;
      let amount = null;
      try {
        const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        
        // Support common variations of reference number keys
        const extractedRef = parsed.refNo || parsed.ref_no || parsed.referenceNumber || parsed.reference_number || parsed.ref || parsed.transactionNo || parsed.transaction_no;
        refNo = extractedRef ? String(extractedRef).replace(/[^0-9]/g, '') : null;
        
        // Support common variations of amount keys
        const extractedAmount = parsed.amount || parsed.totalAmount || parsed.total_amount || parsed.paymentAmount || parsed.payment_amount;
        amount = extractedAmount ? parseFloat(String(extractedAmount).replace(/[^0-9.]/g, '')) : null;
      } catch (err) {
        console.error("JSON parse error for receipt analysis:", err);
      }

      // Safety net fallback: if refNo is null, parse using regex pattern matching
      if (!refNo) {
        const matches = rawText.match(/\b\d{10,16}\b/);
        refNo = matches ? matches[0] : null;
      }
      
      // Safety net fallback: if amount is null, parse numeric amount from text
      if (!amount) {
        const numMatches = rawText.match(/\b\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b/g);
        if (numMatches) {
          const candidates = numMatches
            .map(m => parseFloat(m.replace(/,/g, '')))
            .filter(num => num > 10 && num < 1000000 && String(num) !== refNo);
          if (candidates.length > 0) {
            amount = candidates[0];
          }
        }
      }

      return NextResponse.json({ 
        success: true, 
        refNo: refNo || null,
        amount: amount || null,
        fullText: rawText 
      });
    }
  } catch (error: any) {
    console.error("Vision/Gemini Match Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}