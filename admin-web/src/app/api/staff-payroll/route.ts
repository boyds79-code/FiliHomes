import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../lib/supabaseServer';

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const adminClient = getAdminClient();

    const { error } = await adminClient.from('staff_payroll_records').insert([data]);

    if (error) {
      console.error("Supabase Admin Insert Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
