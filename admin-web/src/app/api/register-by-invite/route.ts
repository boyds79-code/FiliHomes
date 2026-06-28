import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../lib/supabaseServer';
import dns from 'dns';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, inviteCode, fullName, phone = null } = body;

    if (!email || !password || !inviteCode || !fullName) {
      return NextResponse.json({ error: "Missing required fields: email, password, inviteCode, and fullName are required." }, { status: 400 });
    }

    const adminClient = getAdminClient();

    // 1. Verify invitation code
    const { data: invitation, error: inviteErr } = await adminClient
      .from('unit_invitations')
      .select('*')
      .eq('invite_code', inviteCode.trim().toUpperCase())
      .maybeSingle();

    if (inviteErr || !invitation) {
      return NextResponse.json({ error: "Invalid invitation code." }, { status: 400 });
    }

    if (invitation.is_used) {
      return NextResponse.json({ error: "This invitation code has already been used." }, { status: 400 });
    }

    if (new Date(invitation.expired_at) < new Date()) {
      return NextResponse.json({ error: "This invitation code has expired." }, { status: 400 });
    }

    // Verify email match (case-insensitive check for security)
    if (invitation.email.toLowerCase() !== email.toLowerCase()) {
      return NextResponse.json({ error: "The email address does not match this invitation code." }, { status: 400 });
    }

    // 2. Check if user already exists in auth.users
    const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers();
    if (listError) {
      console.error("Auth Admin List Error:", listError);
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    let authUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    let userId: string;

    if (authUser) {
      userId = authUser.id;
      console.log(`✅ Found existing auth user: ${userId}`);
      // Update their password to what they submitted
      const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
        password: password,
        user_metadata: { 
          password_changed: true, // Marked true because they explicitly chose it
          full_name: fullName
        }
      });
      if (updateError) {
        console.error("Auth Admin Update User Error:", updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    } else {
      // Create a brand new auth user
      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { 
          password_changed: true,
          full_name: fullName
        }
      });

      if (createError) {
        console.error("Auth Admin Create User Error:", createError);
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }

      userId = createData.user.id;
      console.log(`✅ Created new auth user: ${userId}`);
    }

    // 3. Upsert profile in profiles table
    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert([
        {
          id: userId,
          email: email,
          phone: phone,
          full_name: fullName,
          role: 'resident',
          unit_id: invitation.unit_id,
          condo_id: invitation.condo_id,
          status: 'active'
        }
      ]);

    if (profileError) {
      console.error("Profile creation error:", profileError);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // 4. Create/update mapping in user_units table as ACTIVE
    const { data: existingMapping } = await adminClient
      .from('user_units')
      .select('id')
      .eq('user_id', userId)
      .eq('unit_id', invitation.unit_id)
      .maybeSingle();

    let mappingError;
    if (existingMapping) {
      const { error } = await adminClient
        .from('user_units')
        .update({
          role: invitation.role,
          status: 'active',
          is_payer: true
        })
        .eq('id', existingMapping.id);
      mappingError = error;
    } else {
      const { error } = await adminClient
        .from('user_units')
        .insert([
          {
            user_id: userId,
            unit_id: invitation.unit_id,
            condo_id: invitation.condo_id,
            role: invitation.role,
            status: 'active',
            is_payer: true
          }
        ]);
      mappingError = error;
    }

    if (mappingError) {
      console.error("Insert/Update user_units error:", mappingError);
      return NextResponse.json({ error: mappingError.message }, { status: 500 });
    }

    // 5. Mark invitation code as USED
    const { error: updateInviteErr } = await adminClient
      .from('unit_invitations')
      .update({
        is_used: true,
        used_at: new Date().toISOString()
      })
      .eq('id', invitation.id);

    if (updateInviteErr) {
      console.error("Marking invitation used error:", updateInviteErr);
      // Non-blocking for the signup itself, but should log
    }

    return NextResponse.json({
      success: true,
      userId,
      message: "Registration completed successfully. You can now log into the mobile app."
    });
  } catch (error: any) {
    console.error("API register-by-invite error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
