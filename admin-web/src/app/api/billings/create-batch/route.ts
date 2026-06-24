import { getAdminClient } from '../../../../lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { bills } = await req.json();
    if (!bills || !Array.isArray(bills)) {
      return NextResponse.json({ error: 'Missing or invalid bills array' }, { status: 400 });
    }

    const adminClient = getAdminClient();

    const { error } = await adminClient.from('billings').insert(bills);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
