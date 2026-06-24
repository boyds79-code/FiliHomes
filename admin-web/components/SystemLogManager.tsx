import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabaseClient';

interface GuardActivityLog {
  id: string;
  created_at: string;
  guard_id: string | null;
  action: string;
  details: string;
  staff_profiles?: {
    full_name: string;
    role: string;
  } | null;
}

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

export default function SystemLogManager({ condoId }: { condoId: string }) {
  const [activeTab, setActiveTab] = useState<'GUARD' | 'VISITOR'>('GUARD');
  const [guardLogs, setGuardLogs] = useState<GuardActivityLog[]>([]);
  const [visitorLogs, setVisitorLogs] = useState<VisitorLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [unitsMap, setUnitsMap] = useState<Record<string, { unit_number: string, building_no: string }>>({});

  // 1. Fetch Units Map to resolve tower/unit details for visitor logs
  const fetchUnitsMap = async () => {
    try {
      const { data, error } = await supabase
        .from('units')
        .select('id, unit_number, building_no')
        .eq('condo_id', condoId);
      if (!error && data) {
        const mapping: Record<string, { unit_number: string, building_no: string }> = {};
        data.forEach(u => {
          mapping[u.id] = {
            unit_number: u.unit_number || '',
            building_no: u.building_no || 'Tower A'
          };
        });
        setUnitsMap(mapping);
      }
    } catch (err) {
      console.error("Error fetching units mapping:", err);
    }
  };

  // 2. Fetch Guard Activity Logs
  const fetchGuardLogs = async () => {
    setLoading(true);
    try {
      // Fetch logs and try to join staff_profiles
      const { data, error } = await supabase
        .from('guard_activity_logs')
        .select(`
          id,
          created_at,
          guard_id,
          action,
          details,
          staff_profiles:guard_id (
            full_name,
            role
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error("Error querying guard_activity_logs:", error);
      } else {
        setGuardLogs((data as any[]) || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 3. Fetch Visitor & Vehicle Access Logs
  const fetchVisitorLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
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
        .order('access_time', { ascending: false })
        .limit(100);

      if (error) {
        console.error("Error querying visitor_logs:", error);
      } else {
        // Filter by condo units if map is loaded
        let filtered = (data as any[]) || [];
        if (Object.keys(unitsMap).length > 0) {
          filtered = filtered.filter(log => {
            const unitId = log.visitor_passes?.unit_id;
            return !unitId || unitsMap[unitId];
          });
        }
        setVisitorLogs(filtered);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Load Initial Data
  useEffect(() => {
    if (condoId) {
      fetchUnitsMap();
    }
  }, [condoId]);

  useEffect(() => {
    if (activeTab === 'GUARD') {
      fetchGuardLogs();
    } else {
      fetchVisitorLogs();
    }
  }, [activeTab, unitsMap]);

  // Subscribe to Realtime Updates
  useEffect(() => {
    const guardChannel = supabase
      .channel('realtime-guard-logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guard_activity_logs' }, () => {
        if (activeTab === 'GUARD') fetchGuardLogs();
      })
      .subscribe();

    const visitorChannel = supabase
      .channel('realtime-visitor-logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitor_logs' }, () => {
        if (activeTab === 'VISITOR') fetchVisitorLogs();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(guardChannel);
      supabase.removeChannel(visitorChannel);
    };
  }, [activeTab, unitsMap]);

  // Handle Export CSV
  const handleExportCSV = () => {
    let csvContent = "";
    if (activeTab === 'GUARD') {
      csvContent += "Date & Time,Guard Name,Action,Details\n";
      const filtered = getFilteredGuardLogs();
      filtered.forEach(log => {
        const date = new Date(log.created_at).toLocaleString();
        const guard = log.staff_profiles?.full_name || 'System / Unknown';
        const action = log.action;
        const details = log.details.replace(/"/g, '""');
        csvContent += `"${date}","${guard}","${action}","${details}"\n`;
      });
    } else {
      csvContent += "Entry Time,Exit Time,Visitor Name,Plate Number,Type,Unit,Parking Fee,Paid Status\n";
      const filtered = getFilteredVisitorLogs();
      filtered.forEach(log => {
        const entry = new Date(log.access_time).toLocaleString();
        const exit = log.exit_time ? new Date(log.exit_time).toLocaleString() : 'Active';
        const name = log.visitor_passes?.visitor_name || 'N/A';
        const plate = log.visitor_passes?.plate_number || 'Walk-in';
        const type = log.visitor_passes?.visit_type || 'N/A';
        const unitId = log.visitor_passes?.unit_id;
        const unit = unitId && unitsMap[unitId] ? `${unitsMap[unitId].building_no} - ${unitsMap[unitId].unit_number}` : 'Unknown';
        const fee = `₱${log.parking_fee}`;
        const paid = log.is_paid ? 'Paid' : 'Unpaid';
        csvContent += `"${entry}","${exit}","${name}","${plate}","${type}","${unit}","${fee}","${paid}"\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${activeTab.toLowerCase()}_activity_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Get distinct action types for filter options
  const getActionTypes = () => {
    const actions = new Set<string>();
    guardLogs.forEach(l => {
      if (l.action) actions.add(l.action);
    });
    return Array.from(actions);
  };

  const getFilteredGuardLogs = () => {
    let filtered = [...guardLogs];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(l => 
        l.details?.toLowerCase().includes(q) ||
        l.action?.toLowerCase().includes(q) ||
        l.staff_profiles?.full_name?.toLowerCase().includes(q)
      );
    }
    if (actionFilter !== 'ALL') {
      filtered = filtered.filter(l => l.action === actionFilter);
    }
    return filtered;
  };

  const getFilteredVisitorLogs = () => {
    let filtered = [...visitorLogs];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(l => 
        l.visitor_passes?.visitor_name?.toLowerCase().includes(q) ||
        l.visitor_passes?.plate_number?.toLowerCase().includes(q) ||
        l.visitor_passes?.purpose?.toLowerCase().includes(q) ||
        l.gate_location?.toLowerCase().includes(q)
      );
    }
    return filtered;
  };

  const filteredGuardLogs = getFilteredGuardLogs();
  const filteredVisitorLogs = getFilteredVisitorLogs();

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden flex flex-col h-full">
      {/* Header Panel */}
      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">📋 System & Activity Logs</h1>
          <p className="text-xs text-slate-500 mt-1">Real-time replication of guard activities and visitor operations across properties.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* CSV Export */}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition shadow-sm"
          >
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Logs (CSV)
          </button>
          
          {/* Refresh Button */}
          <button
            onClick={activeTab === 'GUARD' ? fetchGuardLogs : fetchVisitorLogs}
            className="p-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition shadow-sm"
            title="Refresh logs"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 15H9" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 px-6 gap-6 bg-white shrink-0">
        <button
          onClick={() => { setActiveTab('GUARD'); setSearchQuery(''); setActionFilter('ALL'); }}
          className={`py-3.5 text-sm font-semibold border-b-2 transition relative ${
            activeTab === 'GUARD' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          🛡️ Guard Activity Logs
          {activeTab === 'GUARD' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />}
        </button>
        <button
          onClick={() => { setActiveTab('VISITOR'); setSearchQuery(''); setActionFilter('ALL'); }}
          className={`py-3.5 text-sm font-semibold border-b-2 transition relative ${
            activeTab === 'VISITOR' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          🚗 Visitor & Vehicle Logs
          {activeTab === 'VISITOR' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />}
        </button>
      </div>

      {/* Filters Area */}
      <div className="p-4 border-b border-slate-100 bg-slate-50/20 flex flex-col md:flex-row items-center gap-3 shrink-0">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={activeTab === 'GUARD' ? "Search by guard, action, or details..." : "Search by visitor name, plate number..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
          />
        </div>

        {/* Action Type Filter (Guard tab only) */}
        {activeTab === 'GUARD' && (
          <div className="w-full md:w-48 shrink-0">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white transition"
            >
              <option value="ALL">All Actions</option>
              {getActionTypes().map(act => (
                <option key={act} value={act}>{act}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Logs Table Area */}
      <div className="flex-1 overflow-y-auto min-h-[300px]">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm text-slate-500 font-medium">Fetching logs...</span>
          </div>
        )}

        {!loading && (
          activeTab === 'GUARD' ? (
            filteredGuardLogs.length === 0 ? (
              <div className="text-center py-16">
                <span className="text-4xl text-slate-300">📋</span>
                <p className="text-slate-500 font-medium text-sm mt-3">No activity logs match your search.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 font-semibold text-xs uppercase tracking-wider">
                    <th className="px-6 py-3.5">Timestamp</th>
                    <th className="px-6 py-3.5">Guard / Operator</th>
                    <th className="px-6 py-3.5">Action</th>
                    <th className="px-6 py-3.5">Activity Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredGuardLogs.map((log) => {
                    const badgeColor = getActionBadgeColor(log.action);
                    return (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition">
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 font-medium">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-800 text-xs">
                              {log.staff_profiles?.full_name || 'System Agent'}
                            </span>
                            <span className="text-[10px] text-slate-400 capitalize">
                              {log.staff_profiles?.role?.toLowerCase() || 'Automated'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${badgeColor}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-600 max-w-md break-words">
                          {log.details}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : (
            filteredVisitorLogs.length === 0 ? (
              <div className="text-center py-16">
                <span className="text-4xl text-slate-300">🚗</span>
                <p className="text-slate-500 font-medium text-sm mt-3">No visitor/vehicle logs match your search.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 font-semibold text-xs uppercase tracking-wider">
                    <th className="px-6 py-3.5">Timestamp</th>
                    <th className="px-6 py-3.5">Visitor Name</th>
                    <th className="px-6 py-3.5">Vehicle Plate</th>
                    <th className="px-6 py-3.5">Target Unit</th>
                    <th className="px-6 py-3.5">Gate / Purpose</th>
                    <th className="px-6 py-3.5">Parking Fee</th>
                    <th className="px-6 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVisitorLogs.map((log) => {
                    const unitId = log.visitor_passes?.unit_id;
                    const unitInfo = unitId && unitsMap[unitId] 
                      ? `${unitsMap[unitId].building_no} - ${unitsMap[unitId].unit_number}` 
                      : 'N/A';
                    return (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition">
                        <td className="px-6 py-4 text-xs text-slate-500 font-medium">
                          <div className="flex flex-col">
                            <span>Entry: {new Date(log.access_time).toLocaleString()}</span>
                            {log.exit_time && <span className="text-slate-400">Exit: {new Date(log.exit_time).toLocaleString()}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-800 text-xs">
                              {log.visitor_passes?.visitor_name || 'Walk-in Visitor'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {log.visitor_passes?.visit_type || 'Unknown'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs font-mono font-bold text-slate-700 bg-slate-50/30 px-2 py-1 rounded inline-block">
                          {log.visitor_passes?.plate_number || '🚶 WALK-IN'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs font-medium text-slate-700">
                          {unitInfo}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col text-xs text-slate-600">
                            <span className="font-semibold text-[10px] text-slate-400 uppercase">Gate: {log.gate_location || 'Main Gate'}</span>
                            <span className="italic">"{log.visitor_passes?.purpose || 'No purpose listed'}"</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-slate-800">
                          ₱{log.parking_fee || 0}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {log.exit_time ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 uppercase">
                              Completed {log.is_paid && '• Paid'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-50 text-yellow-700 uppercase animate-pulse">
                              On Premises
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          )
        )}
      </div>
      
      {/* Footer Info */}
      <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center text-xs text-slate-500 shrink-0">
        <span>Showing up to 100 recent entries. Use Export to pull all data.</span>
        <span>Replication status: <span className="text-green-600 font-bold">● Active Sync</span></span>
      </div>
    </div>
  );
}

// Badge color helper
function getActionBadgeColor(action: string): string {
  switch (action) {
    case 'SYSTEM_BOOT':
    case 'SHIFT_START':
      return 'bg-blue-50 text-blue-700 border border-blue-200';
    case 'SHIFT_END':
      return 'bg-slate-50 text-slate-700 border border-slate-200';
    case 'GATE_ENTRY_CONFIRMED':
    case 'VEHICLE_OUT':
      return 'bg-green-50 text-green-700 border border-green-200';
    case 'PARCEL_RECEIVE':
    case 'PARCEL_ARRIVED':
    case 'PARCEL_COLLECTED':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'PMO_MESSAGE':
    case 'INTERCOM_CHAT':
      return 'bg-indigo-50 text-indigo-700 border border-indigo-200';
    default:
      return 'bg-slate-50 text-slate-600 border border-slate-200';
  }
}
