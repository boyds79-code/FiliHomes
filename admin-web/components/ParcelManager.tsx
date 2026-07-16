"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabaseClient';

interface Parcel {
  id: string;
  unit_no: string;
  block_phase_no: string; 
  carrier_name: string;
  tracking_number: string;
  recipient_name: string;
  status: 'ARRIVED' | 'PICKED_UP';
  received_at: string;
  secure_pass_code: string;
  is_overdue: boolean;
  registered_by: string;
}

interface AuditLog {
  id: string;
  timestamp: string;
  unit_no: string;
  block_phase_no: string;
  event_type: 'INTAKE' | 'WARNING_SENT' | 'HANDOVER_RELEASE';
  carrier_name: string;
  operator: string;
  details: string;
  tracking_number?: string;
  registered_by?: string;
  released_by?: string;
  collected_at?: string;
  signature_url?: string;
}

export default function ParcelManager({ condoId, initialView }: { condoId: string; initialView?: 'DORMANT' | 'HOLDING' | 'BLACKBOX' }) {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);

  // 🎯 완료된 택배 내역을 관리하는 새로운 State 및 탭 상태 추가
  const [completedParcels, setCompletedParcels] = useState<any[]>([]);
  const [viewTab, setViewTab] = useState<'ACTIVE' | 'COMPLETED'>('ACTIVE');

  // 🎯 상세 정보 및 서명을 담을 팝업 상태 추가
  const [activeLog, setActiveLog] = useState<AuditLog | null>(null);

  // 🎯 Modal control for zooming into a specific Tower's compressed parcel directory
  const [selectedTower, setSelectedTower] = useState<string | null>(null);

  // 📅 Date Filtering State for Ledger Audit Trails
  const [filterLogDate, setFilterLogDate] = useState<string>(() => {
    const d = new Date();
    const YYYY = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    return `${YYYY}-${MM}-${DD}`;
  });
  
  // 🔢 Pagination Controls: limits view to 20 rows per grid sheet
  const [currentPage, setCurrentPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 20;

  // Active database audit logs state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  // Local transient warning logs state
  const [localWarningLogs, setLocalWarningLogs] = useState<AuditLog[]>([]);

  // Format Date object or string to local timezone YYYY-MM-DD HH:mm format
  const formatLocalTimestamp = (dateInput: string | Date) => {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const YYYY = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    const HH = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${YYYY}-${MM}-${DD} ${HH}:${mm}`;
  };

  useEffect(() => {
    fetchActiveParcels();
    fetchCompletedParcels(); // 초기 로드 시 완료된 목록도 함께 가져옴
    fetchAuditLogsFromDB(); // Real-time fetch audit logs from DB

    const channel = supabase
      .channel('realtime-parcels')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parcels' }, () => {
        fetchActiveParcels();
        fetchCompletedParcels(); // 실시간 변경 시 완료 목록도 업데이트
        fetchAuditLogsFromDB(); // 실시간 변경 시 감사 대장도 업데이트
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchActiveParcels = async () => {
    setLoading(true);
    try {
      // Query the physical 'parcels' table directly
      const { data: parcelData, error: parcelError } = await supabase
        .from('parcels') 
        .select('*')
        .eq('status', 'ARRIVED')
        .order('created_at', { ascending: false });

      if (parcelError) throw parcelError;

      // Map house/lot numbers to retrieve their building names from the 'units' table
      const uniqueUnitNos = Array.from(new Set((parcelData || []).map(p => p.unit_no).filter(Boolean)));
      const unitMapping: Record<string, string> = {};

      if (uniqueUnitNos.length > 0) {
        const { data: unitData, error: unitError } = await supabase
          .from('units')
          .select('unit_number, block_phase_no')
          .in('unit_number', uniqueUnitNos);
        
        if (!unitError && unitData) {
          unitData.forEach(u => {
            if (u.unit_number) {
              unitMapping[u.unit_number] = u.block_phase_no || 'Tower A';
            }
          });
        }
      }

      // Merge results and cast id to string to match interface typing
      const mergedData = (parcelData || []).map(p => ({
        ...p,
        id: String(p.id),
        block_phase_no: unitMapping[p.unit_no] || 'Tower A'
      }));

      setParcels(mergedData);
    } catch (err) { 
      console.error("Fetch Error:", err); 
    } finally { 
      setLoading(false); 
    }
  };

  const fetchCompletedParcels = async () => {
    const { data, error } = await supabase
      .from('parcel_delivery_report') // 방금 만든 뷰 조회
      .select('*')
      .order('collected_at', { ascending: false });
      
    if (error) console.error(error);
    else setCompletedParcels(data || []); // 🎯 완료된 데이터 전용 State에 저장!
  };

  const fetchAuditLogsFromDB = async () => {
    try {
      const { data: allParcels, error } = await supabase
        .from('parcels')
        .select('*');

      if (error) throw error;

      const uniqueUnitNos = Array.from(new Set((allParcels || []).map(p => p.unit_no).filter(Boolean)));
      const unitMapping: Record<string, string> = {};

      if (uniqueUnitNos.length > 0) {
        const { data: unitData } = await supabase
          .from('units')
          .select('unit_number, block_phase_no')
          .in('unit_number', uniqueUnitNos);
        
        if (unitData) {
          unitData.forEach(u => {
            if (u.unit_number) {
              unitMapping[u.unit_number] = u.block_phase_no || 'Tower A';
            }
          });
        }
      }

      const logs: AuditLog[] = [];

      allParcels?.forEach(p => {
        const building = unitMapping[p.unit_no] || 'Tower A';

        // 1. INTAKE log entry
        logs.push({
          id: `LOG-INTAKE-${p.id}`,
          timestamp: p.created_at ? formatLocalTimestamp(p.created_at) : '2026-06-19 12:00',
          unit_no: p.unit_no || 'Unknown',
          block_phase_no: building,
          event_type: 'INTAKE',
          carrier_name: p.carrier_name || 'Lobby Drop-off',
          operator: p.registered_by || 'Guard',
          details: `Package barcode (${p.tracking_number || 'N/A'}) ingested and resident alert instantly pushed at ${p.created_at ? formatLocalTimestamp(p.created_at) : 'N/A'}. Registered by ${p.registered_by || 'Guard'}.`,
          tracking_number: p.tracking_number || 'N/A',
          registered_by: p.registered_by || 'Guard',
          released_by: p.released_by || undefined,
          collected_at: p.collected_at || undefined
        });

        // 2. HANDOVER_RELEASE log entry
        if (p.collected_at || p.status === 'COLLECTED') {
          const releaseTime = p.collected_at || p.created_at;
          logs.push({
            id: `LOG-RELEASE-${p.id}`,
            timestamp: formatLocalTimestamp(releaseTime),
            unit_no: p.unit_no || 'Unknown',
            block_phase_no: building,
            event_type: 'HANDOVER_RELEASE',
            carrier_name: p.carrier_name || 'Lobby Drop-off',
            operator: p.released_by || 'Guard',
            details: `Handover completed cleanly via QR Scan authentication. Released to Resident by ${p.released_by || 'Guard'}.`,
            tracking_number: p.tracking_number || 'N/A',
            registered_by: p.registered_by || 'Guard',
            released_by: p.released_by || 'Guard',
            collected_at: p.collected_at || undefined
          });
        }
      });

      // Sort logs in reverse chronological order (newest first)
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setAuditLogs(logs);
    } catch (err) {
      console.error("Error fetching audit logs:", err);
    }
  };

  const handleSendOverdueWarning = (unitNo: string, carrier: string, tower: string) => {
    const timestamp = formatLocalTimestamp(new Date());
    const newWarningLog: AuditLog = {
      id: `LOG-GEN-${Date.now()}`,
      timestamp,
      unit_no: unitNo,
      block_phase_no: tower,
      event_type: "WARNING_SENT",
      carrier_name: carrier,
      operator: "PMO Desk Controller",
      details: `🚨 UNCLAIMED CARGO WARNING TRANSMITTED: High-priority system reminder broadcasted to Unit ${unitNo} mobile client terminal to clear lobby airspace.`
    };
    setLocalWarningLogs(prev => [newWarningLog, ...prev]);
    alert(`📢 CONDO PMO RADAR TRIGGERED!\n\nHigh-intensity compliance warning pushed to Unit ${unitNo} resident terminal.`);
  };

  const handleBuzzSentryGuard = (unitNo: string) => {
    alert(`📱 GUARD WALKIE-TALKIE SIGNAL INTERCEPTED\n\nSent directive to Lobby Guard Mariano regarding Unit ${unitNo}.`);
  };

  const handleManualBatchRelease = async (unitNo: string, parcelIds: string[], tower: string) => {
    const confirmRelease = window.confirm(`⚙️ ADMINISTRATIVE OVERRIDE\n\nAre you sure you want to force-clear and release ALL (${parcelIds.length}) parcels currently held for Unit ${unitNo}?`);
    if (!confirmRelease) return;

    try {
      const { error } = await supabase
        .from('parcels')
        .update({ 
          status: 'COLLECTED', 
          released_by: 'PMO Supervisor', 
          collected_at: new Date().toISOString() 
        })
        .in('id', parcelIds);
      if (error) throw error;
      
      alert(`Success ✅\nAll (${parcelIds.length}) parcels for Unit ${unitNo} released in database.`);
    } catch (e) {
      console.error(e);
      alert("Failed to release parcels in database.");
    }
    setExpandedUnit(null);
  };

  // 🎯 MACRO SCALE CALCULATIONS: Counts active holding parcels per specific spatial target sector
  const countTowerParcels = (towerName: string) => {
    return parcels.filter(p => p.block_phase_no === towerName).length;
  };

  // 🎯 MICRO SCALE GROUPING: Group single rows into unit aggregates inside the active chosen popup modal frame
  const getGroupedVaultParcelsForTower = (towerName: string) => {
    const filtered = parcels.filter(p => p.block_phase_no === towerName && (p.unit_no.includes(searchQuery) || p.recipient_name.toLowerCase().includes(searchQuery.toLowerCase())));
    const map: { [key: string]: Parcel[] } = {};
    
    filtered.forEach(p => {
      if (!map[p.unit_no]) map[p.unit_no] = [];
      map[p.unit_no].push(p);
    });

    return Object.keys(map).map(unitKey => {
      const unitList = map[unitKey];
      return {
        unit_no: unitKey,
        parcels: unitList,
        count: unitList.length,
        recipient_name: unitList[0]?.recipient_name || "Resident",
        is_overdue: unitList.some(p => p.is_overdue)
      };
    });
  };

  const megaTowersList = ["Tower A", "Tower B", "Tower C", "Tower D", "Tower E", "Tower F"];
  const globalOverdueParcels = parcels.filter(p => p.is_overdue);

  const allLogs = [...auditLogs, ...localWarningLogs];
  allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filteredAuditLogs = filterLogDate 
    ? allLogs.filter(log => log.timestamp.startsWith(filterLogDate))
    : allLogs;
  const totalPages = Math.ceil(filteredAuditLogs.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedLogs = filteredAuditLogs.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (initialView) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'system-ui, sans-serif', width: '100%' }}>
        {initialView === 'DORMANT' && (
          <div style={{ ...styles.leftSentryPanel, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontSize: '20px' }}>🚨</span>
              <h3 style={{ ...styles.panelTitle, color: '#991b1b' }}>Unclaimed Cargo Sentry (Global Overdue)</h3>
            </div>
            <p style={styles.panelSubtitle}>Tracking space-clogging uncollected deliveries breaching 24h threshold across all structures.</p>
            
            <div style={styles.overdueStack}>
              {globalOverdueParcels.length === 0 ? (
                <div style={styles.allClearBanner}>✓ All parcels claimed within the 24-hour grace bracket. Clearing all complex parcel inventories.</div>
              ) : (
                globalOverdueParcels.map(p => (
                  <div key={p.id} style={styles.overdueCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={styles.overdueUnitText}>{p.block_phase_no} — Unit {p.unit_no}</span>
                        <div style={styles.overdueDetailText}>Receiver: <strong>{p.recipient_name}</strong></div>
                        <div style={styles.overdueDetailText}>Carrier: 🚚 {p.carrier_name} ({p.tracking_number})</div>
                        <div style={styles.overdueTimeAlert}>Unclaimed Since: {p.received_at}</div>
                      </div>
                      <span style={styles.pulseWarningBadge}>⚠️ Retain Overdue</span>
                    </div>
                    <div style={styles.overdueActionRow}>
                      <button onClick={() => handleSendOverdueWarning(p.unit_no, p.carrier_name, p.block_phase_no)} style={styles.warningPushBtn}>📢 Send Warning Push</button>
                      <button onClick={() => handleBuzzSentryGuard(p.unit_no)} style={styles.buzzGuardBtn}>📱 Buzz Guard</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {initialView === 'HOLDING' && (
          <div style={{ ...styles.rightVaultPanel, width: '100%' }}>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button 
                onClick={() => setViewTab('ACTIVE')} 
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', backgroundColor: viewTab === 'ACTIVE' ? '#0f172a' : '#fff', color: viewTab === 'ACTIVE' ? '#fff' : '#475569' }}
              >
                📥 Holdings
              </button>
              <button 
                onClick={() => setViewTab('COMPLETED')} 
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', backgroundColor: viewTab === 'COMPLETED' ? '#0f172a' : '#fff', color: viewTab === 'COMPLETED' ? '#fff' : '#475569' }}
              >
                ✅ Completed Reports
              </button>
            </div>

            {viewTab === 'ACTIVE' ? (
              <>
                <div style={styles.vaultHeaderRow}>
                  <div>
                    <h3 style={styles.panelTitle}>📥 Complex Holdings Vault Directory</h3>
                    <p style={styles.panelSubtitle}>Showing real-time uncollected parcels counts per architectural tower footprints. Click a sector block to launch directory popup console.</p>
                  </div>
                </div>
                
                <div style={styles.towerVerticalStackColumn}>
                  {megaTowersList.map((towerName) => {
                    const currentTowerCount = countTowerParcels(towerName);
                    return (
                      <div key={towerName} onClick={() => setSelectedTower(towerName)} style={styles.towerListItemRowButton}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <div style={styles.towerIconCircleBadge}>🏢</div>
                          <div>
                            <div style={styles.towerListMainTitle}>{towerName} Gatehouse Locker</div>
                            <div style={styles.towerListSubText}>Click to analyze secure tracking vouchers & rollups</div>
                          </div>
                        </div>
                        <span style={{ ...styles.towerVolumeIndicatorTag, backgroundColor: currentTowerCount > 0 ? '#eff6ff' : '#f8fafc', color: currentTowerCount > 0 ? '#2563eb' : '#94a3b8' }}>
                          {currentTowerCount} Packages Stored ➔
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div style={styles.vaultHeaderRow}>
                  <div>
                    <h3 style={styles.panelTitle}>✅ Completed & Released Parcels</h3>
                    <p style={styles.panelSubtitle}>History of parcels successfully handed over to residents or proxies.</p>
                  </div>
                </div>
                
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto', paddingRight: '8px' }}>
                  {completedParcels.length === 0 ? (
                    <div style={styles.emptyStateContainer}>No completed parcels found.</div>
                  ) : (
                    completedParcels.map((p, idx) => (
                      <div key={p.id || idx} style={{ padding: '14px', border: '1px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#f8fafc' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <strong style={{ color: '#0f172a', fontSize: '14px' }}>Unit {p.unit_no}</strong>
                          <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: '900', backgroundColor: '#dcfce7', padding: '3px 8px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>COLLECTED</span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#334155', marginBottom: '2px' }}><strong>Tracking:</strong> {p.tracking_number}</div>
                        <div style={{ fontSize: '13px', color: '#334155' }}><strong>Released By:</strong> {p.released_by || 'Guard'}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px', fontStyle: 'italic' }}>Collected At: {new Date(p.collected_at || p.created_at).toLocaleString()}</div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {initialView === 'BLACKBOX' && (
          <div style={{ ...styles.auditLogContainer, width: '100%' }}>
            <div style={styles.auditToolbarRowHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📜</span>
                <h3 style={styles.panelTitle}>Immutable Property Parcel Blackbox Audit Trail Ledger</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Filter Audit Date:</span>
                <input type="date" value={filterLogDate} onChange={(e) => { setFilterLogDate(e.target.value); setCurrentPage(1); }} style={styles.datePickerField} />
              </div>
            </div>

            <div style={styles.auditTimelineStack}>
              {paginatedLogs.length === 0 ? (
                <div style={styles.emptyStateContainer}>No cryptographic ledger traces mapped on date: {filterLogDate}.</div>
              ) : (
                paginatedLogs.map((log) => {
                  const isWarning = log.event_type === 'WARNING_SENT';
                  const isRelease = log.event_type === 'HANDOVER_RELEASE';

                  return (
                    <div 
                      key={log.id} 
                      onClick={() => setActiveLog(log)}
                      style={{ ...styles.auditLogItem, cursor: 'pointer' }}
                    >
                      <div style={styles.auditLogHeaderRow}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ 
                            ...styles.eventTag, 
                            backgroundColor: isWarning ? '#fff7ed' : (isRelease ? '#e8fdf0' : '#f1f5f9'),
                            color: isWarning ? '#c2410c' : (isRelease ? '#15803d' : '#475569'),
                            borderColor: isWarning ? '#ffedd5' : (isRelease ? '#d1f7db' : '#e2e8f0')
                          }}>
                            {log.event_type}
                          </span>
                          <strong style={{ fontSize: '13px', color: '#1e293b' }}>Unit {log.unit_no}</strong>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8' }}>{log.timestamp}</span>
                      </div>
                      <p style={styles.auditLogDetailsText}>{log.details}</p>
                    </div>
                  );
                })
              )}
            </div>

            {filteredAuditLogs.length > 0 && (
              <div style={styles.paginationFooterBarRow}>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>
                  Showing {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredAuditLogs.length)} of {filteredAuditLogs.length} Immutable History Logs
                </span>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} style={styles.pageArrowBtn}>[Prev]</button>
                  {Array.from({ length: totalPages }, (_, idx) => (
                    <button key={idx + 1} onClick={() => setCurrentPage(idx + 1)} style={{ ...styles.pageNumberBtn, backgroundColor: currentPage === idx + 1 ? '#0f172a' : '#ffffff', color: currentPage === idx + 1 ? '#ffffff' : '#0f172a', borderColor: currentPage === idx + 1 ? '#0f172a' : '#cbd5e1' }}>{idx + 1}</button>
                  ))}
                  <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} style={styles.pageArrowBtn}>[Next]</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Selected Tower Consolidated Modal */}
        {selectedTower && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalFullDirectoryContainer}>
              <div style={styles.modalHeaderBox}>
                <div>
                  <span style={styles.modalMetaLabelLine}>Lobby Vault Intelligence Console</span>
                  <h3 style={styles.modalMainTitleText}>📋 Consolidated Inventory Directory — {selectedTower}</h3>
                </div>
                <button style={styles.modalDismissXBtn} onClick={() => { setSelectedTower(null); setExpandedUnit(null); setSearchQuery(''); }}>✕ Close Terminal</button>
              </div>

              <div style={styles.modalToolbarRow}>
                <input 
                  type="text" 
                  placeholder={`Search Unit or Name inside ${selectedTower}...`} 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={styles.modalSearchBarField} 
                />
              </div>

              <div style={styles.modalContentScrollBody}>
                <div style={styles.tableFrame}>
                  <div style={styles.tableHeaderLine}>
                    <span style={{ flex: '1.2 0 100px' }}>Unit / Allocation</span>
                    <span style={{ flex: '2 1 150px' }}>Primary Recipient</span>
                    <span style={{ flex: '1.5 1 120px', textAlign: 'center' }}>Holding Volume</span>
                    <span style={{ flex: '1.5 0 110px', textAlign: 'center' }}>Sentry State</span>
                    <span style={{ flex: '2 0 130px', textAlign: 'right' }}>Workspace Action</span>
                  </div>

                  {getGroupedVaultParcelsForTower(selectedTower).length === 0 ? (
                    <div style={styles.emptyStateContainer}>No active uncollected items found under this query filter index inside {selectedTower}.</div>
                  ) : (
                    getGroupedVaultParcelsForTower(selectedTower).map((group) => {
                      const isExpanded = expandedUnit === group.unit_no;
                      const batchIds = group.parcels.map(p => p.id);

                      return (
                        <div key={group.unit_no} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <div onClick={() => setExpandedUnit(isExpanded ? null : group.unit_no)} style={{ ...styles.tableRowLine, backgroundColor: group.is_overdue ? '#fff5f5' : 'transparent', cursor: 'pointer', padding: '16px 12px' }}>
                            <div style={{ flex: '1.2 0 100px', fontWeight: '900', color: '#0f172a', fontSize: '15px' }}>
                              {isExpanded ? '▼ ' : '▶ '} Unit {group.unit_no}
                            </div>
                            <div style={{ flex: '2 1 150px', fontWeight: '600', color: '#334155', fontSize: '13px' }}>{group.recipient_name}</div>
                            <div style={{ flex: '1.5 1 120px', display: 'flex', justifyContent: 'center' }}><span style={styles.volumeCounterBadge}>📦 {group.count} Parcels Stacked</span></div>
                            <div style={{ flex: '1.5 0 110px', display: 'flex', justifyContent: 'center' }}>
                              <span style={{
                                ...styles.statusBadge,
                                backgroundColor: group.is_overdue ? '#fee2e2' : '#eff6ff',
                                color: group.is_overdue ? '#b91c1c' : '#1e40af'
                              }}>{group.is_overdue ? 'OVERDUE' : 'HOLDINGS'}</span>
                            </div>
                            <div style={{ flex: '2 0 130px', display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                              <button onClick={() => handleManualBatchRelease(group.unit_no, batchIds, selectedTower)} style={styles.releaseActionBtn}>Office Override Release All</button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div style={styles.subParcelAccordionZone}>
                              {group.parcels.map((parcel, idx) => (
                                <div key={parcel.id} style={styles.subParcelInnerRow}>
                                  <span style={{ color: '#475569', fontWeight: 'bold' }}>#{idx + 1} Cargo:</span>
                                  <span style={styles.carrierBadgeTag}>{parcel.carrier_name}</span>
                                  <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#1e293b' }}>Tracking Sequence: {parcel.tracking_number}</span>
                                  <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: 'bold' }}>Pass Token Link: {parcel.secure_pass_code}</span>
                                  <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>Ingest Tech: {parcel.registered_by}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Audit Log Modal */}
        {activeLog && (
          <div style={styles.modalOverlay} onClick={() => setActiveLog(null)}>
            <div style={styles.modalCenterBanner} onClick={e => e.stopPropagation()}>
              <div style={styles.modalHeaderBox}>
                <h3 style={styles.modalTitle}> Parcel Handover Report</h3>
                <button style={styles.modalCloseXBtn} onClick={() => setActiveLog(null)}>✕</button>
              </div>
              <div style={styles.auditDetailGrid}>
                <p style={{ margin: '4px 0', fontSize: '14px', color: '#334155' }}><strong>Tracking:</strong> {activeLog.tracking_number || 'N/A'}</p>
                <p style={{ margin: '4px 0', fontSize: '14px', color: '#334155' }}><strong>Unit:</strong> {activeLog.unit_no}</p>
                <p style={{ margin: '4px 0', fontSize: '14px', color: '#334155' }}><strong>Registered By:</strong> {activeLog.registered_by || 'N/A'}</p>
                <p style={{ margin: '4px 0', fontSize: '14px', color: '#334155' }}><strong>Released By:</strong> {activeLog.released_by || activeLog.operator}</p>
                <p style={{ margin: '4px 0', fontSize: '14px', color: '#334155' }}><strong>Collected At:</strong> {activeLog.collected_at || activeLog.timestamp}</p>
              </div>
              {activeLog.signature_url && (
                <div style={styles.signatureDisplayArea}>
                  <img src={activeLog.signature_url} alt="Signature" style={{ width: '100%', height: 100, objectFit: 'contain' }} />
                </div>
              )}
              <button style={styles.modalSubmitBtn} onClick={() => setActiveLog(null)}>Close</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'system-ui, sans-serif' }}>
      
      {/* Upper Layout Workspace Partition Board */}
      <div style={{ display: 'flex', gap: '24px', width: '100%' }}>
        
        {/* 🚨 [좌측 유지] 24h+ 장기 미수령 패키지 실시간 경보 통제소 */}
        <div style={styles.leftSentryPanel}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '20px' }}>🚨</span>
            <h3 style={{ ...styles.panelTitle, color: '#991b1b' }}>Unclaimed Cargo Sentry (Global Overdue)</h3>
          </div>
          <p style={styles.panelSubtitle}>Tracking space-clogging uncollected deliveries breaching 24h threshold across all structures.</p>
          
          <div style={styles.overdueStack}>
            {globalOverdueParcels.length === 0 ? (
              <div style={styles.allClearBanner}>✓ All parcels claimed within the 24-hour grace bracket. Clearing all complex parcel inventories.</div>
            ) : (
              globalOverdueParcels.map(p => (
                <div key={p.id} style={styles.overdueCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={styles.overdueUnitText}>{p.block_phase_no} — Unit {p.unit_no}</span>
                      <div style={styles.overdueDetailText}>Receiver: <strong>{p.recipient_name}</strong></div>
                      <div style={styles.overdueDetailText}>Carrier: 🚚 {p.carrier_name} ({p.tracking_number})</div>
                      <div style={styles.overdueTimeAlert}>Unclaimed Since: {p.received_at}</div>
                    </div>
                    <span style={styles.pulseWarningBadge}>⚠️ Retain Overdue</span>
                  </div>
                  <div style={styles.overdueActionRow}>
                    <button onClick={() => handleSendOverdueWarning(p.unit_no, p.carrier_name, p.block_phase_no)} style={styles.warningPushBtn}>📢 Send Warning Push</button>
                    <button onClick={() => handleBuzzSentryGuard(p.unit_no)} style={styles.buzzGuardBtn}>📱 Buzz Guard</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 🏢 [우측 개조] 5~6개 대형 단지용 세로형 타워 스케일 마스터 보드 */}
        <div style={styles.rightVaultPanel}>
          
          {/* 🎯 탭 전환 UI */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button 
              onClick={() => setViewTab('ACTIVE')} 
              style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', backgroundColor: viewTab === 'ACTIVE' ? '#0f172a' : '#fff', color: viewTab === 'ACTIVE' ? '#fff' : '#475569' }}
            >
              📥 Holdings
            </button>
            <button 
              onClick={() => setViewTab('COMPLETED')} 
              style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', backgroundColor: viewTab === 'COMPLETED' ? '#0f172a' : '#fff', color: viewTab === 'COMPLETED' ? '#fff' : '#475569' }}
            >
              ✅ Completed Reports
            </button>
          </div>

          {viewTab === 'ACTIVE' ? (
            <>
              <div style={styles.vaultHeaderRow}>
                <div>
                  <h3 style={styles.panelTitle}>📥 Complex Holdings Vault Directory</h3>
                  <p style={styles.panelSubtitle}>Showing real-time uncollected parcels counts per architectural tower footprints. Click a sector block to launch directory popup console.</p>
                </div>
              </div>
              
              <div style={styles.towerVerticalStackColumn}>
                {megaTowersList.map((towerName) => {
                  const currentTowerCount = countTowerParcels(towerName);
                  return (
                    <div key={towerName} onClick={() => setSelectedTower(towerName)} style={styles.towerListItemRowButton}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={styles.towerIconCircleBadge}>🏢</div>
                        <div>
                          <div style={styles.towerListMainTitle}>{towerName} Gatehouse Locker</div>
                          <div style={styles.towerListSubText}>Click to analyze secure tracking vouchers & rollups</div>
                        </div>
                      </div>
                      <span style={{ ...styles.towerVolumeIndicatorTag, backgroundColor: currentTowerCount > 0 ? '#eff6ff' : '#f8fafc', color: currentTowerCount > 0 ? '#2563eb' : '#94a3b8' }}>
                        {currentTowerCount} Packages Stored ➔
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div style={styles.vaultHeaderRow}>
                <div>
                  <h3 style={styles.panelTitle}>✅ Completed & Released Parcels</h3>
                  <p style={styles.panelSubtitle}>History of parcels successfully handed over to residents or proxies.</p>
                </div>
              </div>
              
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto', paddingRight: '8px' }}>
                {completedParcels.length === 0 ? (
                  <div style={styles.emptyStateContainer}>No completed parcels found.</div>
                ) : (
                  completedParcels.map((p, idx) => (
                    <div key={p.id || idx} style={{ padding: '14px', border: '1px solid #e2e8f0', borderRadius: '10px', backgroundColor: '#f8fafc' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <strong style={{ color: '#0f172a', fontSize: '14px' }}>Unit {p.unit_no}</strong>
                        <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: '900', backgroundColor: '#dcfce7', padding: '3px 8px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>COLLECTED</span>
                      </div>
                      <div style={{ fontSize: '13px', color: '#334155', marginBottom: '2px' }}><strong>Tracking:</strong> {p.tracking_number}</div>
                      <div style={{ fontSize: '13px', color: '#334155' }}><strong>Released By:</strong> {p.released_by || 'Guard'}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px', fontStyle: 'italic' }}>Collected At: {new Date(p.collected_at || p.created_at).toLocaleString()}</div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

      </div>

      {/* 📜 3. BOTTOM BLOCK: 날짜 필터링 + 페이지네이션 블랙박스 감사 대장 */}
      <div style={styles.auditLogContainer}>
        <div style={styles.auditToolbarRowHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>📜</span>
            <h3 style={styles.panelTitle}>Immutable Property Parcel Blackbox Audit Trail Ledger</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Filter Audit Date:</span>
            <input type="date" value={filterLogDate} onChange={(e) => { setFilterLogDate(e.target.value); setCurrentPage(1); }} style={styles.datePickerField} />
          </div>
        </div>

        <div style={styles.auditTimelineStack}>
          {paginatedLogs.length === 0 ? (
            <div style={styles.emptyStateContainer}>No cryptographic ledger traces mapped on date: {filterLogDate}.</div>
          ) : (
            paginatedLogs.map((log) => {
              const isWarning = log.event_type === 'WARNING_SENT';
              const isRelease = log.event_type === 'HANDOVER_RELEASE';

              return (
                <div 
                  key={log.id} 
                  onClick={() => setActiveLog(log)} // 🎯 로그 행 클릭 시 상세 모달 오픈
                  style={{ ...styles.auditLogItem, cursor: 'pointer' }}
                >
                  <div style={styles.auditLogHeaderRow}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ 
                        ...styles.eventTag, 
                        backgroundColor: isWarning ? '#fff7ed' : (isRelease ? '#e8fdf0' : '#f1f5f9'),
                        color: isWarning ? '#c2410c' : (isRelease ? '#15803d' : '#475569'),
                        borderColor: isWarning ? '#ffedd5' : (isRelease ? '#d1f7db' : '#e2e8f0')
                      }}>
                        {log.event_type}
                      </span>
                      <strong style={{ fontSize: '13px', color: '#1e293b' }}>Unit {log.unit_no}</strong>
                    </div>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8' }}>{log.timestamp}</span>
                  </div>
                  <p style={styles.auditLogDetailsText}>{log.details}</p>
                </div>
              );
            })
          )}
        </div>

        {filteredAuditLogs.length > 0 && (
          <div style={styles.paginationFooterBarRow}>
            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>
              Showing {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, filteredAuditLogs.length)} of {filteredAuditLogs.length} Immutable History Logs
            </span>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} style={styles.pageArrowBtn}>[Prev]</button>
              {Array.from({ length: totalPages }, (_, idx) => (
                <button key={idx + 1} onClick={() => setCurrentPage(idx + 1)} style={{ ...styles.pageNumberBtn, backgroundColor: currentPage === idx + 1 ? '#0f172a' : '#ffffff', color: currentPage === idx + 1 ? '#ffffff' : '#0f172a', borderColor: currentPage === idx + 1 ? '#0f172a' : '#cbd5e1' }}>{idx + 1}</button>
              ))}
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} style={styles.pageArrowBtn}>[Next]</button>
            </div>
          </div>
        )}
      </div>

      {/* 🎯 [신규 팝업 모달 체계 완착]: 우측 타워 클릭 시 타워별 세부 수납 원장 아코디언 창이 팝업 배너로 등장 */}
      {selectedTower && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalFullDirectoryContainer}>
            
            {/* Modal Header */}
            <div style={styles.modalHeaderBox}>
              <div>
                <span style={styles.modalMetaLabelLine}>Lobby Vault Intelligence Console</span>
                <h3 style={styles.modalMainTitleText}>📋 Consolidated Inventory Directory — {selectedTower}</h3>
              </div>
              <button style={styles.modalDismissXBtn} onClick={() => { setSelectedTower(null); setExpandedUnit(null); setSearchQuery(''); }}>✕ Close Terminal</button>
            </div>

            {/* Modal Search Toolbar */}
            <div style={styles.modalToolbarRow}>
              <input 
                type="text" 
                placeholder={`Search Unit or Name inside ${selectedTower}...`} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.modalSearchBarField} 
              />
            </div>

            {/* Modal Scroll Content: Grouped Core Grid table */}
            <div style={styles.modalContentScrollBody}>
              <div style={styles.tableFrame}>
                <div style={styles.tableHeaderLine}>
                  <span style={{ flex: '1.2 0 100px' }}>Unit / Allocation</span>
                  <span style={{ flex: '2 1 150px' }}>Primary Recipient</span>
                  <span style={{ flex: '1.5 1 120px', textAlign: 'center' }}>Holding Volume</span>
                  <span style={{ flex: '1.5 0 110px', textAlign: 'center' }}>Sentry State</span>
                  <span style={{ flex: '2 0 130px', textAlign: 'right' }}>Workspace Action</span>
                </div>

                {getGroupedVaultParcelsForTower(selectedTower).length === 0 ? (
                  <div style={styles.emptyStateContainer}>No active uncollected items found under this query filter index inside {selectedTower}.</div>
                ) : (
                  getGroupedVaultParcelsForTower(selectedTower).map((group) => {
                    const isExpanded = expandedUnit === group.unit_no;
                    const batchIds = group.parcels.map(p => p.id);

                    return (
                      <div key={group.unit_no} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <div onClick={() => setExpandedUnit(isExpanded ? null : group.unit_no)} style={{ ...styles.tableRowLine, backgroundColor: group.is_overdue ? '#fff5f5' : 'transparent', cursor: 'pointer', padding: '16px 12px' }}>
                          <div style={{ flex: '1.2 0 100px', fontWeight: '900', color: '#0f172a', fontSize: '15px' }}>
                            {isExpanded ? '▼ ' : '▶ '} Unit {group.unit_no}
                          </div>
                          <div style={{ flex: '2 1 150px', fontWeight: '600', color: '#334155', fontSize: '13px' }}>{group.recipient_name}</div>
                          <div style={{ flex: '1.5 1 120px', display: 'flex', justifyContent: 'center' }}><span style={styles.volumeCounterBadge}>📦 {group.count} Parcels Stacked</span></div>
                          <div style={{ flex: '1.5 0 110px', display: 'flex', justifyContent: 'center' }}>
                            <span style={{
                              ...styles.statusBadge,
                              backgroundColor: group.is_overdue ? '#fee2e2' : '#eff6ff',
                              color: group.is_overdue ? '#b91c1c' : '#1e40af'
                            }}>{group.is_overdue ? 'OVERDUE' : 'HOLDINGS'}</span>
                          </div>
                          <div style={{ flex: '2 0 130px', display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                            {/* 💡 마스터 오버라이드 기능 단추 보존 결속 */}
                            <button onClick={() => handleManualBatchRelease(group.unit_no, batchIds, selectedTower)} style={styles.releaseActionBtn}>Office Override Release All</button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div style={styles.subParcelAccordionZone}>
                            {group.parcels.map((parcel, idx) => (
                              <div key={parcel.id} style={styles.subParcelInnerRow}>
                                <span style={{ color: '#475569', fontWeight: 'bold' }}>#{idx + 1} Cargo:</span>
                                <span style={styles.carrierBadgeTag}>{parcel.carrier_name}</span>
                                <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#1e293b' }}>Tracking Sequence: {parcel.tracking_number}</span>
                                <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: 'bold' }}>Pass Token Link: {parcel.secure_pass_code}</span>
                                <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: 'auto' }}>Ingest Tech: {parcel.registered_by}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 🎯 [신규 모달] 로그 행 클릭 시 상세 정보 및 서명 확인 모달 */}
      {activeLog && (
        <div style={styles.modalOverlay} onClick={() => setActiveLog(null)}>
          <div style={styles.modalCenterBanner} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeaderBox}>
              <h3 style={styles.modalTitle}> Parcel Handover Report</h3>
              <button style={styles.modalCloseXBtn} onClick={() => setActiveLog(null)}>✕</button>
            </div>
            
            <div style={styles.auditDetailGrid}>
              <p style={{ margin: '4px 0', fontSize: '14px', color: '#334155' }}><strong>Tracking:</strong> {activeLog.tracking_number || 'N/A'}</p>
              <p style={{ margin: '4px 0', fontSize: '14px', color: '#334155' }}><strong>Unit:</strong> {activeLog.unit_no}</p>
              <p style={{ margin: '4px 0', fontSize: '14px', color: '#334155' }}><strong>Registered By:</strong> {activeLog.registered_by || 'N/A'}</p>
              <p style={{ margin: '4px 0', fontSize: '14px', color: '#334155' }}><strong>Released By:</strong> {activeLog.released_by || activeLog.operator}</p>
              <p style={{ margin: '4px 0', fontSize: '14px', color: '#334155' }}><strong>Collected At:</strong> {activeLog.collected_at || activeLog.timestamp}</p>
            </div>

            {activeLog.signature_url && (
              <div style={styles.signatureDisplayArea}>
                <img src={activeLog.signature_url} alt="Signature" style={{ width: '100%', height: 100, objectFit: 'contain' }} />
              </div>
            )}
            
            <button style={styles.modalSubmitBtn} onClick={() => setActiveLog(null)}>Close</button>
          </div>
        </div>
      )}

    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  leftSentryPanel: { width: '38%', backgroundColor: '#ffffff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)' },
  rightVaultPanel: { width: '62%', backgroundColor: '#ffffff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)' },
  panelTitle: { margin: 0, fontSize: '18px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.3px' },
  panelSubtitle: { fontSize: '12px', color: '#64748b', margin: '4px 0 0 0', lineHeight: '1.4' },
  
  // 🎯 대단지용 수직 타워 리스트 라인 컴포넌트 스타일셋
  towerVerticalStackColumn: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' },
  towerListItemRowButton: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.15s ease' },
  towerIconCircleBadge: { width: '36px', height: '36px', backgroundColor: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' },
  towerListMainTitle: { fontSize: '14px', fontWeight: '700', color: '#1e293b' },
  towerListSubText: { fontSize: '11px', color: '#94a3b8', marginTop: '2px' },
  towerVolumeIndicatorTag: { padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '800' },

  overdueStack: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' },
  allClearBanner: { padding: '16px', backgroundColor: '#f0fdf4', color: '#15803d', borderRadius: '10px', fontSize: '12px', fontWeight: '600', textAlign: 'center', border: '1px solid #d1f7db', lineHeight: '1.4' },
  overdueCard: { padding: '16px', backgroundColor: '#fff5f5', border: '1px solid #fee2e2', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' },
  overdueUnitText: { fontSize: '15px', fontWeight: '900', color: '#991b1b' },
  overdueDetailText: { fontSize: '12px', color: '#475569', marginTop: '2px' },
  overdueTimeAlert: { fontSize: '11px', fontWeight: 'bold', color: '#b91c1c', marginTop: '4px', fontStyle: 'italic' },
  pulseWarningBadge: { fontSize: '9px', fontWeight: '900', color: '#ef4444', backgroundColor: '#fff', border: '1px solid #ef4444', padding: '3px 6px', borderRadius: '4px' },
  overdueActionRow: { display: 'flex', gap: '8px', borderTop: '1px dashed #fee2e2', paddingTop: '10px' },
  warningPushBtn: { flex: 1, backgroundColor: '#b91c1c', color: '#ffffff', border: 'none', padding: '8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' },
  buzzGuardBtn: { padding: '8px 14px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' },

  vaultHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' },
  tableSearchInput: { padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', width: '220px', outline: 'none' },
  tableFrame: { width: '100%', display: 'flex', flexDirection: 'column', border: '1px solid #f1f5f9', borderRadius: '12px', overflow: 'hidden' },
  tableHeaderLine: { display: 'flex', padding: '12px', borderBottom: '2px solid #f1f5f9', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', backgroundColor: '#f8fafc', letterSpacing: '0.3px' },
  tableRowLine: { display: 'flex', alignItems: 'center', padding: '12px', gap: '12px' },
  volumeCounterBadge: { backgroundColor: '#f0f6ff', color: '#2563eb', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '800' },
  carrierBadgeTag: { backgroundColor: '#e2e8f0', color: '#334155', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: '700' },
  statusBadge: { padding: '4px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' },
  releaseActionBtn: { backgroundColor: '#0f172a', color: '#ffffff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' },

  subParcelAccordionZone: { backgroundColor: '#f8fafc', borderTop: '1px solid #edf2f7', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' },
  subParcelInnerRow: { display: 'flex', gap: '12px', alignItems: 'center', backgroundColor: '#ffffff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #edf2f7', fontSize: '12px' },
  emptyStateContainer: { padding: '30px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', fontWeight: '500' },

  auditLogContainer: { backgroundColor: '#ffffff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.01)', width: '100%' },
  auditToolbarRowHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #f1f5f9', paddingBottom: '14px' },
  datePickerField: { padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', color: '#0f172a', fontWeight: '700', outline: 'none' },
  auditTimelineStack: { display: 'flex', flexDirection: 'column', gap: '10px' },
  auditLogItem: { padding: '14px', backgroundColor: '#f8fafc', border: '1px solid #edf2f7', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '6px' },
  auditLogHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  eventTag: { fontSize: '9px', fontWeight: '900', padding: '2px 6px', borderRadius: '4px', borderWidth: '1px', borderStyle: 'solid' },
  auditLogDetailsText: { fontSize: '12px', color: '#334155', margin: 0, lineHeight: '1.4', fontWeight: '500' },
  auditOperatorFooter: { fontSize: '11px', color: '#94a3b8', borderTop: '1px solid #f1f5f9', paddingTop: '4px', marginTop: '2px' },
  paginationFooterBarRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '16px', marginTop: '16px' },
  pageArrowBtn: { background: 'none', border: 'none', color: '#2563eb', fontSize: '12px', fontWeight: '800', cursor: 'pointer', padding: '4px' },
  pageNumberBtn: { width: '28px', height: '28px', border: '1px solid', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  // 🎯 타워 돋보기 모달 대형 팝업 스타일 벨트
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '20px' },
  modalFullDirectoryContainer: { backgroundColor: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '880px', maxHeight: '85vh', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  modalHeaderBox: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px', width: '100%' },
  modalMetaLabelLine: { fontSize: '10px', fontWeight: '800', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px' },
  modalMainTitleText: { margin: '2px 0 0 0', fontSize: '18px', fontWeight: '800', color: '#0f172a' },
  modalDismissXBtn: { backgroundColor: '#f1f5f9', border: 'none', padding: '8px 16px', borderRadius: '8px', color: '#0f172a', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' },
  modalToolbarRow: { display: 'flex', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' },
  modalSearchBarField: { padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', width: '100%', outline: 'none' },
  modalContentScrollBody: { flex: 1, overflowY: 'auto', paddingRight: '4px' },

  // Audit Log Modal Styles
  modalCenterBanner: { backgroundColor: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '560px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  modalTitle: { margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#0f172a' },
  modalCloseXBtn: { background: 'none', border: 'none', fontSize: '16px', color: '#94a3b8', cursor: 'pointer' },
  auditDetailGrid: { display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #f1f5f9' },
  detailRow: { fontSize: '13px', color: '#334155', display: 'grid', gridTemplateColumns: '100px 1fr', gap: '8px', alignItems: 'baseline' },
  signatureDisplayArea: { marginTop: '8px', padding: '16px', border: '1px solid #e2e8f0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' },
  signatureVectorFrame: { width: '100%', height: '60px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'center', alignItems: 'center' },
  modalSubmitBtn: { backgroundColor: '#475569', color: '#ffffff', border: 'none', padding: '10px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', alignSelf: 'flex-end' }
};