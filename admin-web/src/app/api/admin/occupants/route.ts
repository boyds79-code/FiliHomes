import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../../lib/supabaseServer';
import dns from 'dns';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const unitId = searchParams.get('unitId');
    const condoId = searchParams.get('condoId') || 'c1111111-1111-1111-1111-111111111111';
    const adminClient = getAdminClient();

    let query = adminClient
      .from('user_units')
      .select(`
        id,
        role,
        status,
        lease_start_date,
        lease_end_date,
        is_payer,
        created_at,
        unit_id,
        document_name,
        document_url,
        units (unit_number, block_phase_no),
        profiles:user_id (id, email, phone, full_name, role)
      `)
      .eq('condo_id', condoId);

    if (unitId) {
      query = query.eq('unit_id', unitId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error("Supabase Select Error (occupants):", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const mappedData = data?.map((item: any) => {
      if (item.units) {
        item.units.tower_name = item.units.block_phase_no || '';
      }
      return item;
    });

    return NextResponse.json(mappedData);
  } catch (error: any) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      email,
      fullName,
      phone,
      unitId,
      condoId = 'c1111111-1111-1111-1111-111111111111',
      unitRole = 'family_member',
      leaseStartDate = null,
      leaseEndDate = null,
      isPayer = true,
      status = 'active',
      documentName = null,
      documentUrl = null
    } = body;

    if (!email || !unitId) {
      return NextResponse.json({ error: "Missing required fields: email and unitId are required." }, { status: 400 });
    }

    const adminClient = getAdminClient();

    // 1. Check if the user already exists in auth.users
    const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers();
    if (listError) {
      console.error("Auth Admin List Error:", listError);
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    let authUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    let userId: string;
    let isNewUser = false;

    if (authUser) {
      userId = authUser.id;
      console.log(`✅ Found existing auth user: ${userId}`);
    } else {
      // Create a new auth user with default password and set metadata
      isNewUser = true;
      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email: email,
        password: 'password123',
        email_confirm: true,
        user_metadata: { 
          password_changed: false,
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

    // 2. Upsert profile in profiles table
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
          status: 'active'
        }
      ]);

    if (profileError) {
      console.error("Supabase Upsert Profile Error:", profileError);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // 3. Upsert mapping in user_units table
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
          role: unitRole,
          status: status,
          lease_start_date: leaseStartDate,
          lease_end_date: leaseEndDate,
          is_payer: isPayer,
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
            role: unitRole,
            status: status,
            lease_start_date: leaseStartDate,
            lease_end_date: leaseEndDate,
            is_payer: isPayer,
            document_name: documentName,
            document_url: documentUrl
          }
        ]);
      mappingError = error;
    }

    if (mappingError) {
      console.error("Supabase Insert/Update user_units Error:", mappingError);
      return NextResponse.json({ error: mappingError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      isNewUser,
      userId,
      message: isNewUser 
        ? "Resident registered successfully. Default password is 'password123'." 
        : "Existing resident linked to unit successfully."
    });
  } catch (error: any) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mappingId = searchParams.get('id');

    if (!mappingId) {
      return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
    }

    const adminClient = getAdminClient();
    
    const { error } = await adminClient
      .from('user_units')
      .delete()
      .eq('id', mappingId);

    if (error) {
      console.error("Supabase Delete Error (user_units):", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Occupant unlinked successfully." });
  } catch (error: any) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const {
      mappingId,
      fullName,
      phone,
      unitRole,
      isPayer,
      leaseStartDate,
      leaseEndDate
    } = body;

    if (!mappingId) {
      return NextResponse.json({ error: "Missing required field: mappingId" }, { status: 400 });
    }

    const adminClient = getAdminClient();

    // 1. Get the user_id associated with this mapping
    const { data: mapping, error: mapGetErr } = await adminClient
      .from('user_units')
      .select('user_id')
      .eq('id', mappingId)
      .maybeSingle();

    if (mapGetErr || !mapping) {
      console.error("Get mapping error:", mapGetErr);
      return NextResponse.json({ error: mapGetErr?.message || "Unit mapping not found" }, { status: 404 });
    }

    // 2. Update user_units mapping
    const { error: mapUpdateErr } = await adminClient
      .from('user_units')
      .update({
        role: unitRole,
        is_payer: isPayer,
        lease_start_date: unitRole === 'tenant' ? (leaseStartDate || null) : null,
        lease_end_date: unitRole === 'tenant' ? (leaseEndDate || null) : null
      })
      .eq('id', mappingId);

    if (mapUpdateErr) {
      console.error("Update mapping error:", mapUpdateErr);
      return NextResponse.json({ error: mapUpdateErr.message }, { status: 500 });
    }

    // 3. Update profiles table
    const { error: profileUpdateErr } = await adminClient
      .from('profiles')
      .update({
        full_name: fullName,
        phone: phone
      })
      .eq('id', mapping.user_id);

    if (profileUpdateErr) {
      console.error("Update profile error:", profileUpdateErr);
      return NextResponse.json({ error: profileUpdateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Occupant details updated successfully." });
  } catch (error: any) {
    console.error("API PUT Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
