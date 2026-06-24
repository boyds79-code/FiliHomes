import { getAdminClient } from '../../../../lib/supabaseServer';
import { NextResponse } from 'next/server';

// 가상의 알림 발송 함수 (추후 Supabase Edge Function이나 Expo Push Notification 로직으로 교체)
async function sendTechPushNotification(title: string, bodyText: string) {
  try {
    console.log("🔔 [PUSH NOTIFICATION]: Dispatching tech notifications...");
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
          console.log(`🔔 Sent push notification to ${pushTokens.length} technicians.`);
        }
      }
    }
  } catch (error) {
    console.error("Error dispatching technician notification:", error);
  }
}

export async function POST(req: Request) {
  try {
    const { userId, title, description, imageUrl, unitId, condoId, proposedVisitTime, assignedTechId } = await req.json();
    const adminClient = getAdminClient();

    // 1. 현재 시간 체크 (필리핀 시간 UTC+8 기준 09:00 - 18:00)
    const now = new Date();
    const phTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // UTC 시간에 8시간을 더함
    const hour = phTime.getUTCHours();
    const isWorkingHours = hour >= 9 && hour < 18;

    let status = 'REQUESTED';

    const insertData: any = {
      user_id: userId,
      title: title,
      description: description,
      image_url: imageUrl,
      unit_id: unitId,
      condo_id: condoId,
      status: status
    };

    if (proposedVisitTime) {
      insertData.time_change_request = proposedVisitTime;
    }

    const { error } = await adminClient.from('job_orders').insert([insertData]);

    if (error) throw error;

    // 🚨 테크팀에 새로운 수리 요청 알림 항상 발송
    await sendTechPushNotification(`🛠️ New Job Order`, `New request submitted: "${title}"`);

    // 🚨 근무 시간 외라면 추가 알림 발송
    if (!isWorkingHours) {
      await sendTechPushNotification("🚨 Urgent/After-Hours Request", "A new after-hours/urgent repair request has been submitted.");
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
