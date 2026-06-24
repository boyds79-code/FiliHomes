import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// 🎯 크리스님의 Supabase 프로젝트 주소와 anon key를 웹 프로젝트 .env에 맞게 바인딩하세요.
const SUPABASE_URL = "https://asqgyncyqnbmitkubjwq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjUzOTIsImV4cCI6MjA5NDg0MTM5Mn0.0D7aoNbgXnhGCpqVSA2B34ttfLliTzTibwr1-LzV2ac";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function AdminDashboard() {
  // 택배 등록 Form States (가드용)
  const [targetUserId, setTargetUserId] = useState('');
  const [carrierName, setCarrierName] = useState('Shopee Xpress');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [parcelSubmitting, setParcelSubmitting] = useState(false);

  // Job Order 관리 States (PMO용)
  const [tickets, setTickets] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);

  // 타임라인 로그용 States
  const [logs, setLogs] = useState<any[]>([]);
  const [viewingLogsId, setViewingLogsId] = useState<number | null>(null);

  useEffect(() => {
    fetchGlobalMaintenanceTickets();
  }, []);

  // 🎯 [PMO 기능] 입주민들이 접수한 전체 Job Order 목록을 RPC 함수를 통해 마스터 조회
  const fetchGlobalMaintenanceTickets = async () => {
    try {
      setLoadingTickets(true);
      // RLS를 우회하여 전 세대 수리 내역을 가져오는 RPC 격발
      const { data, error } = await supabase.rpc('get_all_maintenance_tickets');
      if (!error && data) {
        setTickets(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTickets(false);
    }
  };

  // 🎯 [PMO 기능] 특정 티켓의 상태 변경 로그(Timeline) 조회
  const fetchTicketLogs = async (jobOrderId: number) => {
    if (viewingLogsId === jobOrderId) {
      setViewingLogsId(null);
      setLogs([]);
      return;
    }
    setViewingLogsId(jobOrderId);
    const { data, error } = await supabase
      .from('job_order_logs')
      .select('*')
      .eq('job_order_id', jobOrderId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setLogs(data);
    }
  };

  // 🎯 [가드 기능] 바코드 스캔 대행 버튼터치 시 입주민 앱으로 실시간 parcels 인서트 격발
  const handleInsertParcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserId || !trackingNumber) {
      alert("Please enter Resident User UUID and Tracking Number!");
      return;
    }

    try {
      setParcelSubmitting(true);
      const { error } = await supabase
        .from('parcels')
        .insert([{
          user_id: targetUserId.trim(), // 🔒 입주민 앱과 다이렉트 매칭되는 진짜 UUID
          carrier_name: carrierName,
          tracking_number: trackingNumber.trim().toUpperCase(),
          image_url: imageUrl.trim() || null,
          status: 'ARRIVED'
        }]);

      if (!error) {
        alert("📦 Parcel Log Dispatched! Resident app will be updated instantly.");
        setTrackingNumber('');
        setImageUrl('');
      } else {
        alert("Database connection error: " + error.message);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setParcelSubmitting(false);
    }
  };

  // 🎯 [PMO 기능] 엔지니어 조율 진행 상황을 6단계 중 하나로 원격 업데이트 (입주민 앱 상태 실시간 연동)
  const handleUpdateTicketStatus = async (ticketId: number, nextStatus: string, timeOption?: string) => {
    try {
      const updatePayload: any = { status: nextStatus };
      
      // 스케줄 조율 단계일 때 PMO가 제안하는 방문 예정 시간 입력
      if (nextStatus === 'TIME_REQUESTED' && timeOption) {
        updatePayload.appointment_time = timeOption;
        updatePayload.status_scheduling_at = new Date().toISOString();
      } else if (nextStatus === 'REVIEWED') {
        updatePayload.status_reviewed_at = new Date().toISOString();
      } else if (nextStatus === 'ASSIGNED') {
        updatePayload.status_assigned_at = new Date().toISOString();
      } else if (nextStatus === 'CLOSED') {
        updatePayload.status_closed_at = new Date().toISOString();
        updatePayload.final_approval_by = 'PMO_ADMIN'; // 권한자 서명 기록
      }

      const { error } = await supabase
        .from('maintenance_requests')
        .update(updatePayload)
        .eq('id', ticketId);

      if (!error) {
        alert(`🎯 Ticket status changed to [${nextStatus}] successfully!`);
        fetchGlobalMaintenanceTickets(); // 대시보드 리스트 리프레시
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={webStyles.adminBody}>
      <header style={webStyles.adminHeader}>
        <h2>🏢 Solea Condominium PMO & Guard Integrated System</h2>
        <p>Live Server Database Syncing Dashboard Active</p>
      </header>

      <div style={webStyles.dashboardGrid}>
        {/* 왼쪽 섹션: 가드용 택배 입고 바코드 등록 시뮬레이터 */}
        <section style={webStyles.sectionCard}>
          <h3 style={{ color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>📦 Guard House: Parcel Scanning Station</h3>
          <form onSubmit={handleInsertParcel} style={{ marginTop: '15px' }}>
            <label style={webStyles.inputLabel}>Resident Account UUID</label>
            <input type="text" placeholder="Copy-paste user UUID from profiles table" value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} style={webStyles.webTextInput} />

            <label style={webStyles.inputLabel}>Courier Carrier</label>
            <select value={carrierName} onChange={(e) => setCarrierName(e.target.value)} style={webStyles.webTextInput}>
              <option value="Shopee Xpress">🧡 Shopee Xpress</option>
              <option value="Lazada Express">💙 Lazada Express</option>
              <option value="J&T Express"> J&T Express</option>
              <option value="DHL Courier"> DHL Express</option>
            </select>

            <label style={webStyles.inputLabel}>Barcode / Tracking Number</label>
            <input type="text" placeholder="e.g. SPX-PH-9923841" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} style={webStyles.webTextInput} />

            <label style={webStyles.inputLabel}>Guard Photo URL (Optional)</label>
            <input type="text" placeholder="https://..." value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={webStyles.webTextInput} />

            <button type="submit" disabled={parcelSubmitting} style={webStyles.webSubmitBtn}>
              {parcelSubmitting ? "Uploading logs..." : "⚡ Scan & Insert Parcel to Resident App"}
            </button>
          </form>
        </section>

        {/* 오른쪽 섹션: PMO 매니저용 하자보수(Job Order) 마스터 관제판 */}
        <section style={webStyles.sectionCard}>
          <h3 style={{ color: '#0f172a', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>🛠️ PMO Office: Engineering Job Order Board</h3>
          
          {loadingTickets ? (
            <p style={{ textAlign: 'center', marginTop: '30px' }}>Connecting to maintenance streams...</p>
          ) : tickets.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', marginTop: '30px' }}>No active repair tickets filed by residents.</p>
          ) : (
            <div style={{ maxHeight: '500px', overflowY: 'auto', marginTop: '15px' }}>
              {tickets.map((ticket) => (
                <div key={ticket.id} style={webStyles.ticketLogItem}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '15px', color: '#0f172a' }}>{ticket.title}</strong>
                    <span style={{ backgroundColor: '#ffedd5', color: '#col', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>
                      {ticket.status}
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', color: '#475569', margin: '8px 0' }}>{ticket.description}</p>
                  <small style={{ color: '#94a3b8' }}>Filed at: {new Date(ticket.created_at).toLocaleString()}</small>
                  
                  {/* 조작 제어 버튼 컨트롤러 랙 */}
                  <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleUpdateTicketStatus(ticket.id, 'REVIEWED')} style={webStyles.actionMinBtn}>Review</button>
                    <button onClick={() => handleUpdateTicketStatus(ticket.id, 'ASSIGNED')} style={webStyles.actionMinBtn}>Assign Crew</button>
                    <button onClick={() => handleUpdateTicketStatus(ticket.id, 'TIME_REQUESTED', 'Sat, June 6 at 2:00 PM')} style={{ ...webStyles.actionMinBtn, backgroundColor: '#0038a8', color: '#fff' }}>Propose Time (Sat 2PM)</button>
                    {ticket.status === 'WAITING_FOR_ADMIN' ? (
                      <button onClick={() => handleUpdateTicketStatus(ticket.id, 'CLOSED')} style={{ ...webStyles.actionMinBtn, backgroundColor: '#8b5cf6', color: '#fff' }}>Verify & Close</button>
                    ) : (
                      <button onClick={() => handleUpdateTicketStatus(ticket.id, 'COMPLETED')} style={{ ...webStyles.actionMinBtn, backgroundColor: '#16a34a', color: '#fff' }}>Finish Job</button>
                    )}
                    <button onClick={() => fetchTicketLogs(ticket.id)} style={{ ...webStyles.actionMinBtn, backgroundColor: '#f1f5f9', color: '#475569' }}>
                      {viewingLogsId === ticket.id ? 'Hide History' : 'View History'}
                    </button>
                  </div>

                  {/* 🎯 Timeline 로그 표시 영역 */}
                  {viewingLogsId === ticket.id && (
                    <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <h4 style={{ fontSize: '13px', color: '#0f172a', marginBottom: '10px', marginTop: 0 }}>⏳ Status History / Timeline</h4>
                      {logs.length === 0 ? (
                        <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>No history logs recorded yet.</p>
                      ) : (
                        <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '12px', color: '#334155' }}>
                          {logs.map((log: any) => (
                            <li key={log.id} style={{ marginBottom: '8px' }}>
                              <strong style={{ color: '#0f172a' }}>{log.new_status}</strong> 
                              <span style={{ color: '#94a3b8', marginLeft: '8px' }}>
                                {new Date(log.created_at).toLocaleString()}
                              </span>
                              <br />
                              <span style={{ color: '#64748b' }}>{log.note}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// React 전용 미려한 웹 CSS 인라인 인젝션 스타일시트
const webStyles = {
  adminBody: { fontFamily: 'Inter, system-ui, sans-serif', backgroundColor: '#f8fafc', minHeight: '100vh', padding: '30px' },
  adminHeader: { backgroundColor: '#0f172a', color: '#fff', padding: '20px 30px', borderRadius: '16px', marginBottom: '30px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
  dashboardGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px' },
  sectionCard: { backgroundColor: '#fff', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' },
  inputLabel: { display: 'block', fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '6px', marginTop: '12px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  webTextInput: { width: '100%', boxSizing: 'border-box' as const, padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', marginBottom: '10px', color: '#0f172a' },
  webSubmitBtn: { width: '100%', padding: '14px', border: 'none', borderRadius: '8px', backgroundColor: '#ea580c', color: '#fff', fontSize: '14px', fontWeight: '700', cursor: 'pointer', marginTop: '10px', transition: 'background-color 0.2s' },
  ticketLogItem: { border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '12px', backgroundColor: '#fafbfd' },
  actionMinBtn: { padding: '6px 12px', fontSize: '12px', fontWeight: '600', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', cursor: 'pointer', color: '#334155' }
};