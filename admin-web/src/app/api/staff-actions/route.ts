import { getAdminClient } from '../../../lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { action, data, id } = await req.json();
  const adminClient = getAdminClient();

  try {
    if (action === 'INSERT') {
      const email = data.email;
      const password = 'password123';
      
      // 1. Create the user account in Supabase Auth
      const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      
      if (authError) {
        // If user already exists in auth, handle linking by checking and upserting profile
        if (authError.message.toLowerCase().includes('already registered') || authError.message.toLowerCase().includes('already exists')) {
          const { data: existingUsers } = await adminClient.auth.admin.listUsers();
          const existingUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
          if (existingUser) {
            const profileData = {
              id: existingUser.id,
              ...data
            };
            const { error: upsertError } = await adminClient.from('profiles').upsert(profileData);
            if (upsertError) throw upsertError;
            return NextResponse.json({ success: true, message: 'User already exists in Auth, profile linked.' });
          }
        }
        throw authError;
      }
      
      // 2. Insert/Upsert the user's public profile data using the new auth ID
      if (authUser?.user) {
        const profileData = {
          id: authUser.user.id,
          ...data
        };
        const { error: upsertError } = await adminClient.from('profiles').upsert(profileData);
        if (upsertError) throw upsertError;
      }
      
      return NextResponse.json({ success: true });
    } else if (action === 'DELETE') {
      // 1. Clean up database records
      await adminClient.from('staff_profiles').delete().eq('id', id);
      await adminClient.from('profiles').delete().eq('id', id);
      
      // 2. Delete from Supabase Auth
      try {
        await adminClient.auth.admin.deleteUser(id);
      } catch (authDelErr: any) {
        console.warn("Auth user deletion warning/error:", authDelErr.message);
      }
      
      return NextResponse.json({ success: true });
    } else if (action === 'UPDATE') {
      const { error } = await adminClient.from('profiles').update(data).eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}