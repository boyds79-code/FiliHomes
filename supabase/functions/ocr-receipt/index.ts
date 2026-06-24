import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0"

serve(async (req) => {
  const { record } = await req.json();
  const imageUrl = record.receipt_image_url;

  // Google Vision API 호출
  const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${Deno.env.get("GOOGLE_VISION_API_KEY")}`;
  const response = await fetch(visionUrl, {
    method: 'POST',
    body: JSON.stringify({
      requests: [{ image: { source: { imageUri: imageUrl } }, features: [{ type: 'TEXT_DETECTION' }] }]
    })
  });

  const result = await response.json();
  const fullText = result.responses[0].fullTextAnnotation?.text || "";

  // 정규식: "REF" 또는 "Reference" 뒤의 숫자들 추출 (필요에 따라 수정 가능)
  const refMatch = fullText.match(/(?:REF|Reference|Ref\.?)\s*[:#]?\s*(\d+)/i);
  const refNo = refMatch ? refMatch[1] : null;

  // 결과 저장
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  await supabase.from('receipts').update({ extracted_ref_no: refNo }).eq('billing_id', record.billing_id);

  return new Response(JSON.stringify({ refNo }), { headers: { "Content-Type": "application/json" } });
})
