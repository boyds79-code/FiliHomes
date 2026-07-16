import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../../lib/supabaseServer';
import dns from 'dns';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const condoId = searchParams.get('condoId') || 'c1111111-1111-1111-1111-111111111111';
    const techId = searchParams.get('techId');
    const historyTechId = searchParams.get('historyTechId');

    const adminClient = getAdminClient();

    let query = adminClient
      .from('job_orders')
      .select(`
        *,
        assigned_tech:assigned_technician_id (full_name, avatar_url),
        units:job_orders_unit_id_fkey (unit_number, building_no)
      `);

    if (historyTechId) {
      // 테크 히스토리 조회 (완료, 마감, 어드민대기, 취소된 항목들)
      query = query
        .eq('assigned_technician_id', historyTechId)
        .in('status', ['COMPLETED', 'CLOSED', 'WAITING_FOR_ADMIN', 'CANCELED'])
        .order('created_at', { ascending: false });
    } else if (techId) {
      // 테크 활성 작업 조회 (미배정이거나 본인에게 배정된 활성 작업)
      query = query
        .or(`assigned_technician_id.eq.${techId},assigned_technician_id.is.null`)
        .neq('status', 'COMPLETED')
        .neq('status', 'CLOSED')
        .neq('status', 'CANCELED')
        .neq('status', 'WAITING_FOR_ADMIN')
        .order('created_at', { ascending: false });
    } else {
      // 일반 어드민용 조회 (마감/취소된 항목 제외)
      query = query
        .eq('condo_id', condoId)
        .neq('status', 'CLOSED')
        .neq('status', 'CANCELED')
        .neq('status', 'CANCELLED')
        .order('created_at', { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      console.error("Supabase Select Error (job_orders):", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formattedData = (data || []).map((job: any) => {
      if (job.units) {
        return {
          ...job,
          units: {
            unit_number: job.units.unit_number,
            block_phase_no: job.units.building_no
          }
        };
      }
      return job;
    });

    return NextResponse.json(formattedData);
  } catch (error: any) {
    console.error("API Route Error (job_orders):", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
