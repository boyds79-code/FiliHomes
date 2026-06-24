// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Service_role 키를 사용하여 RLS를 우회하고 게이트웨이 비밀키를 안전하게 가져옴
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { billing_id } = await req.json()

    // 1. 청구서 및 유저의 소속 콘도 ID 추적
    const { data: billing, error: billErr } = await supabaseAdmin
      .from('billings')
      .select('*, condos(id, name)')
      .eq('id', billing_id)
      .single()

    if (billErr || !billing) throw new Error("Billing ledger record not found.")

    // 2. 해당 콘도가 등록한 전용 PG Secret Key 추출 (다중 테넌트 라우팅의 핵심)
    const { data: gateway, error: gwErr } = await supabaseAdmin
      .from('condo_gateways')
      .select('*')
      .eq('condo_id', billing.condo_id)
      .single()

    if (gwErr || !gateway) throw new Error("This condo has not configured a digital payment gateway yet.")

    let paymentUrl = ""
    let externalInvoiceId = ""

    // 3. 공급업체(Provider) 분기에 따른 외부 API 통신 (예시: XENDIT 대응)
    if (gateway.provider === 'XENDIT') {
      const basicAuth = btoa(`${gateway.secret_key}:`)
      
      const xenditResponse = await fetch('https://api.xendit.co/v2/invoices', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          external_id: billing_id,
          amount: Number(billing.total_amount),
          description: `Maintenance Dues & Water - Month: ${billing.billing_month}`,
          currency: 'PHP',
          reminder_time: 1,
          success_redirect_url: `https://philicondo.com/payment-success`,
          failure_redirect_url: `https://philicondo.com/payment-failed`
        })
      })

      const invoiceData = await xenditResponse.json()
      if (!xenditResponse.ok) throw new Error(invoiceData.message || "Xendit API communication failure.")
      
      paymentUrl = invoiceData.invoice_url
      externalInvoiceId = invoiceData.id
    } 
    // 차후 PAYMONGO 모듈 필요 시 else if 분기 확장 가능 구조

    // 4. 발급된 외부 인보이스 ID를 DB 테이블에 업데이트 기록
    await supabaseAdmin
      .from('billings')
      .update({ payment_link_id: externalInvoiceId })
      .eq('id', billing_id)

    return new Response(
      JSON.stringify({ success: true, payment_url: paymentUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    )
  }
})