import { getAdminClient } from '../../../../lib/supabaseServer';
import { NextResponse } from 'next/server';

async function sendResidentPushNotification(userId: string, title: string, bodyText: string) {
  try {
    console.log(`🔔 [PUSH NOTIFICATION]: Dispatching resident notification to ${userId}...`);
    const adminClient = getAdminClient();
    
    // profiles 테이블에서 expo_push_token 가져오기
    const { data: profile } = await adminClient
      .from('profiles')
      .select('expo_push_token')
      .eq('id', userId)
      .single();
    
    if (profile && profile.expo_push_token) {
      const notification = {
        to: profile.expo_push_token,
        sound: 'default',
        title: title,
        body: bodyText,
        badge: 1,
        data: { type: 'MAINTENANCE_JOB_ORDER' }
      };

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([notification]),
      });
      console.log("🔔 Sent push notification to resident successfully.");
    } else {
      console.log("🔔 Resident push token not found or null.");
    }
  } catch (error) {
    console.error("Error dispatching resident notification:", error);
  }
}

async function sendTechPushNotification(techUserId: string, title: string, bodyText: string) {
  try {
    console.log(`🔔 [PUSH NOTIFICATION]: Dispatching tech notification to ${techUserId}...`);
    const adminClient = getAdminClient();
    
    const { data: profile } = await adminClient
      .from('profiles')
      .select('expo_push_token')
      .eq('id', techUserId)
      .single();
    
    if (profile && profile.expo_push_token) {
      const notification = {
        to: profile.expo_push_token,
        sound: 'default',
        title: title,
        body: bodyText,
        badge: 1,
        data: { type: 'MAINTENANCE_JOB_ORDER' }
      };

      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([notification]),
      });
      console.log("🔔 Sent push notification to technician successfully.");
    } else {
      console.log("🔔 Technician push token not found or null.");
    }
  } catch (error) {
    console.error("Error dispatching technician notification:", error);
  }
}

async function broadcastTechPushNotification(title: string, bodyText: string) {
  try {
    console.log("🔔 [PUSH NOTIFICATION]: Broadcasting tech notifications...");
    const adminClient = getAdminClient();
    
    // 1. role = 'TECHNICIAN' 인 스탭 프로필 ID 가져오기
    const { data: staffMembers } = await adminClient
      .from('staff_profiles')
      .select('id')
      .eq('role', 'TECHNICIAN');
    
    if (staffMembers && staffMembers.length > 0) {
      const staffIds = staffMembers.map(s => s.id);
      
      // 2. profiles 테이블에서 expo_push_token 가져오기
      const { data: staffProfiles } = await adminClient
        .from('profiles')
        .select('expo_push_token')
        .in('id', staffIds)
        .not('expo_push_token', 'is', null);
      
      if (staffProfiles && staffProfiles.length > 0) {
        const pushTokens = staffProfiles.map(p => p.expo_push_token).filter(Boolean);
        if (pushTokens.length > 0) {
          const notifications = pushTokens.map(token => ({
            to: token,
            sound: 'default',
            title: title,
            body: bodyText,
            badge: 1,
            data: { type: 'MAINTENANCE_JOB_ORDER' }
          }));
          
          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(notifications),
          });
          console.log(`🔔 Sent cancellation push notification to ${pushTokens.length} technicians.`);
        }
      }
    }
  } catch (error) {
    console.error("Error broadcasting technician notification:", error);
  }
}

