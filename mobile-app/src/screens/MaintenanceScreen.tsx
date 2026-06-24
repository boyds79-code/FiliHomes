import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Platform, StatusBar, TouchableOpacity, FlatList, TextInput, Modal, Alert, ActivityIndicator, Image, ScrollView, KeyboardAvoidingView, Dimensions, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext';
import { JobStatus, RepairTicket } from '../types/jobOrder';
import { API_BASE_URL } from '../api/apiClient';
import { useUnit } from '../contexts/UnitContext';

const { width } = Dimensions.get('window');

export default function MaintenanceScreen({ navigation }: any) {
  const { themeColor, unitId } = useCondoConfig();
  const { currentUnit } = useUnit();
  const activeUnitId = currentUnit?.unit_id || unitId;
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tickets, setTickets] = useState<RepairTicket[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(null);

  const [selectedDateVal, setSelectedDateVal] = useState('');
  const [selectedDateISO, setSelectedDateISO] = useState('');
  const [selectedTimeVal, setSelectedTimeVal] = useState('');
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  
  const [numTechs, setNumTechs] = useState<number>(1);
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'PROGRESS' | 'HISTORY'>('PROGRESS');
  const scrollViewRef = useRef<ScrollView>(null);

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

  const isTimeSlotFullyBooked = (dateStr: string, slotStr: string) => {
    const slotISO = parseDateTimeToISO(dateStr, slotStr);
    if (!slotISO) return false;
    const slotTimeMs = new Date(slotISO).getTime();
    if (isNaN(slotTimeMs)) return false;

    let conflictCount = 0;
    for (const booking of allBookings) {
      if (!booking.proposed_visit_time) continue;
      const bookingTimeMs = new Date(booking.proposed_visit_time).getTime();
      if (isNaN(bookingTimeMs)) continue;

      const diffMin = Math.abs(slotTimeMs - bookingTimeMs) / (1000 * 60);
      if (diffMin < 60) {
        conflictCount++;
      }
    }
    return conflictCount >= numTechs;
  };

  const fetchAvailability = async () => {
    try {
      const { data: techs } = await supabase
        .from('staff_profiles')
        .select('id')
        .eq('role', 'TECHNICIAN');
      
      const totalTechs = techs ? techs.length : 1;
      setNumTechs(totalTechs > 0 ? totalTechs : 1);

      const { data: bookings } = await supabase
        .from('job_orders')
        .select('proposed_visit_time, assigned_technician_id')
        .in('status', ['VISIT_CONFIRMED', 'VISITING', 'IN_PROGRESS']);
      
      if (bookings) {
        setAllBookings(bookings.filter((b: any) => b.proposed_visit_time));
      }
    } catch (err) {
      console.error("Error fetching tech availability:", err);
    }
  };

  const findFreeTechnicianId = async (combinedISO: string) => {
    try {
      const slotTimeMs = new Date(combinedISO).getTime();
      if (isNaN(slotTimeMs)) return null;

      const { data: techs } = await supabase
        .from('staff_profiles')
        .select('id')
        .eq('role', 'TECHNICIAN');

      if (!techs || techs.length === 0) return null;

      for (const tech of techs) {
        const hasConflict = allBookings.some((booking) => {
          if (booking.assigned_technician_id !== tech.id) return false;
          if (!booking.proposed_visit_time) return false;
          const bookingTimeMs = new Date(booking.proposed_visit_time).getTime();
          const diffMin = Math.abs(slotTimeMs - bookingTimeMs) / (1000 * 60);
          return diffMin < 60;
        });

        if (!hasConflict) {
          return tech.id;
        }
      }
    } catch (err) {
      console.error("Error finding free technician:", err);
    }
    return null;
  };

  const fetchActiveRepairTickets = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        console.log("DEBUG - 세션 유저 없음, 여기서 에러 방지 완료.");
        return;
      }
      if (!activeUnitId) { setLoading(false); setTickets([]); return; }

      const { data: results, error } = await supabase
        .from('job_orders')
        .select('*')
        .eq('unit_id', activeUnitId.replace(/['"]/g, ''))
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!results) { setTickets([]); return; }

      // 기술자 정보를 병렬로 조회하여 매핑
      const parsed = await Promise.all(results.map(async (t) => {
        let techInfo = null;
        if (t.assigned_technician_id) {
          const { data: techData } = await supabase
            .from('staff_profiles')
            .select('full_name, avatar_url')
            .eq('id', t.assigned_technician_id)
            .single();
          techInfo = techData;
        }
        return { ...t, id: t.id.toString(), assigned_tech: techInfo } as RepairTicket;
      }));
      setTickets(parsed);
    } catch (err) {
      console.error("Fetch Error:", err);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [activeUnitId]);

  useEffect(() => {
    if (!activeUnitId) return;
    fetchActiveRepairTickets();
    fetchAvailability();

    const channel = supabase.channel(`mobile_job_orders_${activeUnitId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_orders', filter: `unit_id=eq.${activeUnitId.replace(/['"]/g, '')}` }, 
        () => {
          fetchActiveRepairTickets();
          fetchAvailability();
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeUnitId, fetchActiveRepairTickets]);

  const handlePickImage = async () => {
    Alert.alert(
      "Select Image",
      "Choose an option to attach a photo",
      [
        {
          text: "Take Photo",
          onPress: async () => {
            const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
            if (!cameraPermission.granted) {
              Alert.alert("Permission Required", "Please allow access to your camera to take a photo.");
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [4, 3],
              quality: 0.6,
              base64: true,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
              setSelectedImage(result.assets[0].uri);
              setSelectedImageBase64(result.assets[0].base64 || null);
            }
          }
        },
        {
          text: "Choose from Gallery",
          onPress: async () => {
            const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!libraryPermission.granted) {
              Alert.alert("Permission Required", "Please allow access to your photos.");
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [4, 3],
              quality: 0.6,
              base64: true,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
              setSelectedImage(result.assets[0].uri);
              setSelectedImageBase64(result.assets[0].base64 || null);
            }
          }
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
  };

  const handleModifySubmit = async () => {
    if (!activeUnitId) return Alert.alert("Error", "Unit information is not available.");
    if (!newTitle.trim() || !newDesc.trim()) return Alert.alert("Missing Fields", "Please enter title and description.");
    setSubmitting(true);
    
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      console.log("DEBUG - 세션 유저 없음");
      setSubmitting(false);
      return;
    }
    
    let uploadedPublicUrl = null;
    if (selectedImage && selectedImageBase64) {
      try {
        const fileName = `${userId}/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('repairs')
          .upload(fileName, decode(selectedImageBase64), { contentType: 'image/jpeg' });
          
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('repairs').getPublicUrl(fileName);
        uploadedPublicUrl = urlData.publicUrl;
      } catch (uploadErr: any) {
        console.error("Storage upload failed:", uploadErr);
        Alert.alert("Upload Error", "Failed to upload photo to storage: " + uploadErr.message);
        setSubmitting(false);
        return;
      }
    }

    // 🎯 [수정된 부분] 직접 DB에 찌르는 대신 서버 API 호출
    try {
      let proposedVisitTime = null;
      let assignedTechId = null;

      if (selectedDateISO && selectedTimeVal) {
        proposedVisitTime = parseDateTimeToISO(selectedDateISO, selectedTimeVal);
        assignedTechId = await findFreeTechnicianId(proposedVisitTime);
      }

      const response = await fetch(`${API_BASE_URL}/api/maintenance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          title: newTitle.trim(),
          description: newDesc.trim(),
          imageUrl: uploadedPublicUrl,
          unitId: activeUnitId.replace(/['"]/g, ''),
          condoId: currentUnit?.condo_id || 'c1111111-1111-1111-1111-111111111111',
          proposedVisitTime,
          assignedTechId
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit maintenance request");
      }
      
      Alert.alert("Success", "Maintenance request submitted!");
      setModalVisible(false);
      setNewTitle('');
      setNewDesc('');
      setSelectedImage(null);
      setSelectedImageBase64(null);
      setSelectedDateVal('');
      setSelectedDateISO('');
      setSelectedTimeVal('');
      fetchActiveRepairTickets();
    } catch (error: any) {
      Alert.alert("Submission Error", error.message);
    } finally {
      setSubmitting(false);
    }
  };
  const getFriendlyStatus = (status: string) => {
    switch (status) {
      case 'REQUESTED':
        return 'Filed';
      case 'ASSIGNED':
      case 'ACKNOWLEDGED':
      case 'CHECKED_BY_TECH':
        return 'Tech Assigned';
      case 'TIME_NEGOTIATING':
      case 'VISIT_PROPOSED':
        return 'Scheduling';
      case 'VISIT_CONFIRMED':
        return 'Time Confirmed';
      case 'VISITING':
        return 'Arrived at Unit';
      case 'ESTIMATE_SUBMITTED':
        return 'Cost Approval Pending';
      case 'IN_PROGRESS':
        return 'In Progress';
      case 'COMPLETED':
        return 'Finished';
      case 'CANCELED':
        return 'Canceled';
      case 'CLOSED':
        return 'Closed';
      default:
        return status;
    }
  };

  const renderTicketItem = ({ item }: { item: RepairTicket }) => {
    const isHistory = 
      (item.status as string) === 'COMPLETED' || 
      (item.status as string) === 'CLOSED' || 
      (item.status as string) === 'RESOLVED' || 
      (item.status as string) === 'CANCELED' || 
      (item.status as string) === 'CANCELLED';

    const isFinished = 
      (item.status as string) === 'COMPLETED' || 
      (item.status as string) === 'CLOSED' || 
      (item.status as string) === 'RESOLVED';

    const costVal = Number(item.estimated_cost || 0);
    const costText = costVal > 0 ? `₱${costVal.toLocaleString()}` : 'Free';

    const dateStr = new Date(item.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    return (
      <TouchableOpacity 
        style={[
          styles.listItem,
          isFinished && styles.finishedHighlight
        ]} 
        onPress={() => navigation.navigate('JobOrderDetail', { ticketId: item.id })}
      >
        <View style={styles.listTextContainer}>
          <Text style={styles.listTitle}>{item.title}</Text>
          <Text style={styles.listStatus}>Status: {getFriendlyStatus(item.status)}</Text>
          {isHistory && (
            <Text style={styles.listDate}>Requested: {dateStr}</Text>
          )}
          {isFinished && (
            <Text style={[styles.listCost, costVal > 0 ? { color: '#0f172a', fontWeight: '700' } : { color: '#10b981', fontWeight: '700' }]}>
              Cost: {costText}
            </Text>
          )}
        </View>
        <Text style={styles.chevronIcon}>❯</Text>
      </TouchableOpacity>
    );
  };

  const progressTickets = tickets.filter(
    (t) => 
      (t.status as string) !== 'COMPLETED' && 
      (t.status as string) !== 'CLOSED' && 
      (t.status as string) !== 'CANCELED' && 
      (t.status as string) !== 'CANCELLED' && 
      (t.status as string) !== 'RESOLVED'
  );
  
  const historyTickets = tickets.filter(
    (t) => 
      (t.status as string) === 'COMPLETED' || 
      (t.status as string) === 'CLOSED' || 
      (t.status as string) === 'CANCELED' || 
      (t.status as string) === 'CANCELLED' || 
      (t.status as string) === 'RESOLVED'
  );

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const pageIndex = Math.round(offsetX / width);
    if (pageIndex === 0) {
      setActiveTab('PROGRESS');
    } else {
      setActiveTab('HISTORY');
    }
  };

  const selectTab = (tab: 'PROGRESS' | 'HISTORY') => {
    setActiveTab(tab);
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        x: tab === 'PROGRESS' ? 0 : width,
        animated: true,
      });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backBtn} 
          onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home')}
        >
          <Text style={styles.backIcon}>❮ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job Order</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Segmented Top Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'PROGRESS' && { borderBottomColor: themeColor || '#0038a8' }]}
          onPress={() => selectTab('PROGRESS')}
        >
          <Text style={[styles.tabLabel, activeTab === 'PROGRESS' && { color: themeColor || '#0038a8', fontWeight: '700' }]}>
            Order Progress ({progressTickets.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'HISTORY' && { borderBottomColor: themeColor || '#0038a8' }]}
          onPress={() => selectTab('HISTORY')}
        >
          <Text style={[styles.tabLabel, activeTab === 'HISTORY' && { color: themeColor || '#0038a8', fontWeight: '700' }]}>
            History ({historyTickets.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        style={{ flex: 1 }}
      >
        {/* Page 1: Order Progress */}
        <View style={{ width: width }}>
          <FlatList
            data={progressTickets}
            keyExtractor={(item) => item.id}
            renderItem={renderTicketItem}
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            ListEmptyComponent={
              <View style={styles.emptySectionView}>
                <Text style={styles.emptySectionText}>No ongoing repair requests.</Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
        </View>

        {/* Page 2: History */}
        <View style={{ width: width }}>
          <FlatList
            data={historyTickets}
            keyExtractor={(item) => item.id}
            renderItem={renderTicketItem}
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            ListEmptyComponent={
              <View style={styles.emptySectionView}>
                <Text style={styles.emptySectionText}>No repair history found.</Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
        </View>
      </ScrollView>
      <TouchableOpacity style={[styles.fabButton, { backgroundColor: themeColor }]} onPress={() => setModalVisible(true)}><Text style={styles.fabText}>+</Text></TouchableOpacity>

      {/* 🎯 모달 UI 추가 */}
<Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => setModalVisible(false)}>
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    style={styles.modalOverlay}
  >
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={StyleSheet.absoluteFillObject} />
    </TouchableWithoutFeedback>
    <View style={[styles.modalCardWindow, { width: '100%', maxHeight: Dimensions.get('window').height * 0.85 }]}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.modalHeaderTitle}>New Repair Request</Text>
        <TouchableOpacity style={styles.photoPickerBtn} onPress={handlePickImage}>
          {selectedImage ? <Image source={{ uri: selectedImage }} style={styles.uploadPreview} /> : <Text>+ Add Photo</Text>}
        </TouchableOpacity>
        <TextInput style={styles.titleInput} placeholder="Title" value={newTitle} onChangeText={setNewTitle} />
        <TextInput style={styles.contentInput} placeholder="Description" value={newDesc} onChangeText={setNewDesc} multiline />
        
        {/* Real-time Visit Scheduling */}
        <Text style={{ fontSize: 13, fontWeight: '800', color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>
          📅 Preferred Visit Appointment
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
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

        <View style={styles.modalBtnRow}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}><Text style={{ color: '#475569', fontWeight: '600' }}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.submitBtn, { backgroundColor: themeColor }]} onPress={handleModifySubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>

    {/* Absolute Positioned Pickers inside the parent Modal wrapper */}
    {datePickerVisible && (
      <View style={[styles.dialogOverlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 }]}>
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
    )}

    {timePickerVisible && (
      <View style={[styles.dialogOverlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 }]}>
        <View style={styles.dialogCardWindow}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#0f172a' }}>⏰ Select Preferred Time Slot</Text>
          <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
            {timeSlots.map((slot) => {
              const isBooked = selectedDateISO ? isTimeSlotFullyBooked(selectedDateISO, slot) : false;
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
                    {slot} {isBooked ? '(Fully Booked)' : ''}
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
    )}
  </KeyboardAvoidingView>
</Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fafbfd' },
  header: { 
    height: 56, 
    backgroundColor: '#fff', 
    flexDirection: 'row', // 가로 정렬
    alignItems: 'center', 
    justifyContent: 'space-between', // 버튼과 타이틀 배치
    paddingHorizontal: 16,
    borderBottomWidth: 1, 
    borderBottomColor: '#f1f5f9' 
  },
  backBtn: { padding: 8 },
  backIcon: { fontSize: 16, fontWeight: '700', color: '#0038a8' },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  historyBtn: { padding: 8 },
  historyBtnText: { fontSize: 14, fontWeight: '600', color: '#0038a8' },
  listItem: { flexDirection: 'row', backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 12, alignItems: 'center' },
  listTextContainer: { flex: 1 },
  listTitle: { fontSize: 15, fontWeight: '700' },
  listStatus: { fontSize: 12, color: '#64748b' },
  chevronIcon: { fontSize: 14, color: '#cbd5e1' },
  fabButton: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 4 },
  fabText: { fontSize: 28, color: '#fff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCardWindow: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeaderTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  photoPickerBtn: { width: '100%', height: 130, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1', marginBottom: 14, justifyContent: 'center', alignItems: 'center' },
  uploadPreview: { width: '100%', height: '100%', borderRadius: 12 },
  titleInput: { height: 45, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 10, marginBottom: 10 },
  contentInput: { height: 90, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 10, marginBottom: 20 },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cancelBtn: { flex: 0.48, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 10 },
  submitBtn: { flex: 0.48, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  submitBtnText: { color: '#fff', fontWeight: 'bold' },
  emptyTitle: { textAlign: 'center', marginTop: 50, color: '#64748b' },
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
  dialogOverlay: { 
    flex: 1, 
    backgroundColor: 'rgba(15, 23, 42, 0.4)', 
    justifyContent: 'center', 
    alignItems: 'center', 
    paddingHorizontal: 24 
  },
  dialogCardWindow: { 
    width: '100%', 
    backgroundColor: '#fff', 
    borderRadius: 20, 
    padding: 20 
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  emptySectionView: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptySectionText: {
    fontSize: 13,
    color: '#94a3b8',
  },
  listDate: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  listCost: {
    fontSize: 12,
    marginTop: 4,
  },
  finishedHighlight: {
    backgroundColor: '#f4fbf7',
    borderLeftWidth: 5,
    borderLeftColor: '#10b981',
    borderColor: '#e8f7ee',
    borderWidth: 1,
  }
});