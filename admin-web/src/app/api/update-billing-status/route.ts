import { getAdminClient } from '../../../lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { billingId, status } = await req.json();
    const adminClient = getAdminClient();

    const { error } = await adminClient
      .from('billings')
      .update({ status: status })
      .eq('id', Number(billingId));

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}