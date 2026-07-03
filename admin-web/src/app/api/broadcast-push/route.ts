import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { notifications } = await req.json();
    if (!notifications || !Array.isArray(notifications)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Database environment variables missing' }, { status: 500 });
    }

    const projectRef = supabaseUrl.split('//')[1].split('.')[0];
    const edgeUrl = `https://${projectRef}.supabase.co/functions/v1/push-notification`;

    console.log(`[API Broadcast Push] Invoking Edge Function directly for ${notifications.length} targets...`);

    // Invoke Edge Function for each notification using Server-side Service Role Key
    const sendPromises = notifications.map(async (notif) => {
      try {
        const res = await fetch(edgeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ record: notif })
        });
        return { status: res.status, text: await res.text() };
      } catch (e: any) {
        return { error: e.message };
      }
    });

    const results = await Promise.all(sendPromises);
    console.log("[API Broadcast Push] Direct call results completed:", results);

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
