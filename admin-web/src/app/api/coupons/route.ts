import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../lib/supabaseServer';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const advertiserName = searchParams.get('advertiserName');

    if (!userId && !advertiserName) {
      return NextResponse.json({ error: "Missing required query parameter: userId or advertiserName" }, { status: 400 });
    }

    const adminClient = getAdminClient();

    // If advertiserName is provided, return redeemed coupons for that advertiser
    if (advertiserName) {
      const { data: coupons, error } = await adminClient
        .from('coupons')
        .select(`
          id,
          title,
          description,
          code,
          status,
          advertiser_name,
          created_at,
          redeemed_at,
          profiles:user_id (full_name)
        `)
        .eq('advertiser_name', advertiserName)
        .eq('status', 'redeemed')
        .order('redeemed_at', { ascending: false });

      if (error) {
        console.error("Error fetching redeemed coupons for advertiser:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(coupons);
    }

    if (!userId) {
      return NextResponse.json({ error: "Missing required query parameter: userId" }, { status: 400 });
    }

    // 1. Fetch user's coupons
    const { data: coupons, error } = await adminClient
      .from('coupons')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching coupons:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 2. If user doesn't have coupons yet, seed welcome/onboarding coupons
    if (!coupons || coupons.length === 0) {
      const defaults = [
        {
          user_id: userId,
          title: "Globe 50% Off Welcome Promo",
          description: "Get 50% off on your first 3 months of Fiber Internet. Scan at any Globe Telecom partner store.",
          code: `WEL-GLB-${userId.slice(0, 8).toUpperCase()}`,
          advertiser_name: "Globe Telecom",
          status: "active"
        },
        {
          user_id: userId,
          title: "PLDT Home Speed Boost Voucher",
          description: "Enjoy a free speed boost up to 200 Mbps for 1 month. Scan at PLDT partner branches.",
          code: `WEL-PLDT-${userId.slice(0, 8).toUpperCase()}`,
          advertiser_name: "PLDT Home",
          status: "active"
        }
      ];

      const { data: inserted, error: insertErr } = await adminClient
        .from('coupons')
        .insert(defaults)
        .select();

      if (insertErr) {
        console.error("Error seeding default coupons:", insertErr);
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }

      return NextResponse.json(inserted);
    }

    return NextResponse.json(coupons);
  } catch (error: any) {
    console.error("API GET Coupons Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { code, advertiserName } = body;

    if (!code || !advertiserName) {
      return NextResponse.json({ error: "Missing required fields: code and advertiserName" }, { status: 400 });
    }

    const adminClient = getAdminClient();

    // 1. Find the active coupon
    const { data: coupon, error: fetchErr } = await adminClient
      .from('coupons')
      .select('*')
      .eq('code', code)
      .eq('advertiser_name', advertiserName)
      .eq('status', 'active')
      .maybeSingle();

    if (fetchErr) {
      console.error("Error fetching coupon for redemption:", fetchErr);
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!coupon) {
      return NextResponse.json({ error: "Active coupon not found or already redeemed for this merchant." }, { status: 404 });
    }

    // 2. Mark as redeemed
    const { data: updated, error: updateErr } = await adminClient
      .from('coupons')
      .update({
        status: 'redeemed',
        redeemed_at: new Date().toISOString()
      })
      .eq('id', coupon.id)
      .select()
      .single();

    if (updateErr) {
      console.error("Error updating coupon to redeemed:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Coupon successfully redeemed!",
      coupon: updated
    });
  } catch (error: any) {
    console.error("API POST Coupons Redeem Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
