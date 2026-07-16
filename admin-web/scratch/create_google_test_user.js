const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from admin-web/.env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Environment variables are missing. Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const condoId = 'c1111111-1111-1111-1111-111111111111'; // FiliHomes target condo

async function run() {
  try {
    console.log("🚀 Starting Google Play Test User setup...");

    // 1. Get or Create Unit 1207
    console.log("🔍 Checking if Unit 1207 exists...");
    let { data: unit, error: unitErr } = await supabase
      .from('units')
      .select('id')
      .eq('condo_id', condoId)
      .eq('unit_number', '1207')
      .maybeSingle();

    if (unitErr) throw unitErr;

    if (!unit) {
      console.log("✏️ Unit 1207 does not exist. Creating it...");
      const { data: newUnit, error: newUnitErr } = await supabase
        .from('units')
        .insert([{
          condo_id: condoId,
          unit_number: '1207',
          block_phase_no: 'Tower B',
          floor_no: '12',
          building_name: 'Tower B'
        }])
        .select('id')
        .single();
      
      if (newUnitErr) throw newUnitErr;
      unit = newUnit;
      console.log("✅ Unit 1207 created successfully. ID:", unit.id);
    } else {
      console.log("✅ Unit 1207 exists. ID:", unit.id);
    }

    // 2. Manage Auth User: google-test@filihomes.app
    console.log("🔍 Checking for existing google-test@filihomes.app Auth user...");
    const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers();
    if (usersErr) throw usersErr;

    const existingUser = usersData.users.find(u => u.email === 'google-test@filihomes.app');
    let user;

    if (existingUser) {
      console.log(`🧹 Found existing user with ID ${existingUser.id}. Deleting profiles and mappings first...`);
      // Delete from user_units bridge table
      await supabase.from('user_units').delete().eq('user_id', existingUser.id);
      // Delete from profiles table
      await supabase.from('profiles').delete().eq('id', existingUser.id);

      console.log(`🧹 Deleting auth user...`);
      const { error: delErr } = await supabase.auth.admin.deleteUser(existingUser.id);
      if (delErr) throw delErr;
      console.log("✅ Existing user deleted.");
    }

    console.log("✏️ Creating new Google Play Test user...");
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: 'google-test@filihomes.app',
      password: 'GoogleTest123!',
      email_confirm: true
    });

    if (createErr) throw createErr;
    user = newUser.user;
    console.log("✅ Auth user created successfully. ID:", user.id);

    // 3. Setup Profile
    console.log("✏️ Creating/Updating Profile in 'profiles' table...");
    const { error: profileErr } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        email: 'google-test@filihomes.app',
        full_name: 'Google Play Reviewer',
        role: 'resident',
        status: 'active',
        unit_id: unit.id,
        condo_id: condoId
      });

    if (profileErr) throw profileErr;
    console.log("✅ Profile created/updated successfully.");

    // 4. Setup User-Unit Bridge Mapping
    console.log("✏️ Mapping user to Unit 1207 in 'user_units' table...");
    const { error: bridgeErr } = await supabase
      .from('user_units')
      .upsert({
        user_id: user.id,
        unit_id: unit.id,
        condo_id: condoId,
        role: 'owner',
        status: 'active'
      });

    if (bridgeErr) throw bridgeErr;
    console.log("✅ User-Unit mapping registered successfully.");

    // 5. Clean up old billings for Unit 1207
    console.log("🧹 Clearing any old billing records for Unit 1207...");
    const { error: cleanBillErr } = await supabase
      .from('billings')
      .delete()
      .eq('unit_id', unit.id);
    
    if (cleanBillErr) throw cleanBillErr;
    console.log("✅ Old billing records cleared.");

    // 6. Insert Mock Billings for May, June, July 2026
    console.log("✏️ Inserting mock billing statements...");
    const mockBillings = [
      {
        id: `BILL-1207-2026-05-${unit.id.substring(0, 8)}`,
        unit_id: unit.id,
        condo_id: condoId,
        billing_month: '2026-05',
        billing_period_label: 'May 2026',
        due_date: '2026-05-15',
        condo_dues: 1500,
        electricity: 850,
        water: 300,
        parking_fee: 500,
        visitor_parking_fee: 0,
        amenity_fee: 0,
        total_due: 3150,
        status: 'PAID',
        description: 'Regular Monthly Dues + Utilities'
      },
      {
        id: `BILL-1207-2026-06-${unit.id.substring(0, 8)}`,
        unit_id: unit.id,
        condo_id: condoId,
        billing_month: '2026-06',
        billing_period_label: 'June 2026',
        due_date: '2026-06-15',
        condo_dues: 1500,
        electricity: 950,
        water: 320,
        parking_fee: 500,
        visitor_parking_fee: 0,
        amenity_fee: 0,
        total_due: 3270,
        status: 'PAID',
        description: 'Regular Dues + Summer Electricity'
      },
      {
        id: `BILL-1207-2026-07-${unit.id.substring(0, 8)}`,
        unit_id: unit.id,
        condo_id: condoId,
        billing_month: '2026-07',
        billing_period_label: 'July 2026',
        due_date: '2026-07-15',
        condo_dues: 1500,
        electricity: 1100,
        water: 280,
        parking_fee: 500,
        visitor_parking_fee: 150,
        amenity_fee: 200,
        total_due: 3730,
        status: 'UNPAID',
        description: 'Monthly dues, utility readings, visitor parking fee (₱150), and pool house booking fee (₱200).'
      }
    ];

    const { error: billInsertErr } = await supabase
      .from('billings')
      .insert(mockBillings);

    if (billInsertErr) throw billInsertErr;
    console.log("✅ Mock billings inserted successfully.");

    // 7. Clean up and Insert a Mock Visitor Pass
    console.log("🧹 Clearing old visitor passes for Unit 1207...");
    const { error: cleanPassErr } = await supabase
      .from('visitor_passes')
      .delete()
      .eq('unit_id', unit.id);
    
    if (cleanPassErr) throw cleanPassErr;

    console.log("✏️ Inserting mock active visitor pass...");
    const { error: passInsertErr } = await supabase
      .from('visitor_passes')
      .insert([{
        id: 'PASS-GOOGLETEST',
        unit_id: unit.id,
        visitor_name: 'John Doe (Google Reviewer)',
        visit_type: 'WALK_IN',
        plate_number: 'NDG 4892',
        purpose: 'App Testing Review',
        visit_date: '2026-06-30',
        qr_code_value: 'GOOGLETESTPASS',
        status: 'APPROVED'
      }]);
    
    if (passInsertErr) throw passInsertErr;
    console.log("✅ Mock active visitor pass inserted successfully.");

    console.log("\n🎉 SUCCESS! Google Play Review account setup complete!");
    console.log("-----------------------------------------------------");
    console.log("📧 Email: google-test@filihomes.app");
    console.log("🔑 Password: GoogleTest123!");
    console.log("🏢 Condo ID: c1111111-1111-1111-1111-111111111111 (Tower B Unit 1207)");
    console.log("-----------------------------------------------------");

  } catch (err) {
    console.error("❌ Setup failed with error:", err.message || err);
    process.exit(1);
  }
}

run();
