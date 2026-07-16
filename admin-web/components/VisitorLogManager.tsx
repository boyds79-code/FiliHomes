import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabaseClient';

interface VisitorLog {
  id: string;
  access_time: string;
  exit_time: string | null;
  gate_location: string;
  parking_fee: number;
  is_paid: boolean;
  visitor_passes: {
    visitor_name: string;
    visit_type: string;
    purpose: string;
    plate_number: string | null;
    unit_id: string;
  } | null;
}

export default function VisitorLogManager({ condoId }: { condoId: string }) {
  const [activeTab, setActiveTab] = useState<'LOGS' | 'REVENUE' | 'ARCHIVED'>('LOGS');
  const [logs, setLogs] = useState<VisitorLog[]>([]);
  const [revenueLogs, setRevenueLogs] = useState<VisitorLog[]>([]);
  const [archivedLogs, setArchivedLogs] = useState<any[]>([]);
  const [archivedTotal, setArchivedTotal] = useState(0);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTower, setSelectedTower] = useState('ALL');
  const [filterUnit, setFilterUnit] = useState('');
  const [unitsMap, setUnitsMap] = useState<Record<string, { unit_number: string, block_phase_no: string }>>({});
  const [visitorLogSubTab, setVisitorLogSubTab] = useState<'WALK_IN' | 'VEHICLE'>('WALK_IN');

  const fetchUnitsMap = async () => {
    try {
      const { data, error } = await supabase
        .from('units')
        .select('id, unit_number, block_phase_no')
        .eq('condo_id', condoId);
      if (!error && data) {
        const mapping: Record<string, { unit_number: string, block_phase_no: string }> = {};
        data.forEach(u => {
          mapping[u.id] = {
            unit_number: u.unit_number || '',
            block_phase_no: u.block_phase_no || 'Tower A'
          };
        });
        setUnitsMap(mapping);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (condoId) {
      fetchUnitsMap();
    }
  }, [condoId]);

  useEffect(() => {
    if (condoId) {
      if (activeTab === 'LOGS') fetchLogs();
      else if (activeTab === 'REVENUE') fetchParkingRevenue();
      else if (activeTab === 'ARCHIVED') fetchArchivedLogs();
    }
  }, [searchQuery, selectedTower, filterUnit, condoId, activeTab, unitsMap]);

  // Real-time Postgres changes channel to sync visitor logs automatically when guards check visitors in/out
  useEffect(() => {
    if (!condoId) return;

    const channel = supabase
      .channel('realtime-visitor-logs-admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'visitor_logs' },
        () => {
          if (activeTab === 'LOGS') fetchLogs();
          else if (activeTab === 'REVENUE') fetchParkingRevenue();
          else if (activeTab === 'ARCHIVED') fetchArchivedLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [condoId, activeTab, searchQuery, selectedTower, filterUnit, unitsMap]);

  const fetchArchivedLogs = async () => {
    setArchivedLoading(true);
    try {
      const response = await fetch(`/api/admin/archived-logs?limit=50&search=${searchQuery}`);
      if (!response.ok) throw new Error("Failed to fetch archived logs");
      const data = await response.json();
      setArchivedLogs(data.logs || []);
      setArchivedTotal(data.totalCount || 0);
    } catch (err) {
      console.error("Error fetching archived logs:", err);
    } finally {
      setArchivedLoading(false);
    }
  };

  const fetchLogs = async () => {
    let query = supabase
      .from('visitor_logs')
      .select(`
        id,
        access_time,
        exit_time,
        gate_location,
        parking_fee,
        is_paid,
        visitor_passes (
          visitor_name,
          visit_type,
          purpose,
          plate_number,
          unit_id
        )
      `)
      .order('access_time', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching logs:", error);
    } else {
      let filteredData = (data as any[]) || [];
      
      // Filter by condoId (only keep if unit_id is in unitsMap)
      filteredData = filteredData.filter((log) => {
        const unitId = log.visitor_passes?.unit_id;
        return unitId && unitsMap[unitId];
      });

      if (searchQuery) {
        filteredData = filteredData.filter((log) => 
          log.visitor_passes?.visitor_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          log.visitor_passes?.plate_number?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }
      if (selectedTower !== 'ALL') {
        filteredData = filteredData.filter((log) => {
          const unitId = log.visitor_passes?.unit_id;
          return unitId && unitsMap[unitId]?.block_phase_no === selectedTower;
        });
      }
      if (filterUnit.trim()) {
        filteredData = filteredData.filter((log) => {
          const unitId = log.visitor_passes?.unit_id;
          const uNum = unitId ? unitsMap[unitId]?.unit_number : '';
          return uNum?.toLowerCase().includes(filterUnit.trim().toLowerCase());
        });
      }
      setLogs(filteredData);
    }
  };

  const fetchParkingRevenue = async () => {
    const { data, error } = await supabase
      .from('visitor_logs')
      .select(`
        id, 
        access_time, 
        exit_time, 
        parking_fee,
        is_paid,
        visitor_passes (visitor_name, plate_number, unit_id)
      `)
      .gt('parking_fee', 0) // 🎯 주차비가 0보다 큰 것만 가져옴
      .eq('is_paid', true)  // 결제 완료된 것만
      .order('exit_time', { ascending: false });

    if (!error) {
      let filteredData = (data as any[]) || [];
      // Filter by condoId (only keep if unit_id is in unitsMap)
      filteredData = filteredData.filter((log) => {
        const unitId = log.visitor_passes?.unit_id;
        return unitId && unitsMap[unitId];
      });
      setRevenueLogs(filteredData);
    }
  };

  const calculateParkingFee = (entryTime: string, exitTime: string) => {
    const entry = new Date(entryTime);
    const exit = new Date(exitTime);
    const hours = Math.ceil((exit.getTime() - entry.getTime()) / (1000 * 60 * 60)); // 시간 올림
    return hours * 50; // 시간당 50페소
  };

  const handleExit = async (logId: string, entryTime: string) => {
    if (!confirm("Are you sure you want to process exit and calculate fee?")) return;

    const exitTime = new Date().toISOString();
    const fee = calculateParkingFee(entryTime, exitTime);

    const { error } = await supabase
      .from('visitor_logs')
      .update({ 
        exit_time: exitTime,
        parking_fee: fee,
        is_paid: true // 실제 결제 시스템 연동 전 자동 결제로 처리
      })
      .eq('id', logId);

    if (!error) {
      alert(`Parking fee: ₱${fee} paid successfully.`);
      fetchLogs(); // 목록 갱신
    } else {
      console.error("Exit processing failed:", error);
      alert("Failed to process exit.");
    }
  };

  const renderLogs = () => {
    const walkInLogs = logs.filter(log => log.visitor_passes?.visit_type !== 'VEHICLE');
    const vehicleLogs = logs.filter(log => log.visitor_passes?.visit_type === 'VEHICLE');
    
    return (
      <div>
        {/* Segmented controls for Walk-in / Vehicle */}
        <div className="flex gap-4 border-b pb-3 mb-4">
          <button
            onClick={() => setVisitorLogSubTab('WALK_IN')}
            className={`text-sm font-bold pb-2 transition-all border-b-2 ${visitorLogSubTab === 'WALK_IN' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            🚶 Walk-in Log ({walkInLogs.length})
          </button>
          <button
            onClick={() => setVisitorLogSubTab('VEHICLE')}
            className={`text-sm font-bold pb-2 transition-all border-b-2 ${visitorLogSubTab === 'VEHICLE' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            🚗 Vehicle Log ({vehicleLogs.length})
          </button>
        </div>

        {visitorLogSubTab === 'WALK_IN' ? (
          <table className="w-full text-left text-sm text-slate-600">
            <thead>
              <tr className="border-b text-xs uppercase text-slate-400">
                <th className="py-2">Time</th>
                <th>Visitor Name</th>
                <th>Purpose</th>
                <th>Tower / Unit</th>
                <th>Gate Location</th>
                <th>Status / Actions</th>
              </tr>
            </thead>
            <tbody>
              {walkInLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">No walk-in visitors recorded.</td>
                </tr>
              ) : walkInLogs.map((log) => {
                const unitId = log.visitor_passes?.unit_id;
                const unitInfo = unitId ? unitsMap[unitId] : null;
                return (
                  <tr key={log.id} className="border-b hover:bg-slate-50">
                    <td className="py-3 text-xs text-slate-500">
                      In: {new Date(log.access_time).toLocaleString()}
                      {log.exit_time && <><br/>Out: {new Date(log.exit_time).toLocaleString()}</>}
                    </td>
                    <td className="font-bold text-slate-800">{log.visitor_passes?.visitor_name || 'N/A'}</td>
                    <td>{log.visitor_passes?.purpose || '-'}</td>
                    <td>
                      {unitInfo?.block_phase_no || '-'} / {unitInfo?.unit_number ? `Unit ${unitInfo.unit_number}` : '-'}
                    </td>
                    <td>{log.gate_location || 'Main Gate'}</td>
                    <td>
                      {log.exit_time ? (
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold">Checked Out</span>
                      ) : (
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded font-bold">In Premises</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left text-sm text-slate-600">
            <thead>
              <tr className="border-b text-xs uppercase text-slate-400">
                <th className="py-2">Time Info (In / Out)</th>
                <th>Visitor Name</th>
                <th>Plate No</th>
                <th>Tower / Unit</th>
                <th>Gate Location</th>
                <th>Parking Fee</th>
                <th>Status / Actions</th>
              </tr>
            </thead>
            <tbody>
              {vehicleLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">No vehicles recorded.</td>
                </tr>
              ) : vehicleLogs.map((log) => {
                const unitId = log.visitor_passes?.unit_id;
                const unitInfo = unitId ? unitsMap[unitId] : null;
                return (
                  <tr key={log.id} className="border-b hover:bg-slate-50">
                    <td className="py-3 text-xs text-slate-500">
                      In: {new Date(log.access_time).toLocaleString()}
                      <br/>
                      Out: {log.exit_time ? new Date(log.exit_time).toLocaleString() : <span className="text-blue-600 font-bold">In Premises (Active)</span>}
                    </td>
                    <td className="font-bold text-slate-800">{log.visitor_passes?.visitor_name || 'N/A'}</td>
                    <td className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded w-fit">{log.visitor_passes?.plate_number || 'N/A'}</td>
                    <td>
                      {unitInfo?.block_phase_no || '-'} / {unitInfo?.unit_number ? `Unit ${unitInfo.unit_number}` : '-'}
                    </td>
                    <td>{log.gate_location || 'Main Gate'}</td>
                    <td>
                      {log.exit_time ? (
                        log.parking_fee > 0 ? (
                          <div className="flex flex-col">
                            <span className="font-bold text-emerald-600">₱{log.parking_fee}</span>
                            <span className="text-[10px] text-slate-400">{log.is_paid ? '✅ Paid' : '❌ Unpaid'}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">No Charge</span>
                        )
                      ) : (
                        // Active vehicle: show estimated fee so far (₱50 / hour)
                        (() => {
                          const elapsedHours = Math.ceil((new Date().getTime() - new Date(log.access_time).getTime()) / (1000 * 60 * 60));
                          const estimatedFee = elapsedHours * 50;
                          return (
                            <div className="flex flex-col">
                              <span className="font-bold text-amber-600">₱{estimatedFee}</span>
                              <span className="text-[9px] text-slate-400 font-semibold">(Est. so far)</span>
                            </div>
                          );
                        })()
                      )}
                    </td>
                    <td>
                      {log.exit_time ? (
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold">Checked Out</span>
                      ) : (
                        <button 
                          onClick={() => handleExit(log.id, log.access_time)}
                          className="text-xs bg-blue-100 text-blue-700 px-3 py-1 rounded font-bold hover:bg-blue-200 transition-colors"
                        >
                          Process Exit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  const renderRevenue = () => {
    const totalRevenue = revenueLogs.reduce((sum, log) => sum + (log.parking_fee || 0), 0);

    return (
      <div>
        <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200 flex justify-between items-center">
          <div>
            <h4 className="text-sm font-bold text-green-800">Total Collected Revenue</h4>
            <p className="text-xs text-green-600">Sum of all paid parking fees</p>
          </div>
          <div className="text-2xl font-black text-green-700">₱ {totalRevenue.toLocaleString()}</div>
        </div>

        <table className="w-full text-left text-sm text-slate-600">
          <thead>
            <tr className="border-b text-xs uppercase text-slate-400">
              <th className="py-2">Exit Time</th>
              <th>Visitor</th>
              <th>Plate Number</th>
              <th>Status</th>
              <th className="text-right">Fee (PHP)</th>
            </tr>
          </thead>
          <tbody>
            {revenueLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400 border-b">No revenue data available.</td>
              </tr>
            ) : revenueLogs.map((log) => (
              <tr key={log.id} className="border-b hover:bg-slate-50">
                <td className="py-3 text-xs text-slate-500">
                  {log.exit_time ? new Date(log.exit_time).toLocaleString() : 'N/A'}
                </td>
                <td className="font-bold text-slate-800">{log.visitor_passes?.visitor_name || 'N/A'}</td>
                <td className="font-mono text-xs">{log.visitor_passes?.plate_number || 'N/A'}</td>
                <td>
                  {log.is_paid && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">Paid</span>}
                </td>
                <td className="text-right font-bold text-emerald-600">₱ {log.parking_fee}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderArchived = () => (
    <div className="space-y-4">
      <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center text-xs text-slate-500">
        <div>
          <span>📁 Total Archived Records: </span>
          <span className="font-bold text-slate-700">{archivedTotal}</span>
        </div>
        <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
          🔒 Secure Archival Vault (Admins & Guards Only)
        </div>
      </div>
      
      {archivedLoading ? (
        <div className="py-12 text-center text-slate-400 text-xs font-semibold">
          Loading archived vault records...
        </div>
      ) : archivedLogs.length === 0 ? (
        <div className="py-12 text-center text-slate-400 text-xs font-semibold border border-dashed rounded-xl">
          No archived logs found.
        </div>
      ) : (
        <table className="w-full text-left text-sm text-slate-600">
          <thead>
            <tr className="border-b text-xs uppercase text-slate-400">
              <th className="py-2">Archived At / Access Time</th>
              <th>Visitor</th>
              <th>Type</th>
              <th>Plate / Gate</th>
              <th>Retention Status</th>
            </tr>
          </thead>
          <tbody>
            {archivedLogs.map((log) => (
              <tr key={log.id} className="border-b hover:bg-slate-50">
                <td className="py-3 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">Archived: {new Date(log.archived_at).toLocaleDateString()}</span>
                  <br/>
                  In: {new Date(log.access_time).toLocaleString()}
                  {log.exit_time && <><br/>Out: {new Date(log.exit_time).toLocaleString()}</>}
                </td>
                <td className="font-bold text-slate-800">{log.visitor_passes?.visitor_name || 'N/A'}</td>
                <td>{log.visitor_passes?.visit_type || '-'}</td>
                <td className="font-mono text-xs">
                  {log.visitor_passes?.plate_number || 'N/A'} / {log.gate_location || 'Main Gate'}
                </td>
                <td>
                  <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded font-bold">Archived</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">📋 Visitor Control</h3>
          <div className="flex gap-2 mt-2">
            <button 
              onClick={() => setActiveTab('LOGS')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${activeTab === 'LOGS' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Access Logs
            </button>
            <button 
              onClick={() => setActiveTab('REVENUE')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${activeTab === 'REVENUE' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
            >
              Revenue Report
            </button>
            <button 
              onClick={() => setActiveTab('ARCHIVED')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${activeTab === 'ARCHIVED' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
            >
              Secure Archives
            </button>
          </div>
        </div>
        
        {(activeTab === 'LOGS' || activeTab === 'ARCHIVED') && (
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <select
              value={selectedTower}
              onChange={(e) => setSelectedTower(e.target.value)}
              className="border p-2 rounded-lg text-sm bg-white text-slate-700 font-medium"
            >
              <option value="ALL">All Towers</option>
              <option value="Tower A">Tower A</option>
              <option value="Tower B">Tower B</option>
            </select>

            <input 
              type="text" 
              placeholder="Unit (e.g. 1204)" 
              className="border p-2 rounded-lg text-sm w-28 md:w-32"
              value={filterUnit}
              onChange={(e) => setFilterUnit(e.target.value)}
            />

            <input 
              type="text" 
              placeholder="Search visitor..." 
              className="border p-2 rounded-lg text-sm w-full md:w-auto"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        {activeTab === 'LOGS' && renderLogs()}
        {activeTab === 'REVENUE' && renderRevenue()}
        {activeTab === 'ARCHIVED' && renderArchived()}
      </div>
    </div>
  );
}