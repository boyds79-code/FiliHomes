import { createClient } from '@supabase/supabase-js';

// TODO: 관리자용 환경변수에서 Supabase 설정값 주입 필요
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

export async function approvePayment(billingId: string) {
  try {
    const { data, error } = await supabase
      .from('billings')
      .update({
        status: 'PAID',               // 상태를 완납으로 변경
        // paid_at: new Date().toISOString() // DB 스키마에 paid_at 컬럼 추가 시 활성화
      })
      .eq('id', billingId)
      .select();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error("Failed to approve payment:", error.message);
    return { success: false, error: error.message };
  }
}