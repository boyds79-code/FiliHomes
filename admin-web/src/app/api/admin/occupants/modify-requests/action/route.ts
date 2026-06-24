import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../../../../lib/supabaseServer';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { requestId, action, approvedBy } = body;

    if (!requestId || !action || !approvedBy) {
      return NextResponse.json({ error: "Missing required fields: requestId, action, approvedBy" }, { status: 400 });
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: "Invalid action. Must be 'approve' or 'reject'." }, { status: 400 });
    }

    const adminClient = getAdminClient();

    // 1. Fetch the request details
    const { data: request, error: fetchErr } = await adminClient
      .from('occupant_modification_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (fetchErr || !request) {
      console.error("Fetch request error:", fetchErr);
      return NextResponse.json({ error: fetchErr?.message || "Modification request not found." }, { status: 404 });
    }

    if (request.status !== 'pending') {
      return NextResponse.json({ error: `Request has already been actioned. Status: ${request.status}` }, { status: 400 });
    }

    if (action === 'approve') {
      // 2a. Get user_id associated with the unit mapping
      const { data: mapping, error: mapErr } = await adminClient
        .from('user_units')
        .select('user_id')
        .eq('id', request.mapping_id)
        .maybeSingle();

      if (mapErr || !mapping) {
        console.error("Fetch mapping error:", mapErr);
        return NextResponse.json({ error: mapErr?.message || "Underlying occupant unit mapping not found." }, { status: 404 });
      }

      // 2b. Update user_units mapping
      const { error: mapUpdateErr } = await adminClient
        .from('user_units')
        .update({
          role: request.role,
          is_payer: request.is_payer,
          lease_start_date: request.lease_start_date,
          lease_end_date: request.lease_end_date
        })
        .eq('id', request.mapping_id);

      if (mapUpdateErr) {
        console.error("Update mapping error:", mapUpdateErr);
        return NextResponse.json({ error: mapUpdateErr.message }, { status: 500 });
      }

      // 2c. Update profiles
      const { error: profileUpdateErr } = await adminClient
        .from('profiles')
        .update({
          full_name: request.full_name,
          phone: request.phone
        })
        .eq('id', mapping.user_id);

      if (profileUpdateErr) {
        console.error("Update profile error:", profileUpdateErr);
        return NextResponse.json({ error: profileUpdateErr.message }, { status: 500 });
      }
    }

    // 3. Update request status to approved/rejected and log auditor details
    const { error: requestUpdateErr } = await adminClient
      .from('occupant_modification_requests')
      .update({
        status: action === 'approve' ? 'approved' : 'rejected',
        approved_by: approvedBy,
        action_date: new Date().toISOString()
      })
      .eq('id', requestId);

    if (requestUpdateErr) {
      console.error("Update request status error:", requestUpdateErr);
      return NextResponse.json({ error: requestUpdateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Directory change request successfully ${action === 'approve' ? 'approved and applied' : 'rejected'}.`
    });
  } catch (error: any) {
    console.error("API POST modify-requests/action error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
