import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabaseClient';

interface UserReport {
  id: string;
  reporter_id: string;
  reported_id: string;
  reason_category: string;
  description: string;
  status: 'PENDING' | 'INVESTIGATED' | 'RESOLVED';
  created_at: string;
  reported_user_email?: string; 
  reporter_unit?: string;
  reported_unit?: string;
}

export default function SecuritySanctionManager({ condoId }: { condoId: string }) {
  const [reports, setReports] = useState<UserReport[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchIncomingReports();

    // ⚡ 실시간 신고 접수 리스너 채널 바인딩
    const channel = supabase
      .channel('live-security-reports')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_reports' }, () => {
        fetchIncomingReports();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchIncomingReports = async () => {
    try {
      const response = await fetch('/api/security-sanction');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setReports(data);
        }
      }
    } catch (err) {
      console.error("Failed to fetch reports:", err);
    }
  };

  const handleBanUser = async (reportId: string, userId: string) => {
    const confirmBan = window.confirm("Are you sure you want to SUSPEND this user from accessing the Mobile App?");
    if (!confirmBan) return;

    setIsProcessing(true);
    try {
      const response = await fetch('/api/security-sanction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, reportId, action: 'suspend' })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process restriction.');
      }

      alert("User access suspended successfully. Incident resolved.");
      fetchIncomingReports();
    } catch (err) {
      console.error(err);
      alert("Failed to process restriction.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDismissReport = async (reportId: string) => {
    const confirmDismiss = window.confirm("Are you sure you want to DISMISS this report? No sanction will be applied to the user.");
    if (!confirmDismiss) return;

    setIsProcessing(true);
    try {
      const response = await fetch('/api/security-sanction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, action: 'dismiss' })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to dismiss report.');
      }

      alert("Report dismissed successfully. Ticket resolved.");
      fetchIncomingReports();
    } catch (err) {
      console.error(err);
      alert("Failed to dismiss report.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-800">🛡️ Community Safety & Sanction Nexus</h3>
        <p className="text-xs text-slate-400">Review user misconduct reports and enforce immediate remote app suspensions.</p>
      </div>

      {reports.length === 0 ? (
        <div className="border border-dashed p-12 text-center rounded-xl text-slate-400 bg-slate-50/50">
          🕊️ Community environment is clean. No pending user reports found.
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map(r => (
            <div key={r.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50 hover:border-slate-300 transition">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="bg-rose-100 text-rose-700 text-xs font-bold px-2 py-0.5 rounded-md">
                    ⚠️ {r.reason_category}
                  </span>
                  <p className="text-xs text-slate-700 font-semibold mt-1.5">
                    Reporting Unit: <span className="text-slate-900 font-bold">{r.reporter_unit || 'Unknown Unit'}</span>
                  </p>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>

              <div className="bg-white border p-3 rounded-lg mb-4">
                <p className="text-sm text-slate-700 font-medium">" {r.description} "</p>
                <div className="mt-2 pt-2 border-t border-dashed flex justify-between text-[11px] text-slate-500">
                  <span>Reported Unit: <span className="font-bold text-rose-600">{r.reported_unit || 'Unknown Unit'}</span></span>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <button 
                  onClick={() => handleDismissReport(r.id)}
                  disabled={isProcessing}
                  className="bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-xs hover:bg-slate-300 transition"
                >
                  Dismiss & Clear
                </button>
                <button 
                  onClick={() => handleBanUser(r.id, r.reported_id)}
                  disabled={isProcessing}
                  className="bg-red-600 text-white font-bold px-4 py-2 rounded-lg text-xs hover:bg-red-700 transition"
                >
                  🚫 Instant Suspend User
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}