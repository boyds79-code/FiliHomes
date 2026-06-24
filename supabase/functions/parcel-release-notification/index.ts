import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!, 
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req: Request) => {
  try {
    const payload = await req.json();
    // 만약 invoke에서 { record: NEW }로 보냈다면 payload.record가 맞습니다.
    const record = payload.record;

    if (!record || !record.unit_no) {
      return new Response("No record found", { status: 400 });
    }

    // 1. DB에서 토큰 가져오기
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .eq('unit_no', record.unit_no)
      .maybeSingle(); // .single() 대신 .maybeSingle()을 써야 토큰이 없을 때 에러가 안 납니다.

    if (userError) {
      console.error("DB Error:", userError);
      return new Response("DB Error", { status: 500 });
    }

    if (user?.expo_push_token) {
      // 2. 푸시 전송
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: user.expo_push_token,
          title: '📦 New Parcel Arrived',
          body: `A parcel for Unit ${record.unit_no} is ready for collection at the guard desk.`,
          data: { parcelId: record.id },
        }),
      });
      
      const result = await res.json();
      return new Response(JSON.stringify(result), { status: 200 });
    }

    return new Response("No token found for this unit", { status: 200 });
    
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
});