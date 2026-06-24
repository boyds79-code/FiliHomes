import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '../../../lib/supabaseServer';
const supabaseAdmin = getAdminClient();

export async function POST(req: NextRequest) {
  try {
    const { billingId } = await req.json();

    if (!billingId) {
      return NextResponse.json({ error: 'Billing ID is required' }, { status: 400 });
    }

    // Update the billing status to PAID
    const { data, error } = await supabaseAdmin
      .from('billings')
      .update({ status: 'PAID' })
      .eq('id', billingId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // You could also trigger an edge function here to send a push notification

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
