import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, StatusBar, TouchableOpacity, ScrollView, Image, Alert, ActivityIndicator, Modal, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext';
import { JobStatus, RepairTicket } from '../types/jobOrder';
import { API_BASE_URL } from '../api/apiClient';

export default function JobOrderDetailScreen({ route, navigation }: any) {
  const { ticketId } = route.params; // Only need ticketId now, as we'll fetch fresh data
  const { themeColor } = useCondoConfig();
  
  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState<RepairTicket | null>(null); // Initialize as null, data will be fetched
  
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [customTimeInput, setCustomTimeInput] = useState('');
  const [selectedDateVal, setSelectedDateVal] = useState('');
  const [selectedDateISO, setSelectedDateISO] = useState('');
  const [selectedTimeVal, setSelectedTimeVal] = useState('');
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [techModalVisible, setTechModalVisible] = useState(false);
  const [techBookings, setTechBookings] = useState<any[]>([]);

  const parseDateTimeToISO = (dateISO: string, timeStr: string) => {
    if (!dateISO || !timeStr) return '';
    const match = timeStr.match(/^(\d{2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return `${dateISO}T12:00:00Z`;
    
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const ampm = match[3].toUpperCase();
    
    if (ampm === 'PM' && hours < 12) {
      hours += 12;
    } else if (ampm === 'AM' && hours === 12) {
      hours = 0;
    }
    
    const [year, month, day] = dateISO.split('-').map(Number);
    const localDate = new Date(year, month - 1, day, hours, parseInt(minutes, 10));
    return localDate.toISOString();
  };

  const isTimeSlotColliding = (dateStr: string, slotStr: string) => {
    const slotISO = parseDateTimeToISO(dateStr, slotStr);
    if (!slotISO) return false;
    const slotTimeMs = new Date(slotISO).getTime();
    if (isNaN(slotTimeMs)) return false;

    for (const booking of techBookings) {
      if (!booking.proposed_visit_time) continue;
      const bookingTimeMs = new Date(booking.proposed_visit_time).getTime();
      if (isNaN(bookingTimeMs)) continue;

      const diffMin = Math.abs(slotTimeMs - bookingTimeMs) / (1000 * 60);
      if (diffMin < 60) {
        return true;
      }
    }
    return false;
  };

  const getNext10Days = () => {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 10; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      let label = "";
      if (i === 0) label = "Today";
      else if (i === 1) label = "Tomorrow";
      else {
        label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      }
      const value = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const dayNum = String(d.getDate()).padStart(2, '0');
      const dateISO = `${year}-${month}-${dayNum}`;
      days.push({ label: `${label} (${value})`, dateStr: dateISO });
    }
    return days;
  };

  const timeSlots = [
    "09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
    "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM",
    "05:00 PM", "06:00 PM"
  ];

  useEffect(() => {
    fetchTicketDetail();

    // Realtime channel to update data
    const channel = supabase.channel(`ticket_detail_${ticketId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', // '*' 대신 'UPDATE'만 사용 (가장 안정적)
        schema: 'public', 
        table: 'job_orders',
        filter: `id=eq.${ticketId}` 
      }, (payload) => {
        console.log("Realtime Update Detected:", payload);
        fetchTicketDetail(); // Call fetchTicketDetail on change
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ticketId]);


  const fetchTicketDetail = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('job_orders')
        .select('*') // 1. 티켓만 따로 가져옴
        .eq('id', ticketId)
        .single();

      if (!error && data) {
        const t = data; // Renamed from 'data' to 't' for clarity

        // 2. 기술자 ID가 있다면 기술자 정보 및 예약 일정을 가져옴
        if (t.assigned_technician_id) {
          const { data: techData } = await supabase
            .from('staff_profiles')
            .select('full_name, avatar_url')
            .eq('id', t.assigned_technician_id)
            .single();
          t.assigned_tech = techData;

          const { data: bookingsData } = await supabase
            .from('job_orders')
            .select('proposed_visit_time')
            .eq('assigned_technician_id', t.assigned_technician_id)
            .in('status', ['VISIT_CONFIRMED', 'VISITING', 'IN_PROGRESS']);
          if (bookingsData) {
            setTechBookings(bookingsData.filter((b: any) => b.proposed_visit_time));
          }
        }

        setTicket({
          id: t.id.toString(),
          title: t.title,
          description: t.description,
          image_url: t.image_url,
          status: t.status as JobStatus,
          proposed_visit_time: t.proposed_visit_time,
          time_change_request: t.time_change_request,
          appointment_time: t.proposed_visit_time,
          reject_reason: t.reject_reason,
          estimated_cost: t.estimated_cost,
          created_at: t.created_at,
          filed_at: t.status_filed_at || t.created_at,
          reviewed_at: t.status_reviewed_at,
          assigned_at: t.status_assigned_at,
          scheduling_at: t.status_scheduling_at,
          booked_at: t.status_booked_at,
          in_progress_at: t.status_in_progress_at,
          finished_at: t.status_finished_at,
          assigned_technician_id: t.assigned_technician_id,
          assigned_tech: t.assigned_tech, // 이제 assigned_tech는 객체로 담깁니다.
          before_photo_url: t.before_photo_url,
          after_photo_url: t.after_photo_url
        });
      } else {
        console.error("Error fetching ticket detail:", error);
        useFallbackData();
        setTicket(null); // Ensure ticket is null on error if fallback doesn't set it
      }
    } catch (err) {
      console.log(err);
      useFallbackData();
    } finally {
      setLoading(false);
    }
  };

  const useFallbackData = () => {
    setTicket({ id: 't1', title: 'Living Room Aircon Leaking Water', description: 'The split-type indoor unit is heavily dripping from the right side after 2 hours of operational use. Suspect clogged drain pipe.', image_url: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=600', status: 'TIME_NEGOTIATING', appointment_time: 'Sat, May 30 at 2:00 PM', reject_reason: null, estimated_cost: 0, created_at: new Date(Date.now() - 86400000).toISOString(), filed_at: new Date(Date.now() - 86400000).toISOString(), reviewed_at: new Date(Date.now() - 72000000).toISOString(), assigned_at: new Date(Date.now() - 54000000).toISOString(), scheduling_at: new Date(Date.now() - 3600000).toISOString(), booked_at: null, assigned_tech: { full_name: 'Juan (Technician)', avatar_url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=200' }, after_photo_url: null } as any);
  };

  const handleConfirmTime = async () => {
    if (!ticket) return;
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/maintenance/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: ticket.id,
          updates: { 
            status: 'VISIT_CONFIRMED', 
            status_booked_at: new Date().toISOString(),
            reject_reason: null
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update job order");
      }
      
      Alert.alert("Confirmed!", "Technician scheduled.");
      fetchTicketDetail(); // Refresh data after action
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Failed to confirm time.");
    } finally {
      setLoading(false);
    }
  };

  const startChatWithTech = async () => {
    if (!ticket || !ticket.assigned_technician_id || !ticket.assigned_tech) {
      Alert.alert("Notice", "No technician has been assigned yet.");
      return;
    }
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id;
      if (!currentUserId) {
        Alert.alert("Error", "You must be logged in to chat.");
        return;
      }

      const techId = ticket.assigned_technician_id;

      if (techId.startsWith('demo') || currentUserId.startsWith('demo')) {
        navigation.navigate('DirectChat', {
          chatId: 'demo-dm-tech',
          targetUnitNumber: ticket.assigned_tech.full_name
        });
        return;
      }

      const u1 = currentUserId < techId ? currentUserId : techId;
      const u2 = currentUserId < techId ? techId : currentUserId;

      const { data: existingChat, error: checkError } = await supabase
        .from('direct_chats')
        .select('id')
        .eq('user1_id', u1)
        .eq('user2_id', u2)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingChat) {
        navigation.navigate('DirectChat', { 
          chatId: existingChat.id, 
          targetUnitNumber: ticket.assigned_tech.full_name
        });
        return;
      }

      const { data: newChat, error: createError } = await supabase
        .from('direct_chats')
        .insert([{ user1_id: u1, user2_id: u2 }])
        .select('id')
        .single();

      if (createError) throw createError;

      if (newChat) {
        navigation.navigate('DirectChat', { 
          chatId: newChat.id, 
          targetUnitNumber: ticket.assigned_tech.full_name
        });
      }
    } catch (e: any) {
      console.error("Failed to start chat with technician:", e);
      Alert.alert("Error", "Failed to start chat: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBookAppointment = async () => {
    if (!selectedDateISO || !selectedTimeVal || !ticket) {
      Alert.alert("Required", "Please select both a date and time slot.");
      return;
    }
    const combinedISO = parseDateTimeToISO(selectedDateISO, selectedTimeVal);

    if (isTimeSlotColliding(selectedDateISO, selectedTimeVal)) {
      Alert.alert("Collision", "This time slot is already booked by the technician. Please select another slot.");
      return;
    }

    try {
      setLoading(true);
      const isTechAssigned = !!ticket.assigned_technician_id;
      const updates: any = isTechAssigned
        ? {
            status: 'TIME_NEGOTIATING',
            time_change_request: combinedISO,
            reject_reason: null
          }
        : {
            status: 'VISIT_CONFIRMED',
            proposed_visit_time: combinedISO,
            time_change_request: null,
            reject_reason: null
          };

      const response = await fetch(`${API_BASE_URL}/api/maintenance/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: ticket.id,
          updates
        })
      });

      if (response.ok) {
        if (isTechAssigned) {
          Alert.alert("Reschedule Requested ⏳", "Your rescheduling request has been sent to the technician. Please wait for their confirmation.");
        } else {
          Alert.alert("Appointment Confirmed! 🎉", "Your visit appointment has been scheduled successfully.");
        }
        setSelectedDateVal('');
        setSelectedDateISO('');
        setSelectedTimeVal('');
        fetchTicketDetail();
      } else {
        const errorData = await response.json();
        Alert.alert("Error", "Failed to book appointment: " + (errorData.error || "Unknown error"));
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", "Network error when booking appointment: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveEstimate = async () => {
    if (!ticket) return;
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/maintenance/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: ticket.id,
          updates: { status: 'IN_PROGRESS', resident_approved: true }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update job order");
      }
      
      Alert.alert("Work Authorized 🛠️", "Estimate approved. Maintenance team will proceed with the repairs shortly.");
      fetchTicketDetail(); // Refresh data after action
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", "Failed to authorize the repair: " + (e.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const handleRejectTimeSubmit = async () => {
    if (!selectedDateVal || !selectedTimeVal || !ticket) {
      Alert.alert("Required", "Please select both preferred date and time.");
      return;
    }
    const combined = `${selectedDateVal}, ${selectedTimeVal}`;
    try {
      setLoading(true);
      if (ticket.id.startsWith('t1')) {
        setRejectModalVisible(false);
        Alert.alert("Feedback Sent ⚡", "PMO Admin will check your preferred schedule and update shortly.");
        return;
      }
      
      const response = await fetch(`${API_BASE_URL}/api/maintenance/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: ticket.id,
          updates: { 
            status: 'TIME_NEGOTIATING', 
            time_change_request: combined,
            reject_reason: null
          }
        })
      });

      if (response.ok) {
        setRejectModalVisible(false);
        setSelectedDateVal('');
        setSelectedDateISO('');
        setSelectedTimeVal('');
        Alert.alert("Feedback Sent ⚡", "PMO Admin will check your preferred schedule and update shortly.");
        fetchTicketDetail(); // Refresh data after action
      } else {
        const errorData = await response.json();
        console.error("Error rejecting time:", errorData);
        Alert.alert("Error", "Failed to send time change request: " + (errorData.error || "Unknown error"));
      }
    } catch (e) {
      console.log(e);
      setLoading(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    Alert.alert(
      "Cancel Request",
      "Are you sure you want to cancel this request?",
      [
        { text: "No", style: "cancel" },
        { 
          text: "Yes, Cancel", 
          style: "destructive",
          onPress: async () => {
            try {
              setLoading(true);
              if (orderId.startsWith('t1')) {
                Alert.alert("Cancelled", "The job order has been cancelled (Mock).");
                navigation.goBack();
                return;
              }
              const response = await fetch(`${API_BASE_URL}/api/maintenance/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: orderId,
                  updates: { status: 'CANCELED' }
                })
              });
              if (response.ok) {
                Alert.alert("Cancelled", "The job order has been cancelled.");
                navigation.goBack(); 
              } else {
                const errorData = await response.json();
                Alert.alert("Error", "Failed to cancel job order: " + (errorData.error || "Unknown error"));
              }
            } catch (e: any) {
              console.error("Cancel Order Error:", e);
              Alert.alert("Network Error", "Failed to contact API server: " + e.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const formatSecureDate = (isoString: string | null) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const statusSteps: { key: JobStatus; label: string }[] = [
    { key: 'REQUESTED', label: '1. Filed' },
    { key: 'ACKNOWLEDGED', label: '2. Tech Assigned' },
    { key: 'VISIT_CONFIRMED', label: '3. Scheduling' },
    { key: 'ESTIMATE_SUBMITTED', label: '4. Cost Approval' },
    { key: 'COMPLETED', label: '5. Finished' }
  ];

  const getCanonicalStatus = (status: JobStatus): JobStatus => {
    switch (status) {
      case 'REQUESTED':
        return 'REQUESTED';
      case 'ASSIGNED':
      case 'ACKNOWLEDGED':
      case 'CHECKED_BY_TECH':
      case 'TIME_NEGOTIATING':
      case 'VISIT_PROPOSED':
        return 'ACKNOWLEDGED';
      case 'VISIT_CONFIRMED':
        return 'VISIT_CONFIRMED';
      case 'VISITING':
      case 'ESTIMATE_SUBMITTED':
        return 'ESTIMATE_SUBMITTED';
      case 'IN_PROGRESS':
      case 'COMPLETED':
      case 'CLOSED':
        return 'COMPLETED';
      default:
        return 'REQUESTED';
    }
  };

  if (loading || !ticket) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={[styles.backIcon, { color: themeColor || '#0038a8' }]}>❮ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ticket Details</Text>
          <View style={{ width: 50 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={themeColor || '#0038a8'} />
        </View>
      </SafeAreaView>
    );
  }

  const canonicalStatus = getCanonicalStatus(ticket.status);
  const currentStepIndex = statusSteps.findIndex(s => s.key === canonicalStatus);

  const stepTimes: Partial<Record<JobStatus, string | null>> = {
    REQUESTED: ticket.filed_at,
    ACKNOWLEDGED: ticket.assigned_at,
    VISIT_CONFIRMED: ticket.booked_at,
    ESTIMATE_SUBMITTED: ticket.status === 'ESTIMATE_SUBMITTED' ? null : ticket.in_progress_at,
    COMPLETED: ticket.finished_at
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={[styles.backIcon, { color: themeColor || '#0038a8' }]}>❮ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job Order Status</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.ticketTitle}>{ticket.title}</Text>
        <Text style={styles.ticketDate}>Reported: {formatSecureDate(ticket.created_at)}</Text>
        <Text style={styles.ticketDesc}>{ticket.description}</Text>
        {ticket.image_url && (
          <Image
            source={{ uri: ticket.image_url }}
            style={styles.ticketImagePreview}
            onError={(e) => console.log("Ticket Image Load Error:", e.nativeEvent.error)}
          />)}

        {/* Dispatched Technician Info Card (Persisted) */}
        {ticket.assigned_tech && (
          <View style={styles.persistedTechCard}>
            <TouchableOpacity 
              style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
              onPress={() => setTechModalVisible(true)}
              activeOpacity={0.8}
            >
              <Image source={{ uri: ticket.assigned_tech.avatar_url || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=200' }} style={styles.techAvatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.techNameText}>{ticket.assigned_tech.full_name}</Text>
                <Text style={styles.techRoleText}>Engineering Staff (Tap for info)</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.chatBtn, { backgroundColor: themeColor || '#0038a8' }]}
              onPress={startChatWithTech}
            >
              <Text style={styles.chatBtnText}>💬 Chat</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Interactive Scheduling Card based on Realtime Availability */}
        {['ASSIGNED', 'ACKNOWLEDGED', 'CHECKED_BY_TECH', 'TIME_NEGOTIATING', 'VISIT_PROPOSED'].includes(ticket.status) && ticket.assigned_tech && (
          <View style={styles.timeActionContainer}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0369a1', marginBottom: 4 }}>
              📅 Schedule Visit Appointment
            </Text>
            <Text style={{ fontSize: 12, color: '#475569', marginBottom: 12, lineHeight: 18 }}>
              Select a date and time slot from the technician's real-time availability:
            </Text>

            {ticket.status === 'VISIT_PROPOSED' && ticket.proposed_visit_time && (
              <View style={{ backgroundColor: '#eff6ff', padding: 12, borderRadius: 10, marginBottom: 14, borderWidth: 1, borderColor: '#bfdbfe' }}>
                <Text style={{ fontSize: 12, color: '#1e40af', fontWeight: '800' }}>💡 Tech Proposed Time:</Text>
                <Text style={{ fontSize: 14, color: '#1e3a8a', fontWeight: '700', marginTop: 4 }}>
                  {formatSecureDate(ticket.proposed_visit_time)}
                </Text>
                <TouchableOpacity 
                  style={{ backgroundColor: themeColor || '#0038a8', paddingVertical: 10, borderRadius: 8, marginTop: 8, alignItems: 'center' }} 
                  onPress={handleConfirmTime}
                >
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Approve Tech Proposed Time</Text>
                </TouchableOpacity>
              </View>
            )}

            {ticket.reject_reason && (
              <View style={{ backgroundColor: '#fef2f2', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#fee2e2', marginBottom: 12 }}>
                <Text style={{ color: '#b91c1c', fontSize: 12, fontWeight: '700' }}>⚠️ Notice from Technician:</Text>
                <Text style={{ color: '#991b1b', fontSize: 12, marginTop: 4, lineHeight: 16 }}>
                  {ticket.reject_reason}
                </Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
              <TouchableOpacity 
                style={[styles.dropdownSelector, { flex: 0.48, marginTop: 0 }]}
                onPress={() => setDatePickerVisible(true)}
              >
                <Text style={styles.dropdownText}>
                  📅 {selectedDateVal ? selectedDateVal.split(" ")[0] : 'Select Date'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.dropdownSelector, { flex: 0.48, marginTop: 0 }]}
                onPress={() => setTimePickerVisible(true)}
              >
                <Text style={styles.dropdownText}>
                  ⏰ {selectedTimeVal ? selectedTimeVal : 'Select Time'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={{ 
                backgroundColor: (selectedDateISO && selectedTimeVal) ? '#10b981' : '#cbd5e1', 
                paddingVertical: 12, 
                borderRadius: 10, 
                alignItems: 'center' 
              }}
              disabled={!selectedDateISO || !selectedTimeVal}
              onPress={handleBookAppointment}
            >
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Book Appointment Slot</Text>
            </TouchableOpacity>

            {ticket.status === 'TIME_NEGOTIATING' && ticket.time_change_request && (
              <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#e0f2fe', paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 12, color: '#0369a1', fontWeight: '600', flex: 0.7 }} numberOfLines={1}>
                  🔄 Requested: {ticket.time_change_request}
                </Text>
                <View style={{ backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ fontSize: 11, color: '#b45309', fontWeight: '800' }}>⏳ Pending</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Confirmed Visit Slot with Reschedule Option */}
        {ticket.status === 'VISIT_CONFIRMED' && ticket.proposed_visit_time && (
          <View style={{ backgroundColor: '#f0fdf4', borderRadius: 16, borderWidth: 1, borderColor: '#bbf7d0', padding: 16, marginTop: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#166534', marginBottom: 4 }}>
              📅 Visit Appointment Scheduled
            </Text>
            <Text style={{ fontSize: 16, fontWeight: '900', color: '#14532d', marginVertical: 8 }}>
              {formatSecureDate(ticket.proposed_visit_time)}
            </Text>
            <Text style={{ fontSize: 12, color: '#15803d', marginBottom: 14 }}>
              Need to reschedule this appointment? Select a new slot from the availability calendar below:
            </Text>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
              <TouchableOpacity 
                style={[styles.dropdownSelector, { flex: 0.48, marginTop: 0, borderColor: '#86efac', backgroundColor: '#fff' }]}
                onPress={() => setDatePickerVisible(true)}
              >
                <Text style={styles.dropdownText}>
                  📅 {selectedDateVal ? selectedDateVal.split(" ")[0] : 'Select Date'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.dropdownSelector, { flex: 0.48, marginTop: 0, borderColor: '#86efac', backgroundColor: '#fff' }]}
                onPress={() => setTimePickerVisible(true)}
              >
                <Text style={styles.dropdownText}>
                  ⏰ {selectedTimeVal ? selectedTimeVal : 'Select Time'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={{ 
                backgroundColor: (selectedDateISO && selectedTimeVal) ? '#0284c7' : '#cbd5e1', 
                paddingVertical: 12, 
                borderRadius: 10, 
                alignItems: 'center' 
              }}
              disabled={!selectedDateISO || !selectedTimeVal}
              onPress={handleBookAppointment}
            >
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Update Appointment Slot</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Cost Approval Container */}
        {ticket.status === 'ESTIMATE_SUBMITTED' && (
          <View style={styles.approvalBox}>
            <Text style={styles.approvalTitle}>💸 Estimate Cost Approval Needed</Text>
            <Text style={styles.estimateAmount}>₱{ticket.estimated_cost?.toLocaleString()}</Text>
            <Text style={styles.approvalDesc}>Please review the estimate of material/labor cost and approve to start repair.</Text>
            <TouchableOpacity style={[styles.acceptBtn, { backgroundColor: themeColor || '#0038a8', width: '100%', paddingVertical: 14, borderRadius: 12 }]} onPress={handleApproveEstimate}>
              <Text style={styles.acceptBtnText}>Approve & Start Repair</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Completed Proof / After Photo Container */}
        {['COMPLETED', 'CLOSED'].includes(ticket.status) && (
          <View style={styles.approvalBox}>
            <Text style={[styles.approvalTitle, { color: '#166534' }]}>🎉 Repair Completed</Text>
            {ticket.after_photo_url && (
              <Image source={{ uri: ticket.after_photo_url }} style={styles.ticketImagePreview} />
            )}
            <Text style={[styles.ticketDate, { color: '#15803d', marginTop: 10 }]}>Finished: {formatSecureDate(ticket.booked_at)}</Text>
            
            <View style={{ backgroundColor: '#f0fdf4', padding: 12, borderRadius: 10, marginTop: 12, borderWidth: 1, borderColor: '#bbf7d0' }}>
              <Text style={{ color: '#166534', fontSize: 13, fontWeight: '700' }}>
                💵 Billing Summary:
              </Text>
              {ticket.estimated_cost && ticket.estimated_cost > 0 ? (
                <Text style={{ color: '#14532d', fontSize: 13, fontWeight: '800', marginTop: 4 }}>
                  ₱{ticket.estimated_cost.toLocaleString()} has been successfully added to your next monthly statement.
                </Text>
              ) : (
                <Text style={{ color: '#15803d', fontSize: 13, fontWeight: '600', marginTop: 4 }}>
                  This service was completed free of charge (₱0). No additional charges will appear on your bill.
                </Text>
              )}
            </View>
          </View>
        )}

        <View style={styles.dividerLine} />
        
        <Text style={styles.stepperSectionHeading}>📍 Progress Tracking Ledger</Text>
        {statusSteps.map((step, idx) => {
          const isPassed = idx <= currentStepIndex;
          const isCurrent = idx === currentStepIndex;
          const targetRawTime = stepTimes[step.key];
          const displayTime = targetRawTime ? formatSecureDate(targetRawTime) : null;
          
          return (
            <View key={step.key}>
              {/* Step rendering logic */}
              <View style={styles.vStepRow}>
                <View style={styles.leftLineColumn}>
                  <View style={[styles.vStepDot, isPassed && { backgroundColor: themeColor || '#0038a8' }, isCurrent && styles.currentDotShadow]} />
                  {idx < statusSteps.length - 1 && <View style={[styles.vVerticalLine, idx < currentStepIndex && { backgroundColor: themeColor || '#0038a8' }]} />}
                </View>
                <View style={styles.rightContentRowInline}>
                  <Text style={[styles.vStepLabel, isPassed && { color: '#0f172a', fontWeight: '700' }]}>{step.label}</Text>
                  {displayTime && displayTime !== '-' ? (
                    <Text style={[styles.vStepTimeInline, isCurrent && { color: themeColor || '#0038a8', fontWeight: '700' }]}>{displayTime}</Text>
                  ) : (
                    <Text style={styles.vStepTimePendingInline}>{isPassed ? '✓ Done' : '-'}</Text>
                  )}
                </View>
              </View>
            </View>
          );
        })}

        {!['IN_PROGRESS', 'COMPLETED', 'CLOSED', 'CANCELED'].includes(ticket.status) && (
          <TouchableOpacity style={styles.cancelOrderBtn} onPress={() => handleCancelOrder(ticket.id)}>
            <Text style={styles.cancelOrderBtnText}>❌ Cancel Job Order</Text>
          </TouchableOpacity>
        )}
        
        <View style={{ height: 40 }} />
      </ScrollView>

      {rejectModalVisible && (
        <View style={[styles.dialogOverlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }]}>
          <View style={styles.dialogCardWindow}>
            <Text style={styles.dialogTitle}>✍️ Request Schedule Change</Text>
            <Text style={styles.dialogDesc}>Select preferred day/hours so engineering staff can adjust.</Text>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              <TouchableOpacity 
                style={[styles.dropdownSelector, { flex: 0.48 }]}
                onPress={() => setDatePickerVisible(true)}
              >
                <Text style={styles.dropdownText}>
                  📅 {selectedDateVal ? selectedDateVal.split(" ")[0] : 'Select Date'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.dropdownSelector, { flex: 0.48 }]}
                onPress={() => setTimePickerVisible(true)}
              >
                <Text style={styles.dropdownText}>
                  ⏰ {selectedTimeVal ? selectedTimeVal : 'Select Time'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dialogBtnRow}>
              <TouchableOpacity style={styles.dialogCancelBtn} onPress={() => setRejectModalVisible(false)}><Text style={styles.dialogCancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.dialogSubmitBtn, { backgroundColor: themeColor || '#0038a8' }]} onPress={handleRejectTimeSubmit}><Text style={styles.dialogSubmitBtnText}>Send Request</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Date Dropdown Modal */}
      <Modal animationType="slide" transparent={true} visible={datePickerVisible} onRequestClose={() => setDatePickerVisible(false)}>
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCardWindow}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#0f172a' }}>🗓️ Select Preferred Date</Text>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {getNext10Days().map((day) => (
                <TouchableOpacity 
                  key={day.dateStr} 
                  style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', alignItems: 'center' }}
                  onPress={() => {
                    setSelectedDateVal(day.label);
                    setSelectedDateISO(day.dateStr);
                    setDatePickerVisible(false);
                  }}
                >
                  <Text style={{ fontSize: 15, color: themeColor || '#0038a8', fontWeight: '600' }}>{day.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={{ marginTop: 15, width: '100%', paddingVertical: 10, borderRadius: 8, backgroundColor: '#f1f5f9' }} onPress={() => setDatePickerVisible(false)}>
              <Text style={{ color: '#475569', fontWeight: '600', textAlign: 'center' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Time Dropdown Modal */}
      <Modal animationType="slide" transparent={true} visible={timePickerVisible} onRequestClose={() => setTimePickerVisible(false)}>
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCardWindow}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#0f172a' }}>⏰ Select Preferred Time Slot</Text>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              {timeSlots.map((slot) => {
                const isBooked = selectedDateISO ? isTimeSlotColliding(selectedDateISO, slot) : false;
                return (
                  <TouchableOpacity 
                    key={slot} 
                    disabled={isBooked}
                    style={{ 
                      paddingVertical: 14, 
                      borderBottomWidth: 1, 
                      borderBottomColor: '#f1f5f9', 
                      alignItems: 'center',
                      opacity: isBooked ? 0.35 : 1
                    }}
                    onPress={() => {
                      setSelectedTimeVal(slot);
                      setTimePickerVisible(false);
                    }}
                  >
                    <Text style={{ 
                      fontSize: 15, 
                      color: isBooked ? '#94a3b8' : (themeColor || '#0038a8'), 
                      fontWeight: '600',
                      textDecorationLine: isBooked ? 'line-through' : 'none'
                    }}>
                      {slot} {isBooked ? '(Already Booked)' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={{ marginTop: 15, width: '100%', paddingVertical: 10, borderRadius: 8, backgroundColor: '#f1f5f9' }} onPress={() => setTimePickerVisible(false)}>
              <Text style={{ color: '#475569', fontWeight: '600', textAlign: 'center' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Technician Info Modal */}
      <Modal animationType="fade" transparent={true} visible={techModalVisible} onRequestClose={() => setTechModalVisible(false)}>
        <View style={styles.dialogOverlay}>
          <View style={[styles.dialogCardWindow, { alignItems: 'center', padding: 24 }]}>
            <Text style={[styles.dialogTitle, { fontSize: 18, color: '#166534', marginBottom: 10 }]}>👷 Dispatched Technician</Text>
            
            <Image 
              source={{ uri: ticket.assigned_tech?.avatar_url || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=200' }} 
              style={styles.largeTechAvatar} 
            />
            
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 4, textAlign: 'center' }}>
              {ticket.assigned_tech?.full_name}
            </Text>
            
            <Text style={{ fontSize: 13, color: '#15803d', fontWeight: '700', marginBottom: 12 }}>
              Engineering Department Staff
            </Text>
            
            <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center', lineHeight: 18, marginBottom: 20 }}>
              This team member is authorized by FiliCondo management to perform maintenance services in your unit.
            </Text>

            <TouchableOpacity 
              style={[styles.dialogSubmitBtn, { backgroundColor: themeColor || '#0038a8', width: '100%', paddingVertical: 12, borderRadius: 10 }]} 
              onPress={() => setTechModalVisible(false)}
            >
              <Text style={styles.dialogSubmitBtnText}>Close Details</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fafbfd', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  header: { height: 56, backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  backBtn: { paddingVertical: 4 },
  backIcon: { fontSize: 14, fontWeight: '700' },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  ticketTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  ticketDate: { fontSize: 12, color: '#94a3b8', marginTop: 6, fontWeight: '500' },
  ticketDesc: { fontSize: 14, color: '#475569', lineHeight: 22, marginTop: 12 },
  ticketImagePreview: { width: '100%', height: 180, borderRadius: 14, marginTop: 16, resizeMode: 'cover' },
  dividerLine: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 20 },
  stepperSectionHeading: { fontSize: 13, fontWeight: '800', color: '#64748b', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  vStepRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 10, position: 'relative' },
  leftLineColumn: { width: 24, alignItems: 'center', justifyContent: 'center' },
  vStepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#cbd5e1', zIndex: 2 },
  currentDotShadow: { borderWidth: 2, borderColor: '#bae6fd', backgroundColor: '#0038a8' },
  vVerticalLine: { width: 2, backgroundColor: '#e2e8f0', position: 'absolute', top: 16, bottom: -24, left: 11, zIndex: 1 },
  rightContentRowInline: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 12 },
  vStepLabel: { fontSize: 14, color: '#64748b', fontWeight: '500' },
  vStepTimeInline: { fontSize: 13, color: '#475569', fontWeight: '500', textAlign: 'right' },
  vStepTimePendingInline: { fontSize: 13, color: '#cbd5e1', fontWeight: '400', textAlign: 'right' },
  timeActionContainer: { backgroundColor: '#f0f9ff', borderRadius: 16, borderWidth: 1, borderColor: '#e0f2fe', padding: 16, marginTop: 24 },
  timeRequestTitle: { fontSize: 13, fontWeight: '800', color: '#0369a1', textTransform: 'uppercase' },
  proposedTimeHighlight: { fontSize: 18, fontWeight: '900', color: '#0c4a6e', marginVertical: 10 },
  dualBtnWrapperRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  rejectBtn: { flex: 0.46, paddingVertical: 14, backgroundColor: '#fff', borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#fee2e2' },
  rejectBtnText: { color: '#ef4444', fontSize: 13, fontWeight: '700' },
  acceptBtn: { flex: 0.5, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  acceptBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  approvalBox: { backgroundColor: '#f0f9ff', padding: 20, borderRadius: 16, marginTop: 24, borderWidth: 1, borderColor: '#bae6fd' },
  approvalTitle: { fontSize: 13, fontWeight: '800', color: '#0369a1', textTransform: 'uppercase' },
  estimateAmount: { fontSize: 24, fontWeight: '900', color: '#0c4a6e', marginVertical: 8 },
  approvalDesc: { fontSize: 12, color: '#475569', marginBottom: 16 },
  cancelOrderBtn: { marginTop: 20, paddingVertical: 14, backgroundColor: '#fef2f2', borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#fee2e2' },
  cancelOrderBtnText: { color: '#ef4444', fontSize: 14, fontWeight: '700' },
  pendingText: { fontSize: 12, color: '#94a3b8', marginTop: 10, fontStyle: 'italic', textAlign: 'center' },
  techProfileBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0fdf4', padding: 14, borderRadius: 16, marginTop: 24, borderWidth: 1, borderColor: '#bbf7d0' },
  techAvatar: { width: 46, height: 46, borderRadius: 23, marginRight: 12, borderWidth: 1, borderColor: '#86efac' },
  techAvatarPlaceholder: { width: 46, height: 46, borderRadius: 23, marginRight: 12, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center' },
  techNameText: { color: '#166534', fontWeight: 'bold', fontSize: 15 },
  techRoleText: { color: '#15803d', fontSize: 12, marginTop: 2 },
  dialogOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  dialogCardWindow: { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 20 },
  dialogTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  dialogDesc: { fontSize: 12, color: '#64748b', marginTop: 6, lineHeight: 18 },
  dialogTextInput: { backgroundColor: '#f1f5f9', borderRadius: 10, padding: 12, fontSize: 13, color: '#0f172a', marginTop: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  dialogBtnRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  dialogCancelBtn: { flex: 0.35, paddingVertical: 11, backgroundColor: '#f1f5f9', borderRadius: 8, alignItems: 'center' },
  dialogCancelBtnText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  dialogSubmitBtn: { flex: 0.6, paddingVertical: 11, borderRadius: 8, alignItems: 'center' },
  dialogSubmitBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  largeTechAvatar: { width: 180, height: 180, borderRadius: 90, alignSelf: 'center', marginVertical: 20, borderWidth: 3, borderColor: '#10b981' },
  dropdownSelector: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  dropdownText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
  },
  persistedTechCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 14,
    borderRadius: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  chatBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  }
});