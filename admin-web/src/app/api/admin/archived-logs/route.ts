import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../../lib/supabaseServer';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const searchQuery = searchParams.get('search') || '';
    
    const adminClient = getAdminClient();

    // 1. Fetch archived visitor logs
    const logsQuery = adminClient
      .from('archived_visitor_logs')
      .select('*')
      .order('access_time', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: logs, error: logsError } = await logsQuery;

    if (logsError) {
      console.error("Supabase Error (archived_visitor_logs):", logsError);
      return NextResponse.json({ error: logsError.message }, { status: 500 });
    }

    if (!logs || logs.length === 0) {
      return NextResponse.json({ logs: [], totalCount: 0 });
    }

    // 2. Fetch total count of archived logs
    const { count, error: countError } = await adminClient
      .from('archived_visitor_logs')
      .select('*', { count: 'exact', head: true });

    const totalCount = countError ? logs.length : (count || 0);

    // 3. In-memory join: Fetch matching archived visitor passes
    const passIds = Array.from(new Set(logs.map(log => log.pass_id).filter(id => id !== null)));
    
    let passes: any[] = [];
    if (passIds.length > 0) {
      const { data: passesData, error: passesError } = await adminClient
        .from('archived_visitor_passes')
        .select('*')
        .in('id', passIds);

      if (passesError) {
        console.error("Supabase Error (archived_visitor_passes):", passesError);
      } else {
        passes = passesData || [];
      }
    }

    // Map passes by id
    const passesMap = new Map(passes.map(p => [p.id.toString(), p]));

    // Join logs and passes
    const joinedLogs = logs.map(log => {
      const pass = log.pass_id ? passesMap.get(log.pass_id.toString()) : null;
      return {
        ...log,
        visitor_passes: pass ? {
          visitor_name: pass.visitor_name,
          visit_type: pass.visit_type,
          purpose: pass.purpose,
          plate_number: pass.plate_number,
          vehicle_type: pass.vehicle_type,
          vehicle_model: pass.vehicle_model
        } : null
      };
    });

    // 4. Apply search filter in-memory if query is provided
    let filteredLogs = joinedLogs;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filteredLogs = joinedLogs.filter(log => 
        log.gate_location?.toLowerCase().includes(q) ||
        log.visitor_passes?.visitor_name?.toLowerCase().includes(q) ||
        log.visitor_passes?.plate_number?.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ logs: filteredLogs, totalCount });
  } catch (error: any) {
    console.error("API Route Error (archived-logs):", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
