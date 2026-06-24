import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../../../lib/supabaseServer';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const adminClient = getAdminClient();

    let query = adminClient
      .from('occupant_modification_requests')
      .select(`
        *,
        user_units:mapping_id (
          id,
          role,
          is_payer,
          lease_start_date,
          lease_end_date,
          units (unit_number, building_no),
          profiles:user_id (email, full_name, phone)
        )
      `);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error("Fetch modification requests error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("API GET modify-requests error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      mappingId,
      requestedBy,
      fullName,
      phone,
      unitRole,
      isPayer,
      leaseStartDate,
      leaseEndDate,
      documentName,
      documentUrl
    } = body;

    if (!mappingId || !requestedBy || !fullName || !documentName || !documentUrl) {
      return NextResponse.json({ error: "Missing required fields for request submission." }, { status: 400 });
    }

    const adminClient = getAdminClient();

    // Insert pending modification request
    const { data, error } = await adminClient
      .from('occupant_modification_requests')
      .insert([
        {
          mapping_id: mappingId,
          requested_by: requestedBy,
          full_name: fullName,
          phone: phone || null,
          role: unitRole,
          is_payer: isPayer,
          lease_start_date: unitRole === 'tenant' ? (leaseStartDate || null) : null,
          lease_end_date: unitRole === 'tenant' ? (leaseEndDate || null) : null,
          document_name: documentName,
          document_url: documentUrl,
          status: 'pending'
        }
      ])
      .select()
      .single();

    if (error) {
      console.error("Insert modification request error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Directory change request submitted for supervisor approval.", data });
  } catch (error: any) {
    console.error("API POST modify-requests error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
