import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '../../../lib/supabaseServer';

// Helper function to parse month name (e.g. "May 2026") into "YYYY-MM"
function parseBillingMonth(period: string): string {
  if (!period) return new Date().toISOString().substring(0, 7);
  
  if (/^\d{4}-\d{2}$/.test(period)) return period;
  
  const cleanPeriod = period.replace('-', ' ').trim();
  const parts = cleanPeriod.split(/\s+/);
  
  if (parts.length === 2) {
    const monthStr = parts[0].toLowerCase();
    const yearStr = parts[1];
    
    const monthsMap: { [key: string]: string } = {
      jan: '01', january: '01',
      feb: '02', february: '02',
      mar: '03', march: '03',
      apr: '04', april: '04',
      may: '05',
      jun: '06', june: '06',
      jul: '07', july: '07',
      aug: '08', august: '08',
      sep: '09', september: '09',
      oct: '10', october: '10',
      nov: '11', november: '11',
      dec: '12', december: '12'
    };
    
    const month = monthsMap[monthStr.substring(0, 3)] || '01';
    const year = /^\d{4}$/.test(yearStr) ? yearStr : new Date().getFullYear().toString();
    return `${year}-${month}`;
  }
  
  return new Date().toISOString().substring(0, 7);
}

export async function POST(req: NextRequest) {
  try {
    const { condoId, billings } = await req.json();
    const supabaseAdmin = getAdminClient();

    // 1. Data format validation
    if (!condoId || !billings || !Array.isArray(billings)) {
      return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
    }

    // 2. Fetch all units for this condo to map unit_number to unit_id
    const { data: unitsData, error: unitsError } = await supabaseAdmin
      .from('units')
      .select('id, unit_number')
      .eq('condo_id', condoId);

    if (unitsError) {
      throw new Error(`Failed to fetch units: ${unitsError.message}`);
    }

    const unitMap = new Map();
    if (unitsData) {
      unitsData.forEach(u => unitMap.set(String(u.unit_number), u.id));
    }

    // 2.5 Fetch all COMPLETED bookings to aggregate amenity fees for this condo
    const { data: bookingsData, error: bookingsError } = await supabaseAdmin
      .from('amenity_bookings')
      .select('unit_id, amenity_id, booking_date')
      .eq('status', 'COMPLETED');

    if (bookingsError) {
      throw new Error(`Failed to fetch amenity bookings: ${bookingsError.message}`);
    }

    // Fetch condo_settings to determine rates for amenities
    const { data: condoSettings } = await supabaseAdmin
      .from('condo_settings')
      .select('amenity_settings')
      .eq('condo_id', condoId)
      .maybeSingle();

    const amenitySettings = condoSettings?.amenity_settings || {};
    const amenityFeeMap = new Map();
    const amenityDescMap = new Map();

    if (bookingsData) {
      bookingsData.forEach(booking => {
        if (!booking.unit_id) return;
        
        // Filter locally by units belonging to this condo
        const belongsToCondo = Array.from(unitMap.values()).includes(booking.unit_id);
        if (!belongsToCondo) return;

        const bookingMonth = booking.booking_date.substring(0, 7); // 'YYYY-MM'
        const matchedKey = Object.keys(amenitySettings).find(
          key => key.toLowerCase().replace(/\s+/g, '_') === booking.amenity_id
        );
        const config = matchedKey ? amenitySettings[matchedKey] : null;

        if (config && config.charge_enabled && Number(config.fee) > 0) {
          const fee = Number(config.fee);
          const key = `${booking.unit_id}_${bookingMonth}`;
          
          amenityFeeMap.set(key, (amenityFeeMap.get(key) || 0) + fee);
          
          const descLine = `${config.name || booking.amenity_id} Session: ₱${fee}`;
          const descs = amenityDescMap.get(key) || [];
          descs.push(descLine);
          amenityDescMap.set(key, descs);
        }
      });
    }

    // 3. Map input data to match target public.billings schema
    const finalBillingsToInsert = billings
      .map((b: any) => {
        const unitId = unitMap.get(String(b.unit_no));
        if (!unitId) return null; // Exclude if unit number doesn't exist

        const amount = b.amount !== undefined ? b.amount : (b.outstanding_balance || 0);
        const billingMonth = parseBillingMonth(b.billing_period || b.billing_month);
        const dueDate = `${billingMonth}-15`; // Default due date to 15th of the month

        const key = `${unitId}_${billingMonth}`;
        const computedAmenityFee = amenityFeeMap.get(key) || 0;
        const amenityDescs = amenityDescMap.get(key) || [];
        const baseDescription = `Monthly billing statement for ${billingMonth}`;
        const finalDescription = amenityDescs.length > 0
          ? `${baseDescription}\n-- Amenity Sessions --\n${amenityDescs.join('\n')}`
          : baseDescription;

        // Calculate total_due manually to ensure it includes dues, utilities, and amenity fee
        const baseDues = Number(b.condo_dues || b.association_dues || 0);
        const electricity = Number(b.electricity || 0);
        const water = Number(b.water || b.water_bill || 0);
        const parking = Number(b.parking_fee || 0);
        const jobOrder = Number(b.job_order_fee || 0);
        const totalDue = baseDues + electricity + water + parking + jobOrder + amount + computedAmenityFee;

        return {
          condo_id: condoId,
          unit_id: unitId,
          billing_month: billingMonth,
          due_date: dueDate,
          condo_dues: baseDues,
          electricity: electricity,
          water: water,
          electricity_usage: b.electricity_usage || 0,
          water_usage: b.water_usage || 0,
          parking_fee: parking,
          job_order_fee: jobOrder,
          amenity_fee: computedAmenityFee,
          previous_balance: amount, // Map balance to previous_balance
          total_due: totalDue,
          description: finalDescription,
          status: totalDue > 0 ? 'ISSUED' : 'PAID'
        };
      })
      .filter((b: any) => b !== null);

    if (finalBillingsToInsert.length === 0) {
      return NextResponse.json({ error: 'No matching units found in database' }, { status: 400 });
    }

    // 4. Batch Insert
    const { error: insertError } = await supabaseAdmin
      .from('billings')
      .insert(finalBillingsToInsert as any);

    if (insertError) {
      console.error("Supabase Admin Insert Error:", insertError);
      throw new Error(`Failed to insert billings: ${insertError.message}`);
    }

    return NextResponse.json({ 
      success: true, 
      insertedCount: finalBillingsToInsert.length 
    });

  } catch (error: any) {
    console.error('Migration API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}