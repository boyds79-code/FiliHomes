import { getAdminClient } from '../../../lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const adminClient = getAdminClient();
    const { data: reports, error } = await adminClient
      .from('user_reports')
      .select('*')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (reports && reports.length > 0) {
      // 1. Gather all unique user IDs
      const userIds = Array.from(new Set(
        reports.flatMap(r => [r.reporter_id, r.reported_id].filter(Boolean))
      ));

      // 2. Fetch unit details for these user IDs
      const { data: userUnits } = await adminClient
        .from('user_units')
        .select(`
          user_id,
          units:unit_id (
            unit_number,
            block_phase_no
          )
        `)
        .in('user_id', userIds);

      // 3. Map user ID to unit info
      const unitMap = new Map<string, { unit_number: string; tower_name: string }>();
      if (userUnits) {
        userUnits.forEach((uu: any) => {
          if (uu.units) {
            unitMap.set(uu.user_id, {
              unit_number: uu.units.unit_number,
              tower_name: uu.units.block_phase_no || ''
            });
          }
        });
      }

      // 4. Attach unit info to reports
      const reportsWithUnits = reports.map((r: any) => {
        let reporterUnit = unitMap.get(r.reporter_id);
        let reportedUnit = unitMap.get(r.reported_id);
        
        let reporterUnitStr = reporterUnit ? `${reporterUnit.tower_name ? reporterUnit.tower_name + ' ' : ''}Unit ${reporterUnit.unit_number}` : 'Unknown Unit';
        let reportedUnitStr = reportedUnit ? `${reportedUnit.tower_name ? reportedUnit.tower_name + ' ' : ''}Unit ${reportedUnit.unit_number}` : 'Unknown Unit';
        
        // Chris Kim test UUID fallback
        if (r.reporter_id === '4078096f-b34a-4119-8075-63874fdd99d1' && reporterUnitStr === 'Unknown Unit') {
          reporterUnitStr = 'Unit 1204';
        }
        if (r.reported_id === '4078096f-b34a-4119-8075-63874fdd99d1' && reportedUnitStr === 'Unknown Unit') {
          reportedUnitStr = 'Unit 1204';
        }

        // Try to extract target unit from description for demo or missing records
        if (r.description) {
          // 1) Match explicit "Target Unit: XXX"
          let match = r.description.match(/Target Unit:\s*([^\s-]+)/i);
          if (match && match[1]) {
            reportedUnitStr = `Unit ${match[1]}`;
          } else {
            // 2) Match room identifiers like demo-dm-1204, demo-room-1502
            match = r.description.match(/(?:demo-dm-|demo-room-|unit\s+)(\d+)/i);
            if (match && match[1]) {
              reportedUnitStr = `Unit ${match[1]}`;
            }
          }

          // 3) Append tower info if present
          const towerMatch = r.description.match(/(Tower\s+\w+)/i);
          if (towerMatch && towerMatch[1] && !reportedUnitStr.includes('Tower')) {
            reportedUnitStr = `${towerMatch[1]} ${reportedUnitStr}`;
          }
        }
        
        return {
          ...r,
          reporter_unit: reporterUnitStr,
          reported_unit: reportedUnitStr
        };
      });

      return NextResponse.json(reportsWithUnits);
    }

    return NextResponse.json(reports || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId, reportId, action } = await req.json();
    if (!reportId) {
      return NextResponse.json({ error: 'Missing reportId' }, { status: 400 });
    }

    const adminClient = getAdminClient();

    // 1. If dismissing, resolve ticket without user sanction
    if (action === 'dismiss') {
      const { error: reportError } = await adminClient
        .from('user_reports')
        .update({ status: 'RESOLVED' })
        .eq('id', reportId);
        
      if (reportError) throw reportError;
      return NextResponse.json({ success: true, dismissed: true });
    }

    // Default: Suspend user and resolve ticket (Suspend)
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // 1. Update user profile status to suspended
    const { error: profileError } = await adminClient
      .from('profiles')
      .update({ status: 'suspended' })
      .eq('id', userId);

    if (profileError) throw profileError;

    // 2. Resolve the report ticket
    const { error: reportError } = await adminClient
      .from('user_reports')
      .update({ status: 'RESOLVED' })
      .eq('id', reportId);
      
    if (reportError) throw reportError;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
