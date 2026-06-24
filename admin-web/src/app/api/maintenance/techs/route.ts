import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../../lib/supabaseServer';
import dns from 'dns';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const adminClient = getAdminClient();

    const { data, error } = await adminClient
      .from('staff_profiles')
      .select('id, full_name, role, avatar_url')
      .eq('role', 'TECHNICIAN');

    if (error) {
      console.error("Supabase Select Error (technicians):", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("API Route Error (technicians):", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
