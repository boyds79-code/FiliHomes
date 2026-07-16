export type JobStatus = 
  | 'REQUESTED'
  | 'ASSIGNED'
  | 'ACKNOWLEDGED'
  | 'CHECKED_BY_TECH'
  | 'VISIT_PROPOSED'
  | 'VISIT_CONFIRMED'
  | 'TIME_NEGOTIATING'
  | 'VISITING'
  | 'ESTIMATE_SUBMITTED'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_ADMIN'
  | 'CLOSED'
  | 'COMPLETED';

export interface AssignedTechInfo {
  full_name: string;
  avatar_url?: string | null; // 아바타 URL은 없을 수도 있으므로 optional 또는 null 허용
}

export interface RepairTicket {
  id: string;
  condo_id?: string;
  unit_id?: string;
  user_id?: string;
  unit_no?: string; // Appended by JOIN
  title: string;
  description: string;
  category?: string;
  issue_category?: string;
  image_url: string | null;
  before_photo_url?: string | null;
  after_photo_url?: string | null;
  status: JobStatus;
  maintenance_status?: JobStatus; // Alternative property used in some places
  
  appointment_time: string | null;
  proposed_visit_time?: string | null;
  time_change_request?: string | null;
  
  reject_reason: string | null;
  
  material_cost?: number;
  labor_cost?: number;
  estimated_cost?: number;
  approval_status?: string;
  resident_approval?: boolean;
  
  assigned_technician_id?: string | null;

  created_at: string;
  filed_at: string | null;
  reviewed_at: string | null;
  assigned_at: string | null;
  scheduling_at: string | null;
  booked_at: string | null;
  in_progress_at?: string | null;
  finished_at?: string | null;

  // 🎯 수정: assigned_tech 속성 정의 (단일 객체 또는 null 가능성 고려)
  assigned_tech?: AssignedTechInfo | null;
}
