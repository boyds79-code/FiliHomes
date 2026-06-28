import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../../../lib/supabaseServer';
import { Resend } from 'resend';
import dns from 'dns';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

// GET: Retrieve invitations for a condo
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const condoId = searchParams.get('condoId') || 'c1111111-1111-1111-1111-111111111111';
    
    const adminClient = getAdminClient();
    const { data, error } = await adminClient
      .from('unit_invitations')
      .select(`
        id,
        email,
        invite_code,
        role,
        is_used,
        expired_at,
        created_at,
        used_at,
        unit_id,
        units (unit_number, building_no)
      `)
      .eq('condo_id', condoId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Supabase Error (fetch invitations):", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("API GET Invitations Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Create invitation codes and send emails
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { invitations, condoId = 'c1111111-1111-1111-1111-111111111111' } = body;

    if (!invitations || !Array.isArray(invitations) || invitations.length === 0) {
      return NextResponse.json({ error: "Missing or invalid parameter: invitations array is required." }, { status: 400 });
    }

    const adminClient = getAdminClient();
    const resendApiKey = process.env.RESEND_API_KEY;
    const isMock = !resendApiKey || resendApiKey === 're_mock_key';
    const resend = isMock ? null : new Resend(resendApiKey);

    const generatedInvitations = [];
    const errors = [];

    // Fetch condo name to include in email
    const { data: condoData } = await adminClient
      .from('condos')
      .select('name')
      .eq('id', condoId)
      .single();
    const condoName = condoData?.name || "FiliCondo";

    for (const invite of invitations) {
      const { email, unitId, role = 'tenant' } = invite;

      if (!email || !unitId) {
        errors.push({ email, error: "Email and unitId are required." });
        continue;
      }

      // 1. Generate unique 6-digit uppercase alphanumeric code
      let inviteCode = '';
      let isCodeUnique = false;
      let attempts = 0;

      while (!isCodeUnique && attempts < 10) {
        attempts++;
        inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        
        // Verify code uniqueness in db
        const { data: existing } = await adminClient
          .from('unit_invitations')
          .select('id')
          .eq('invite_code', inviteCode)
          .maybeSingle();
        
        if (!existing) {
          isCodeUnique = true;
        }
      }

      if (!inviteCode) {
        errors.push({ email, error: "Failed to generate a unique invite code." });
        continue;
      }

      // 2. Fetch unit details for email body
      const { data: unitData } = await adminClient
        .from('units')
        .select('unit_number, building_no')
        .eq('id', unitId)
        .single();
      const unitNumber = unitData?.unit_number || 'N/A';
      const buildingNo = unitData?.building_no || '';
      const unitDisplay = buildingNo ? `${buildingNo} - Unit ${unitNumber}` : `Unit ${unitNumber}`;

      // 3. Set expiration (7 days from now)
      const expiredAt = new Date();
      expiredAt.setDate(expiredAt.getDate() + 7);

      // 4. Save invitation in DB
      const { data: insertedData, error: dbError } = await adminClient
        .from('unit_invitations')
        .insert([
          {
            condo_id: condoId,
            unit_id: unitId,
            email: email,
            invite_code: inviteCode,
            role: role,
            expired_at: expiredAt.toISOString()
          }
        ])
        .select()
        .single();

      if (dbError) {
        console.error(`DB Error inserting invitation for ${email}:`, dbError);
        errors.push({ email, error: dbError.message });
        continue;
      }

      // 5. Send email using Resend (or mock if no API key)
      let emailSent = false;
      let emailErrorMsg = null;

      try {
        if (!isMock && resend) {
          const { data: emailData, error: emailErr } = await resend.emails.send({
            from: `${condoName} <no-reply@filicondo.hey-driver.com>`, 
            to: [email],
            subject: `🏢 Welcome to ${condoName} - App Invitation Code`,
            html: `
              <div style="font-family: Arial, sans-serif; padding: 24px; background-color: #f8fafc; color: #1e293b; max-width: 600px; margin: 0 auto; border-radius: 16px; border: 1px solid #e2e8f0;">
                <h2 style="color: #0038a8; margin-bottom: 20px;">Welcome to ${condoName}!</h2>
                <p>Hello,</p>
                <p>You have been invited to register as a <strong>${role === 'owner' ? 'Home Owner' : 'Resident'}</strong> for <strong>${unitDisplay}</strong> in FiliCondo.</p>
                
                <div style="background-color: #ffffff; padding: 20px; border-radius: 12px; text-align: center; border: 1px solid #cbd5e1; margin: 24px 0;">
                  <span style="font-size: 14px; color: #64748b; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Your Invitation Code</span>
                  <div style="font-size: 32px; font-weight: 800; color: #0038a8; margin-top: 8px; letter-spacing: 2px;">${inviteCode}</div>
                  <span style="font-size: 11px; color: #94a3b8; display: block; margin-top: 10px;">This code is valid for 7 days and can only be used once.</span>
                </div>
                
                <p>Please follow these steps to get started:</p>
                <ol style="line-height: 1.6;">
                  <li>Download the <strong>FiliCondo</strong> mobile app.</li>
                  <li>On the login screen, tap <strong>"Sign Up with Invite Code"</strong>.</li>
                  <li>Enter your email, desired password, and the 6-digit code above.</li>
                  <li>Your account will be instantly verified and linked to your unit!</li>
                </ol>
                
                <p style="margin-top: 30px; font-size: 12px; color: #94a3b8;">If you did not request this invitation, please contact your building's Property Management Office (PMO).</p>
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-top: 24px;" />
                <p style="font-size: 11px; color: #94a3b8; text-align: center;">Powered by FiliCondo PropTech Systems</p>
              </div>
            `
          });

          if (emailErr) {
            emailErrorMsg = emailErr.message;
            console.error("Resend Email Sending Error:", emailErr);
          } else {
            emailSent = true;
            console.log(`✉️ Email successfully dispatched via Resend to ${email} (ID: ${emailData?.id})`);
          }
        } else {
          // Mock mode: log the code in server logs
          emailSent = true;
          console.log(`[MOCK EMAIL SANDBOX]`);
          console.log(`To: ${email}`);
          console.log(`Subject: Welcome to ${condoName} - App Invitation Code`);
          console.log(`Body: Hello! Your invite code for ${unitDisplay} is [ ${inviteCode} ]. Use it to sign up instantly.`);
        }
      } catch (e: any) {
        emailErrorMsg = e.message;
        console.error("Email service exception:", e);
      }

      generatedInvitations.push({
        id: insertedData.id,
        email,
        unitDisplay,
        inviteCode,
        emailSent,
        emailError: emailErrorMsg
      });
    }

    return NextResponse.json({
      success: true,
      sentCount: generatedInvitations.filter(i => i.emailSent).length,
      invitations: generatedInvitations,
      errors
    });
  } catch (error: any) {
    console.error("API POST Invite Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
