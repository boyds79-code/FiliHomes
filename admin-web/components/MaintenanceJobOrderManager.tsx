"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabaseClient';
import { RepairTicket } from '../types/jobOrder';

interface Technician {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
}

export default function MaintenanceJobOrderManager({ condoId, initialView }: { condoId: string; initialView?: 'NEW_REQUESTS' | 'ACTIVE_JOBS' | 'TECHNICIANS' }) {
  const [jobOrders, setJobOrders] = useState<RepairTicket[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'NEW_REQUESTS' | 'ACTIVE_JOBS' | 'TECHNICIANS'>(initialView || 'NEW_REQUESTS');

  useEffect(() => {
    if (initialView) {
      setActiveTab(initialView);
    }
  }, [initialView]);
  const [selectedTechs, setSelectedTechs] = useState<{ [orderId: string]: string }>({});
  const [uploadingTechId, setUploadingTechId] = useState<string | null>(null);

  // 부모로부터 받는 condoId가 객체라면, 값이 바뀔 때만 참조가 바뀌도록 메모이제이션 합니다.
  const targetCondoId = React.useMemo(() => condoId?.toString().replace(/['"]/g, ''), [condoId]);

  useEffect(() => {
    if (!targetCondoId) return; // ID가 없으면 실행 안 함

    let isSubscribed = true;
    let channel: any;

    const setup = async () => {
      await fetchActiveJobOrders();
      await fetchTechnicians();

      if (!isSubscribed) return;

      // 🚨 주의: removeAllChannels()는 다른 모듈(인터폰 등)의 실시간 연결도 끊어버리므로 주석 처리
      // supabase.removeAllChannels();

      channel = supabase.channel(`admin_channel_${targetCondoId}`)
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'job_orders',
            filter: `condo_id=eq.${targetCondoId}` 
        }, () => {
            // 🎯 무조건 fetch하는 대신, 데이터 로딩 중이 아닐 때만 fetch하여 무한 루프 차단
            if (isSubscribed && !isProcessing) {
                fetchActiveJobOrders();
            }
        })
        // 🚨 관리자용 취소 푸시 알림 수신 (Realtime)
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'notifications',
          filter: 'type=eq.ADMIN' 
        }, (payload) => {
          window.alert(`🚨 [PMO Alert]\n${payload.new.title}\n\n${payload.new.message}`);
        })
        .subscribe();
    };

    setup();

    return () => {
      isSubscribed = false;
      if (channel) supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetCondoId]); // 의존성 배열 유지

  const fetchActiveJobOrders = async () => {
  try {
    // 1. 만약 condoId가 "solea-residences" 같은 문자열이라면,
    // 실제 데이터베이스에 저장된 해당 콘도의 UUID로 변환하거나, 
    // 혹은 DB 구조가 문자열 condo_id를 허용하는지 확인해야 합니다.
    
    // 가장 확실한 방법: UUID 변환 매핑
    const CONDO_MAP: { [key: string]: string } = {
      'solea-residences': 'c1111111-1111-1111-1111-111111111111', // 🎯 정확한 DB UUID로 매핑 통일
      // 다른 콘도들도 추가
    };

    const actualCondoId = CONDO_MAP[targetCondoId.toLowerCase()] || targetCondoId;

    console.log("조회 시도 중인 Condo ID:", actualCondoId); // 🎯 이 로그를 크롬 개발자 도구에서 확인하세요!

    // 🎯 supabase를 supabaseAdmin으로 변경해야 에러가 사라집니다.
    const response = await fetch(`/api/maintenance/list?condoId=${actualCondoId}`);
    if (!response.ok) throw new Error("Failed to fetch job orders list");
    const data = await response.json();

      console.log("Data fetch successful:", data);

      if (data) {
        setJobOrders(data.map((item: any) => ({
          id: item.id,
          unit_no: item.units?.block_phase_no ? `${item.units.block_phase_no} - ${item.units.unit_number}` : (item.units?.unit_number || 'N/A'),
          title: item.title || 'Untitled',
          description: item.description || '',
          image_url: item.image_url || null,
          status: item.status,
          appointment_time: item.appointment_time || null,
          reject_reason: item.reject_reason || null,
          created_at: item.created_at,
          filed_at: item.status_filed_at || null,
          reviewed_at: item.status_reviewed_at || null,
          assigned_at: item.status_assigned_at || null,
          scheduling_at: item.status_scheduling_at || null,
          booked_at: item.status_booked_at || null,
          issue_category: item.category || 'Repair',
          maintenance_status: item.status,
          material_cost: item.material_cost || 0,
          labor_cost: item.labor_cost || 0,
          estimated_cost: item.estimated_cost || 0, 
          assigned_tech: item.assigned_tech, // ◀️ 추가: 기술자 객체 저장
          approval_status: item.approval_status || 'PENDING',
          resident_approval: item.resident_approval || false
        } as RepairTicket)));
      }
    } catch (error) {
      console.error("Fetch failed:", error); 
    }
  };

  const fetchTechnicians = async () => {
    try {
      const response = await fetch('/api/maintenance/techs');
      if (!response.ok) throw new Error("Failed to fetch technicians list");
      const data = await response.json();
      
      if (data) {
        setTechnicians(data.map((p: any) => ({
          id: p.id,
          full_name: p.full_name || 'Unnamed Technician',
          email: '', // 이메일이 staff_profiles에 없다면 생략 가능
          avatar_url: p.avatar_url
        })));
      }
    } catch (error) {
      console.error("Fetch technicians failed:", error);
    }
  };

  // 🎯 기술자 사진 업로드 핸들러
  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>, techId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingTechId(techId);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `tech_${techId}_${Date.now()}.${fileExt}`;
      
      // 1. Storage에 파일 업로드
      const { error: uploadError } = await supabase.storage
        .from('staff-avatars') // ⚠️ Supabase Storage에 'staff-avatars' 버킷을 퍼블릭으로 만들어야 합니다.
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // 2. 파일의 Public URL 가져오기
      const { data: publicUrlData } = supabase.storage.from('staff-avatars').getPublicUrl(fileName);

      // 3. DB의 avatar_url 컬럼 업데이트
      const response = await fetch('/api/staff-profiles/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: techId,
          updates: { avatar_url: publicUrlData.publicUrl }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update avatar in DB');
      }

      alert("Technician photo successfully updated!");
      fetchTechnicians(); // 새로고침 없이 즉시 목록 갱신
    } catch (error: any) {
      alert("Upload failed: " + error.message);
    } finally {
      setUploadingTechId(null);
    }
  };

  const handleAssignTech = async (orderId: string) => {
    const techId = selectedTechs[orderId];
    if (!techId) {
      alert("Please select a technician first.");
      return;
    }

    setIsProcessing(true);
    try {
      // 🎯 여기서 assigned_technician_id 컬럼을 업데이트합니다.
      const response = await fetch('/api/maintenance/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: orderId,
          updates: { 
            assigned_technician_id: techId, 
            status: 'ASSIGNED',
            status_assigned_at: new Date().toISOString()
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update job order');
      }
      
      alert("Technician assigned successfully!");
      fetchActiveJobOrders();
    } catch (error) {
      console.error("Error assigning technician:", error);
      alert("Failed to assign technician.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompleteJob = async (order: RepairTicket) => {
    setIsProcessing(true);
    try {
      const response = await fetch('/api/maintenance/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: order.id,
          updates: { status: 'CLOSED' }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to complete job');
      }
      
      alert("Job verified and closed! Billing has been generated.");
      fetchActiveJobOrders();
    } catch (error) {
      console.error("Error completing job:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const newRequests = jobOrders.filter(o => o.maintenance_status === 'REQUESTED');
  const activeJobs = jobOrders.filter(o => o.maintenance_status !== 'REQUESTED');

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>PMO Job Order Control Center</h2>
      <p style={styles.subtitle}>Assign new requests to field technicians and finalize completed jobs.</p>

      {/* Tabs */}
      {!initialView && (
        <div style={styles.tabContainer}>
          <button 
            style={activeTab === 'NEW_REQUESTS' ? styles.activeTabBtn : styles.tabBtn} 
            onClick={() => setActiveTab('NEW_REQUESTS')}
          >
            🚨 New Requests ({newRequests.length})
          </button>
          <button 
            style={activeTab === 'ACTIVE_JOBS' ? styles.activeTabBtn : styles.tabBtn} 
            onClick={() => setActiveTab('ACTIVE_JOBS')}
          >
            🛠️ Active / Invoice Settlement ({activeJobs.length})
          </button>
          <button 
            style={activeTab === 'TECHNICIANS' ? styles.activeTabBtn : styles.tabBtn} 
            onClick={() => setActiveTab('TECHNICIANS')}
          >
            👨‍🔧 Manage Technicians ({technicians.length})
          </button>
        </div>
      )}

      {activeTab === 'NEW_REQUESTS' && (
        <div style={styles.table}>
          {newRequests.length === 0 ? (
            <div style={styles.emptyState}><p>No pending job order requests.</p></div>
          ) : (
            <>
              <div style={styles.tableHeader}>
                <span style={styles.cellUnit}>Unit</span>
                <span style={{ ...styles.cellDesc, flex: '2 1 250px' }}>Description</span>
                <span style={{ flex: '1 1 150px' }}>Assign To</span>
                <span style={styles.cellAction}>Action</span>
              </div>
              {newRequests.map((order) => (
                <div key={order.id} style={styles.tableRow}>
                  <div style={styles.cellUnit}>{order.unit_no}</div>
                  <div style={{ ...styles.cellDesc, flex: '2 1 250px' }}>
                    <span style={styles.categoryBadge}>{order.issue_category}</span> {order.description}
                  </div>
                  <div style={{ flex: '1 1 150px', paddingRight: '12px' }}>
                    <select 
                      style={styles.selectInput}
                      value={selectedTechs[order.id] || ''}
                      onChange={(e) => setSelectedTechs(prev => ({ ...prev, [order.id]: e.target.value }))}
                    >
                      <option value="">-- Select Technician --</option>
                      {technicians.map(tech => (
                        <option key={tech.id} value={tech.id}>{tech.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.cellAction}>
                    <button 
                      style={{ ...styles.button, backgroundColor: '#0284c7' }} 
                      disabled={isProcessing} 
                      onClick={() => handleAssignTech(order.id)}
                    >
                      Dispatch
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {activeTab === 'ACTIVE_JOBS' && (
        <div style={styles.table}>
          {activeJobs.length === 0 ? (
            <div style={styles.emptyState}><p>No active maintenance jobs.</p></div>
          ) : (
            <>
              <div style={styles.tableHeader}>
                <span style={styles.cellUnit}>Unit</span>
                <span style={styles.cellDesc}>Description</span>
                <span style={styles.cellInput}>Material (₱)</span>
                <span style={styles.cellInput}>Labor (₱)</span>
                <span style={styles.cellAction}>Action</span>
              </div>
              {activeJobs.map((order) => (
                <div key={order.id} style={styles.tableRow}>
                  <div style={styles.cellUnit}>{order.unit_no}</div>
                  <div style={styles.cellDesc}>
                    <div>{order.description}</div>
                    {order.assigned_tech && (
                      <div style={{ fontSize: '11px', color: '#6366f1', marginTop: '4px', fontWeight: 'bold' }}>
                        👤 Assigned: {order.assigned_tech.full_name}
                      </div>
                    )}
                  </div>
                  <div style={styles.cellInput}>
                    <span style={styles.readOnlyText}>{order.material_cost}</span>
                  </div>
                  <div style={styles.cellInput}>
                    <span style={styles.readOnlyText}>{order.labor_cost}</span>
                  </div>
                  <div style={styles.cellAction}>
                    {order.maintenance_status === 'ESTIMATE_SUBMITTED' ? (
                      <span style={{ color: '#d97706', fontWeight: 'bold', fontSize: '11px', textAlign: 'center' }}>⏳ Field Tech sent to Resident</span>
                    ) : (order.maintenance_status === 'WAITING_FOR_ADMIN' || order.maintenance_status === 'COMPLETED') ? (
                      <button style={{ ...styles.button, backgroundColor: '#10b981' }} disabled={isProcessing} onClick={() => handleCompleteJob(order)}>Verify & Close</button>
                    ) : order.maintenance_status === 'IN_PROGRESS' || order.maintenance_status === 'VISITING' ? (
                       <span style={{ color: '#2563eb', fontWeight: 'bold', fontSize: '11px', textAlign: 'center' }}>🛠️ Tech Field Working</span>
                    ) : order.maintenance_status === 'TIME_NEGOTIATING' ? (
                       <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '11px', textAlign: 'center' }}>🔄 Reschedule Req</span>
                    ) : order.maintenance_status === 'ASSIGNED' ? (
                       <span style={{ color: '#6366f1', fontWeight: 'bold', fontSize: '11px', textAlign: 'center' }}>📝 Assigned to Tech</span>
                    ) : order.maintenance_status === 'CHECKED_BY_TECH' ? (
                       <span style={{ color: '#0ea5e9', fontWeight: 'bold', fontSize: '11px', textAlign: 'center' }}>👨‍🔧 Tech Preparing</span>
                    ) : order.maintenance_status === 'VISIT_PROPOSED' ? (
                       <span style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: '11px', textAlign: 'center' }}>⏳ Waiting Time Approval</span>
                    ) : (
                      <span style={{ color: '#6b7280', fontSize: '11px', textAlign: 'center' }}>{order.maintenance_status}</span>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {activeTab === 'TECHNICIANS' && (
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <span style={{ flex: '0 0 80px' }}>Photo</span>
            <span style={{ flex: '1 1 200px' }}>Technician Name</span>
            <span style={styles.cellAction}>Action</span>
          </div>
          {technicians.map((tech) => (
            <div key={tech.id} style={styles.tableRow}>
              <div style={{ flex: '0 0 80px' }}>
                {tech.avatar_url ? (
                  <img src={tech.avatar_url} alt="avatar" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #cbd5e1' }} />
                ) : (
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>👤</div>
                )}
              </div>
              <div style={{ flex: '1 1 200px', fontWeight: 'bold', color: '#1e293b' }}>{tech.full_name}</div>
              <div style={{ ...styles.cellAction, justifyContent: 'flex-start' }}>
                <input 
                  type="file" 
                  id={`upload-${tech.id}`} 
                  style={{ display: 'none' }} 
                  accept="image/*"
                  onChange={(e) => handleUploadAvatar(e, tech.id)}
                />
                <label htmlFor={`upload-${tech.id}`} style={{ ...styles.button, backgroundColor: '#8b5cf6', display: 'inline-block', textAlign: 'center', cursor: 'pointer', padding: '6px 12px' }}>
                  {uploadingTechId === tech.id ? 'Uploading...' : '📸 Upload Photo'}
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e5e7eb', marginBottom: '24px' },
  title: { fontSize: '18px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' },
  subtitle: { fontSize: '14px', color: '#6b7280', marginBottom: '20px' },
  tabContainer: { display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' },
  tabBtn: { padding: '8px 16px', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#475569', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  activeTabBtn: { padding: '8px 16px', backgroundColor: '#0f172a', border: '1px solid #0f172a', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer' },
  table: { width: '100%', display: 'flex', flexDirection: 'column' },
  tableHeader: { display: 'flex', paddingBottom: '12px', borderBottom: '2px solid #f3f4f6', fontWeight: '600', color: '#374151', fontSize: '13px' },
  tableRow: { display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f3f4f6', gap: '12px' },
  cellUnit: { flex: '0 0 60px', fontWeight: 'bold', fontSize: '14px' },
  cellDesc: { flex: '2 1 200px', fontSize: '13px', color: '#4b5563', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' },
  cellInput: { flex: '1 1 90px', minWidth: '70px' },
  cellAction: { flex: '0 0 110px', display: 'flex', justifyContent: 'center' },
  selectInput: { width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', fontSize: '12px', color: '#0f172a' },
  button: { color: '#ffffff', padding: '8px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', width: '100%' },
  emptyState: { padding: '40px', textAlign: 'center', color: '#6b7280', fontSize: '14px' },
  readOnlyText: { color: '#1e293b', fontWeight: '600' },
  categoryBadge: { backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }
};