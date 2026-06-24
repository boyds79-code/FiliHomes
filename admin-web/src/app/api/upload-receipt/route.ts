import { getAdminClient } from '../../../lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { billingId, receiptUrl } = await req.json();
    const adminClient = getAdminClient();

    // 1. Receipts 테이블에 기록
    const { error: insertError } = await adminClient.from('receipts').insert([{
      billing_id: billingId,
      receipt_image_url: receiptUrl,
      status: 'PENDING_MATCHING'
    }]);
    
    if (insertError) {
      console.error("🚨 Receipt Insert Error Details:", insertError);
      throw insertError;
    }

    // 2. Billings 테이블 상태 업데이트
    const { error: updateError } = await adminClient
      .from('billings')
      .update({ status: 'REQUESTED' })
      .eq('id', Number(billingId));
  
    if (updateError) {
      console.error("🚨 Billing Update Error Details:", updateError);
      throw updateError;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("🚨 API Upload Error Detail:", error); 
    return NextResponse.json({ error: error.message || "Unknown error" }, { status: 500 });
  }
}