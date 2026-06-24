import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../../lib/supabaseServer';
import dns from 'dns';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const condoId = searchParams.get('condoId') || 'c1111111-1111-1111-1111-111111111111';
    
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('notices')
      .select('*')
      .eq('condo_id', condoId)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching notices:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("GET notices error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      title,
      content,
      category,
      is_pinned = false,
      condoId = 'c1111111-1111-1111-1111-111111111111'
    } = body;

    if (!title || !content || !category) {
      return NextResponse.json({ error: "Title, content, and category are required." }, { status: 400 });
    }

    const adminClient = getAdminClient();

    // 1. Insert notice into database
    const { data: notices, error: insertError } = await adminClient
      .from('notices')
      .insert({
        condo_id: condoId,
        title,
        content,
        category,
        is_pinned
      })
      .select();

    if (insertError) {
      console.error("Error inserting notice:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const newNotice = notices?.[0];

    // 2. Fetch all resident push tokens for the condo to trigger Expo Push Notification
    try {
      const { data: occupants, error: occupantError } = await adminClient
        .from('user_units')
        .select(`
          profiles:user_id (expo_push_token)
        `)
        .eq('condo_id', condoId);

      if (occupantError) {
        console.error("Error fetching occupant push tokens:", occupantError);
      } else if (occupants) {
        const tokens = occupants
          .map((item: any) => item.profiles?.expo_push_token)
          .filter((token): token is string => !!token && token.startsWith('ExponentPushToken'));

        const uniqueTokens = Array.from(new Set(tokens));

        if (uniqueTokens.length > 0) {
          const getCategoryEmoji = (cat: string) => {
            switch (cat) {
              case 'EMERGENCY': return '🚨';
              case 'FACILITIES': return '🏊';
              case 'EVENT': return '🎉';
              default: return '📢';
            }
          };
          const categoryEmoji = getCategoryEmoji(category || 'GENERAL');

          const pushMessages = uniqueTokens.map(token => ({
            to: token,
            sound: 'default',
            title: `${categoryEmoji} [${category || 'GENERAL'}] ${title}`,
            body: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
            badge: 1,
            channelId: 'default',
            data: { type: 'NEW_NOTICE', noticeId: newNotice?.id, category }
          }));

          // Dispatch to Expo API
          console.log(`Attempting to dispatch push notifications for new notice to ${uniqueTokens.length} devices.`);
          console.log(`Push payload:`, JSON.stringify(pushMessages, null, 2));
          
          const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(pushMessages),
          });
          
          const expoResText = await expoRes.text();
          console.log(`Expo API Response Status: ${expoRes.status}`);
          console.log(`Expo API Response Body: ${expoResText}`);
          console.log(`Dispatched push notifications for new notice to ${uniqueTokens.length} devices.`);
        }
      }
    } catch (pushErr) {
      console.error("Failed to send push notifications during notice creation:", pushErr);
    }

    return NextResponse.json(newNotice);
  } catch (error: any) {
    console.error("POST notices error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const {
      id,
      title,
      content,
      category,
      is_pinned = false,
      condoId = 'c1111111-1111-1111-1111-111111111111'
    } = body;

    if (!id || !title || !content || !category) {
      return NextResponse.json({ error: "Missing required fields for update (id, title, content, category)." }, { status: 400 });
    }

    const adminClient = getAdminClient();
    const { data: updatedNotices, error } = await adminClient
      .from('notices')
      .update({
        title,
        content,
        category,
        is_pinned
      })
      .eq('id', id)
      .eq('condo_id', condoId)
      .select();

    if (error) {
      console.error("Error updating notice:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(updatedNotices?.[0]);
  } catch (error: any) {
    console.error("PUT notice error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: "Missing notice id" }, { status: 400 });
    }

    const adminClient = getAdminClient();
    const { error } = await adminClient
      .from('notices')
      .delete()
      .eq('id', id);

    if (error) {
      console.error("Error deleting notice:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE notice error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
