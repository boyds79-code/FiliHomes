import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '../../../../lib/supabaseServer';

export async function POST(req: NextRequest) {
  try {
    const { userId, fullName, isNewCondo, condoName, selectedCondoId } = await req.json();
    const adminClient = getAdminClient();

    if (!userId || !fullName) {
      return NextResponse.json({ error: 'Missing required user information' }, { status: 400 });
    }

    let condoIdToLink = selectedCondoId;

    if (isNewCondo) {
      if (!condoName) {
        return NextResponse.json({ error: 'Condo name is required' }, { status: 400 });
      }

      // Create condo using adminClient (RLS Bypass)
      const { data: newCondo, error: condoErr } = await adminClient
        .from('condos')
        .insert([{ name: condoName }])
        .select()
        .single();

      if (condoErr) {
        console.error("Error creating condo via Admin:", condoErr);
        return NextResponse.json({ error: `Failed to create condo: ${condoErr.message}` }, { status: 500 });
      }

      condoIdToLink = newCondo.id;

      // Initialize condo settings
      const { error: settingsErr } = await adminClient
        .from('condo_settings')
        .insert([{
          condo_id: condoIdToLink,
          visitor_parking_enabled: true,
          amenity_booking_enabled: true,
          amenity_settings: {}
        }]);

      if (settingsErr) {
        console.error("Error creating condo settings via Admin:", settingsErr);
      }
    }

    if (!condoIdToLink) {
      return NextResponse.json({ error: 'Condo ID is required' }, { status: 400 });
    }

    // Link user to condo by inserting into staff_profiles (assigned_building represents the condo mapping)
    const { error: staffErr } = await adminClient
      .from('staff_profiles')
      .insert([{
        id: userId,
        full_name: fullName,
        role: 'PMO_MANAGER',
        assigned_building: condoIdToLink,
        payroll_settings: {
          is_billing_manager: true,
          permissions: { create: true, read: true, update: true, delete: true }
        }
      }]);

    if (staffErr) {
      console.error("Error creating staff_profile via Admin:", staffErr);
      return NextResponse.json({ error: `Failed to link staff profile: ${staffErr.message}` }, { status: 500 });
    }

    // Also update public.profiles table (which contains condo_id and role)
    const { error: profileErr } = await adminClient
      .from('profiles')
      .update({
        condo_id: condoIdToLink,
        role: 'admin'
      })
      .eq('id', userId);

    if (profileErr) {
      console.error("Error updating profile role via Admin:", profileErr);
    }

    return NextResponse.json({ success: true, condoId: condoIdToLink });
  } catch (error: any) {
    console.error("Register PMO API error:", error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}
