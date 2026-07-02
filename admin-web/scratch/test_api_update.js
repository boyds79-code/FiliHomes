// test_api_update.js
const { createClient } = require('@supabase/supabase-js');
const dns = require('dns');

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

const supabaseUrl = 'https://asqgyncyqnbmitkubjwq.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ';

const adminClient = createClient(supabaseUrl, supabaseServiceKey);

async function sendResidentPushNotification(userId, title, bodyText) {
  try {
    console.log(`🔔 [PUSH NOTIFICATION]: Dispatching resident notification to ${userId}...`);
    const { data: profile } = await adminClient
      .from('profiles')
      .select('expo_push_token')
      .eq('id', userId)
      .single();
    
    if (profile && profile.expo_push_token) {
      console.log("🔔 expo_push_token found:", profile.expo_push_token);
    } else {
      console.log("🔔 Resident push token not found or null.");
    }
  } catch (error) {
    console.error("Error dispatching resident notification:", error);
  }
}

async function sendTechPushNotification(techUserId, title, bodyText) {
  try {
    console.log(`🔔 [PUSH NOTIFICATION]: Dispatching tech notification to ${techUserId}...`);
    const { data: profile } = await adminClient
      .from('profiles')
      .select('expo_push_token')
      .eq('id', techUserId)
      .single();
    
    if (profile && profile.expo_push_token) {
      console.log("🔔 expo_push_token found:", profile.expo_push_token);
    } else {
      console.log("🔔 Technician push token not found.");
    }
  } catch (error) {
    console.error("Error dispatching technician notification:", error);
  }
}

async function broadcastTechPushNotification(title, bodyText) {
  try {
    console.log("🔔 [PUSH NOTIFICATION]: Broadcasting tech notifications...");
    const { data: staffMembers } = await adminClient
      .from('staff_profiles')
      .select('id')
      .eq('role', 'TECHNICIAN');
    
    if (staffMembers && staffMembers.length > 0) {
      const staffIds = staffMembers.map(s => s.id);
      const { data: staffProfiles } = await adminClient
        .from('profiles')
        .select('expo_push_token')
        .in('id', staffIds)
        .not('expo_push_token', 'is', null);
      
      if (staffProfiles && staffProfiles.length > 0) {
        const pushTokens = staffProfiles.map(p => p.expo_push_token).filter(Boolean);
        console.log("🔔 Found push tokens for technicians:", pushTokens);
      }
    }
  } catch (error) {
    console.error("Error broadcasting technician notification:", error);
  }
}

async function mockRouteHandler(id, updates) {
  try {
    console.log("🏁 Starting mock API handler with ID:", id, "updates:", updates);
    if (!id || !updates) {
      throw new Error("Missing params");
    }

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

    if (updates.status === 'CANCELED') {
      const { data: job, error: jobError } = await adminClient
        .from('job_orders')
        .select('title, assigned_technician_id')
        .eq('id', id)
        .single();
      
      if (jobError) throw jobError;

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

    console.log("⚡ Executing update database call...");
    const { error: updateError } = await adminClient.from('job_orders').update(updates).eq('id', id);
    if (updateError) throw updateError;

    console.log("🎉 Mock API handler completed successfully!");
  } catch (error) {
    console.error("🔥 CRITICAL ERROR IN API HANDLER:");
    console.error(error.stack || error);
  }
}

// Target job order ID for test (fetched from database earlier)
const targetId = 'c2e3d259-be4f-4c69-b0f3-b0acd9380c3d';
mockRouteHandler(targetId, { status: 'CANCELED' });
