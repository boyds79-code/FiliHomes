"use client";

import React, { useState, useEffect } from 'react';

interface Notice {
  id: number;
  condo_id: string;
  title: string;
  content: string;
  category: 'GENERAL' | 'EMERGENCY' | 'FACILITIES' | 'EVENT';
  is_pinned: boolean;
  created_at: string;
}

export default function NoticeManager({ condoId }: { condoId: string }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [editingNoticeId, setEditingNoticeId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<'GENERAL' | 'EMERGENCY' | 'FACILITIES' | 'EVENT'>('GENERAL');
  const [isPinned, setIsPinned] = useState(false);

  useEffect(() => {
    fetchNotices();
  }, [condoId]);

  const fetchNotices = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/notices?condoId=${condoId}`);
      if (!response.ok) throw new Error("Failed to fetch notices");
      const data = await response.json();
      setNotices(data || []);
    } catch (err) {
      console.error("Error fetching notices:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (notice: Notice) => {
    setEditingNoticeId(notice.id);
    setTitle(notice.title);
    setContent(notice.content);
    setCategory(notice.category);
    setIsPinned(notice.is_pinned);
    setFormMsg(null);
  };

  const handleCancelEdit = () => {
    setEditingNoticeId(null);
    setTitle('');
    setContent('');
    setCategory('GENERAL');
    setIsPinned(false);
    setFormMsg(null);
  };

  const handlePublishNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setFormMsg({ type: 'error', text: 'Please fill in both the title and content fields.' });
      return;
    }

    setSubmitting(true);
    setFormMsg(null);

    const isEditMode = editingNoticeId !== null;

    try {
      const url = '/api/admin/notices';
      const method = isEditMode ? 'PUT' : 'POST';
      const payload = {
        title: title.trim(),
        content: content.trim(),
        category,
        is_pinned: isPinned,
        condoId,
        ...(isEditMode && { id: editingNoticeId })
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Failed to ${isEditMode ? 'update' : 'publish'} notice`);
      }

      setFormMsg({ 
        type: 'success', 
        text: isEditMode 
          ? 'Notice updated successfully!' 
          : 'Notice published successfully! Residents have been notified.' 
      });
      
      // Clear Form & Exit Edit Mode
      setTitle('');
      setContent('');
      setCategory('GENERAL');
      setIsPinned(false);
      setEditingNoticeId(null);

      // Refresh list
      fetchNotices();
    } catch (err: any) {
      console.error(`Error ${isEditMode ? 'updating' : 'publishing'} notice:`, err);
      setFormMsg({ type: 'error', text: err.message || `An error occurred while ${isEditMode ? 'updating' : 'publishing'}.` });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteNotice = async (id: number) => {
    if (!confirm('Are you sure you want to delete this notice? This action cannot be undone.')) return;

    try {
      const response = await fetch(`/api/admin/notices?id=${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error("Failed to delete notice");

      fetchNotices();
    } catch (err) {
      console.error("Error deleting notice:", err);
      alert("Failed to delete notice.");
    }
  };

  const getCategoryColor = (cat: string, isPinned: boolean) => {
    if (isPinned) return 'bg-red-50 text-red-600 border border-red-200';
    switch (cat) {
      case 'EMERGENCY': return 'bg-red-100 text-red-700 border border-red-200';
      case 'FACILITIES': return 'bg-sky-100 text-sky-700 border border-sky-200';
      case 'EVENT': return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
      default: return 'bg-slate-100 text-slate-700 border border-slate-200';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      {/* 📝 Notice Composer Form */}
      <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm self-start">
        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span>📢</span> {editingNoticeId ? 'Edit Notice' : 'Compose New Notice'}
          </span>
          {editingNoticeId && (
            <button 
              type="button" 
              onClick={handleCancelEdit}
              className="text-xs text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg font-bold transition duration-150"
            >
              Cancel Edit
            </button>
          )}
        </h3>

        <form onSubmit={handlePublishNotice} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Notice Title</label>
            <input 
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Elevator B Maintenance Scheduled"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              disabled={submitting}
            >
              <option value="GENERAL">📢 General Announcement</option>
              <option value="EMERGENCY">🚨 Emergency Notice</option>
              <option value="FACILITIES">🏊 Facilities Closure / Alert</option>
              <option value="EVENT">🎉 Community Event</option>
            </select>
          </div>

          <div className="flex items-center gap-3 py-2">
            <input 
              type="checkbox"
              id="isPinned"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="w-4.5 h-4.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
              disabled={submitting}
            />
            <label htmlFor="isPinned" className="text-sm font-semibold text-slate-700 cursor-pointer">
              📌 Pin this notice to the top of the board
            </label>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Detailed Content</label>
            <textarea 
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Provide all details about the announcement..."
              rows={6}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
              disabled={submitting}
            />
          </div>

          {formMsg && (
            <div className={`p-4 rounded-xl text-sm font-semibold ${
              formMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {formMsg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={`w-full text-white font-bold py-3 px-4 rounded-xl transition duration-150 shadow-sm disabled:opacity-50 ${
              editingNoticeId ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {submitting 
              ? (editingNoticeId ? 'Updating...' : 'Publishing & Notifying...') 
              : (editingNoticeId ? '💾 Save Changes' : '⚡ Publish Announcement')
            }
          </button>
        </form>
      </div>

      {/* 📋 Bulletins Ledger (List of notices) */}
      <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
          <span>📋</span> Bulletin Board Ledger
        </h3>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-400 mb-4"></div>
            <p className="text-sm font-medium">Fetching board bulletins...</p>
          </div>
        ) : notices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-100 rounded-2xl text-slate-400">
            <span className="text-4xl mb-4">📭</span>
            <p className="text-sm font-semibold">No announcements have been published yet.</p>
            <p className="text-xs text-slate-400 mt-1">Compose a notice on the left to broadcast to residents.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notices.map((notice) => (
              <div 
                key={notice.id} 
                className={`p-5 rounded-2xl border transition duration-150 hover:shadow-md flex flex-col justify-between md:flex-row gap-4 ${
                  notice.is_pinned ? 'border-red-200 bg-red-50/20' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase ${getCategoryColor(notice.category, notice.is_pinned)}`}>
                      {notice.is_pinned ? '📌 PINNED' : notice.category}
                    </span>
                    <span className="text-xs text-slate-400 font-semibold">
                      {new Date(notice.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>

                  <h4 className={`text-base font-bold ${notice.is_pinned ? 'text-red-700' : 'text-slate-800'}`}>
                    {notice.title}
                  </h4>

                  <p className="text-sm text-slate-500 whitespace-pre-wrap leading-relaxed">
                    {notice.content}
                  </p>
                </div>

                <div className="flex md:flex-col justify-end items-end gap-2 shrink-0 md:w-32">
                  <button
                    onClick={() => handleStartEdit(notice)}
                    className="w-full px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 text-xs font-bold transition duration-150"
                  >
                    Edit Notice
                  </button>
                  <button
                    onClick={() => handleDeleteNotice(notice.id)}
                    className="w-full px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition duration-150"
                  >
                    Delete Notice
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
