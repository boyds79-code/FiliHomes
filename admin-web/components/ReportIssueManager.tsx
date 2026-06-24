"use client";

import React, { useState, useEffect } from 'react';
import { reportIssue, getIssues, PlatformIssue } from '../src/lib/platformService';

interface ReportIssueManagerProps {
  condoId: string;
}

export default function ReportIssueManager({ condoId }: ReportIssueManagerProps) {
  const [issues, setIssues] = useState<PlatformIssue[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<PlatformIssue['priority']>('MEDIUM');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchIssues = async () => {
    setLoading(true);
    try {
      const data = await getIssues(condoId);
      setIssues(data);
    } catch (e) {
      console.error("Failed to load platform issues:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIssues();
  }, [condoId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setErrorMsg('Please fill in both the title and the description.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await reportIssue({
        condo_id: condoId,
        title: title.trim(),
        description: description.trim(),
        reported_by: 'pmo-admin-user', // Simulated current PMO admin user ID
        reported_by_name: 'PMO Administrator',
        priority
      });

      setSuccessMsg('Your report has been successfully submitted to the platform support team.');
      setTitle('');
      setDescription('');
      setPriority('MEDIUM');
      
      // Refresh list
      await fetchIssues();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while submitting your report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            🛠️ Report Platform Issue
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Submit bugs, operational issues, or system requests directly to FiliCondo Platform Operator.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Submission Form Column */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl p-6 shadow-sm self-start">
          <h3 className="font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2 text-base">
            📝 New Report
          </h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="bg-red-50 text-red-700 p-3 rounded-lg text-xs font-semibold border border-red-100">
                ⚠️ {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="bg-emerald-50 text-emerald-700 p-3 rounded-lg text-xs font-semibold border border-emerald-100">
                ✅ {successMsg}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Issue Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief summary of the problem..."
                className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Detailed Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Explain the issue, steps to reproduce, or requested changes in detail..."
                className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition resize-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Priority Level
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as PlatformIssue['priority'])}
                className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition font-medium"
              >
                <option value="LOW">🟢 Low - Minor bug / cosmetic request</option>
                <option value="MEDIUM">🟡 Medium - Functional issue with workaround</option>
                <option value="HIGH">🔴 High - Blocking core operations</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`w-full bg-blue-700 text-white py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                submitting ? 'opacity-60 cursor-not-allowed' : 'hover:bg-blue-800 active:bg-blue-900'
              }`}
            >
              {submitting ? 'Submitting Report...' : 'Send to Operator'}
            </button>
          </form>
        </div>

        {/* History / Status Tracker Column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm min-h-[400px] flex flex-col">
            <h3 className="font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center justify-between text-base">
              <span>📋 Submission History</span>
              <button 
                onClick={fetchIssues} 
                className="text-xs text-blue-700 hover:text-blue-800 font-bold flex items-center gap-1"
                title="Refresh logs"
              >
                🔄 Refresh
              </button>
            </h3>

            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
                <p className="text-xs text-slate-400 mt-3 font-semibold">Loading ticket history...</p>
              </div>
            ) : issues.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-400">
                <span className="text-3xl mb-2">🎈</span>
                <p className="text-sm font-semibold">No issues reported yet.</p>
                <p className="text-xs text-slate-500 mt-1">If you notice any bugs, use the form to alert our engineering team.</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {issues.map((issue) => (
                  <div 
                    key={issue.id} 
                    className="border border-slate-100 rounded-xl p-4 hover:border-slate-200 hover:bg-slate-50/50 transition duration-150"
                  >
                    <div className="flex justify-between items-start gap-4 mb-2">
                      <h4 className="font-bold text-slate-800 text-sm">{issue.title}</h4>
                      <div className="flex gap-2">
                        {/* Priority Badge */}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          issue.priority === 'HIGH' 
                            ? 'bg-red-50 text-red-700 border border-red-100' 
                            : issue.priority === 'MEDIUM' 
                              ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                              : 'bg-slate-50 text-slate-500 border border-slate-100'
                        }`}>
                          {issue.priority}
                        </span>
                        
                        {/* Status Badge */}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          issue.status === 'RESOLVED' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : issue.status === 'IN_PROGRESS' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {issue.status}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-3 mb-3 leading-relaxed">
                      {issue.description}
                    </p>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold border-t border-slate-50 pt-2">
                      <span>Ticket: #{issue.id.substring(0, 8)}</span>
                      <span>{new Date(issue.created_at).toLocaleDateString()} {new Date(issue.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
