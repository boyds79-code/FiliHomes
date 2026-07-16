import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record;

    if (!record) {
      return new Response(JSON.stringify({ error: "No record provided" }), { status: 400 });
    }

    const { expo_push_token, title, message, unit_id, user_id } = record;
    let pushTokens: string[] = [];

    // 만약 record 자체에 토큰이 있다면 우선 사용
    if (expo_push_token) {
      pushTokens.push(expo_push_token);
    } else {
      // 토큰이 없다면 Supabase DB에서 조회 (Service Role Key 사용)
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        let query = supabase.from('profiles').select('expo_push_token').not('expo_push_token', 'is', null);
        
        if (unit_id) {
          query = query.eq('unit_id', unit_id);
        } else if (user_id) {
          query = query.eq('id', user_id);
        } else {
          return new Response(JSON.stringify({ error: "No target unit_id or user_id provided" }), { status: 400 });
        }

        const { data, error } = await query;
        
        if (!error && data) {
          pushTokens = data.map((p: any) => p.expo_push_token).filter(Boolean);
        } else if (error) {
          console.error("Profiles query error:", error);
        }
      }
    }

    if (pushTokens.length === 0) {
      return new Response(JSON.stringify({ error: "No push tokens found for the target" }), { status: 404 });
    }

    // Calculate unread billings count for the badge count
    let badgeCount = record.badge || 1;
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && supabaseServiceKey && unit_id) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        // Get user_id of this unit
        const { data: profData } = await supabase.from('profiles').select('id').eq('unit_id', unit_id).maybeSingle();
        if (profData?.id) {
          // Get all active units of this user
          const { data: userUnits } = await supabase.from('user_units').select('unit_id').eq('user_id', profData.id).eq('status', 'active');
          if (userUnits && userUnits.length > 0) {
            const unitIds = userUnits.map((u: any) => u.unit_id);
            const { count } = await supabase
              .from('billings')
              .select('*', { count: 'exact', head: true })
              .in('unit_id', unitIds)
              .in('status', ['ISSUED', 'OVERDUE', 'UNPAID', 'PENDING']);
            if (count !== null && count > 0) {
              badgeCount = count;
            }
          }
        }
      }
    } catch (badgeErr) {
      console.error("Failed to count unread billings for badge:", badgeErr);
    }

    // 여러 개의 토큰에 대해 푸시 알림 요청 생성
    const notifications = pushTokens.map(token => ({
      to: token,
      sound: 'default',
      title: title || '알림',
      body: message,
      badge: badgeCount, // 🎯 스마트폰 홈 화면 앱 아이콘 뱃지 숫자 지정!
    }));

    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN') || ''}`,
      },
      body: JSON.stringify(notifications),
    }).then((res) => res.json());

    return new Response(JSON.stringify(res), { status: 200 });
  } catch (err: any) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});