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

    // 여러 개의 토큰에 대해 푸시 알림 요청 생성
    const notifications = pushTokens.map(token => ({
      to: token,
      sound: 'default',
      title: title || '알림',
      body: message,
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