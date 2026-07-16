"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabaseClient';

interface Unit {
  id: string;
  unit_number: string;
  tower_name: string;
}

interface Occupant {
  id: string;
  role: string;
  status: string;
  lease_start_date: string | null;
  lease_end_date: string | null;
  is_payer: boolean;
  created_at: string;
  unit_id: string;
  units: {
    unit_number: string;
    tower_name: string;
  } | null;
  profiles: {
    id: string;
    email: string;
    phone: string | null;
    full_name: string | null;
    role: string;
  } | null;
}

interface OccupantManagerProps {
  condoId: string;
  initialTab?: 'DIRECTORY' | 'REGISTER' | 'REQUESTS' | 'INVITATIONS';
}

export default function OccupantManager({ condoId, initialTab = 'DIRECTORY' }: OccupantManagerProps) {
  const [occupants, setOccupants] = useState<Occupant[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'DIRECTORY' | 'REGISTER' | 'REQUESTS' | 'INVITATIONS'>(initialTab);
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('');

  // Form state
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [unitRole, setUnitRole] = useState<'owner' | 'co_owner' | 'property_manager' | 'family_member' | 'tenant' | 'short_term_renter'>('family_member');
  const [leaseStartDate, setLeaseStartDate] = useState('');
  const [leaseEndDate, setLeaseEndDate] = useState('');
  const [isPayer, setIsPayer] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Inline edit state
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<'owner' | 'co_owner' | 'property_manager' | 'family_member' | 'tenant' | 'short_term_renter'>('family_member');
  const [editIsPayer, setEditIsPayer] = useState(true);
  const [editLeaseStartDate, setEditLeaseStartDate] = useState('');
  const [editLeaseEndDate, setEditLeaseEndDate] = useState('');
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  // Document uploader and modify-requests states
  const [editDocName, setEditDocName] = useState('');
  const [editDocUrl, setEditDocUrl] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  // Modify requests sub-tabs and data states
  const [requestSubTab, setRequestSubTab] = useState<'REGISTRATION' | 'MODIFICATION' | 'HISTORY'>('REGISTRATION');
  const [modificationRequests, setModificationRequests] = useState<any[]>([]);
  const [modLoading, setModLoading] = useState(false);

  // Registration requests state
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);

  // Invitation states
  const [invitations, setInvitations] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteUnitId, setInviteUnitId] = useState('');
  const [inviteRole, setInviteRole] = useState<'owner' | 'co_owner' | 'family_member' | 'tenant' | 'short_term_renter'>('tenant');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loadingInvites, setLoadingInvites] = useState(false);

  const fetchInvitations = async () => {
    try {
      setLoadingInvites(true);
      const response = await fetch(`/api/admin/occupants/invite?condoId=${condoId}`);
      if (!response.ok) throw new Error("Failed to fetch invitations");
      const data = await response.json();
      setInvitations(data || []);
    } catch (err) {
      console.error("Error fetching invitations:", err);
    } finally {
      setLoadingInvites(false);
    }
  };

  const handleRevokeInvitation = async (inviteId: string) => {
    if (!confirm("Are you sure you want to cancel this invitation? This will invalidate the invite code immediately.")) return;
    try {
      const response = await fetch(`/api/admin/occupants/invite?inviteId=${inviteId}`, {
        method: 'DELETE'
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to cancel invitation");

      alert("Invitation cancelled and invalidated successfully!");
      fetchInvitations();
    } catch (err: any) {
      alert("Failed to cancel invitation: " + (err.message || err));
    }
  };

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteUnitId) {
      setInviteMsg({ type: 'error', text: 'Email and target unit are required.' });
      return;
    }
    setInviteMsg(null);
    setInviting(true);

    try {
      const response = await fetch('/api/admin/occupants/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          condoId,
          invitations: [
            {
              email: inviteEmail.trim(),
              unitId: inviteUnitId,
              role: inviteRole
            }
          ]
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to send invitation');
      }

      setInviteMsg({ type: 'success', text: `Invitation sent successfully to ${inviteEmail}!` });
      setInviteEmail('');
      setInviteUnitId('');
      fetchInvitations();
    } catch (err: any) {
      setInviteMsg({ type: 'error', text: err.message || 'Invitation failed.' });
    } finally {
      setInviting(false);
    }
  };

  const fetchModificationRequests = async () => {
    setModLoading(true);
    try {
      const response = await fetch('/api/admin/occupants/modify-requests');
      if (!response.ok) throw new Error("Failed to fetch modification requests");
      const data = await response.json();
      setModificationRequests(data || []);
    } catch (err) {
      console.error("Error fetching modification requests:", err);
    } finally {
      setModLoading(false);
    }
  };

  useEffect(() => {
    // Make sure initialTab prop is respected when it changes
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (activeTab === 'REQUESTS') {
      fetchModificationRequests();
    } else if (activeTab === 'INVITATIONS') {
      fetchInvitations();
    }
  }, [activeTab]);

  // Load and sync pending requests
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('filihomes_occupant_requests');
      if (stored) {
        setPendingRequests(JSON.parse(stored));
      } else {
        const defaults = [
          {
            id: 'req-1',
            fullName: 'Michael Jordan',
            email: 'mj23@bulls.com',
            phone: '+63 917 232 3000',
            unitId: '',
            unitNumber: '101',
            towerName: 'Tower A',
            unitRole: 'owner',
            isPayer: true,
            created_at: new Date().toISOString()
          },
          {
            id: 'req-2',
            fullName: 'LeBron James',
            email: 'kingjames@lakers.com',
            phone: '+63 917 232 0023',
            unitId: '',
            unitNumber: '202',
            towerName: 'Tower A',
            unitRole: 'owner',
            isPayer: false,
            created_at: new Date(Date.now() - 3600000).toISOString()
          },
          {
            id: 'req-3',
            fullName: 'Stephen Curry',
            email: 'chefcurry@warriors.com',
            phone: '+63 917 303 3030',
            unitId: '',
            unitNumber: '303',
            towerName: 'Tower B',
            unitRole: 'tenant',
            isPayer: true,
            created_at: new Date(Date.now() - 7200000).toISOString()
          }
        ];
        window.localStorage.setItem('filihomes_occupant_requests', JSON.stringify(defaults));
        setPendingRequests(defaults);
        // Dispatch event for dashboard to count it
        window.dispatchEvent(new Event('occupantRequestsUpdated'));
      }
    }
  }, []);

  useEffect(() => {
    fetchUnits();
    fetchOccupants();
  }, [condoId]);

  const fetchUnits = async () => {
    try {
      const response = await fetch(`/api/admin/units?condoId=${condoId}`);
      if (!response.ok) throw new Error("Failed to fetch units list");
      const data = await response.json();
      setUnits(data || []);

      // Dynamically match simulated requests with actual DB Unit IDs to prevent constraint failures
      if (data && data.length > 0) {
        setPendingRequests(prev => {
          const updated = prev.map((req, idx) => {
            const matchedUnit = data.find((u: any) => u.unit_number === req.unitNumber) || data[idx % data.length];
            return {
              ...req,
              unitId: matchedUnit?.id || req.unitId,
              unitNumber: matchedUnit?.unit_number || req.unitNumber,
              towerName: matchedUnit?.tower_name || req.towerName
            };
          });
          window.localStorage.setItem('filihomes_occupant_requests', JSON.stringify(updated.filter(r => r.id.startsWith('req-'))));
          return updated;
        });
      }
    } catch (err) {
      console.error("Error fetching units:", err);
    }
  };

  const fetchOccupants = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/occupants?condoId=${condoId}`);
      if (!response.ok) throw new Error("Failed to fetch occupants list");
      const data = await response.json();
      setOccupants(data || []);

      // Fetch vehicles to display in the occupant directory
      const { data: vData, error: vErr } = await supabase
        .from('vehicles')
        .select('*');
      if (!vErr && vData) {
        setVehicles(vData);
      }

      // Sync database pending requests to localStorage
      const dbPending = (data || [])
        .filter((occ: any) => occ.status === 'pending')
        .map((occ: any) => ({
          id: occ.id,
          fullName: occ.profiles?.full_name || 'N/A',
          email: occ.profiles?.email || 'N/A',
          phone: occ.profiles?.phone || null,
          unitId: occ.unit_id,
          unitNumber: occ.units?.unit_number || 'N/A',
          towerName: occ.units?.block_phase_no || '',
          unitRole: occ.role,
          isPayer: occ.is_payer,
          created_at: occ.created_at,
          documentName: occ.document_name || null,
          documentUrl: occ.document_url || null
        }));

      const stored = window.localStorage.getItem('filihomes_occupant_requests');
      const localRequests = stored ? JSON.parse(stored) : [];
      // Keep only mock requests from local storage
      const mockRequests = localRequests.filter((r: any) => r.id.startsWith('req-'));
      // Combine them
      const combined = [...dbPending, ...mockRequests.filter((mr: any) => !dbPending.some((db: any) => db.email.toLowerCase() === mr.email.toLowerCase()))];
      
      setPendingRequests(combined);
      window.localStorage.setItem('filihomes_occupant_requests', JSON.stringify(combined));
      window.dispatchEvent(new Event('occupantRequestsUpdated'));
    } catch (err) {
      console.error("Error fetching occupants:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      
      const sheetData = filteredOccupants.map(occ => ({
        'House/Lot Number': occ.units?.unit_number || 'N/A',
        'Block/Phase': occ.units?.tower_name || 'N/A',
        'Full Name': occ.profiles?.full_name || 'N/A',
        'Email Address': occ.profiles?.email || 'N/A',
        'Phone Number': occ.profiles?.phone || 'N/A',
        'Unit Role': occ.role || 'N/A',
        'Billing Payer': occ.is_payer ? 'Yes' : 'No',
        'Status/Lease': occ.role === 'tenant' 
          ? (occ.lease_start_date && occ.lease_end_date 
              ? `${new Date(occ.lease_start_date).toLocaleDateString()} - ${new Date(occ.lease_end_date).toLocaleDateString()}` 
              : 'Leasing') 
          : 'Permanent'
      }));
      
      const worksheet = XLSX.utils.json_to_sheet(sheetData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Occupants Directory');
      XLSX.writeFile(workbook, `Occupants_Directory_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error('Failed to export excel:', err);
      alert('Failed to export occupants directory to Excel. Try again.');
    }
  };

  const handleRegisterOccupant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !selectedUnitId || !fullName) {
      setFormMsg({ type: 'error', text: 'Please fill in all required fields (Unit, Name, Email).' });
      return;
    }

    setSubmitting(true);
    setFormMsg(null);

    try {
      const payload = {
        email,
        fullName,
        phone: phone || null,
        unitId: selectedUnitId,
        condoId,
        unitRole,
        leaseStartDate: unitRole === 'tenant' && leaseStartDate ? leaseStartDate : null,
        leaseEndDate: unitRole === 'tenant' && leaseEndDate ? leaseEndDate : null,
        isPayer
      };

      const response = await fetch('/api/admin/occupants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to register occupant');
      }

      setFormMsg({
        type: 'success',
        text: result.message || 'Occupant registered successfully!'
      });

      // Reset form
      setEmail('');
      setFullName('');
      setPhone('');
      setSelectedUnitId('');
      setUnitRole('family_member');
      setLeaseStartDate('');
      setLeaseEndDate('');
      setIsPayer(true);

      // Refresh occupant list
      fetchOccupants();
    } catch (err: any) {
      setFormMsg({ type: 'error', text: err.message || 'An unexpected error occurred.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveRequest = async (req: any) => {
    try {
      if (!req.unitId) {
        alert("Cannot approve: No valid Unit matching in the system.");
        return;
      }
      
      const payload = {
        email: req.email,
        fullName: req.fullName,
        phone: req.phone || null,
        unitId: req.unitId,
        condoId,
        unitRole: req.unitRole,
        leaseStartDate: null,
        leaseEndDate: null,
        isPayer: req.isPayer
      };

      const response = await fetch('/api/admin/occupants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to approve homeowner request');
      }

      alert(`Success: ${req.fullName} is now registered and linked to Unit ${req.unitNumber}!`);
      
      const updated = pendingRequests.filter(r => r.id !== req.id);
      setPendingRequests(updated);
      window.localStorage.setItem('filihomes_occupant_requests', JSON.stringify(updated.filter(r => r.id.startsWith('req-'))));
      
      // Dispatch custom event to notify components (like Dashboard)
      window.dispatchEvent(new Event('occupantRequestsUpdated'));
      
      fetchOccupants();
    } catch (err: any) {
      alert(err.message || 'Approval processing failed.');
    }
  };

  const handleRejectRequest = async (reqId: string, name: string) => {
    if (!confirm(`Are you sure you want to reject the homeowner registration request from ${name}?`)) {
      return;
    }
    try {
      if (!reqId.startsWith('req-')) {
        const response = await fetch(`/api/admin/occupants?id=${reqId}`, {
          method: 'DELETE'
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error || 'Failed to reject homeowner request');
        }
      }
      const updated = pendingRequests.filter(r => r.id !== reqId);
      setPendingRequests(updated);
      window.localStorage.setItem('filihomes_occupant_requests', JSON.stringify(updated.filter(r => r.id.startsWith('req-'))));
      window.dispatchEvent(new Event('occupantRequestsUpdated'));
      fetchOccupants();
    } catch (err: any) {
      alert(err.message || 'Rejection failed.');
    }
  };

  const handleUnlinkOccupant = async (mappingId: string, residentName: string) => {
    if (!confirm(`Are you sure you want to remove ${residentName || 'this resident'} from this unit? This will revoke their access.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/occupants?id=${mappingId}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to unlink occupant');
      }

      fetchOccupants();
    } catch (err: any) {
      alert(err.message || 'Failed to remove occupant');
    }
  };

  const handleStartEdit = (occ: Occupant) => {
    setEditingRowId(occ.id);
    setEditFullName(occ.profiles?.full_name || '');
    setEditPhone(occ.profiles?.phone || '');
    setEditRole(occ.role as any);
    setEditIsPayer(occ.is_payer);
    setEditLeaseStartDate(occ.lease_start_date ? occ.lease_start_date.slice(0, 10) : '');
    setEditLeaseEndDate(occ.lease_end_date ? occ.lease_end_date.slice(0, 10) : '');
    setEditDocName('');
    setEditDocUrl('');
    setUploadProgress(0);
  };

  const handleCancelEdit = () => {
    setEditingRowId(null);
    setEditDocName('');
    setEditDocUrl('');
    setUploadProgress(0);
  };

  const handleSaveEdit = async (mappingId: string) => {
    if (!editDocUrl) {
      alert("A verification document (e.g. lease contract, ownership deed) is required to request occupant profile modifications.");
      return;
    }

    setSavingRowId(mappingId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const requestedBy = user?.email || 'admin@filihomes.com';

      const response = await fetch('/api/admin/occupants/modify-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappingId,
          requestedBy,
          fullName: editFullName.trim(),
          phone: editPhone.trim() || null,
          unitRole: editRole,
          isPayer: editIsPayer,
          leaseStartDate: editRole === 'tenant' && editLeaseStartDate ? editLeaseStartDate : null,
          leaseEndDate: editRole === 'tenant' && editLeaseEndDate ? editLeaseEndDate : null,
          documentName: editDocName,
          documentUrl: editDocUrl
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit directory modification request');
      }

      alert("Directory modification request has been submitted for supervisor approval!");
      setEditingRowId(null);
      setEditDocName('');
      setEditDocUrl('');
      setUploadProgress(0);
      
      // Refresh requests lists
      fetchModificationRequests();
      fetchOccupants();
    } catch (err: any) {
      alert(err.message || "Request submission failed.");
    } finally {
      setSavingRowId(null);
    }
  };

  const handleMockUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setEditDocName(file.name);
    setUploadProgress(10);
    
    // Simulate upload progress
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setEditDocUrl(`https://asqgyncyqnbmitkubjwq.supabase.co/storage/v1/object/public/documents/verification/${encodeURIComponent(file.name)}`);
          return 100;
        }
        return prev + 30;
      });
    }, 150);
  };

  const handleApproveModification = async (requestId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const approvedBy = user?.email || 'admin@filihomes.com';

      const response = await fetch('/api/admin/occupants/modify-requests/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          action: 'approve',
          approvedBy
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to approve modification request');
      }

      alert("Directory modification request approved and successfully applied!");
      fetchModificationRequests();
      fetchOccupants(); // Refresh directory list
    } catch (err: any) {
      alert(err.message || 'Approval failed.');
    }
  };

  const handleRejectModification = async (requestId: string) => {
    if (!confirm("Are you sure you want to reject this modification request?")) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const approvedBy = user?.email || 'admin@filihomes.com';

      const response = await fetch('/api/admin/occupants/modify-requests/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          action: 'reject',
          approvedBy
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to reject modification request');
      }

      alert("Directory modification request rejected.");
      fetchModificationRequests();
    } catch (err: any) {
      alert(err.message || 'Rejection failed.');
    }
  };

  const getLeaseStatusBadge = (occupant: Occupant) => {
    if (occupant.role !== 'tenant') return null;
    if (!occupant.lease_end_date) return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-600">No Limit</span>;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const leaseEnd = new Date(occupant.lease_end_date);
    leaseEnd.setHours(0, 0, 0, 0);

    if (leaseEnd < today) {
      return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-100 text-red-700">Expired</span>;
    } else {
      return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-green-100 text-green-700">Leasing</span>;
    }
  };

  // Filter occupants list
  const filteredOccupants = occupants.filter((occ) => {
    const profile = occ.profiles;
    const nameMatch = profile?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
    const emailMatch = profile?.email?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
    const phoneMatch = profile?.phone?.includes(searchQuery) || false;
    const unitMatch = occ.units?.unit_number?.toLowerCase().includes(searchQuery.toLowerCase()) || false;
    const queryMatch = nameMatch || emailMatch || phoneMatch || unitMatch;

    const unitFilterMatch = !selectedUnitFilter || occ.unit_id === selectedUnitFilter;
    const roleFilterMatch = !selectedRoleFilter || occ.role === selectedRoleFilter;
    const activeStatusMatch = occ.status === 'active';

    return queryMatch && unitFilterMatch && roleFilterMatch && activeStatusMatch;
  });

  return (
    <div className="space-y-6">
      {activeTab === 'INVITATIONS' && (
        <div className="w-full space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800">✉️ Invite Resident</h3>
            <p className="text-xs text-slate-500 mt-1">
              Send a unique 6-digit registration code to a resident's email.
            </p>

            <form onSubmit={handleSendInvitation} className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="resident@email.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500 font-sans"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Target Unit</label>
                <select
                  value={inviteUnitId}
                  onChange={(e) => setInviteUnitId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                  required
                >
                  <option value="">Select Unit...</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.tower_name ? `${u.tower_name} - ` : ''}Unit {u.unit_number}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Role Type</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="owner">Home Owner</option>
                  <option value="co_owner">Co-Owner</option>
                  <option value="family_member">Family Member</option>
                  <option value="tenant">Tenant</option>
                  <option value="short_term_renter">Short-term Renter</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={inviting}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm py-2 px-4 rounded-lg transition-colors disabled:bg-blue-300 h-[38px] flex items-center justify-center cursor-pointer"
                >
                  {inviting ? "Sending..." : "Send Invitation"}
                </button>
              </div>
            </form>

            {inviteMsg && (
              <div className={`mt-4 p-3 rounded-lg text-sm font-semibold ${
                inviteMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {inviteMsg.text}
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800">📋 Invitation History</h3>
            <p className="text-xs text-slate-500 mt-1">
              List of sent invitation codes and their registration status.
            </p>

            <div className="overflow-x-auto mt-6">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Recipient</th>
                    <th className="py-3 px-4">Assigned Unit</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4 text-center">Invite Code</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Issued Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {loadingInvites ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                        Loading invitations history...
                      </td>
                    </tr>
                  ) : invitations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                        No invitations sent yet for this condo.
                      </td>
                    </tr>
                  ) : (
                    invitations.map((invite) => {
                      const isExpired = new Date(invite.expired_at) < new Date();
                      return (
                        <tr key={invite.id} className="hover:bg-slate-50/50">
                          <td className="py-4 px-4 font-semibold text-slate-800">{invite.email}</td>
                          <td className="py-4 px-4">
                            {invite.units?.block_phase_no ? `${invite.units.block_phase_no} - ` : ''}Unit {invite.units?.unit_number}
                          </td>
                          <td className="py-4 px-4 capitalize font-medium">{invite.role.replace('_', ' ')}</td>
                          <td className="py-4 px-4 text-center">
                            <span className="font-mono font-bold text-blue-600 bg-blue-50/50 rounded px-2.5 py-1">
                              {invite.invite_code}
                            </span>
                          </td>
                          <td className="py-4 px-4">
                            {invite.is_used ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-green-50 text-green-700 border border-green-200">
                                Used
                              </span>
                            ) : isExpired ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-50 text-red-700 border border-red-200">
                                Expired
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="py-4 px-4 text-slate-400 text-xs font-mono">
                            {new Date(invite.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-4 px-4 text-right">
                            {!invite.is_used && !isExpired && (
                              <button
                                onClick={() => handleRevokeInvitation(invite.id)}
                                className="text-[11px] font-bold text-red-600 hover:text-red-800 hover:underline border border-red-200 bg-red-50/50 hover:bg-red-50 px-2 py-1 rounded transition"
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'REGISTER' && (
        <div className="max-w-2xl mx-auto w-full">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <span>👤</span> Pre-Approve Upcoming Resident
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-normal">
                Pre-authorizing planned residents prevents unauthorized sign-ups. When users download the app and sign up with this email, they are automatically mapped to their Unit.
              </p>
            </div>

            <form onSubmit={handleRegisterOccupant} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">House/Lot *</label>
                <select
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Choose Unit --</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.unit_number} {unit.tower_name ? `(${unit.tower_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Full Name *</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Email Address *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. john@example.com"
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Phone Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +63 917 123 4567"
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase">Role in Unit</label>
                <select
                  value={unitRole}
                  onChange={(e) => setUnitRole(e.target.value as any)}
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="owner">Owner (Primary)</option>
                  <option value="co_owner">Co-Owner</option>
                  <option value="property_manager">Property Manager (Proxy)</option>
                  <option value="family_member">Family Member</option>
                  <option value="tenant">Tenant (Renter)</option>
                  <option value="short_term_renter">Short-term Renter</option>
                </select>
              </div>

              {/* Conditional Tenant Fields */}
              {unitRole === 'tenant' && (
                <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-3">
                  <p className="text-xs font-bold text-blue-700">Lease Agreement Validity</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Start Date</label>
                      <input
                        type="date"
                        value={leaseStartDate}
                        onChange={(e) => setLeaseStartDate(e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded p-2 focus:outline-none bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">End Date</label>
                      <input
                        type="date"
                        value={leaseEndDate}
                        onChange={(e) => setLeaseEndDate(e.target.value)}
                        className="w-full text-xs border border-slate-200 rounded p-2 focus:outline-none bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 py-2">
                <input
                  type="checkbox"
                  id="isPayer"
                  checked={isPayer}
                  onChange={(e) => setIsPayer(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
                <label htmlFor="isPayer" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
                  Responsible for Billing (Payer)
                </label>
              </div>

              {formMsg && (
                <div className={`p-3 rounded-lg text-xs font-semibold ${
                  formMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {formMsg.text}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold p-3 rounded-xl transition text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? 'Registering...' : '💾 Save Occupant Credential'}
              </button>
            </form>

            {/* User Guideline Box */}
            <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-2">
              <p className="font-bold text-slate-800">🔑 Credentials & Setup Details:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Assigned temporary password: <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">password123</code></li>
                <li>Residents will be prompted to change their password on the first login screen.</li>
                <li>Lease termination automatically revokes mobile permissions and visitor passes.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'REQUESTS' && (
        <div className="w-full animate-fade-in">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">🛎️ Resident Request & Audit Center</h3>
              <p className="text-xs text-slate-500 mt-1">
                Manage mobile user registrations, view document verifications, and audit occupant modification approvals.
              </p>
            </div>

            {/* Sub-tab Navigation */}
            <div className="flex border-b border-slate-200">
              <button
                onClick={() => setRequestSubTab('REGISTRATION')}
                className={`py-3 px-4 text-xs font-bold transition-all relative flex items-center gap-2 ${
                  requestSubTab === 'REGISTRATION'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>👤 Resident Registrations</span>
                {pendingRequests.length > 0 && (
                  <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-black">
                    {pendingRequests.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setRequestSubTab('MODIFICATION')}
                className={`py-3 px-4 text-xs font-bold transition-all relative flex items-center gap-2 ${
                  requestSubTab === 'MODIFICATION'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>✏️ Directory Changes</span>
                {modificationRequests.filter(r => r.status === 'pending').length > 0 && (
                  <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-black">
                    {modificationRequests.filter(r => r.status === 'pending').length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setRequestSubTab('HISTORY')}
                className={`py-3 px-4 text-xs font-bold transition-all relative flex items-center gap-2 ${
                  requestSubTab === 'HISTORY'
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>📜 Audit History Logs</span>
              </button>
            </div>

            {/* Registration Requests Tab */}
            {requestSubTab === 'REGISTRATION' && (
              <div className="space-y-4">
                <div className="mb-2">
                  <h4 className="font-bold text-slate-800 text-sm">Resident Registrations</h4>
                  <p className="text-slate-500 text-xs mt-0.5">Approve new user registration requests submitted via mobile app.</p>
                </div>
                {pendingRequests.length === 0 ? (
                  <div className="py-20 text-center text-slate-400 text-sm font-semibold border border-dashed border-slate-200 rounded-2xl bg-slate-50/20">
                    🎉 No pending registration requests at the moment.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-100 rounded-xl">
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-black tracking-wider">
                        <tr>
                          <th className="py-3 px-4">Resident Info</th>
                          <th className="py-3 px-4">Requested Unit</th>
                          <th className="py-3 px-4">Requested Role</th>
                          <th className="py-3 px-4">Payer Status</th>
                          <th className="py-3 px-4">Verification Doc</th>
                          <th className="py-3 px-4">Request Date</th>
                          <th className="py-3 px-4 text-right">Verification Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pendingRequests.map((req) => (
                          <tr key={req.id} className="hover:bg-slate-50/50 transition">
                            <td className="py-4 px-4">
                              <div className="font-bold text-slate-800">{req.fullName}</div>
                              <div className="text-[11px] text-slate-400">{req.email}</div>
                              {req.phone && <div className="text-[10px] text-slate-400 font-mono mt-0.5">{req.phone}</div>}
                            </td>
                            <td className="py-4 px-4">
                              <span className="font-bold text-slate-700">Unit {req.unitNumber}</span>
                              <span className="text-[10px] text-slate-400 block">{req.towerName}</span>
                            </td>
                            <td className="py-4 px-4 font-semibold capitalize text-slate-700">
                              {req.unitRole}
                            </td>
                            <td className="py-4 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                req.isPayer ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-50 text-slate-400'
                              }`}>
                                {req.isPayer ? 'Responsible' : 'Non-payer'}
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              {req.documentUrl ? (
                                <a 
                                  href={req.documentUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-blue-600 font-bold hover:underline"
                                  title={req.documentName}
                                >
                                  📄 View Contract
                                </a>
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">No file</span>
                              )}
                            </td>
                            <td className="py-4 px-4 text-slate-400 font-medium">
                              {new Date(req.created_at).toLocaleDateString()}
                            </td>
                            <td className="py-4 px-4 text-right space-x-2">
                              <button
                                onClick={() => handleRejectRequest(req.id, req.fullName)}
                                className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg text-[11px] font-bold transition border border-red-100"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => handleApproveRequest(req)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold transition border border-emerald-700"
                              >
                                Approve
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Directory Modification Change Requests */}
            {requestSubTab === 'MODIFICATION' && (
              <div className="space-y-4">
                <div className="mb-2">
                  <h4 className="font-bold text-slate-800 text-sm">Directory Change Requests</h4>
                  <p className="text-slate-500 text-xs mt-0.5 font-sans">Review updates to occupant profiles. All changes must be verified against documents and approved by a supervisor.</p>
                </div>
                {modLoading ? (
                  <div className="py-20 text-center text-slate-400 text-sm font-semibold">
                    <span className="animate-spin mr-2">⚙️</span> Loading changes...
                  </div>
                ) : modificationRequests.filter(r => r.status === 'pending').length === 0 ? (
                  <div className="py-20 text-center text-slate-400 text-sm font-semibold border border-dashed border-slate-200 rounded-2xl bg-slate-50/20">
                    🎉 No pending directory change requests at the moment.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {modificationRequests.filter(r => r.status === 'pending').map((req) => {
                      const orig = req.user_units;
                      return (
                        <div key={req.id} className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4 shadow-sm">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-bold text-slate-800 text-sm">
                                Unit {orig?.units?.unit_number || 'N/A'} {orig?.units?.block_phase_no ? `(${orig.units.block_phase_no})` : ''}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-1">
                                Requested by: <span className="font-mono text-blue-600 font-bold">{req.requested_by}</span> on {new Date(req.created_at).toLocaleString()}
                              </div>
                            </div>
                            <span className="bg-yellow-50 text-yellow-800 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase border border-yellow-200 tracking-wide">
                              Pending Review
                            </span>
                          </div>

                          {/* Side-by-Side Comparative UI */}
                          <div className="overflow-x-auto border border-slate-100 rounded-lg bg-white">
                            <table className="w-full text-left text-xs text-slate-600">
                              <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] font-black tracking-wider">
                                <tr>
                                  <th className="py-2.5 px-4">Field</th>
                                  <th className="py-2.5 px-4">Original Value</th>
                                  <th className="py-2.5 px-4">Requested Value</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-sans">
                                <tr>
                                  <td className="py-3 px-4 font-semibold text-slate-600">Full Name</td>
                                  <td className="py-3 px-4 text-slate-500 line-through">{orig?.profiles?.full_name || 'N/A'}</td>
                                  <td className={`py-3 px-4 font-bold ${req.full_name !== orig?.profiles?.full_name ? 'text-green-600 bg-green-50/50' : 'text-slate-800'}`}>
                                    {req.full_name}
                                  </td>
                                </tr>
                                <tr>
                                  <td className="py-3 px-4 font-semibold text-slate-600">Phone</td>
                                  <td className="py-3 px-4 text-slate-500 font-mono">{orig?.profiles?.phone || 'None'}</td>
                                  <td className={`py-3 px-4 font-mono font-bold ${req.phone !== orig?.profiles?.phone ? 'text-green-600 bg-green-50/50' : 'text-slate-800'}`}>
                                    {req.phone || 'None'}
                                  </td>
                                </tr>
                                <tr>
                                  <td className="py-3 px-4 font-semibold text-slate-600">Role</td>
                                  <td className="py-3 px-4 text-slate-500 capitalize">{orig?.role || 'N/A'}</td>
                                  <td className={`py-3 px-4 capitalize font-bold ${req.role !== orig?.role ? 'text-green-600 bg-green-50/50' : 'text-slate-800'}`}>
                                    {req.role}
                                  </td>
                                </tr>
                                <tr>
                                  <td className="py-3 px-4 font-semibold text-slate-600">Billing Payer</td>
                                  <td className="py-3 px-4 text-slate-500">{orig?.is_payer ? 'Yes' : 'No'}</td>
                                  <td className={`py-3 px-4 font-bold ${req.is_payer !== orig?.is_payer ? 'text-green-600 bg-green-50/50' : 'text-slate-800'}`}>
                                    {req.is_payer ? 'Yes' : 'No'}
                                  </td>
                                </tr>
                                {(req.role === 'tenant' || orig?.role === 'tenant') && (
                                  <tr>
                                    <td className="py-3 px-4 font-semibold text-slate-600">Lease Validity</td>
                                    <td className="py-3 px-4 text-slate-500">
                                      {orig?.lease_start_date ? new Date(orig.lease_start_date).toLocaleDateString() : 'N/A'} -{' '}
                                      {orig?.lease_end_date ? new Date(orig.lease_end_date).toLocaleDateString() : 'N/A'}
                                    </td>
                                    <td className={`py-3 px-4 font-bold ${
                                      (req.lease_start_date !== orig?.lease_start_date || req.lease_end_date !== orig?.lease_end_date)
                                        ? 'text-green-600 bg-green-50/50'
                                        : 'text-slate-800'
                                    }`}>
                                      {req.lease_start_date ? new Date(req.lease_start_date).toLocaleDateString() : 'N/A'} -{' '}
                                      {req.lease_end_date ? new Date(req.lease_end_date).toLocaleDateString() : 'N/A'}
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>

                          {/* Verification Document Section */}
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-3 rounded-lg border border-slate-200 gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">📄</span>
                              <div>
                                <div className="font-bold text-slate-700 text-xs">Verification Document Attachment</div>
                                <div className="font-mono text-[10px] text-slate-500 truncate max-w-[200px]" title={req.document_name}>{req.document_name}</div>
                              </div>
                            </div>
                            <a 
                              href={req.document_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="w-full sm:w-auto px-4 py-1.5 bg-blue-50 border border-blue-200 text-blue-600 text-center rounded-lg text-xs font-bold hover:bg-blue-100 transition shadow-sm"
                            >
                              🔍 View Document
                            </a>
                          </div>

                          {/* Decision Actions */}
                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              onClick={() => handleRejectModification(req.id)}
                              className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-lg text-xs font-bold transition border border-red-100 shadow-sm"
                            >
                              Reject Changes
                            </button>
                            <button
                              onClick={() => handleApproveModification(req.id)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold transition border border-emerald-700 shadow-sm"
                            >
                              Approve & Apply
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Audit History Logs Tab */}
            {requestSubTab === 'HISTORY' && (
              <div className="space-y-4">
                <div className="mb-2">
                  <h4 className="font-bold text-slate-800 text-sm">Audit History Log</h4>
                  <p className="text-slate-500 text-xs mt-0.5">Permanent record of directory modifications. All approvals/rejections and their associated verification documents are archived here.</p>
                </div>
                {modLoading ? (
                  <div className="py-20 text-center text-slate-400 text-sm font-semibold">
                    <span className="animate-spin mr-2">⚙️</span> Loading history...
                  </div>
                ) : modificationRequests.filter(r => r.status !== 'pending').length === 0 ? (
                  <div className="py-20 text-center text-slate-400 text-sm font-semibold border border-dashed border-slate-200 rounded-2xl bg-slate-50/20">
                    📂 No past change requests found.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-100 rounded-xl">
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="bg-slate-50 text-slate-500 uppercase text-[9px] font-black tracking-wider">
                        <tr>
                          <th className="py-3 px-4">Unit</th>
                          <th className="py-3 px-4">Occupant Name</th>
                          <th className="py-3 px-4">Requested By</th>
                          <th className="py-3 px-4">Actioned By</th>
                          <th className="py-3 px-4">Verification Doc</th>
                          <th className="py-3 px-4">Decision</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-sans">
                        {modificationRequests.filter(r => r.status !== 'pending').map((req) => (
                          <tr key={req.id} className="hover:bg-slate-50/50 transition">
                            <td className="py-4 px-4">
                              <div className="font-bold text-slate-800">
                                Unit {req.user_units?.units?.unit_number || 'N/A'}
                              </div>
                              <div className="text-[10px] text-slate-400">{req.user_units?.units?.block_phase_no || ''}</div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="font-semibold text-slate-800">{req.full_name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{req.phone || 'No Phone'}</div>
                            </td>
                            <td className="py-4 px-4 text-slate-500">
                              <div className="text-[11px] font-medium font-mono truncate max-w-[140px]" title={req.requested_by}>{req.requested_by}</div>
                              <div className="text-[10px] text-slate-400">on {new Date(req.created_at).toLocaleDateString()}</div>
                            </td>
                            <td className="py-4 px-4 text-slate-500">
                              <div className="text-[11px] font-medium font-mono truncate max-w-[140px]" title={req.approved_by || 'N/A'}>{req.approved_by || 'N/A'}</div>
                              <div className="text-[10px] text-slate-400">on {req.action_date ? new Date(req.action_date).toLocaleDateString() : 'N/A'}</div>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-400">📄</span>
                                <a 
                                  href={req.document_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-blue-600 font-semibold hover:underline font-mono truncate max-w-[110px]"
                                  title={req.document_name}
                                >
                                  {req.document_name}
                                </a>
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                req.status === 'approved' 
                                  ? 'bg-green-50 text-green-700 border-green-200' 
                                  : 'bg-red-50 text-red-700 border-red-200'
                              }`}>
                                {req.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'DIRECTORY' && (
        <div className="w-full">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">📋 Occupant Directory</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Directory of currently linked and pre-authorized condo occupants.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleExportExcel}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm font-sans"
                >
                  🟢 Export to Excel
                </button>
                <button 
                  onClick={fetchOccupants}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  🔄 Refresh List
                </button>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Search Directory</label>
                <input
                  type="text"
                  placeholder="Search name, email, unit..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Filter by Unit</label>
                <select
                  value={selectedUnitFilter}
                  onChange={(e) => setSelectedUnitFilter(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">All Units</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.unit_number} {unit.tower_name ? `(${unit.tower_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Filter by Role</label>
                <select
                  value={selectedRoleFilter}
                  onChange={(e) => setSelectedRoleFilter(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">All Roles</option>
                  <option value="owner">Owners Only</option>
                  <option value="co_owner">Co-Owners Only</option>
                  <option value="property_manager">Property Managers Only</option>
                  <option value="family_member">Family Only</option>
                  <option value="tenant">Tenants Only</option>
                  <option value="short_term_renter">Short-term Renters Only</option>
                </select>
              </div>
            </div>

            {/* Directory Table */}
            {loading ? (
              <div className="py-20 flex justify-center items-center text-slate-400 text-sm font-semibold">
                <span className="animate-spin mr-2">⚙️</span> Loading occupants records...
              </div>
            ) : filteredOccupants.length === 0 ? (
              <div className="py-20 text-center text-slate-400 text-sm font-semibold border border-dashed rounded-xl">
                No matching occupant records found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-black tracking-wider">
                    <tr>
                      <th className="py-3 px-4 rounded-l-lg">House/Lot No.</th>
                      <th className="py-3 px-4">Resident Info</th>
                      <th className="py-3 px-4">Unit Role</th>
                      <th className="py-3 px-4">Registered Vehicles</th>
                      <th className="py-3 px-4">Billing Payer</th>
                      <th className="py-3 px-4">Status / Lease</th>
                      <th className="py-3 px-4 rounded-r-lg text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOccupants.map((occ) => {
                      const profile = occ.profiles;
                      const isEditing = editingRowId === occ.id;
                      return (
                        <tr key={occ.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-4 px-4 font-bold text-slate-800">
                            {occ.units?.unit_number} {occ.units?.tower_name ? `(${occ.units.tower_name})` : ''}
                          </td>
                          {isEditing ? (
                            <>
                              <td className="py-4 px-4 space-y-2">
                                <input 
                                  type="text" 
                                  value={editFullName} 
                                  onChange={(e) => setEditFullName(e.target.value)}
                                  className="w-full text-xs border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                                  placeholder="Full Name"
                                />
                                <div className="text-[10px] text-slate-400 font-medium">{profile?.email || 'N/A'} (Login ID)</div>
                                <input 
                                  type="text" 
                                  value={editPhone} 
                                  onChange={(e) => setEditPhone(e.target.value)}
                                  className="w-full text-xs border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                  placeholder="Phone Number"
                                />

                                {/* Verification Document Dropzone / Uploader */}
                                <div className="mt-2 p-2 border border-dashed border-slate-200 rounded-lg bg-slate-50 text-[10px] space-y-1.5">
                                  <label className="block font-bold text-slate-600">📄 Verification Doc (Required)</label>
                                  {editDocName ? (
                                    <div className="flex items-center justify-between bg-white p-1 rounded border border-slate-100">
                                      <span className="font-mono text-[9px] truncate max-w-[120px] text-slate-700" title={editDocName}>{editDocName}</span>
                                      <button 
                                        type="button" 
                                        onClick={() => { setEditDocName(''); setEditDocUrl(''); }}
                                        className="text-red-500 hover:text-red-700 font-bold ml-1 text-xs"
                                        title="Remove file"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="relative border border-slate-200 rounded bg-white hover:bg-slate-50 transition cursor-pointer text-center py-2 px-1">
                                      <input
                                        type="file"
                                        accept=".pdf,image/*"
                                        onChange={handleMockUpload}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                      />
                                      <span className="text-slate-400 block text-[9px]">📎 Click to attach document</span>
                                    </div>
                                  )}
                                  {uploadProgress > 0 && uploadProgress < 100 && (
                                    <div className="w-full bg-slate-200 h-1 rounded-full mt-1 overflow-hidden">
                                      <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="py-4 px-4">
                                <select
                                  value={editRole}
                                  onChange={(e) => {
                                    const val = e.target.value as any;
                                    setEditRole(val);
                                    if (val !== 'tenant') {
                                      setEditIsPayer(true);
                                    }
                                  }}
                                  className="w-full text-xs border border-slate-200 rounded p-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white font-medium"
                                >
                                  <option value="owner">Owner (Primary)</option>
                                  <option value="co_owner">Co-Owner</option>
                                  <option value="property_manager">Property Manager</option>
                                  <option value="family_member">Family Member</option>
                                  <option value="tenant">Tenant (Renter)</option>
                                  <option value="short_term_renter">Short-term Renter</option>
                                </select>
                              </td>
                              <td className="py-4 px-4">
                                {vehicles.filter(v => v.user_id === profile?.id).length === 0 ? (
                                  <span className="text-slate-400 italic text-[10px]">None</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1 max-w-[180px]">
                                    {vehicles.filter(v => v.user_id === profile?.id).map(v => (
                                      <div key={v.id} className="inline-flex items-center bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold mr-1">
                                        🚗 {v.plate_number}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="py-4 px-4 text-center">
                                <input
                                  type="checkbox"
                                  checked={editIsPayer}
                                  onChange={(e) => setEditIsPayer(e.target.checked)}
                                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                                />
                                <span className="block text-[9px] text-slate-400 mt-1">{editIsPayer ? 'Responsible' : 'Non-payer'}</span>
                              </td>
                              <td className="py-4 px-4 space-y-2">
                                {editRole === 'tenant' ? (
                                  <div className="space-y-1">
                                    <div>
                                      <label className="block text-[8px] font-bold text-slate-400 uppercase">Lease Start</label>
                                      <input
                                        type="date"
                                        value={editLeaseStartDate}
                                        onChange={(e) => setEditLeaseStartDate(e.target.value)}
                                        className="w-full text-[10px] border border-slate-200 rounded p-1 focus:outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[8px] font-bold text-slate-400 uppercase">Lease End</label>
                                      <input
                                        type="date"
                                        value={editLeaseEndDate}
                                        onChange={(e) => setEditLeaseEndDate(e.target.value)}
                                        className="w-full text-[10px] border border-slate-200 rounded p-1 focus:outline-none"
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-green-100 text-green-700">Permanent</span>
                                )}
                              </td>
                              <td className="py-4 px-4 text-right space-x-2 shrink-0">
                                <button
                                  onClick={() => handleSaveEdit(occ.id)}
                                  disabled={savingRowId === occ.id || !editFullName.trim()}
                                  className="text-blue-600 hover:text-blue-800 font-bold hover:underline transition mr-2 disabled:opacity-50"
                                >
                                  {savingRowId === occ.id ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="text-slate-500 hover:text-slate-700 font-bold hover:underline transition"
                                >
                                  Cancel
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-4 px-4">
                                <div className="font-semibold text-slate-800">{profile?.full_name || 'N/A'}</div>
                                <div className="text-[11px] text-slate-400">{profile?.email || 'N/A'}</div>
                                {profile?.phone && <div className="text-[10px] text-slate-400 mt-0.5">{profile.phone}</div>}
                              </td>
                              <td className="py-4 px-4 font-medium text-slate-700 capitalize">
                                {occ.role === 'family_member' ? 'Family Member' : 
                                 occ.role === 'co_owner' ? 'Co-Owner' : 
                                 occ.role === 'property_manager' ? 'Property Manager' : 
                                 occ.role === 'short_term_renter' ? 'Short-term Renter' : occ.role}
                              </td>
                              <td className="py-4 px-4">
                                {vehicles.filter(v => v.user_id === profile?.id).length === 0 ? (
                                  <span className="text-slate-400 italic text-[10px]">None</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1 max-w-[180px]">
                                    {vehicles.filter(v => v.user_id === profile?.id).map(v => (
                                      <div key={v.id} className="inline-flex items-center bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold mr-1">
                                        🚗 {v.plate_number}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="py-4 px-4">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  occ.is_payer ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-50 text-slate-400'
                                }`}>
                                  {occ.is_payer ? 'Payer' : 'Non-payer'}
                                </span>
                              </td>
                              <td className="py-4 px-4 space-y-1">
                                {occ.role === 'tenant' ? (
                                  <div>
                                    {getLeaseStatusBadge(occ)}
                                    <div className="text-[10px] text-slate-400 mt-1">
                                      {occ.lease_start_date ? new Date(occ.lease_start_date).toLocaleDateString('en-US') : '?'} -{' '}
                                      {occ.lease_end_date ? new Date(occ.lease_end_date).toLocaleDateString('en-US') : '?'}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-green-100 text-green-700">Permanent</span>
                                )}
                              </td>
                              <td className="py-4 px-4 text-right space-x-2 shrink-0">
                                <button
                                  onClick={() => handleStartEdit(occ)}
                                  className="text-blue-600 hover:text-blue-800 font-bold hover:underline transition mr-2"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleUnlinkOccupant(occ.id, profile?.full_name || '')}
                                  className="text-red-500 hover:text-red-700 font-bold hover:underline transition"
                                >
                                  Unlink
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
