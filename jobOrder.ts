import { createClient } from '@supabase/supabase-js';

// This should use the service role key for admin-level operations
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * 관리소가 특정 티켓을 배정하고 수리 비용을 확정하는 어드민 비즈니스 로직
 */
export async function assignAndUpdateTicket(jobOrderId: string, technicianId: string, cost: number, newStatus: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from('job_orders')
      .update({
        assigned_technician_id: technicianId,
        material_cost: cost,
        status: newStatus // e.g., 'ASSIGNED' -> 'IN_PROGRESS' -> 'COMPLETED'
      })
      .eq('id', jobOrderId)
      .select();

    if (error) throw error;

    if (newStatus === 'COMPLETED' && cost > 0) {
      console.log(`💵 Ticket ${jobOrderId} closed. Material cost ₱${cost} queued for next billing statement.`);
    }

    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}