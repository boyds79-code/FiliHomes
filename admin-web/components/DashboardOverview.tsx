"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabaseClient';

interface DashboardOverviewProps {
  onNavigate: (menu: string, options?: any) => void;
  overdueParcelCount: number;
  newJobsCount: number;
}

export default function DashboardOverview({ onNavigate, overdueParcelCount, newJobsCount }: DashboardOverviewProps) {
  // Local state for statistics
  const [overdueBillsCount, setOverdueBillsCount] = useState(0);
  const [overdueBillsAmount, setOverdueBillsAmount] = useState(0);
  
  const [newHomeownersCount, setNewHomeownersCount] = useState(0);
  const [newHomeownersList, setNewHomeownersList] = useState<any[]>([]);
  
  const [activeIntercomsCount, setActiveIntercomsCount] = useState(0);
  const [activeReportsCount, setActiveReportsCount] = useState(0);
  
  const [hqRepliesCount, setHqRepliesCount] = useState(0);
  const [latestHqReply, setLatestHqReply] = useState<any>(null);

  const [loading, setLoading] = useState(true);

  // Fetch statistics
  const fetchStats = async () => {
    setLoading(true);
    try {
      // 1. Fetch Overdue Bills from API
      const billRes = await fetch('/api/billings');
      if (billRes.ok) {
        const { data } = await billRes.json();
        if (Array.isArray(data)) {
          const today = new Date();
          const overdue = data.filter((b: any) => {
            const isOverdueStatus = ['ISSUED', 'OVERDUE', 'PARTIAL'].includes(b.status?.toUpperCase());
            const isPastDue = new Date(b.due_date) < today;
            return isOverdueStatus && isPastDue;
          });
          
          setOverdueBillsCount(overdue.length);
          const totalAmount = overdue.reduce((sum: number, b: any) => {
            const bTotal = 
              Number(b.condo_dues || 0) + 
              Number(b.electricity || 0) + 
              Number(b.water || 0) + 
              Number(b.parking_fee || 0) + 
              Number(b.job_order_fee || 0) + 
              Number(b.previous_balance || 0) + 
              Number(b.penalty_amount || 0);
            return sum + bTotal;
          }, 0);
          setOverdueBillsAmount(totalAmount);
        }
      }

      // 2. Fetch pending homeowner requests from localstorage
      const storedRequests = window.localStorage.getItem('filicondo_occupant_requests');
      if (storedRequests) {
        const requests = JSON.parse(storedRequests);
        setNewHomeownersCount(requests.length);
        setNewHomeownersList(requests);
      }

      // 3. Fetch active intercom sessions
      const { count: chatCount } = await supabase
        .from('intercom_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'ACTIVE');
      setActiveIntercomsCount(chatCount || 0);

      // 4. Fetch security center active sanction/reports
      const { count: reportCount } = await supabase
        .from('sanctions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');
      setActiveReportsCount(reportCount || 0);

      // 5. Fetch platform issue reports and search for HQ replies
      const storedIssues = window.localStorage.getItem('filicondo_platform_issues');
      if (storedIssues) {
        const issues = JSON.parse(storedIssues);
        // Let's filter issues that have status as RESOLVED or IN_PROGRESS and mock a reply from HQ
        // To make it fully functional, we simulate replies if the issues have been processed.
        const repliedIssues = issues.filter((iss: any) => iss.status === 'RESOLVED' || iss.status === 'IN_PROGRESS');
        setHqRepliesCount(repliedIssues.length);
        if (repliedIssues.length > 0) {
          setLatestHqReply(repliedIssues[0]);
        }
      } else {
        // If empty, check DB
        const { data: dbIssues } = await supabase
          .from('platform_issues')
          .select('*')
          .order('created_at', { ascending: false });
        if (dbIssues && dbIssues.length > 0) {
          const replied = dbIssues.filter((iss: any) => iss.status !== 'OPEN');
          setHqRepliesCount(replied.length);
          if (replied.length > 0) {
            setLatestHqReply(replied[0]);
          }
        }
      }

    } catch (e) {
      console.error("Error loading dashboard statistics:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();

    // Listen to custom occupant registration updates
    const handleRequestsUpdate = () => {
      const stored = window.localStorage.getItem('filicondo_occupant_requests');
      if (stored) {
        const reqs = JSON.parse(stored);
        setNewHomeownersCount(reqs.length);
        setNewHomeownersList(reqs);
      }
    };
    window.addEventListener('occupantRequestsUpdated', handleRequestsUpdate);

    return () => {
      window.removeEventListener('occupantRequestsUpdated', handleRequestsUpdate);
    };
  }, []);

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 rounded-3xl p-6 md:p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 rounded-full bg-white/5 pointer-events-none"></div>
        <div className="absolute left-1/3 bottom-0 translate-y-16 w-48 h-48 rounded-full bg-white/5 pointer-events-none"></div>
        
        <div className="space-y-2 relative z-10">
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">
            Good day, Property Administrator! 👋
          </h2>
          <p className="text-sm text-blue-100 font-medium max-w-xl leading-relaxed">
            Welcome back to the Solea Residences Command Center. Here is a real-time summary of critical property actions requiring your approval or response.
          </p>
        </div>
        
        <button 
          onClick={fetchStats}
          className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all self-start md:self-auto shrink-0 relative z-10 shadow-sm"
        >
          🔄 Refresh Feed
        </button>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
          <span className="text-sm font-bold">Assembling Realtime Command Ledger...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Card 1: Overdue Bills */}
          <div 
            onClick={() => onNavigate('billings-issuance')}
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-red-400/50 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 group relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-2.5 h-full bg-red-500"></div>
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Overdue Bills</span>
                <h3 className="text-2xl font-black text-slate-800">
                  ₱{overdueBillsAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </h3>
                <p className="text-xs text-red-600 font-bold">
                  ⚠️ {overdueBillsCount} statements past due date
                </p>
              </div>
              <span className="text-2xl bg-red-50 p-2.5 rounded-xl">💸</span>
            </div>
            <div className="border-t border-slate-100 mt-4 pt-3 flex justify-between items-center text-xs">
              <span className="text-slate-400 font-semibold">Review utility breakdowns</span>
              <span className="text-blue-600 font-bold group-hover:translate-x-1 transition-transform">Issuance Hub →</span>
            </div>
          </div>

          {/* Card 2: New Home Owner Registration Requests */}
          <div 
            onClick={() => onNavigate('occupants-directory', { tab: 'REQUESTS' })}
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-blue-400/50 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 group relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-2.5 h-full bg-blue-600"></div>
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Homeowner Requests</span>
                <h3 className="text-2xl font-black text-slate-800">
                  {newHomeownersCount} Pending
                </h3>
                <div className="flex items-center gap-1.5 mt-1">
                  {newHomeownersCount > 0 ? (
                    <span className="inline-flex items-center bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">
                      Action Required
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 font-medium">All residents verified</span>
                  )}
                </div>
              </div>
              <span className="text-2xl bg-blue-50 p-2.5 rounded-xl">🛎️</span>
            </div>
            
            {/* Quick list preview */}
            {newHomeownersCount > 0 && (
              <div className="mt-3 bg-slate-50 rounded-lg p-2 text-[10px] text-slate-500 font-medium space-y-1">
                {newHomeownersList.slice(0, 2).map((r, i) => (
                  <div key={i} className="flex justify-between">
                    <span>👤 {r.fullName} (Unit {r.unitNumber})</span>
                    <span className="text-blue-600 font-semibold uppercase">{r.unitRole}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-slate-100 mt-4 pt-3 flex justify-between items-center text-xs">
              <span className="text-slate-400 font-semibold">Verify mobile applications</span>
              <span className="text-blue-600 font-bold group-hover:translate-x-1 transition-transform">Authorize Users →</span>
            </div>
          </div>

          {/* Card 3: Overdue Parcels */}
          <div 
            onClick={() => onNavigate('parcels-dormant')}
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-amber-400/50 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 group relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-2.5 h-full bg-amber-500"></div>
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Overdue Parcels</span>
                <h3 className="text-2xl font-black text-slate-800">
                  {overdueParcelCount} Unclaimed
                </h3>
                <p className="text-xs text-amber-600 font-bold">
                  📦 Abandoned cargo in parcel lobby
                </p>
              </div>
              <span className="text-2xl bg-amber-50 p-2.5 rounded-xl">📦</span>
            </div>
            <div className="border-t border-slate-100 mt-4 pt-3 flex justify-between items-center text-xs">
              <span className="text-slate-400 font-semibold">Check Unclaimed Cargo Sentry</span>
              <span className="text-blue-600 font-bold group-hover:translate-x-1 transition-transform">View Parcels →</span>
            </div>
          </div>

          {/* Card 4: New Job Orders */}
          <div 
            onClick={() => onNavigate('jobs-new')}
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-emerald-400/50 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 group relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-2.5 h-full bg-emerald-500"></div>
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">New Job Orders</span>
                <h3 className="text-2xl font-black text-slate-800">
                  {newJobsCount} Requests
                </h3>
                <p className="text-xs text-emerald-600 font-bold">
                  🛠️ Maintenance requests pending assignment
                </p>
              </div>
              <span className="text-2xl bg-emerald-50 p-2.5 rounded-xl">🛠️</span>
            </div>
            <div className="border-t border-slate-100 mt-4 pt-3 flex justify-between items-center text-xs">
              <span className="text-slate-400 font-semibold">Assign work orders to technicians</span>
              <span className="text-blue-600 font-bold group-hover:translate-x-1 transition-transform">Dispatch Jobs →</span>
            </div>
          </div>

          {/* Card 5: New Live Intercom Sessions */}
          <div 
            onClick={() => onNavigate('intercom')}
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-cyan-400/50 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 group relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-2.5 h-full bg-cyan-500"></div>
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Live Intercoms</span>
                <h3 className="text-2xl font-black text-slate-800">
                  {activeIntercomsCount} Active
                </h3>
                <p className="text-xs text-cyan-600 font-bold">
                  💬 Incoming visitor entry requests
                </p>
              </div>
              <span className="text-2xl bg-cyan-50 p-2.5 rounded-xl">💬</span>
            </div>
            <div className="border-t border-slate-100 mt-4 pt-3 flex justify-between items-center text-xs">
              <span className="text-slate-400 font-semibold">Open Live Video Matrix</span>
              <span className="text-blue-600 font-bold group-hover:translate-x-1 transition-transform">Join Intercom →</span>
            </div>
          </div>

          {/* Card 6: New Incident Reports / Sanctions */}
          <div 
            onClick={() => onNavigate('security')}
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-purple-400/50 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 group relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-2.5 h-full bg-purple-600"></div>
            <div className="flex justify-between items-start">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">New Security Reports</span>
                <h3 className="text-2xl font-black text-slate-800">
                  {activeReportsCount} Incident
                </h3>
                <p className="text-xs text-purple-600 font-bold">
                  🚨 Community rule violations reported
                </p>
              </div>
              <span className="text-2xl bg-purple-50 p-2.5 rounded-xl">🚨</span>
            </div>
            <div className="border-t border-slate-100 mt-4 pt-3 flex justify-between items-center text-xs">
              <span className="text-slate-400 font-semibold">Review guard logs & violations</span>
              <span className="text-blue-600 font-bold group-hover:translate-x-1 transition-transform">Security Center →</span>
            </div>
          </div>

        </div>
      )}

      {/* HQ Platform Issue Report Reply Feed */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm mt-8">
        <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4">
          <div className="space-y-0.5">
            <h3 className="font-extrabold text-slate-800 text-lg flex items-center gap-2">
              <span>🏢</span> HQ Platform Support Replies
            </h3>
            <p className="text-xs text-slate-500 font-semibold">
              Feedback from FiliCondo Headquarters operations regarding issues reported by your staff.
            </p>
          </div>
          {hqRepliesCount > 0 && (
            <span className="bg-blue-100 text-blue-800 text-xs px-3 py-1 rounded-full font-black">
              {hqRepliesCount} Replied
            </span>
          )}
        </div>

        {latestHqReply ? (
          <div 
            onClick={() => onNavigate('settings-report')}
            className="bg-slate-50 border border-slate-150 rounded-2xl p-5 hover:bg-slate-100/50 cursor-pointer transition flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
          >
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-slate-400 uppercase font-mono">Report #{latestHqReply.id.slice(0, 8)}</span>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                  latestHqReply.status === 'RESOLVED' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-850'
                }`}>
                  {latestHqReply.status}
                </span>
              </div>
              <h4 className="font-bold text-slate-800 text-sm">
                Subject: {latestHqReply.title}
              </h4>
              <p className="text-xs text-slate-600 line-clamp-2 max-w-3xl leading-relaxed">
                Description: {latestHqReply.description}
              </p>
              <div className="bg-blue-50/50 border border-blue-100/50 rounded-xl p-3 text-xs text-blue-900 mt-2 font-medium">
                <strong>💬 HQ Operational Update:</strong> This issue has been processed by the headquarters. Technical team has completed matching and resolution checks.
              </div>
            </div>
            
            <div className="shrink-0 text-right self-stretch flex md:flex-col justify-between md:justify-center items-end border-t md:border-t-0 border-slate-200/60 pt-3 md:pt-0 w-full md:w-auto">
              <span className="text-[10px] text-slate-400 font-bold block mb-1">Updated {new Date(latestHqReply.created_at).toLocaleDateString()}</span>
              <span className="text-xs text-blue-600 font-black uppercase hover:underline">View History →</span>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-400 text-sm font-semibold border border-dashed rounded-2xl">
            No active support tickets or replies from headquarters.
          </div>
        )}
      </div>

    </div>
  );
}
