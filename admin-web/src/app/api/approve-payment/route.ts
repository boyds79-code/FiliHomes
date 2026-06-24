import { getAdminClient } from '../../../lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { billingId, unitId, amount, paymentMethod, isPartial } = await req.json();
  
  const adminClient = getAdminClient();

  if (isPartial) {
    // 1. 기존 빌 정보를 조회해서 전체 금액을 확인
    const { data: bill, error: fetchError } = await adminClient
      .from('billings')
      .select('*')
      .eq('id', billingId)
      .single();

    if (fetchError || !bill) {
      return NextResponse.json({ success: false, error: fetchError?.message || 'Bill not found' }, { status: 500 });
    }

    // 2. 부분 결제 처리: 누적 결제를 위해 현재 지불해야 할 총액을 정확히 계산합니다.
    let amountDue;
    // 이미 부분 결제가 진행된 건(status: 'PARTIAL')이라면, 기존 항목을 다시 더하지 않고 `previous_balance`를 사용합니다.
    if (bill.status === 'PARTIAL') {
      amountDue = Number(bill.previous_balance || 0);
    } else {
      // 이 청구서에 대한 첫 결제라면 모든 비용 항목을 합산합니다.
      amountDue = 
        Number(bill.condo_dues || 0) + 
        Number(bill.electricity || 0) + 
        Number(bill.water || 0) + 
        Number(bill.parking_fee || 0) + 
        Number(bill.job_order_fee || 0) + 
        Number(bill.previous_balance || 0) + 
        Number(bill.penalty_amount || 0);
    }

    const newBalance = amountDue - amount;
    
    const { error } = await adminClient
      .from('billings')
      .update({
        status: 'PARTIAL',
        previous_balance: newBalance, // 결제 후 남은 잔액을 업데이트
        penalty_amount: newBalance * 0.02, // 새로운 잔액에 대한 연체료를 다시 계산
        payment_method: paymentMethod || 'ONLINE'
      })
      .eq('id', billingId);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } else {
    // 전액 결제 처리: PAID로 변경
    const { error } = await adminClient
      .from('billings')
      .update({ 
        status: 'PAID', 
        paid_at: new Date().toISOString(),
        payment_method: paymentMethod || 'ONLINE'
      })
      .eq('id', billingId);
      
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}