export async function POST(req: Request) {
  try {
    const { id, updates } = await req.json();
    if (!id || !updates) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    // Centrally record step transition timestamps
    if (updates.status) {
      const nowStr = new Date().toISOString();
      if (updates.status === 'ASSIGNED') updates.status_assigned_at = nowStr;
      else if (updates.status === 'VISIT_PROPOSED') updates.status_scheduling_at = nowStr;
      else if (updates.status === 'VISIT_CONFIRMED') updates.status_booked_at = nowStr;
      else if (updates.status === 'VISITING') updates.status_visiting_at = nowStr;
      else if (updates.status === 'ESTIMATE_SUBMITTED') updates.status_estimate_submitted_at = nowStr;
      else if (updates.status === 'IN_PROGRESS') updates.status_in_progress_at = nowStr;
      else if (updates.status === 'COMPLETED') updates.status_finished_at = nowStr;
      else if (updates.status === 'CLOSED') updates.status_closed_at = nowStr;
      else if (updates.status === 'REQUESTED') updates.status_filed_at = nowStr;
    }

    const adminClient = getAdminClient();

    // 1-0-3. 상태가 CANCELED로 변경되는 경우 담당 기술자(또는 미배정이면 모든 기술자)에게 푸시 알림 발송
    if (updates.status === 'CANCELED') {
      const { data: job } = await adminClient
        .from('job_orders')
        .select('title, assigned_technician_id')
        .eq('id', id)
        .single();
      
      if (job) {
        if (job.assigned_technician_id) {
          await sendTechPushNotification(
            job.assigned_technician_id,
            `❌ Job Order Cancelled`,
            `The job order "${job.title}" assigned to you has been cancelled by the resident.`
          );
        } else {
          await broadcastTechPushNotification(
            `❌ Job Order Cancelled`,
            `The unassigned job order "${job.title}" has been cancelled by the resident.`
          );
        }
      }
    }

    // 1-0. 상태가 ASSIGNED로 변경되고 담당 기술자가 배정되는 경우
    if (updates.status === 'ASSIGNED' && updates.assigned_technician_id) {
      const { data: job } = await adminClient
        .from('job_orders')
        .select('user_id, title')
        .eq('id', id)
        .single();
      
      const { data: tech } = await adminClient
        .from('staff_profiles')
        .select('full_name')
        .eq('id', updates.assigned_technician_id)
        .single();
      
      if (job && job.user_id) {
        const techName = tech?.full_name || "a Technician";
        await sendResidentPushNotification(
          job.user_id,
          `🛠️ Job Order Assigned`,
          `Your job order "${job.title}" has been assigned to ${techName}.`
        );
      }
    }

    // 1-0-2. 상태가 VISIT_PROPOSED로 변경되고 방문 제안 시간이 등록되는 경우
    if (updates.status === 'VISIT_PROPOSED' && updates.proposed_visit_time) {
      const { data: job } = await adminClient
        .from('job_orders')
        .select('user_id, title, assigned_technician_id')
        .eq('id', id)
        .single();
      
      const techId = updates.assigned_technician_id || job?.assigned_technician_id;
      let techName = "a Technician";
      if (techId) {
        const { data: tech } = await adminClient
          .from('staff_profiles')
          .select('full_name')
          .eq('id', techId)
          .single();
        if (tech?.full_name) techName = tech.full_name;
      }
      
      const targetUserId = job?.user_id;
      if (targetUserId) {
        let displayTime = updates.proposed_visit_time;
        try {
          const parsedDate = new Date(updates.proposed_visit_time);
          if (!isNaN(parsedDate.getTime())) {
            displayTime = parsedDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            });
          }
        } catch (err) {
          console.error("Error formatting proposed visit time for push notification:", err);
        }

        await sendResidentPushNotification(
          targetUserId,
          `📅 Proposed Visit Time`,
          `Technician ${techName} proposed a visit at ${displayTime}. Please approve.`
        );
      }
    }

    // 1-0-7. 상태가 TIME_NEGOTIATING으로 변경되고 입주민이 시간 변경을 요청한 경우 (입주자가 다시 스케줄을 제안한 경우)
    if (updates.status === 'TIME_NEGOTIATING' && updates.time_change_request) {
      const { data: job } = await adminClient
        .from('job_orders')
        .select('title, assigned_technician_id, units:job_orders_unit_id_fkey(unit_number)')
        .eq('id', id)
        .single();
      
      const techId = updates.assigned_technician_id || job?.assigned_technician_id;
      if (techId) {
        let displayTime = updates.time_change_request;
        try {
          const parsedDate = new Date(updates.time_change_request);
          if (!isNaN(parsedDate.getTime())) {
            displayTime = parsedDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            });
          }
        } catch (err) {
          console.error("Error formatting proposed visit time for push notification:", err);
        }

        const unitNum = (job as any)?.units?.unit_number || "";
        await sendTechPushNotification(
          techId,
          `🔄 Reschedule Requested (Unit ${unitNum})`,
          `The resident requested to reschedule "${job?.title || 'Job'}" to ${displayTime}. Please confirm.`
        );
      }
    }

    // 1-0-4. 상태가 VISIT_CONFIRMED로 변경되는 경우
    if (updates.status === 'VISIT_CONFIRMED') {
      const { data: job } = await adminClient
        .from('job_orders')
        .select('user_id, title, assigned_technician_id, proposed_visit_time, time_change_request')
        .eq('id', id)
        .single();
      
      const techId = updates.assigned_technician_id || job?.assigned_technician_id;
      let techName = "a Technician";
      if (techId) {
        const { data: tech } = await adminClient
          .from('staff_profiles')
          .select('full_name')
          .eq('id', techId)
          .single();
        if (tech?.full_name) techName = tech.full_name;
      }
      
      const visitTime = updates.proposed_visit_time || job?.proposed_visit_time || job?.time_change_request;
      let displayTime = "";
      if (visitTime) {
        try {
          const parsedDate = new Date(visitTime);
          if (!isNaN(parsedDate.getTime())) {
            displayTime = parsedDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            });
          } else {
            displayTime = visitTime;
          }
        } catch (err) {
          console.error("Error formatting proposed visit time for push notification:", err);
          displayTime = visitTime;
        }
      }
      
      const targetUserId = job?.user_id;
      if (targetUserId) {
        await sendResidentPushNotification(
          targetUserId,
          `✅ Visit Confirmed`,
          `Your visit is confirmed for ${displayTime}. Technician ${techName} will visit your unit.`
        );
      }
    }

    // 1-0-5. 상태가 ESTIMATE_SUBMITTED로 변경되는 경우
    if (updates.status === 'ESTIMATE_SUBMITTED') {
      const { data: job } = await adminClient
        .from('job_orders')
        .select('user_id, title')
        .eq('id', id)
        .single();
      
      const cost = updates.estimated_cost ?? (Number(updates.material_cost || 0) + Number(updates.labor_cost || 0));
      const targetUserId = job?.user_id;
      if (targetUserId) {
        await sendResidentPushNotification(
          targetUserId,
          `💰 Estimate Billed`,
          `Estimate Billed: Please approve cost of ₱${cost.toLocaleString()} to start repairs.`
        );
      }
    }

    // 1-0-6. 상태가 COMPLETED 또는 CLOSED로 변경되는 경우 푸시 알림 발송
    if (updates.status === 'COMPLETED' || updates.status === 'CLOSED') {
      const { data: job } = await adminClient
        .from('job_orders')
        .select('user_id, status, title, estimated_cost')
        .eq('id', id)
        .single();
      
      if (job && job.status !== updates.status) {
        const cost = updates.estimated_cost ?? job.estimated_cost ?? 0;
        const targetUserId = job.user_id;
        if (targetUserId) {
          await sendResidentPushNotification(
            targetUserId,
            `✅ Repair Completed`,
            `Repair Completed: ₱${cost.toLocaleString()} has been successfully billed to your next monthly statement.`
          );
        }
      }
    }

    // 1. 상태가 COMPLETED 혹은 CLOSED로 변경되는 경우, 빌링 연동을 수행합니다.
    if (updates.status === 'COMPLETED' || updates.status === 'CLOSED') {
      // 1-1. 작업 정보 조회 (비용 정보 획득 및 현재 상태 체크)
      const { data: job } = await adminClient
        .from('job_orders')
        .select('status, unit_id, condo_id, estimated_cost')
        .eq('id', id)
        .single();
      
      const cost = updates.estimated_cost ?? job?.estimated_cost ?? 0;
      
      // 이미 COMPLETED나 CLOSED 상태가 아니었을 때만 금액 추가 (중복 부과 방지)
      if (job && job.status !== 'COMPLETED' && job.status !== 'CLOSED' && cost > 0) {
        // 1-2. 해당 유닛의 '다음 달' 빌링 데이터 조회 (없으면 새로 생성)
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const billingMonth = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`; // 'YYYY-MM', Timezone-safe

        const { data: bill } = await adminClient
          .from('billings')
          .select('id, job_order_fee')
          .eq('unit_id', job.unit_id)
          .eq('billing_month', billingMonth)
          .single();

        if (bill) {
          // 빌링이 이미 있다면 금액만 추가
          await adminClient
            .from('billings')
            .update({ job_order_fee: Number(bill.job_order_fee || 0) + Number(cost) })
            .eq('id', bill.id);
        } else {
          // 빌링이 없다면 새로 생성
          await adminClient
            .from('billings')
            .insert([{
              condo_id: job.condo_id,
              unit_id: job.unit_id,
              billing_month: billingMonth,
              job_order_fee: cost,
              status: 'ISSUED',
              due_date: new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 30).toISOString()
            }]);
        }
      }
    }

    // 2. 최종 상태 업데이트
    const { error } = await adminClient.from('job_orders').update(updates).eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
