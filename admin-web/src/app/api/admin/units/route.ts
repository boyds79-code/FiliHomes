import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../../lib/supabaseServer';
import dns from 'dns';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const condoId = searchParams.get('condoId');

    const adminClient = getAdminClient();

    let query = adminClient
      .from('units')
      .select('id, unit_number, block_phase_no');

    if (condoId) {
      query = query.eq('condo_id', condoId);
    }

    const { data, error } = await query.order('unit_number', { ascending: true });

    if (error) {
      console.error("Supabase Select Error (units):", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const mappedData = data?.map((unit: any) => ({
      id: unit.id,
      unit_number: unit.unit_number,
      tower_name: unit.block_phase_no || ''
    })) || [];

    return NextResponse.json(mappedData);
  } catch (error: any) {
    console.error("API Route Error (units):", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
