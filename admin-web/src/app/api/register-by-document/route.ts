import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../lib/supabaseServer';
import dns from 'dns';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      email, 
      password, 
      fullName, 
      phone = null, 
      condoId, 
      unitId, 
      role = 'tenant', 
      documentName = null, 
      documentUrl = null 
    } = body;

    if (!email || !password || !fullName || !condoId || !unitId) {
      return NextResponse.json({ error: "Missing required fields: email, password, fullName, condoId, and unitId are required." }, { status: 400 });
    }

    const adminClient = getAdminClient();

    // 1. Check if user already exists in auth.users
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
      // Update their password and metadata
      const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, {
        password: password,
        user_metadata: { 
          password_changed: true,
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

    // 2. Upsert profile in profiles table with status = 'pending'
    const { error: profileError } = await adminClient
      .from('profiles')
      .upsert([
        {
          id: userId,
          email: email,
          phone: phone,
          full_name: fullName,
          role: 'resident',
          unit_id: unitId,
          condo_id: condoId,
          status: 'pending' // Pending verification
        }
      ]);

    if (profileError) {
      console.error("Profile creation error:", profileError);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // 3. Create mapping in user_units table with status = 'pending'
    const { data: existingMapping } = await adminClient
      .from('user_units')
      .select('id')
      .eq('user_id', userId)
      .eq('unit_id', unitId)
      .maybeSingle();

    let mappingError;
    if (existingMapping) {
      const { error } = await adminClient
        .from('user_units')
        .update({
          role: role,
          status: 'pending', // Under review
          is_payer: true,
          document_name: documentName,
          document_url: documentUrl
        })
        .eq('id', existingMapping.id);
      mappingError = error;
    } else {
      const { error } = await adminClient
        .from('user_units')
        .insert([
          {
            user_id: userId,
            unit_id: unitId,
            condo_id: condoId,
            role: role,
            status: 'pending',
            is_payer: true,
            document_name: documentName,
            document_url: documentUrl
          }
        ]);
      mappingError = error;
    }

    if (mappingError) {
      console.error("Insert/Update user_units error:", mappingError);
      return NextResponse.json({ error: mappingError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      userId,
      message: "Registration submitted successfully. The PMO will verify your documents shortly."
    });
  } catch (error: any) {
    console.error("API register-by-document error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
