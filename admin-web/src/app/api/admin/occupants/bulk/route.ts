import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../../../lib/supabaseServer';
import dns from 'dns';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { condoId = 'c1111111-1111-1111-1111-111111111111', occupants = [] } = body;

    if (!occupants || occupants.length === 0) {
      return NextResponse.json({ error: "No occupants provided for bulk Ingestion." }, { status: 400 });
    }

    const adminClient = getAdminClient();

    // Fetch existing units for cache to support auto-creation & matching
    const { data: dbUnits, error: fetchUnitsErr } = await adminClient
      .from('units')
      .select('id, unit_number, building_no')
      .eq('condo_id', condoId);
    if (fetchUnitsErr) {
      console.error("Fetch units for bulk mapping error:", fetchUnitsErr);
    }
    const unitsCache = dbUnits || [];

    // 1. Fetch all existing auth users once to check against in memory (optimization)
    const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers();
    if (listError) {
      console.error("Auth Admin List Error:", listError);
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    const currentUsers = [...users];
    const registeredOccupants = [];
    const profilesToUpsert = [];
    const mappingsToUpsert = [];

    // 2. Process each occupant
    for (const occ of occupants) {
      const { email, fullName, phone, unitId, unitRole = 'family_member', leaseStartDate = null, leaseEndDate = null, isPayer = true, unit_no, tower } = occ;

      if (!email || (!unitId && !unit_no)) {
        continue; // Skip invalid records
      }

      let finalUnitId = unitId;

      // Auto-create unit if not matched/existing in DB
      if (!finalUnitId && unit_no) {
        let matchedUnit = unitsCache.find(u => 
          u.unit_number.toLowerCase() === unit_no.toLowerCase() &&
          (!tower || (u.building_no || '').toLowerCase() === tower.toLowerCase())
        );

        if (matchedUnit) {
          finalUnitId = matchedUnit.id;
        } else {
          // Dynamic unit creation on-the-fly
          const { data: newUnit, error: createUnitErr } = await adminClient
            .from('units')
            .insert({
              condo_id: condoId,
              unit_number: unit_no,
              building_no: tower || 'A',
              status: 'vacant'
            })
            .select('id')
            .single();

          if (createUnitErr) {
            console.error(`Failed to auto-create unit ${unit_no} (${tower}):`, createUnitErr.message);
            continue;
          }

          finalUnitId = newUnit.id;
          unitsCache.push({ id: finalUnitId, unit_number: unit_no, building_no: tower || 'A' });
        }
      }

      let authUser = currentUsers.find(u => u.email?.toLowerCase() === email.toLowerCase());
      let userId: string;

      if (authUser) {
        userId = authUser.id;
      } else {
        // Create new auth user
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
          console.error(`Auth Admin Create User Error for ${email}:`, createError);
          continue; // Skip this user and proceed with others
        }

        userId = createData.user.id;
        // Add to our local list to prevent duplicate creation attempts if same email is in CSV
        currentUsers.push(createData.user);
      }

      // Prepare profile data
      profilesToUpsert.push({
        id: userId,
        email: email,
        phone: phone,
        full_name: fullName,
        role: 'resident',
        unit_id: finalUnitId,
        condo_id: condoId,
        status: 'active'
      });

      // Prepare user_unit mapping data
      mappingsToUpsert.push({
        user_id: userId,
        unit_id: finalUnitId,
        condo_id: condoId,
        role: unitRole,
        status: 'active',
        lease_start_date: leaseStartDate || null,
        lease_end_date: leaseEndDate || null,
        is_payer: isPayer
      });

      registeredOccupants.push({ email, fullName, unitId: finalUnitId });
    }

    // 3. Batch upsert profiles
    if (profilesToUpsert.length > 0) {
      const { error: profileError } = await adminClient
        .from('profiles')
        .upsert(profilesToUpsert);

      if (profileError) {
        console.error("Supabase Bulk Upsert Profile Error:", profileError);
        return NextResponse.json({ error: profileError.message }, { status: 500 });
      }
    }

    // 4. Upsert mappings in user_units table
    if (mappingsToUpsert.length > 0) {
      const { error: mappingError } = await adminClient
        .from('user_units')
        .upsert(mappingsToUpsert, { onConflict: 'user_id,unit_id' });

      if (mappingError) {
        console.error("Supabase Bulk Upsert user_units Error:", mappingError);
        return NextResponse.json({ error: mappingError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      processedCount: registeredOccupants.length,
      message: `Successfully registered/updated ${registeredOccupants.length} occupants.`
    });
  } catch (error: any) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
