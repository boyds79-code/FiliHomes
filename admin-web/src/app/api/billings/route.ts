import { getAdminClient } from '../../../lib/supabaseServer';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const supabaseAdmin = getAdminClient();

  // 1. 데이터를 각각 개별적으로 조회 (조인 사용 안 함)
  const [billingsRes, unitsRes, receiptsRes] = await Promise.all([
    supabaseAdmin.from('billings').select('*'),
    supabaseAdmin.from('units').select('id, unit_number, building_no'),
    supabaseAdmin.from('receipts').select('*')
  ]);

  if (billingsRes.error) return NextResponse.json({ error: billingsRes.error.message }, { status: 400 });

  const billingsData = billingsRes.data || [];
  const unitsData = unitsRes.data || [];
  const receiptsData = receiptsRes.data || [];

  // 2. 데이터 병합 (Merge)
  const mergedData = billingsData.map((bill) => {
    // unit_id가 일치하는 유닛 정보 찾기
    const unitInfo = unitsData.find((u) => u.id === bill.unit_id);
    // billing_id가 일치하는 영수증 필터링
    const billReceipts = receiptsData.filter((r) => String(r.billing_id) === String(bill.id));

    return {
      ...bill,
      unit_number: unitInfo?.unit_number || 'UNKNOWN',
      building_no: unitInfo?.building_no || 'UNKNOWN',
      receipts: billReceipts
    };
  });

  return NextResponse.json({ data: mergedData });
}