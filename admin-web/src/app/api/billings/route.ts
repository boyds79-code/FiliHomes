import { getAdminClient } from '../../../lib/supabaseServer';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const condoId = searchParams.get('condoId');
  const supabaseAdmin = getAdminClient();

  // 1. Fetch billings, units, receipts, and condos in parallel
  let billingsQuery = supabaseAdmin.from('billings').select('*');
  let unitsQuery = supabaseAdmin.from('units').select('id, unit_number, building_no');

  if (condoId) {
    billingsQuery = billingsQuery.eq('condo_id', condoId);
    unitsQuery = unitsQuery.eq('condo_id', condoId);
  }

  const [billingsRes, unitsRes, receiptsRes, condosRes] = await Promise.all([
    billingsQuery,
    unitsQuery,
    supabaseAdmin.from('receipts').select('*'),
    supabaseAdmin.from('condos').select('id, penalty_rate')
  ]);

  if (billingsRes.error) return NextResponse.json({ error: billingsRes.error.message }, { status: 400 });

  const billingsData = billingsRes.data || [];
  const unitsData = unitsRes.data || [];
  const receiptsData = receiptsRes.data || [];
  
  // 2. Dynamic Late Penalty database auto-sync routine
  const today = new Date();
  const updatesToRun = [];

  for (const bill of billingsData) {
    // Only apply penalties to unpaid, pending, or partial statements
    if (bill.status === 'PAID') continue;

    const condoInfo = condosRes.data?.find(c => c.id === bill.condo_id);
    const penaltyRate = condoInfo?.penalty_rate || 0.02;

    const dueDateObj = new Date(bill.due_date);
    // The penalty starts accruing on the day after the due date, at 00:00:00.
    const penaltyAccrualDate = new Date(dueDateObj);
    penaltyAccrualDate.setDate(penaltyAccrualDate.getDate() + 1);
    penaltyAccrualDate.setHours(0, 0, 0, 0);

    const isOverdue = (bill.status === 'OVERDUE' || bill.status === 'REQUESTED' || today >= penaltyAccrualDate);

    if (isOverdue) {
      const rawDelay = Math.ceil((today.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24));
      const delayDays = Math.max(14, rawDelay);
      const baseForPenalty = 
        Number(bill.condo_dues || 0) + 
        Number(bill.electricity || 0) + 
        Number(bill.water || 0) + 
        Number(bill.parking_fee || 0) + 
        Number(bill.visitor_parking_fee || 0) + 
        Number(bill.amenity_fee || 0) + 
        Number(bill.job_order_fee || 0) + 
        Number(bill.previous_balance || 0);

      const targetPenalty = baseForPenalty * (penaltyRate / 30) * delayDays;

      // If the current database penalty_amount is 0 or different, schedule a DB update!
      const currentPenalty = Number(bill.penalty_amount || 0);
      if (Math.abs(currentPenalty - targetPenalty) > 0.01) {
        updatesToRun.push(
          supabaseAdmin
            .from('billings')
            .update({ 
              penalty_amount: targetPenalty,
              status: bill.status === 'ISSUED' ? 'OVERDUE' : bill.status
            })
            .eq('id', bill.id)
        );
        
        // Synchronize locally in-memory so the current API response matches the new DB state
        bill.penalty_amount = targetPenalty;
        if (bill.status === 'ISSUED') {
          bill.status = 'OVERDUE';
        }
      }
    }
  }

  // Execute database updates in parallel
  if (updatesToRun.length > 0) {
    try {
      await Promise.all(updatesToRun);
      console.log(`⚡ Auto-synced penalty_amount for ${updatesToRun.length} overdue bills.`);
    } catch (dbErr) {
      console.error("🚨 Error updating penalty_amount in database:", dbErr);
    }
  }

  // 3. Merge data
  const mergedData = billingsData.map((bill) => {
    const unitInfo = unitsData.find((u) => u.id === bill.unit_id);
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