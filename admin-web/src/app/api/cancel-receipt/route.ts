import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '../../../lib/supabaseServer';

export async function POST(req: NextRequest) {
  try {
    const { billingId } = await req.json();

    if (!billingId) {
      return NextResponse.json({ error: 'Billing ID is required' }, { status: 400 });
    }

    const supabaseAdmin = getAdminClient();

    // 1. Delete associated receipts in the receipts table
    const { error: deleteError } = await supabaseAdmin
      .from('receipts')
      .delete()
      .eq('billing_id', billingId);

    if (deleteError) {
      console.error("🚨 Receipt Delete Error:", deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // 2. Revert the billing status to ISSUED
    const { data: billingData, error: updateError } = await supabaseAdmin
      .from('billings')
      .update({ status: 'ISSUED' })
      .eq('id', billingId)
      .select()
      .single();

    if (updateError) {
      console.error("🚨 Billing Revert Error:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: billingData });
  } catch (err: any) {
    console.error("🚨 Cancel Receipt Unexpected Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
