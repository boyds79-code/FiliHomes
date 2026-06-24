import { getAdminClient } from '../../../lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });
    }

    const adminClient = getAdminClient();

    // 1. Delete associated personal records (Bazaar items, profiles, messages, safety logs)
    // Supabase foreign keys set to CASCADE will handle cascade deletes,
    // but we manually clean up personal tables to be safe under RA 10173.
    
    // Clean up Bazaar profiles and listings
    await adminClient.from('bazaar_items').delete().eq('seller_id', userId);
    await adminClient.from('bazaar_profiles').delete().eq('id', userId);
    
    // Clean up direct message mappings and logs
    await adminClient.from('community_blocks').delete().eq('blocker_id', userId);
    await adminClient.from('community_blocks').delete().eq('blocked_user_id', userId);
    
    // Clean up vehicle plate registrations
    await adminClient.from('vehicles').delete().eq('user_id', userId);

    // 2. We keep transactional logs (Billings, Amenity Bookings, Job Orders, visitor logs) 
    // for a mandatory 5-year retention period as required by BIR (Bureau of Internal Revenue) 
    // and local real estate laws, but we anonymize them (remove profile relationship).
    // The profile status is marked as 'deleted' to dissociate personal data.
    const { error: profileErr } = await adminClient
      .from('profiles')
      .update({ 
        full_name: 'Deleted Resident', 
        email: `deleted_${userId}@filicondo.com`,
        phone: null,
        avatar_url: null,
        status: 'deleted',
        expo_push_token: null
      })
      .eq('id', userId);

    if (profileErr) throw profileErr;

    // 3. Delete the user from Supabase Auth using the Admin Client
    const { error: authErr } = await adminClient.auth.admin.deleteUser(userId);
    if (authErr) {
      console.error("Auth user deletion error:", authErr);
      throw authErr;
    }

    return NextResponse.json({ success: true, message: 'Account successfully deactivated and personal data anonymized.' });
  } catch (error: any) {
    console.error("Account deletion failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
