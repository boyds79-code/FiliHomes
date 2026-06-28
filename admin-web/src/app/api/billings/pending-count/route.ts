import { getAdminClient } from '../../../../lib/supabaseServer';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const supabaseAdmin = getAdminClient();
    const { count, error } = await supabaseAdmin
      .from('billings')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'REQUESTED');

    if (error) {
      console.error("🚨 Error fetching pending billings count:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ count: count || 0 });
  } catch (err: any) {
    console.error("🚨 Unexpected error in pending count API:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
