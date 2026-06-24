import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../../lib/supabaseServer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const adminClient = getAdminClient();
    
    // 1. Fetch staff profiles
    const { data: staffData, error: staffError } = await adminClient
      .from('staff_profiles')
      .select('*');

    if (staffError) {
      console.error("Supabase Select staff_profiles Error:", staffError);
      return NextResponse.json({ error: staffError.message }, { status: 500 });
    }

    if (!staffData || staffData.length === 0) {
      return NextResponse.json([]);
    }

    // 2. Extract IDs and fetch corresponding profiles
    const staffIds = staffData.map((s: any) => s.id);
    const { data: profilesData, error: profilesError } = await adminClient
      .from('profiles')
      .select('id, email')
      .in('id', staffIds);

    if (profilesError) {
      console.error("Supabase Select profiles Error:", profilesError);
    }

    // 3. Merge profiles data into staff profiles
    const mergedData = staffData.map((staff: any) => {
      const profile = profilesData?.find((p: any) => p.id === staff.id);
      return {
        ...staff,
        profiles: profile ? { email: profile.email } : null
      };
    });

    return NextResponse.json(mergedData);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 2. 기존 POST 함수 (직원 등록용으로 사용)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const adminClient = getAdminClient();

    // insert 할 테이블이 'staff_profiles'인지 'profiles'인지 확인하세요
    const { error } = await adminClient.from('staff_profiles').insert([body.data]);

    if (error) {
      console.error("Supabase Insert Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("API Route Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}