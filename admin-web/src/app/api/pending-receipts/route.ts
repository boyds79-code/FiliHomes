import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../lib/supabaseServer';
const supabaseAdmin = getAdminClient();

export async function GET() {
  try {
    // Fetch billings with PENDING_APPROVAL status (meaning user has uploaded a receipt)
    const { data, error } = await supabaseAdmin
      .from('billings')
      .select('id, amount, billing_period, status, receipt_url, created_at, units(unit_number), condos(name)')
      .eq('status', 'PENDING_APPROVAL')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
