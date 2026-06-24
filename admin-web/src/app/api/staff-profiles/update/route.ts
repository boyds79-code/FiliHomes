import { getAdminClient } from '../../../../lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { id, updates } = await req.json();
    if (!id || !updates) {
      return NextResponse.json({ error: 'Missing id or updates' }, { status: 400 });
    }

    const adminClient = getAdminClient();

    const { error } = await adminClient.from('staff_profiles').update(updates).eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
