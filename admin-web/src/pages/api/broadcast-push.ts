import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { notifications } = req.body;
    if (!notifications || !Array.isArray(notifications)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://asqgyncyqnbmitkubjwq.supabase.co";
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ";
    
    const projectRef = supabaseUrl.split('//')[1].split('.')[0];
    const edgeUrl = `https://${projectRef}.supabase.co/functions/v1/push-notification`;

    console.log(`[API Broadcast Push Pages] Invoking Edge Function directly for ${notifications.length} targets...`);

    const sendPromises = notifications.map(async (notif) => {
      try {
        const response = await fetch(edgeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ record: { ...notif, badge: 1 } })
        });
        return { status: response.status, text: await response.text() };
      } catch (e: any) {
        return { error: e.message };
      }
    });

    const results = await Promise.all(sendPromises);
    console.log("[API Broadcast Push Pages] Direct call results completed:", results);

    return res.status(200).json({ success: true, results });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
