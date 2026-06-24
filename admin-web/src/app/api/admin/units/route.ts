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
      .from('units')
      .select('id, unit_number, building_no')
      .order('unit_number', { ascending: true });

    if (error) {
      console.error("Supabase Select Error (units):", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const mappedData = data?.map((unit: any) => ({
      id: unit.id,
      unit_number: unit.unit_number,
      tower_name: unit.building_no || ''
    })) || [];

    return NextResponse.json(mappedData);
  } catch (error: any) {
    console.error("API Route Error (units):", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
