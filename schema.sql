-- Core Database Schema for PhiliHomes

CREATE TABLE IF NOT EXISTS public.visitor_passes (
    id TEXT PRIMARY KEY,
    user_id UUID,
    visitor_name VARCHAR(100) NOT NULL,
    visit_type VARCHAR(20) NOT NULL,
    plate_number VARCHAR(20),
    vehicle_type VARCHAR(50),
    purpose TEXT NOT NULL,
    visit_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    qr_code_value TEXT,
    unit_id UUID,
    time_in TIMESTAMP WITH TIME ZONE DEFAULT now(),
    time_out TIMESTAMP WITH TIME ZONE,
    vehicle_model TEXT,
    entry_time TIMESTAMP WITH TIME ZONE,
    exit_time TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.gate_access_logs (
    id TEXT PRIMARY KEY,
    plate_number VARCHAR(50) NOT NULL,
    method VARCHAR(50) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    operator_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.parcel_delivery_report (
    id TEXT PRIMARY KEY,
    unit_no TEXT,
    tracking_number VARCHAR(100),
    carrier_name VARCHAR(150),
    guard_registered TEXT,
    guard_released TEXT,
    collected_at TIMESTAMP WITH TIME ZONE,
    signature_url TEXT,
    status VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS public.maintenance_requests (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT,
    status VARCHAR(20) DEFAULT 'REQUESTED' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    appointment_time VARCHAR(100),
    reject_reason TEXT,
    status_filed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    status_reviewed_at TIMESTAMP WITH TIME ZONE,
    status_assigned_at TIMESTAMP WITH TIME ZONE,
    status_scheduling_at TIMESTAMP WITH TIME ZONE,
    status_booked_at TIMESTAMP WITH TIME ZONE,
    operator_id UUID,
    assigned_engineer_id UUID
);

CREATE TABLE IF NOT EXISTS public.receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_id TEXT NOT NULL,
    payment_method TEXT,
    receipt_image_url TEXT NOT NULL,
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    extracted_ref_no TEXT,
    user_id UUID,
    status TEXT DEFAULT 'ISSUED'
);

CREATE TABLE IF NOT EXISTS public.staff_payroll_records (
    id TEXT PRIMARY KEY,
    staff_id UUID,
    staff_name VARCHAR(100) NOT NULL,
    base_salary_piso NUMERIC NOT NULL,
    overtime_hours NUMERIC DEFAULT 0,
    deductions_piso NUMERIC DEFAULT 0,
    net_pay_piso NUMERIC NOT NULL,
    payout_status VARCHAR(30) DEFAULT 'PENDING',
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL,
    reported_id UUID NOT NULL,
    reason_category TEXT NOT NULL,
    description TEXT,
    content_origin TEXT,
    status TEXT DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.parcel_deliveries (
    id TEXT PRIMARY KEY,
    unit_id UUID NOT NULL,
    user_id UUID NOT NULL,
    tracking_number VARCHAR(100),
    courier_name VARCHAR(100) NOT NULL,
    storage_location VARCHAR(100) DEFAULT 'Guard House' NOT NULL,
    status VARCHAR(30) DEFAULT 'ARRIVED' NOT NULL,
    arrived_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    picked_up_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.instant_visitor_requests (
    id TEXT PRIMARY KEY,
    unit_number VARCHAR(50) NOT NULL,
    visitor_name VARCHAR(150) NOT NULL,
    purpose TEXT,
    status VARCHAR(30) DEFAULT 'PENDING' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.bazaar_messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    sender_id UUID NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.gate_manual_entries (
    id TEXT PRIMARY KEY,
    visitor_type VARCHAR(50) NOT NULL,
    target_unit VARCHAR(10) NOT NULL,
    visitor_name VARCHAR(100) NOT NULL,
    status VARCHAR(30) DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    processed_by VARCHAR(100),
    admin_comment TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicles (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL,
    plate_number VARCHAR(20) NOT NULL,
    vehicle_type VARCHAR(50) NOT NULL,
    owner_type VARCHAR(20) DEFAULT 'RESIDENT' NOT NULL,
    purpose TEXT,
    visit_date DATE,
    status VARCHAR(20) DEFAULT 'APPROVED' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    billing_status VARCHAR(20) DEFAULT 'Paid',
    months_unpaid INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.intercom_chats (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    target_building VARCHAR(50) DEFAULT 'Tower A',
    read_by_guards TEXT[],
    is_sos_active BOOLEAN DEFAULT false,
    break_expires_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    condo_id UUID,
    status TEXT DEFAULT 'active',
    role TEXT,
    unit_id UUID,
    expo_push_token TEXT
);

CREATE TABLE IF NOT EXISTS public.staff_parcels (
    id TEXT PRIMARY KEY,
    target_building VARCHAR(50) DEFAULT 'Tower A' NOT NULL,
    target_unit VARCHAR(10) NOT NULL,
    tracking_no VARCHAR(100) NOT NULL,
    status VARCHAR(30) DEFAULT 'HOLDING',
    registered_by VARCHAR(100) NOT NULL,
    released_by VARCHAR(100),
    signature_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    released_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.intercom_messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    sender_type VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    operator_name VARCHAR(100),
    resident_signature_url TEXT
);

CREATE TABLE IF NOT EXISTS public.amenity_bookings (
    id TEXT PRIMARY KEY,
    unit_id UUID NOT NULL,
    user_id UUID NOT NULL,
    amenity_id VARCHAR(50) NOT NULL,
    booking_date DATE NOT NULL,
    slot_time VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'CONFIRMED' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.guest_passes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID,
    unit_id UUID,
    guest_name VARCHAR(255) NOT NULL,
    guest_type VARCHAR(50) DEFAULT 'CASUAL' NOT NULL,
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    pass_code VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'ACTIVE' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bazaar_chats (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    buyer_id UUID NOT NULL,
    seller_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.amenities (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    max_capacity INTEGER NOT NULL,
    icon VARCHAR(20) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notices (
    id TEXT PRIMARY KEY,
    condo_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'GENERAL' NOT NULL,
    is_pinned BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.condo_settings (
    condo_id UUID PRIMARY KEY,
    parking_mode TEXT DEFAULT 'MANUAL',
    visitor_parking_policy TEXT DEFAULT 'BILLING_ENABLED',
    approval_policy TEXT DEFAULT 'REQUIRED'
);

CREATE TABLE IF NOT EXISTS public.units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID NOT NULL,
    unit_number VARCHAR(50) NOT NULL,
    floor VARCHAR(10),
    status VARCHAR(50) DEFAULT 'vacant',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    block_phase_no TEXT DEFAULT 'Tower A',
    building_no TEXT DEFAULT 'Tower A',
    user_id UUID
);

CREATE TABLE IF NOT EXISTS public.condos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    address TEXT,
    logo_url TEXT,
    theme_color VARCHAR(7) DEFAULT '#0056b3',
    features JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    total_units INTEGER DEFAULT 0,
    buildings TEXT[],
    base_parking_fee NUMERIC DEFAULT 0,
    visitor_parking_fee_per_hour NUMERIC DEFAULT 0,
    penalty_rate NUMERIC DEFAULT 0.02,
    business_name TEXT,
    tin TEXT,
    atp_number TEXT,
    atp_date TEXT,
    is_vat_registered BOOLEAN DEFAULT false,
    signature_url TEXT
);

CREATE TABLE IF NOT EXISTS public.bazaar_items (
    id TEXT PRIMARY KEY,
    seller_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    price INTEGER NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'AVAILABLE' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.guard_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    guard_id UUID,
    action TEXT,
    details TEXT
);

CREATE TABLE IF NOT EXISTS public.billings (
    id TEXT PRIMARY KEY,
    unit_id UUID NOT NULL,
    billing_month VARCHAR(7) NOT NULL,
    due_date DATE NOT NULL,
    condo_dues NUMERIC DEFAULT 0 NOT NULL,
    electricity NUMERIC DEFAULT 0 NOT NULL,
    water NUMERIC DEFAULT 0 NOT NULL,
    status VARCHAR(20) DEFAULT 'UNPAID' NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    legacy_reference_id TEXT,
    billing_period_label VARCHAR(50),
    condo_id UUID,
    receipt_url TEXT,
    electricity_usage NUMERIC DEFAULT 0,
    water_usage NUMERIC DEFAULT 0,
    parking_fee NUMERIC DEFAULT 0,
    job_order_fee NUMERIC DEFAULT 0,
    job_order_details TEXT,
    payment_method VARCHAR(50),
    previous_balance NUMERIC DEFAULT 0,
    penalty_amount NUMERIC DEFAULT 0,
    total_due NUMERIC DEFAULT 0,
    description TEXT
);

CREATE TABLE IF NOT EXISTS public.delivery_mappings (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    tracking_id TEXT NOT NULL,
    unit_number TEXT NOT NULL,
    recipient_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id UUID,
    unit_id UUID,
    category VARCHAR(50) DEFAULT 'GENERAL' NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT,
    status VARCHAR(50) DEFAULT 'REQUESTED' NOT NULL,
    technician_name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    material_cost NUMERIC DEFAULT 0,
    labor_cost NUMERIC DEFAULT 0,
    linked_billing_id UUID,
    maintenance_status VARCHAR(30) DEFAULT 'PENDING',
    estimated_cost NUMERIC DEFAULT 0,
    approval_status TEXT DEFAULT 'PENDING',
    preferred_date TIMESTAMP WITH TIME ZONE,
    preferred_time_slot VARCHAR(50),
    title TEXT,
    user_id UUID,
    assigned_technician_id UUID,
    status_assigned_at TIMESTAMP WITH TIME ZONE,
    proposed_visit_time TIMESTAMP WITH TIME ZONE,
    resident_approved BOOLEAN DEFAULT false,
    cost_approved BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.bazaar_safety_logs (
    id TEXT PRIMARY KEY,
    reporter_id UUID NOT NULL,
    target_nickname VARCHAR(15) NOT NULL,
    action_type VARCHAR(20) NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.staff_attendance (
    id TEXT PRIMARY KEY,
    staff_id UUID NOT NULL,
    clock_in_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    clock_out_at TIMESTAMP WITH TIME ZONE,
    work_date DATE DEFAULT CURRENT_DATE NOT NULL,
    in_latitude NUMERIC,
    in_longitude NUMERIC,
    total_minutes INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    status VARCHAR(30) DEFAULT 'NORMAL',
    penalty_triggered BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.staff_profiles (
    id UUID PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    assigned_building VARCHAR(50) DEFAULT 'Tower A',
    avatar_url TEXT,
    condo_name VARCHAR(255),
    email VARCHAR(255),
    payroll_settings JSONB DEFAULT '{"base_rate_type": "hourly", "base_rate": 80, "additions": []}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.bazaar_profiles (
    id UUID PRIMARY KEY,
    unit_number VARCHAR(20) NOT NULL,
    nickname VARCHAR(50) NOT NULL,
    manner_score NUMERIC DEFAULT 5 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    unit_id UUID NOT NULL,
    condo_id UUID NOT NULL,
    role VARCHAR(50) NOT NULL,
    is_payer BOOLEAN DEFAULT true,
    lease_start_date DATE,
    lease_end_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_order_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_order_id UUID,
    changed_by UUID,
    old_status TEXT,
    new_status TEXT,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.visitor_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pass_id TEXT,
    access_time TIMESTAMP WITH TIME ZONE DEFAULT now(),
    gate_location TEXT,
    verifier_id UUID,
    exit_time TIMESTAMP WITH TIME ZONE,
    parking_fee NUMERIC DEFAULT 0,
    is_paid BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.intercom_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condo_id TEXT NOT NULL,
    gate_name TEXT NOT NULL,
    unit_no TEXT NOT NULL,
    visitor_purpose TEXT NOT NULL,
    status TEXT DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'INFO',
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    unit_id UUID,
    data JSONB,
    expo_push_token TEXT
);

CREATE TABLE IF NOT EXISTS public.parcels (
    id TEXT PRIMARY KEY,
    user_id UUID,
    status VARCHAR(30) DEFAULT 'ARRIVED' NOT NULL,
    carrier_name VARCHAR(150) NOT NULL,
    tracking_number VARCHAR(100),
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    collected_at TIMESTAMP WITH TIME ZONE,
    operator_id UUID,
    parcel_count INTEGER DEFAULT 1,
    recipient_name TEXT,
    registered_by TEXT,
    unit_no TEXT,
    secure_pass_code TEXT,
    is_pending BOOLEAN DEFAULT true,
    is_overdue BOOLEAN DEFAULT false,
    released_by TEXT,
    is_notified BOOLEAN DEFAULT false
);

-- Foreign Key Constraints
ALTER TABLE public.staff_payroll_records ADD CONSTRAINT fk_staff_payroll_records_staff_id FOREIGN KEY (staff_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.bazaar_messages ADD CONSTRAINT fk_bazaar_messages_chat_id FOREIGN KEY (chat_id) REFERENCES public.bazaar_chats(id) ON DELETE CASCADE;
ALTER TABLE public.intercom_messages ADD CONSTRAINT fk_intercom_messages_chat_id FOREIGN KEY (chat_id) REFERENCES public.intercom_chats(id) ON DELETE CASCADE;
ALTER TABLE public.amenity_bookings ADD CONSTRAINT fk_amenity_bookings_amenity_id FOREIGN KEY (amenity_id) REFERENCES public.amenities(id) ON DELETE CASCADE;
ALTER TABLE public.guest_passes ADD CONSTRAINT fk_guest_passes_condo_id FOREIGN KEY (condo_id) REFERENCES public.condos(id) ON DELETE CASCADE;
ALTER TABLE public.guest_passes ADD CONSTRAINT fk_guest_passes_unit_id FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;
ALTER TABLE public.bazaar_chats ADD CONSTRAINT fk_bazaar_chats_item_id FOREIGN KEY (item_id) REFERENCES public.bazaar_items(id) ON DELETE CASCADE;
ALTER TABLE public.bazaar_chats ADD CONSTRAINT fk_bazaar_chats_buyer_id FOREIGN KEY (buyer_id) REFERENCES public.bazaar_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.bazaar_chats ADD CONSTRAINT fk_bazaar_chats_seller_id FOREIGN KEY (seller_id) REFERENCES public.bazaar_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.units ADD CONSTRAINT fk_units_condo_id FOREIGN KEY (condo_id) REFERENCES public.condos(id) ON DELETE CASCADE;
ALTER TABLE public.bazaar_items ADD CONSTRAINT fk_bazaar_items_seller_id FOREIGN KEY (seller_id) REFERENCES public.bazaar_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.guard_activity_logs ADD CONSTRAINT fk_guard_activity_logs_guard_id FOREIGN KEY (guard_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.job_orders ADD CONSTRAINT fk_job_orders_condo_id FOREIGN KEY (condo_id) REFERENCES public.condos(id) ON DELETE CASCADE;
ALTER TABLE public.job_orders ADD CONSTRAINT fk_job_orders_unit_id FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;
ALTER TABLE public.job_orders ADD CONSTRAINT fk_job_orders_user_id FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.job_orders ADD CONSTRAINT fk_job_orders_assigned_technician_id FOREIGN KEY (assigned_technician_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.staff_attendance ADD CONSTRAINT fk_staff_attendance_staff_id FOREIGN KEY (staff_id) REFERENCES public.staff_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.user_units ADD CONSTRAINT fk_user_units_user_id FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.user_units ADD CONSTRAINT fk_user_units_unit_id FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;
ALTER TABLE public.user_units ADD CONSTRAINT fk_user_units_condo_id FOREIGN KEY (condo_id) REFERENCES public.condos(id) ON DELETE CASCADE;
ALTER TABLE public.job_order_logs ADD CONSTRAINT fk_job_order_logs_job_order_id FOREIGN KEY (job_order_id) REFERENCES public.job_orders(id) ON DELETE CASCADE;
ALTER TABLE public.visitor_logs ADD CONSTRAINT fk_visitor_logs_pass_id FOREIGN KEY (pass_id) REFERENCES public.visitor_passes(id) ON DELETE CASCADE;
