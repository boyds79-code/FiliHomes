import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, TextInput, Modal } from 'react-native';
import { supabase } from '../lib/supabase';

const formatDate = (dateString?: string) => {
  if (!dateString) return 'Not available';
  const date = new Date(dateString);
  // 날짜가 유효한지 확인
  if (isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleString();
};

export default function VisitorHistory({ unitId }: { unitId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [filterDate, setFilterDate] = useState(new Date());
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear().toString());
const [filterMonth, setFilterMonth] = useState((new Date().getMonth() + 1).toString());

  useEffect(() => {
    if (unitId) fetchLogs(page, false);

    // Real-time subscription: sync logs on any DB modifications (insert, update, delete)
    const channel = supabase.channel(`visitor-history-${unitId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'visitor_passes',
        filter: `unit_id=eq.${unitId}` 
      }, () => {
        fetchLogs(page, false);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [unitId, page]);

  const fetchLogs = async (pageIndex: number = 0, reset: boolean = false) => {
    if (!unitId) return;
    
    // 1. Active 상태 항목 조회 (PENDING 상태 및 APPROVED 상태인 사전 등록 항목)
    const { data: activeData } = await supabase
      .from('visitor_passes')
      .select('*')
      .eq('unit_id', unitId)
      .in('status', ['PENDING', 'APPROVED'])
      .order('created_at', { ascending: false });

    // 2. 방문 기록 (History) 항목 조회 (날짜 필터 및 페이지네이션 적용)
    const from = pageIndex * 10;
    const to = from + 10 - 1;

    const startDate = `${filterYear}-${filterMonth.padStart(2, '0')}-01`;
    const endYear = parseInt(filterMonth) === 12 ? parseInt(filterYear) + 1 : filterYear;
    const endMonth = parseInt(filterMonth) === 12 ? '01' : (parseInt(filterMonth) + 1).toString().padStart(2, '0');
    const endDate = `${endYear}-${endMonth}-01`;

    let query = supabase
      .from('visitor_passes')
      .select('*', { count: 'exact' })
      .eq('unit_id', unitId)
      .neq('status', 'PENDING') // History는 PENDING을 제외하고 조회
      .gte('created_at', startDate)
      .lt('created_at', endDate) // 해당 월의 데이터만 가져옴
      .range(from, to)
      .order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error("❌ error:", error);
    } else {
      if (data && data.length < 10) setHasMore(false);
      else setHasMore(true);

      // Always replace logs to only show the 10 history items of the current page
      setLogs([...(activeData || []), ...(data || [])]);
    }
  };

  const handleUpdateStatus = async (passId: string | number, newStatus: 'APPROVED' | 'REJECTED' | 'CANCELLED') => {
    // 🎯 문자열로 들어오는 id를 숫자로 강제 변환
    const numericId = typeof passId === 'string' ? parseInt(passId, 10) : passId;
    const entryTime = new Date().toISOString();

    // Database check constraint does not support 'CANCELLED', so map it to 'REJECTED'
    const dbStatus = newStatus === 'CANCELLED' ? 'REJECTED' : newStatus;

    const { data, error } = await supabase
      .from('visitor_passes')
      .update({ 
        status: dbStatus, 
        entry_time: entryTime 
      })
      .eq('id', numericId) // 🎯 이제 정확하게 숫자 ID로 매칭됩니다.
      .select(); // 업데이트된 행을 반환받아 확인
      
    if (error) {
      console.error("❌ 업데이트 실패:", error);
      Alert.alert("Error", error.message);
    } else if (!data || data.length === 0) {
      console.warn("⚠️ 업데이트는 성공했으나 매칭되는 행이 없습니다. ID 확인:", numericId);
    } else {
      console.log("✅ DB 업데이트 성공:", data);

      // If approved and it is a manual guard request (no qr_code_value), insert into visitor_logs
      if (newStatus === 'APPROVED' && !data[0].qr_code_value) {
        const { error: logError } = await supabase
          .from('visitor_logs')
          .insert([{
            pass_id: numericId,
            gate_location: 'Main Gate',
            access_time: entryTime
          }]);
        if (logError) {
          console.error("❌ Failed to create visitor log:", logError);
        } else {
          console.log("✅ Visitor log created successfully for manual approval.");
        }
      }

      setLogs(prev => prev.map(log => 
        log.id === numericId ? { ...log, status: newStatus, entry_time: entryTime } : log
      ));
      Alert.alert("Success", `Pass has been ${newStatus}.`);
      setSelectedLog(null);
    }
  };

  // Deduplicate logs by ID to avoid duplicates between activeData and data queries
  const uniqueLogs = Array.from(new Map(logs.map(item => [item.id, item])).values());
  const activeList = uniqueLogs.filter(l => l.status === 'PENDING' || (l.status === 'APPROVED' && !!l.qr_code_value));
  const historyList = uniqueLogs.filter(l => l.status !== 'PENDING' && !(l.status === 'APPROVED' && !!l.qr_code_value));

  return (
    <ScrollView style={styles.container}>
      {/* 1. 방문자 현황 (Visitor Status) 섹션 */}
      <Text style={styles.header}>Visitor Status ({activeList.length})</Text>
      {activeList.length === 0 && <Text style={styles.emptyText}>No active visitors.</Text>}
      {activeList.map(item => {
        const isPreRegistered = !!item.qr_code_value;
        const isPending = item.status === 'PENDING';
        const isApproved = item.status === 'APPROVED';

        return (
          <TouchableOpacity key={item.id} style={styles.card} onPress={() => setSelectedLog(item)} activeOpacity={0.7}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.visitor_name}</Text>
              <Text style={styles.purpose}>{item.purpose || 'Visitor'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Text style={styles.time}>
                  {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>

            <View style={styles.actionRow}>
              {/* 입주민이 생성했거나 승인된 방문객은 Not Arrived (상태 표시용 비활성 버튼) / Cancel 버튼 표시 */}
              {isApproved || (isPending && isPreRegistered) ? (
                <>
                  <View style={[styles.btn, { backgroundColor: '#e2e8f0' }]}>
                    <Text style={[styles.btnText, { color: '#64748b' }]}>Not Arrived</Text>
                  </View>
                  <TouchableOpacity 
                    style={[styles.btn, { backgroundColor: '#ef4444', marginLeft: 10 }]} 
                    onPress={() => {
                      setSelectedLog(null);
                      Alert.alert(
                        "Cancel Pass ⚠️",
                        `Are you sure you want to cancel this visitor pass for ${item.visitor_name}? Once cancelled, it can no longer be used.`,
                        [
                          { text: "No", style: "cancel" },
                          { text: "Yes, Cancel", style: "destructive", onPress: () => handleUpdateStatus(item.id, 'CANCELLED') }
                        ]
                      );
                    }}
                  >
                    <Text style={styles.btnText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              ) : (
                /* 가드가 수동 입차 요청을 한 건은 Approve / Reject 버튼 표시 */
                <>
                  <TouchableOpacity 
                    style={[styles.btn, { backgroundColor: '#10b981' }]} 
                    onPress={() => { setSelectedLog(null); handleUpdateStatus(item.id, 'APPROVED'); }}
                  >
                    <Text style={styles.btnText}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.btn, { backgroundColor: '#ef4444', marginLeft: 10 }]} 
                    onPress={() => { setSelectedLog(null); handleUpdateStatus(item.id, 'REJECTED'); }}
                  >
                    <Text style={styles.btnText}>Reject</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </TouchableOpacity>
        );
      })}

      {/* 필터링 UI (Visitor Log 바로 위로 이동) */}
      <View style={[styles.filterContainer, { marginTop: 25 }]}>
        <TextInput 
          style={styles.filterInput} 
          placeholder="Year" 
          value={filterYear} 
          onChangeText={setFilterYear} 
        />
        <TextInput 
          style={styles.filterInput} 
          placeholder="Month" 
          value={filterMonth} 
          onChangeText={setFilterMonth} 
        />
        <TouchableOpacity style={styles.filterBtn} onPress={() => { setPage(0); fetchLogs(0, true); }}>
          <Text style={{color: '#fff'}}>Filter</Text>
        </TouchableOpacity>
      </View>

      {/* 2. 이전 기록 (Visitor Log) 섹션 */}
      <Text style={[styles.header, { marginTop: 15 }]}>Visitor Log</Text>
      {historyList.length === 0 && <Text style={styles.emptyText}>No history.</Text>}
      {historyList.map(item => (
        <TouchableOpacity key={item.id} style={[styles.card, { opacity: 0.8 }]} onPress={() => setSelectedLog(item)} activeOpacity={0.7}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.name}>{item.visitor_name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
              <Text style={[styles.status, { marginTop: 0 }]}>
                {item.status === 'REJECTED' && item.qr_code_value ? 'CANCELLED' : item.status}
              </Text>
              <Text style={{ color: '#94a3b8', fontSize: 12, marginHorizontal: 6 }}>•</Text>
              <Text style={{ color: '#64748b', fontSize: 12 }}>
                {item.entry_time ? formatDate(item.entry_time) : (item.visit_date || formatDate(item.created_at))}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={styles.detailBtn}>
              <Text style={styles.detailBtnText}>Detail</Text>
            </View>
          </View>
        </TouchableOpacity>
      ))}
      
      {/* Pagination Controls */}
      <View style={styles.paginationRow}>
        <TouchableOpacity 
          style={[styles.pageBtn, page === 0 && styles.disabledPageBtn]} 
          onPress={() => {
            if (page > 0) {
              const next = page - 1;
              setPage(next);
              fetchLogs(next);
            }
          }}
          disabled={page === 0}
        >
          <Text style={[styles.pageBtnText, page === 0 && styles.disabledPageBtnText]}>◀ Prev</Text>
        </TouchableOpacity>

        <Text style={styles.pageNumberText}>Page {page + 1}</Text>

        <TouchableOpacity 
          style={[styles.pageBtn, !hasMore && styles.disabledPageBtn]} 
          onPress={() => {
            if (hasMore) {
              const next = page + 1;
              setPage(next);
              fetchLogs(next);
            }
          }}
          disabled={!hasMore}
        >
          <Text style={[styles.pageBtnText, !hasMore && styles.disabledPageBtnText]}>Next ▶</Text>
        </TouchableOpacity>
      </View>
      <View style={{ height: 40 }} />

      {/* 3. 상세 정보 Modal */}
      <Modal visible={!!selectedLog} transparent animationType="fade" onRequestClose={() => setSelectedLog(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Visitor Details</Text>
            <View style={styles.modalContent}>
              <Text style={styles.modalLabel}>Name: <Text style={styles.modalValue}>{selectedLog?.visitor_name}</Text></Text>
              <Text style={styles.modalLabel}>Entry Type: <Text style={styles.modalValue}>{selectedLog?.qr_code_value ? 'QR Code (Resident Initiated)' : 'Manual Registration'}</Text></Text>
              <Text style={styles.modalLabel}>Purpose: <Text style={styles.modalValue}>{selectedLog?.purpose || 'N/A'}</Text></Text>
              
              {/* 🎯 수정된 부분: formatDate 함수 사용 및 안전한 기본값 처리 */}
              <Text style={styles.modalLabel}>Schedule: <Text style={styles.modalValue}>{selectedLog?.visit_date || 'N/A'}</Text></Text>
              {selectedLog?.status === 'USED' && (
                <Text style={styles.modalLabel}>Entry Time: <Text style={styles.modalValue}>{formatDate(selectedLog?.entry_time)}</Text></Text>
              )}
              
              <Text style={styles.modalLabel}>
                Status: <Text style={styles.modalValue}>
                  {selectedLog?.status === 'REJECTED' && selectedLog?.qr_code_value ? 'CANCELLED' : selectedLog?.status}
                  {selectedLog?.entry_time ? ` (${formatDate(selectedLog.entry_time)})` : ''}
                </Text>
              </Text>
              {selectedLog?.visit_type === 'VEHICLE' && (
                <Text style={styles.modalLabel}>Vehicle: <Text style={styles.modalValue}>{selectedLog?.plate_number} ({selectedLog?.vehicle_model || 'N/A'})</Text></Text>
              )}
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedLog(null)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 15 },
  header: { fontSize: 16, fontWeight: 'bold', color: '#334155', marginBottom: 10 },
  card: { padding: 16, backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontWeight: '700', fontSize: 15, color: '#1e293b' },
  purpose: { fontSize: 13, color: '#64748b', marginTop: 2 },
  time: { fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: '500' },
  status: { color: '#64748b', fontSize: 12, fontWeight: '600', marginTop: 2 },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  btn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  paginationRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20, marginBottom: 10 },
  pageBtn: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#0038a8', borderRadius: 8, marginHorizontal: 15 },
  pageBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  disabledPageBtn: { backgroundColor: '#cbd5e1' },
  disabledPageBtnText: { color: '#94a3b8' },
  pageNumberText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  emptyText: { color: '#94a3b8', textAlign: 'center', marginVertical: 10 },
  filterContainer: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  filterInput: { flex: 1, borderWidth: 1, borderColor: '#e2e8f0', padding: 8, borderRadius: 8 },
  filterBtn: { backgroundColor: '#0038a8', padding: 10, borderRadius: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalView: { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 16, textAlign: 'center' },
  modalContent: { marginBottom: 20 },
  modalLabel: { fontSize: 13, color: '#64748b', marginBottom: 10, fontWeight: '500' },
  modalValue: { color: '#0f172a', fontWeight: '700' },
  closeBtn: { backgroundColor: '#f1f5f9', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  closeBtnText: { color: '#475569', fontWeight: '700', fontSize: 14 },
  detailBtn: { backgroundColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  detailBtnText: { fontSize: 12, fontWeight: '700', color: '#475569' }
});