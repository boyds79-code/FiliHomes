import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    // 1. Verify shared webhook secret for security
    const authHeader = req.headers.get("x-webhook-secret");
    const expectedSecret = Deno.env.get("CRON_MONITOR_SECRET") || "FiliCondoSecretToken123";
    
    if (authHeader !== expectedSecret) {
      console.warn("Unauthorized attempt to invoke system-error-email Function.");
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const payload = await req.json();
    const { job_name, run_id, error_message, end_time } = payload;

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') || 'admin@filicondo.com';

    if (!RESEND_API_KEY) {
      console.error("Missing RESEND_API_KEY environment variable. Cannot send email alert.");
      return new Response(JSON.stringify({ error: "Resend API key missing in environment." }), { status: 500 });
    }

    const emailBody = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1)">
        <div style="background-color: #ef4444; color: white; padding: 24px; text-align: center;">
          <h2 style="margin: 0; font-size: 20px;">🚨 Database Cron Job Execution Failed</h2>
          <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">System Maintenance Alert</p>
        </div>
        <div style="padding: 24px; color: #334155; line-height: 1.6;">
          <p style="margin-top: 0;">Dear Administrator,</p>
          <p>A scheduled database maintenance task has failed to execute. Please review the details below:</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; font-weight: bold; color: #475569; width: 120px;">Job Name:</td>
              <td style="padding: 10px 0; color: #0f172a;">${job_name || 'Unknown'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; font-weight: bold; color: #475569;">Run ID:</td>
              <td style="padding: 10px 0; color: #0f172a; font-family: monospace;">${run_id || 'N/A'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; font-weight: bold; color: #475569;">Error Details:</td>
              <td style="padding: 10px 0; color: #ef4444; font-family: monospace;">${error_message || 'No error details recorded.'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; font-weight: bold; color: #475569;">End Time:</td>
              <td style="padding: 10px 0; color: #0f172a;">${end_time || new Date().toISOString()}</td>
            </tr>
          </table>
          
          <p style="margin-bottom: 0;">Please check the Supabase dashboard or query the <code style="background-color: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-family: monospace;">cron.job_run_details</code> table for more details.</p>
        </div>
        <div style="background-color: #f8fafc; padding: 16px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #94a3b8;">
          This is an automated system alert sent from FiliCondo Database Monitor.
        </div>
      </div>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'FiliCondo System <system@filicondo.com>',
        to: ADMIN_EMAIL,
        subject: `🚨 [FiliCondo Alert] pg_cron Job Failed: ${job_name || 'Unknown'}`,
        html: emailBody,
      }),
    });

    const resJson = await res.json();
    return new Response(JSON.stringify(resJson), { status: 200 });
  } catch (err: any) {
    console.error("Error in system-error-email Edge Function:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
