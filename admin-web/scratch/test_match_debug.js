const cleanRefNo = (desc) => {
  if (!desc) return '';
  const trimmed = desc.trim();
  const words = trimmed.split(/[\s_]+/);
  const lastWord = words[words.length - 1];
  if (lastWord && /[0-9]/.test(lastWord)) {
    if (lastWord.includes('/')) {
      return lastWord.split('/').pop() || lastWord;
    }
    return lastWord;
  }
  return trimmed;
};

// Mock the inputs
const description = "INCOMING_TRANSFER_5029327299933";
const detectedRef = "5029327299933";

console.log("🔍 Simulating matching logic...");

const ref_no = cleanRefNo(description);
console.log("- Extracted ref_no from BDO description:", JSON.stringify(ref_no));
console.log("- Detected ref from Vision AI receipt:", JSON.stringify(detectedRef));

const normalizedBankRef = ref_no.replace(/[^A-Z0-9]/ig, '').toUpperCase();
const normalizedDetectedRef = detectedRef.replace(/[^A-Z0-9]/ig, '').toUpperCase();

console.log("- Normalized Bank Ref:", JSON.stringify(normalizedBankRef));
console.log("- Normalized Detected Ref:", JSON.stringify(normalizedDetectedRef));

const isMatch = normalizedBankRef === normalizedDetectedRef;
console.log("- Strict Comparison Result:", isMatch);
