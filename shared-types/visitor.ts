export type VisitorType = 'WALK_IN' | 'VEHICLE' | 'DELIVERY';

export type VisitStatus = 'PENDING' | 'APPROVED' | 'ENTERED' | 'EXITED' | 'CANCELLED';

export interface VisitorPass {
  id: number;
  user_id: string; // 호수 주인(입주자) UUID
  visitor_name: string;
  visit_type: VisitorType;
  purpose: string | null;
  plate_number: string | null;     // 차량 방문 시 필수
  vehicle_type: string | null;     // 차량 방문 시 필수
  visit_date: string;              // YYYY-MM-DD
  status: VisitStatus;
  qr_code_value: string | null;    // QR 검증용 해시
  created_at: string;
}

export interface VisitorLog {
  id: string;
  pass_id: number;
  access_time: string;             // 입차 시간
  exit_time: string | null;        // 출차 시간
  gate_location: string;
  parking_fee: number;             // 자동 계산된 요금
  is_paid: boolean;
  verified_id: string | null;      // 승인한 가드 UUID
}

export interface Vehicle {
  id: number;
  user_id: string;
  plate_number: string;
  vehicle_type: string;
  owner_type: 'RESIDENT' | 'VISITOR';
  billing_status: 'Paid' | 'Unpaid';
  months_unpaid: number;
  created_at: string;
}

export interface BillingEntry {
  id: number;
  unit_id: string;
  amount: number;
  description: string;
  status: 'PENDING' | 'PAID';
  due_date: string;
  created_at: string;
}