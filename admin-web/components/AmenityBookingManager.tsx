"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabaseClient';

interface AmenityBooking {
  id: string;
  booking_date: string;
  time_slot: string;
  status: string;
  amenity_name: string;
  user_id: string;
  unit_id: string;
  profiles?: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
    expo_push_token?: string | null;
  } | null;
  units?: {
    unit_number: string | null;
    block_phase_no: string | null;
    condo_id: string | null;
  } | null;
}

export default function AmenityBookingManager({ condoId }: { condoId: string }) {
  const [bookings, setBookings] = useState<AmenityBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAmenityFilter, setSelectedAmenityFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [selectedDateFilter, setSelectedDateFilter] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Tab View
  const [activeTab, setActiveTab] = useState<'UPCOMING' | 'HISTORY'>('UPCOMING');

  useEffect(() => {
    fetchBookings();

    // Set up real-time subscription
    const channel = supabase
      .channel('realtime-amenity-bookings')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'amenity_bookings' },
        () => {
          fetchBookings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('amenity_bookings')
        .select('id, booking_date, slot_time, status, user_id, unit_id, amenity_id')
        .order('booking_date', { ascending: false });

      if (bookingsError) throw bookingsError;

      if (bookingsData && bookingsData.length > 0) {
        const userIds = Array.from(new Set(bookingsData.map(b => b.user_id).filter(Boolean)));
        const unitIds = Array.from(new Set(bookingsData.map(b => b.unit_id).filter(Boolean)));
        const amenityIds = Array.from(new Set(bookingsData.map(b => b.amenity_id).filter(Boolean)));

        const [profilesRes, unitsRes, amenitiesRes] = await Promise.all([
          userIds.length > 0 ? supabase.from('profiles').select('id, full_name, email, phone, expo_push_token').in('id', userIds) : { data: [] },
          unitIds.length > 0 ? supabase.from('units').select('id, unit_number, block_phase_no, condo_id').in('id', unitIds) : { data: [] },
          amenityIds.length > 0 ? supabase.from('amenities').select('id, name').in('id', amenityIds) : { data: [] }
        ]);

        const profilesMap = new Map((profilesRes.data || []).map(p => [p.id, p]));
        const unitsMap = new Map((unitsRes.data || []).map(u => [u.id, u]));
        const amenitiesMap = new Map((amenitiesRes.data || []).map(a => [a.id, a]));

        const joined = bookingsData.map(b => {
          const profile = b.user_id ? profilesMap.get(b.user_id) : null;
          const unit = b.unit_id ? unitsMap.get(b.unit_id) : null;
          const amenity = b.amenity_id ? amenitiesMap.get(b.amenity_id) : null;

          return {
            ...b,
            time_slot: b.slot_time || '',
            amenity_name: amenity?.name || `Amenity (ID: ${b.amenity_id})`,
            profiles: profile ? {
              full_name: profile.full_name || 'Resident',
              email: profile.email || '',
              phone: profile.phone || '',
              expo_push_token: profile.expo_push_token || null
            } : null,
            units: unit ? {
              unit_number: unit.unit_number || '',
              block_phase_no: unit.block_phase_no || '',
              condo_id: unit.condo_id || ''
            } : null
          };
        });

        const filteredByCondo = joined.filter(b => b.units?.condo_id === condoId);
        setBookings(filteredByCondo);
      } else {
        setBookings([]);
      }
    } catch (err) {
      console.error('Error fetching amenity bookings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (bookingId: string, newStatus: string) => {
    setActionLoading(bookingId);
    try {
      const { error } = await supabase
        .from('amenity_bookings')
        .update({ status: newStatus })
        .eq('id', bookingId);

      if (error) throw error;

      // Send push notification to resident if they have a push token
      const booking = bookings.find(b => b.id === bookingId);
      const pushToken = booking?.profiles?.expo_push_token;
      if (pushToken && pushToken.startsWith('ExponentPushToken')) {
        const title = `📅 Facility Booking Update`;
        let body = '';
        if (newStatus === 'CONFIRMED') {
          body = `Your reservation for the ${booking.amenity_name} on ${booking.booking_date} at ${booking.time_slot} has been APPROVED! 🎉`;
        } else if (newStatus === 'CANCELLED') {
          body = `Your reservation for the ${booking.amenity_name} on ${booking.booking_date} has been CANCELLED.`;
        } else if (newStatus === 'COMPLETED') {
          body = `Your check-in session at the ${booking.amenity_name} is marked as COMPLETED. Thank you!`;
        }

        if (body) {
          try {
            await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                to: pushToken,
                sound: 'default',
                title: title,
                body: body,
                badge: 1,
                data: { type: 'AMENITY_BOOKING', bookingId }
              }),
            });
            console.log(`Dispatched push notification for booking ${bookingId} to token ${pushToken}`);
          } catch (pushErr) {
            console.error("Failed to send push notification to resident:", pushErr);
          }
        }
      }

      alert(`Booking status successfully updated to ${newStatus}!`);
      fetchBookings();
    } catch (err: any) {
      console.error(err);
      alert(`Failed to update booking status: ${err.message || 'Unknown error'}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Get dynamic list of amenities from bookings to populate filter
  const amenitiesList = Array.from(
    new Set(bookings.map((b) => b.amenity_name).filter(Boolean))
  );

  // Filter Logic
  const filteredBookings = bookings.filter((b) => {
    const isUpcoming = b.status === 'CONFIRMED' || b.status === 'PENDING';
    const isHistory = b.status === 'COMPLETED' || b.status === 'CANCELLED';

    // Tab split
    if (activeTab === 'UPCOMING' && !isUpcoming) return false;
    if (activeTab === 'HISTORY' && !isHistory) return false;

    // Search query match (name, email, house/lot number)
    const fullName = b.profiles?.full_name?.toLowerCase() || '';
    const email = b.profiles?.email?.toLowerCase() || '';
    const unitNo = b.units?.unit_number?.toLowerCase() || '';
    const searchLower = searchQuery.toLowerCase();
    
    if (
      searchQuery &&
      !fullName.includes(searchLower) &&
      !email.includes(searchLower) &&
      !unitNo.includes(searchLower)
    ) {
      return false;
    }

    // Amenity filter
    if (
      selectedAmenityFilter !== 'ALL' &&
      b.amenity_name !== selectedAmenityFilter
    ) {
      return false;
    }

    // Status filter
    if (
      selectedStatusFilter !== 'ALL' &&
      b.status !== selectedStatusFilter
    ) {
      return false;
    }

    // Date filter
    if (selectedDateFilter && b.booking_date !== selectedDateFilter) {
      return false;
    }

    return true;
  });

  // Calculate Metrics
  const totalCount = bookings.length;
  const pendingCount = bookings.filter((b) => b.status === 'PENDING').length;
  const confirmedCount = bookings.filter((b) => b.status === 'CONFIRMED').length;
  const completedCount = bookings.filter((b) => b.status === 'COMPLETED').length;
  const cancelledCount = bookings.filter((b) => b.status === 'CANCELLED').length;

  const getStatusBadgeClass = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'PENDING':
        return 'bg-amber-100 text-amber-800 border border-amber-200';
      case 'CONFIRMED':
      case 'APPROVED':
        return 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'COMPLETED':
        return 'bg-emerald-100 text-emerald-800 border border-emerald-200';
      case 'CANCELLED':
      case 'REJECTED':
        return 'bg-slate-100 text-slate-800 border border-slate-200';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const getAmenityLabel = (amenityId: string) => {
    if (!amenityId) return 'Amenity';
    return amenityId
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-800">
      {/* Top Header Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            🏊 Amenity Bookings Control Panel
          </h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Monitor facility reservations, manage occupancy limits, and verify resident requests.
          </p>
        </div>
        <button
          onClick={fetchBookings}
          className="bg-slate-900 hover:bg-slate-800 active:bg-slate-700 text-white font-bold text-xs py-2 px-4 rounded-xl transition flex items-center gap-1.5"
        >
          <span>🔄</span> Refresh Registry
        </button>
      </div>

      {/* Metrics Section */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Bookings</span>
          <span className="text-xl font-black text-slate-800 mt-1 block">{totalCount}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">🟢 PENDING Approval</span>
          <span className="text-xl font-black text-amber-600 mt-1 block">{pendingCount}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">🔵 CONFIRMED/UPCOMING</span>
          <span className="text-xl font-black text-blue-600 mt-1 block">{confirmedCount}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">✅ COMPLETED</span>
          <span className="text-xl font-black text-emerald-600 mt-1 block">{completedCount}</span>
        </div>
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm text-center">
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">✕ CANCELLED</span>
          <span className="text-xl font-black text-slate-500 mt-1 block">{cancelledCount}</span>
        </div>
      </div>

      {/* Filter and Tab Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 border-b border-slate-100 pb-4">
          {/* Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
            <button
              onClick={() => {
                setActiveTab('UPCOMING');
                setSelectedStatusFilter('ALL');
              }}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'UPCOMING'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              🗓️ Upcoming / Active
            </button>
            <button
              onClick={() => {
                setActiveTab('HISTORY');
                setSelectedStatusFilter('ALL');
              }}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'HISTORY'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              📜 Booking History
            </button>
          </div>

          {/* Search Box */}
          <div className="w-full md:w-80">
            <input
              type="text"
              placeholder="🔍 Search name, email, or house/lot number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 font-medium text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>
        </div>

        {/* Detailed Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Amenity Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Filter by Facility
            </label>
            <select
              value={selectedAmenityFilter}
              onChange={(e) => setSelectedAmenityFilter(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-semibold focus:outline-none"
            >
              <option value="ALL">All Amenities</option>
              {amenitiesList.map((a) => (
                <option key={a} value={a}>
                  {getAmenityLabel(a)}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Filter by Status
            </label>
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-semibold focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              {activeTab === 'UPCOMING' ? (
                <>
                  <option value="PENDING">PENDING Approval</option>
                  <option value="CONFIRMED">CONFIRMED</option>
                </>
              ) : (
                <>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </>
              )}
            </select>
          </div>

          {/* Date Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Filter by Date
            </label>
            <input
              type="date"
              value={selectedDateFilter}
              onChange={(e) => setSelectedDateFilter(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-slate-700 font-semibold focus:outline-none"
            />
          </div>
        </div>

        {/* Bookings Table list */}
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center min-h-[250px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
            <p className="text-xs text-slate-450 mt-4 font-semibold">Synchronizing bookings catalog...</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center min-h-[250px] border-2 border-dashed border-slate-100 rounded-xl">
            <span className="text-3xl mb-2">📭</span>
            <p className="text-sm font-semibold">No reservations match the filters</p>
            <p className="text-xs text-slate-400 mt-1">Excellent! Everything is in order.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Resident & Unit</th>
                  <th className="py-3 px-4">Amenity Type</th>
                  <th className="py-3 px-4">Reserved Time</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/50 transition">
                    {/* Resident Info */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span className="font-bold text-slate-800 block">
                        {b.profiles?.full_name || 'Resident'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                        Unit {b.units?.unit_number || 'N/A'} ({b.units?.block_phase_no || 'Tower'}) • {b.profiles?.email || 'No email'}
                      </span>
                    </td>

                    {/* Amenity Type */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span className="font-bold text-slate-700">
                        {getAmenityLabel(b.amenity_name)}
                      </span>
                    </td>

                    {/* Reserved Date & Time */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span className="font-semibold text-slate-600 block">
                        📅 {b.booking_date}
                      </span>
                      <span className="text-[10px] text-slate-450 font-semibold block mt-0.5">
                        ⏱️ {b.time_slot}
                      </span>
                    </td>

                    {/* Status badge */}
                    <td className="py-4 px-4 whitespace-nowrap text-center">
                      <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full inline-block ${getStatusBadgeClass(b.status)}`}>
                        {b.status}
                      </span>
                    </td>

                    {/* Action buttons */}
                    <td className="py-4 px-4 whitespace-nowrap text-right">
                      {actionLoading === b.id ? (
                        <div className="inline-block animate-spin h-4 w-4 border-2 border-slate-900 border-t-transparent rounded-full"></div>
                      ) : (
                        <div className="flex gap-1.5 justify-end">
                          {b.status === 'PENDING' && (
                            <button
                              onClick={() => handleUpdateStatus(b.id, 'CONFIRMED')}
                              className="bg-blue-50 hover:bg-blue-100 border border-blue-100 text-blue-700 font-bold px-2 py-1 rounded-lg text-[10px] transition"
                            >
                              Approve
                            </button>
                          )}
                          
                          {b.status === 'CONFIRMED' && (
                            <>
                              <button
                                onClick={() => handleUpdateStatus(b.id, 'COMPLETED')}
                                className="bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-700 font-bold px-2.5 py-1 rounded-lg text-[10px] transition"
                              >
                                ✓ Complete
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(b.id, 'CANCELLED')}
                                className="bg-red-50 hover:bg-red-100 border border-red-100 text-red-700 font-bold px-2.5 py-1 rounded-lg text-[10px] transition"
                              >
                                ✕ Cancel
                              </button>
                            </>
                          )}

                          {b.status === 'COMPLETED' && (
                            <span className="text-[10px] text-slate-400 font-semibold">Done</span>
                          )}

                          {b.status === 'CANCELLED' && (
                            <span className="text-[10px] text-slate-400 font-semibold">Cancelled</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
