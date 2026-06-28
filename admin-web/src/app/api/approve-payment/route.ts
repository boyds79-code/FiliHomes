import { getAdminClient } from '../../../lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { billingId, unitId, amount, paymentMethod, isPartial } = await req.json();
    
    const adminClient = getAdminClient();

    if (!billingId) {
      return NextResponse.json({ success: false, error: 'Billing ID is required' }, { status: 400 });
    }

    // 1. Fetch current bill info
    const { data: bill, error: fetchError } = await adminClient
      .from('billings')
      .select('*')
      .eq('id', billingId)
      .single();

    if (fetchError || !bill) {
      return NextResponse.json({ success: false, error: fetchError?.message || 'Bill not found' }, { status: 500 });
    }

    // 2. Fetch penalty rate from condo settings
    const { data: condo } = await adminClient
      .from('condos')
      .select('penalty_rate')
      .eq('id', bill.condo_id)
      .single();
    const penaltyRate = condo?.penalty_rate || 0.02;

    if (isPartial) {
      // Aggregate total amount due (including amenity fee!)
      const amountDue = 
        Number(bill.condo_dues || 0) + 
        Number(bill.electricity || 0) + 
        Number(bill.water || 0) + 
        Number(bill.parking_fee || 0) + 
        Number(bill.job_order_fee || 0) + 
        Number(bill.previous_balance || 0) + 
        Number(bill.penalty_amount || 0) +
        Number(bill.amenity_fee || 0);

      const newBalance = amountDue - amount;

      // Append notice to the bill description so the resident app displays it
      const cleanedDesc = (bill.description || '')
        .replace(/\n\n\[NOTICE: Partial payment.*\]/g, '')
        .replace(/\n\n\[NOTICE: Overdue penalty.*\]/g, '');
      const updatedDesc = `${cleanedDesc}\n\n[NOTICE: Partial payment of ₱${amount.toLocaleString()} processed. Remaining unpaid balance: ₱${newBalance.toFixed(2)}. This balance will be carried forward to next month's billing.]`;

      const { error } = await adminClient
        .from('billings')
        .update({
          status: 'PARTIAL',
          previous_balance: newBalance,
          penalty_amount: newBalance * penaltyRate,
          payment_method: paymentMethod || 'ONLINE',
          description: updatedDesc
        })
        .eq('id', billingId);

      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    } else {
      // Complete Clear Payment
      const dueDateObj = new Date(bill.due_date);
      const todayObj = new Date();
      const isOverdue = todayObj > dueDateObj;
      
      // Calculate real-time late penalty to log how much was waived
      let calculatedPenalty = 0;
      if (isOverdue) {
        const delayDays = Math.ceil((todayObj.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24));
        const baseForPenalty = 
          Number(bill.condo_dues || 0) + 
          Number(bill.electricity || 0) + 
          Number(bill.water || 0) + 
          Number(bill.parking_fee || 0) + 
          Number(bill.job_order_fee || 0) + 
          Number(bill.previous_balance || 0) + 
          Number(bill.amenity_fee || 0);
        calculatedPenalty = baseForPenalty * (penaltyRate / 30) * delayDays;
      }

      const totalPenalty = Number(bill.penalty_amount || 0) + calculatedPenalty;

      // Clean old notices and append waiver notice
      let updatedDesc = (bill.description || '')
        .replace(/\n\n\[NOTICE: Partial payment.*\]/g, '')
        .replace(/\n\n\[NOTICE: Overdue penalty.*\]/g, '');
      
      if (totalPenalty > 0) {
        updatedDesc += `\n\n[NOTICE: Overdue penalty of ₱${totalPenalty.toFixed(2)} was waived/deducted by the administration upon payment approval.]`;
      }

      const { error } = await adminClient
        .from('billings')
        .update({ 
          status: 'PAID', 
          paid_at: new Date().toISOString(),
          payment_method: paymentMethod || 'ONLINE',
          penalty_amount: 0,
          description: updatedDesc
        })
        .eq('id', billingId);
        
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}