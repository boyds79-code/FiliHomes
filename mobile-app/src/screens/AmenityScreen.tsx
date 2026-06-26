import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, SafeAreaView, Platform, StatusBar, FlatList, Modal, Dimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext'; 

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Amenity {
  id: string;
  name: string;
  max_capacity: number;
  icon: string;
  charge_enabled?: boolean;
  fee?: number;
}

interface TimeSlot {
  slot_time: string; 
  current_bookings: number;
}

const getAmenityIcon = (name: string) => {
  const lowercase = name.toLowerCase();
  if (lowercase.includes('pool') || lowercase.includes('cabana')) return '🏊';
  if (lowercase.includes('bbq') || lowercase.includes('grill') || lowercase.includes('cooking')) return '🍖';
  if (lowercase.includes('tennis') || lowercase.includes('court')) return '🎾';
  if (lowercase.includes('clubhouse') || lowercase.includes('lounge') || lowercase.includes('room')) return '🏛️';
  if (lowercase.includes('gym') || lowercase.includes('fitness')) return '🏋️';
  if (lowercase.includes('spa') || lowercase.includes('massage')) return '💆';
  return '🏢';
};

export default function AmenityScreen({ navigation }: any) {
  const { themeColor } = useCondoConfig();
  const todayStr = new Date().toISOString().split('T')[0];
  
  const [activeTab, setActiveTab] = useState<'BOOK' | 'MY_BOOKINGS'>('BOOK');
  const scrollViewRef = useRef<ScrollView>(null);

  const handleTabPress = (tabName: 'BOOK' | 'MY_BOOKINGS') => {
    setActiveTab(tabName);
    const idx = tabName === 'BOOK' ? 0 : 1;
    scrollViewRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: true });
  };

  const [loading, setLoading] = useState(true);
  const [bookingProgress, setBookingProgress] = useState(false);
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [selectedAmenity, setSelectedAmenity] = useState<Amenity | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr); 
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Booking history states
  const [myBookings, setMyBookings] = useState<any[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);

  // Reschedule states
  const [reschedulingBooking, setReschedulingBooking] = useState<any | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>(todayStr);
  const [rescheduleSlots, setRescheduleSlots] = useState<TimeSlot[]>([]);
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState<string | null>(null);
  const [rescheduleProgress, setRescheduleProgress] = useState(false);

  // Calendar states
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState<'NEW' | 'RESCHEDULE'>('NEW');
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  useEffect(() => {
    initAmenityData();
  }, []);

  useEffect(() => {
    if (selectedAmenity && selectedDate) {
      fetchTimeSlots();
    }
  }, [selectedAmenity, selectedDate]);

  useEffect(() => {
    if (activeTab === 'MY_BOOKINGS') {
      fetchMyBookings();
    }
  }, [activeTab]);

  useEffect(() => {
    if (reschedulingBooking && rescheduleDate) {
      fetchRescheduleSlots(reschedulingBooking.amenity_id, rescheduleDate);
    }
  }, [reschedulingBooking, rescheduleDate]);

  const initAmenityData = async () => {
    try {
      setLoading(true);
      
      // Get current condo configuration to fetch custom amenities list
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        useMockDataFallback();
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('condo_id, unit_id')
        .eq('id', userId)
        .single();

      let condoId = profile?.condo_id;

      if (!condoId && profile?.unit_id) {
        const { data: unitData } = await supabase
          .from('units')
          .select('condo_id')
          .eq('id', profile.unit_id)
          .single();
        if (unitData) {
          condoId = unitData.condo_id;
        }
      }

      if (condoId) {
        const { data: settings } = await supabase
          .from('condo_settings')
          .select('amenity_settings')
          .eq('condo_id', condoId)
          .maybeSingle();

        if (settings?.amenity_settings) {
          const rawSettings = settings.amenity_settings;
          const syncedAmenities = Object.keys(rawSettings)
            .filter(key => rawSettings[key].enabled)
            .map(key => ({
              id: key.toLowerCase().replace(/\s+/g, '_'),
              name: key,
              max_capacity: rawSettings[key].max_capacity !== undefined && rawSettings[key].max_capacity !== '' ? Number(rawSettings[key].max_capacity) : 10,
              icon: getAmenityIcon(key),
              charge_enabled: !!rawSettings[key].charge_enabled,
              fee: rawSettings[key].fee !== undefined && rawSettings[key].fee !== '' ? Number(rawSettings[key].fee) : 0
            }));

          if (syncedAmenities.length > 0) {
            // Sync/Upsert only the valid database columns to avoid columns error
            const dbPayload = syncedAmenities.map(({ id, name, max_capacity, icon }) => ({ id, name, max_capacity, icon }));
            await supabase.from('amenities').upsert(dbPayload);
            
            setAmenities(syncedAmenities);
            setSelectedAmenity(syncedAmenities[0]);
            setLoading(false);
            return;
          }
        }
      }

      // If condo settings is missing or doesn't have custom settings, fetch from database directly
      const { data, error } = await supabase
        .from('amenities')
        .select('*');

      if (!error && data && data.length > 0) {
        setAmenities(data);
        setSelectedAmenity(data[0]);
      } else {
        useMockDataFallback();
      }
    } catch (err) {
      console.log(err);
      useMockDataFallback();
    } finally {
      setLoading(false);
    }
  };

  const useMockDataFallback = () => {
    const mockAmenities = [
      { id: 'pool_cabana', name: 'Pool Cabana', max_capacity: 4, icon: '🏊' },
      { id: 'bbq_area', name: 'BBQ Area', max_capacity: 8, icon: '🍖' },
      { id: 'tennis_court', name: 'Tennis Court', max_capacity: 2, icon: '🎾' },
      { id: 'clubhouse', name: 'Clubhouse', max_capacity: 15, icon: '🏛️' }
    ];
    setAmenities(mockAmenities);
    setSelectedAmenity(mockAmenities[0]);
  };

  const fetchTimeSlots = async () => {
    if (!selectedAmenity) return;
    
    const standardSlots = [
      "07:00 AM - 09:00 AM",
      "09:00 AM - 11:00 AM",
      "01:00 PM - 03:00 PM",
      "03:00 PM - 05:00 PM",
      "06:00 PM - 08:00 PM"
    ];

    try {
      const { data } = await supabase
        .from('amenity_bookings')
        .select('slot_time')
        .eq('amenity_id', selectedAmenity.id)
        .eq('booking_date', selectedDate)
        .eq('status', 'CONFIRMED');

      const aggregatedSlots = standardSlots.map(slot => {
        const count = data ? data.filter(b => b.slot_time === slot).length : 0;
        return {
          slot_time: slot,
          current_bookings: count
        };
      });

      setTimeSlots(aggregatedSlots);
      setSelectedSlot(null); 
    } catch (err) {
      const demoSlots = standardSlots.map((slot, index) => ({
        slot_time: slot,
        current_bookings: index === 1 ? selectedAmenity.max_capacity : index 
      }));
      setTimeSlots(demoSlots);
    }
  };

  const fetchRescheduleSlots = async (amenityId: string, date: string) => {
    const standardSlots = [
      "07:00 AM - 09:00 AM",
      "09:00 AM - 11:00 AM",
      "01:00 PM - 03:00 PM",
      "03:00 PM - 05:00 PM",
      "06:00 PM - 08:00 PM"
    ];

    try {
      const { data } = await supabase
        .from('amenity_bookings')
        .select('slot_time')
        .eq('amenity_id', amenityId)
        .eq('booking_date', date)
        .eq('status', 'CONFIRMED');

      const targetAmenity = amenities.find(a => a.id === amenityId);
      const totalLimit = targetAmenity?.max_capacity || 10;

      const aggregatedSlots = standardSlots.map(slot => {
        const count = data ? data.filter(b => b.slot_time === slot).length : 0;
        return {
          slot_time: slot,
          current_bookings: count
        };
      });
      setRescheduleSlots(aggregatedSlots);
      setSelectedRescheduleSlot(null);
    } catch (err) {
      console.log(err);
    }
  };

  const fetchMyBookings = async () => {
    try {
      setBookingsLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('unit_id')
        .eq('id', userId)
        .single();

      if (!profile?.unit_id) return;

      const todayStr = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('amenity_bookings')
        .select(`
          id,
          booking_date,
          slot_time,
          status,
          amenity_id,
          amenities (
            id,
            name,
            icon
          )
        `)
        .eq('unit_id', profile.unit_id)
        .gte('booking_date', todayStr)
        .order('booking_date', { ascending: false });

      if (!error && data) {
        setMyBookings(data);
      }
    } catch (err) {
      console.log("Error loading bookings list:", err);
    } finally {
      setBookingsLoading(false);
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedAmenity || !selectedSlot || !selectedDate) {
      Alert.alert('Selection Incomplete', 'Please pick a facility, date, and time slot.');
      return;
    }

    try {
      setBookingProgress(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('unit_id')
        .eq('id', userId)
        .single();

      if (profileError || !profileData?.unit_id) {
        Alert.alert('Access Restricted', 'Your account is not assigned to any resident unit.');
        return;
      }

      const { error } = await supabase
        .from('amenity_bookings')
        .insert([{
          unit_id: profileData.unit_id,
          user_id: userId,
          amenity_id: selectedAmenity.id,
          booking_date: selectedDate,
          slot_time: selectedSlot,
          status: 'PENDING'
        }]);

      if (error) {
        if (error.code === '23505' || error.message.includes('unique')) {
          Alert.alert('Duplicate Request ⚠️', 'Your unit already holds an active reservation for this exact time slot.');
          return;
        }
        throw error;
      }

      // 🎯 Send push notification to Amenity Staff
      try {
        const { data: staffMembers } = await supabase
          .from('staff_profiles')
          .select('id')
          .eq('role', 'AMENITY_STAFF');
        
        if (staffMembers && staffMembers.length > 0) {
          const staffIds = staffMembers.map(s => s.id);
          const { data: staffProfiles } = await supabase
            .from('profiles')
            .select('expo_push_token')
            .in('id', staffIds)
            .not('expo_push_token', 'is', null);
          
          if (staffProfiles && staffProfiles.length > 0) {
            const pushTokens = staffProfiles.map(p => p.expo_push_token).filter(Boolean);
            if (pushTokens.length > 0) {
              const notifications = pushTokens.map(token => ({
                to: token,
                sound: 'default',
                title: `📅 New Booking Request`,
                body: `A new reservation request for the ${selectedAmenity.name} has been submitted.`,
                badge: 1,
                channelId: 'default',
                data: { type: 'AMENITY_BOOKING' }
              }));
              
              await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                  'Accept-encoding': 'gzip, deflate',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(notifications),
              }).catch(err => console.error("Error sending push notification to staff:", err));
            }
          }
        }
      } catch (pushErr) {
        console.error("Error dispatching staff booking notification:", pushErr);
      }

      Alert.alert('Booking Requested 📅', `Your request for the ${selectedAmenity.name} has been submitted for approval.`, [
        { text: 'OK', onPress: () => {
          setSelectedSlot(null);
          handleTabPress('MY_BOOKINGS');
        }}
      ]);

    } catch (err: any) {
      console.log(err);
      Alert.alert('Database Connection Error', 'Failed to log reservation ticket to the main office server.');
    } finally {
      setBookingProgress(false);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    Alert.alert(
      "Cancel Reservation",
      "Are you sure you want to cancel this booking?",
      [
        { text: "No", style: "cancel" },
        { 
          text: "Yes, Cancel", 
          style: "destructive",
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('amenity_bookings')
                .update({ status: 'CANCELLED' })
                .eq('id', bookingId);
              
              if (error) throw error;
              Alert.alert("Cancelled Success", "Your booking has been cancelled.");
              fetchMyBookings();
            } catch (err: any) {
              Alert.alert("Error", "Failed to cancel: " + err.message);
            }
          }
        }
      ]
    );
  };

  const handleOpenRescheduleModal = (booking: any) => {
    setReschedulingBooking(booking);
    setRescheduleDate(booking.booking_date);
    setSelectedRescheduleSlot(null);
  };

  const handleConfirmReschedule = async () => {
    if (!reschedulingBooking || !rescheduleDate || !selectedRescheduleSlot) {
      Alert.alert("Incomplete", "Please pick a date and slot.");
      return;
    }

    try {
      setRescheduleProgress(true);
      const { error } = await supabase
        .from('amenity_bookings')
        .update({
          booking_date: rescheduleDate,
          slot_time: selectedRescheduleSlot
        })
        .eq('id', reschedulingBooking.id);

      if (error) throw error;

      Alert.alert("Success 🎉", "Your booking schedule was successfully updated.");
      setReschedulingBooking(null);
      fetchMyBookings();
    } catch (err: any) {
      Alert.alert("Error", "Failed to reschedule: " + err.message);
    } finally {
      setRescheduleProgress(false);
    }
  };

  // Calendar Helpers
  const generateMonthDays = (monthDate: Date) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const numDays = new Date(year, month + 1, 0).getDate();
    
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    for (let d = 1; d <= numDays; d++) {
      days.push(d);
    }
    return days;
  };

  const formatDateString = (year: number, month: number, day: number) => {
    const mm = (month + 1).toString().padStart(2, '0');
    const dd = day.toString().padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  };

  const handlePrevMonth = () => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };
  
  const handleNextMonth = () => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleSelectDay = (day: number) => {
    const selectedStr = formatDateString(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
    if (calendarTarget === 'NEW') {
      setSelectedDate(selectedStr);
    } else {
      setRescheduleDate(selectedStr);
    }
    setIsCalendarVisible(false);
  };

  const getAmenityName = (item: any) => {
    if (item.amenities?.name) return item.amenities.name;
    return item.amenity_id.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
  };

  const getAmenityIconDisplay = (item: any) => {
    if (item.amenities?.icon) return item.amenities.icon;
    return getAmenityIcon(item.amenity_id);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={themeColor || '#0038a8'} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeAreaContainer}>
      <View style={styles.navHeader}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.6}>
          <Text style={[styles.backIcon, { color: themeColor || '#0038a8' }]}>❮</Text>
          <Text style={styles.backText}>Home</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Amenity Center</Text>
        <View style={{ width: 60 }} /> 
      </View>

      {/* Tab Menu */}
      <View style={styles.mainTabBar}>
        <TouchableOpacity style={[styles.mainTab, activeTab === 'BOOK' && { borderBottomColor: themeColor || '#0038a8' }]} onPress={() => handleTabPress('BOOK')}>
          <Text style={[styles.mainTabLabel, activeTab === 'BOOK' && { color: themeColor || '#0038a8', fontWeight: '700' }]}>Book Amenity</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.mainTab, activeTab === 'MY_BOOKINGS' && { borderBottomColor: themeColor || '#0038a8' }]} onPress={() => handleTabPress('MY_BOOKINGS')}>
          <Text style={[styles.mainTabLabel, activeTab === 'MY_BOOKINGS' && { color: themeColor || '#0038a8', fontWeight: '700' }]}>My Bookings</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          const tabs: ('BOOK' | 'MY_BOOKINGS')[] = ['BOOK', 'MY_BOOKINGS'];
          if (tabs[index]) {
            setActiveTab(tabs[index]);
          }
        }}
        style={{ flex: 1 }}
      >
        <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
          <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          <Text style={styles.headerSub}>Reserve community facilities in advance. Capacity limits are enforced for safety.</Text>

          {/* Amenities Facility selection grid */}
          <Text style={styles.sectionLabel}>Select Facility</Text>
          {amenities.length === 0 ? (
            <Text style={styles.emptyText}>No registered amenities found for this property.</Text>
          ) : (
            <View style={styles.amenityRow}>
              {amenities.map((item) => {
                const isSelected = selectedAmenity?.id === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.amenityCard, isSelected && { borderColor: themeColor || '#0038a8', backgroundColor: '#f0f9ff' }]}
                    onPress={() => setSelectedAmenity(item)}
                  >
                    <Text style={styles.amenityIcon}>{item.icon || '🏊'}</Text>
                    <Text style={[styles.amenityName, isSelected && { color: themeColor || '#0038a8', fontWeight: 'bold' }]}>
                      {item.name}
                    </Text>
                    <Text style={styles.capacityText}>Limit: {item.max_capacity} pax</Text>
                    {item.charge_enabled && item.fee ? (
                      <Text style={styles.feeText}>₱{item.fee}</Text>
                    ) : (
                      <Text style={styles.feeText}>Free</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Target Booking Date Picker */}
          <Text style={styles.dateSectionLabel}>Select Date</Text>
          <TouchableOpacity 
            style={styles.datePickerInput}
            onPress={() => {
              setCalendarTarget('NEW');
              setCalendarMonth(new Date(selectedDate || Date.now()));
              setIsCalendarVisible(true);
            }}
          >
            <Text style={styles.datePickerInputText}>
              📅 {new Date(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', weekday: 'short' })}
            </Text>
          </TouchableOpacity>

          {/* Slots Selector List */}
          <Text style={styles.sectionLabel}>Available Time Slots</Text>
          <Text style={styles.sectionSubLabel}>Each slot is subject to building capacity auditing rules.</Text>
          
          <View style={styles.slotContainer}>
            {timeSlots.map((slot) => {
              const totalLimit = selectedAmenity?.max_capacity || 10;
              const slotsLeft = totalLimit - slot.current_bookings;
              const isFull = slotsLeft <= 0;
              const isSelected = selectedSlot === slot.slot_time;

              return (
                <TouchableOpacity
                  key={slot.slot_time}
                  disabled={isFull}
                  style={[
                    styles.slotRow,
                    isSelected && { borderColor: themeColor || '#0038a8', backgroundColor: '#f0f9ff' },
                    isFull && { backgroundColor: '#f1f5f9', opacity: 0.5 }
                  ]}
                  onPress={() => setSelectedSlot(slot.slot_time)}
                >
                  <Text style={[styles.slotTimeText, isSelected && { color: themeColor || '#0038a8', fontWeight: 'bold' }]}>
                    ⏰ {slot.slot_time}
                  </Text>
                  <Text style={[styles.slotCountText, isFull ? { color: '#c62828' } : { color: '#16a34a' }]}>
                    {isFull ? 'FULLY BOOKED' : `${slotsLeft} / ${totalLimit} Spots Left`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Booking submit button */}
          {selectedSlot && (
            <TouchableOpacity
              style={[styles.bookingSubmitBtn, { backgroundColor: themeColor || '#0038a8' }]}
              onPress={handleConfirmBooking}
              disabled={bookingProgress}
            >
              {bookingProgress ? <ActivityIndicator color="#fff" /> : <Text style={styles.bookingSubmitBtnText}>Confirm Reservation Ticket</Text>}
            </TouchableOpacity>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      {/* MY BOOKINGS TAB */}
      <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          {bookingsLoading ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={themeColor || '#0038a8'} />
            </View>
          ) : (
            <FlatList
              data={myBookings}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16 }}
              ListEmptyComponent={<Text style={styles.emptyHistoryText}>No booking history found.</Text>}
              renderItem={({ item }) => {
                const isConfirmed = item.status === 'CONFIRMED';
                const dateLabel = new Date(item.booking_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', weekday: 'short' });
                
                return (
                  <View style={styles.bookingCard}>
                    <View style={styles.bookingCardHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ fontSize: 22, marginRight: 8 }}>{getAmenityIconDisplay(item)}</Text>
                        <Text style={styles.bookingAmenityName}>{getAmenityName(item)}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: isConfirmed ? '#eafaf1' : '#fef2f2', borderColor: isConfirmed ? '#d1fae5' : '#fee2e2' }]}>
                        <Text style={[styles.statusText, { color: isConfirmed ? '#16a34a' : '#ef4444' }]}>{item.status}</Text>
                      </View>
                    </View>
                    
                    <View style={styles.bookingCardDetails}>
                      <Text style={styles.bookingDetailsText}>📅 {dateLabel}</Text>
                      <Text style={styles.bookingDetailsText}>🕒 {item.slot_time}</Text>
                    </View>

                    {isConfirmed && (
                      <View style={styles.bookingCardActions}>
                        <TouchableOpacity style={[styles.actionBtn, { borderColor: '#ef4444' }]} onPress={() => handleCancelBooking(item.id)}>
                          <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 13 }}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, { borderColor: themeColor || '#0038a8', backgroundColor: themeColor || '#0038a8' }]} onPress={() => handleOpenRescheduleModal(item)}>
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Reschedule</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>
    </ScrollView>

      {/* Rescheduling Modal dialog */}
      <Modal visible={reschedulingBooking !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardWindow}>
            <Text style={styles.modalHeaderTitle}>🛠️ Reschedule Reservation</Text>
            {reschedulingBooking && (
              <Text style={{ color: '#64748b', fontSize: 13, marginBottom: 15, textAlign: 'center' }}>
                Rescheduling slot for: {getAmenityName(reschedulingBooking)}
              </Text>
            )}

            {/* Reschedule Date Selector */}
            <Text style={styles.sectionLabel}>Select New Date</Text>
            <TouchableOpacity 
              style={styles.datePickerInput}
              onPress={() => {
                setCalendarTarget('RESCHEDULE');
                setCalendarMonth(new Date(rescheduleDate || Date.now()));
                setIsCalendarVisible(true);
              }}
            >
              <Text style={styles.datePickerInputText}>
                📅 {new Date(rescheduleDate || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', weekday: 'short' })}
              </Text>
            </TouchableOpacity>

            {/* Reschedule Slot Selector */}
            <Text style={styles.sectionLabel}>Select New Time Slot</Text>
            <ScrollView style={{ maxHeight: 200, marginBottom: 15 }}>
              {rescheduleSlots.map((slot) => {
                const targetAmenity = reschedulingBooking ? amenities.find(a => a.id === reschedulingBooking.amenity_id) : null;
                const totalLimit = targetAmenity?.max_capacity || 10;
                const slotsLeft = totalLimit - slot.current_bookings;
                const isFull = slotsLeft <= 0;
                const isSelected = selectedRescheduleSlot === slot.slot_time;

                return (
                  <TouchableOpacity
                    key={slot.slot_time}
                    disabled={isFull}
                    style={[
                      styles.slotRowMini,
                      isSelected && { borderColor: themeColor || '#0038a8', backgroundColor: '#f0f9ff' },
                      isFull && { backgroundColor: '#f1f5f9', opacity: 0.5 }
                    ]}
                    onPress={() => setSelectedRescheduleSlot(slot.slot_time)}
                  >
                    <Text style={[styles.slotTimeText, isSelected && { color: themeColor || '#0038a8', fontWeight: 'bold' }]}>
                      ⏰ {slot.slot_time}
                    </Text>
                    <Text style={[styles.slotCountText, isFull ? { color: '#c62828' } : { color: '#16a34a' }]}>
                      {isFull ? 'FULL' : `${slotsLeft}/${totalLimit} Left`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Modal Buttons */}
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setReschedulingBooking(null)}>
                <Text style={{ color: '#64748b', fontWeight: 'bold' }}>Close</Text>
              </TouchableOpacity>
              
              {selectedRescheduleSlot && (
                <TouchableOpacity style={[styles.submitBtn, { backgroundColor: themeColor || '#0038a8' }]} onPress={handleConfirmReschedule} disabled={rescheduleProgress}>
                  {rescheduleProgress ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>Confirm New Slot</Text>}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Calendar Grid Picker Modal */}
      <Modal
        visible={isCalendarVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCalendarVisible(false)}
      >
        <View style={styles.calendarModalOverlay}>
          <View style={styles.calendarModalView}>
            <Text style={styles.calendarModalTitle}>
              Select Booking Date
            </Text>

            {/* Calendar Month Header */}
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={handlePrevMonth} style={styles.calendarNavBtn}>
                <Text style={styles.calendarNavBtnText}>◀</Text>
              </TouchableOpacity>
              <Text style={styles.calendarMonthText}>
                {monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
              </Text>
              <TouchableOpacity onPress={handleNextMonth} style={styles.calendarNavBtn}>
                <Text style={styles.calendarNavBtnText}>▶</Text>
              </TouchableOpacity>
            </View>

            {/* Weekdays Labels */}
            <View style={styles.calendarDaysOfWeekRow}>
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => (
                <Text key={day} style={styles.calendarDayOfWeekLabel}>{day}</Text>
              ))}
            </View>

            {/* Calendar Days Grid */}
            <View style={styles.calendarGrid}>
              {generateMonthDays(calendarMonth).map((day, index) => {
                if (day === null) {
                  return <View key={`empty-${index}`} style={styles.calendarEmptyCell} />;
                }

                const cellDate = formatDateString(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
                const isSelected = cellDate === (calendarTarget === 'NEW' ? selectedDate : rescheduleDate);
                
                // Allow booking from today up to 30 days in advance
                const isCellDisabled = (() => {
                  const maxDate = new Date();
                  maxDate.setDate(maxDate.getDate() + 30);
                  const maxDateStr = maxDate.toISOString().split('T')[0];
                  
                  return cellDate < todayStr || cellDate > maxDateStr;
                })();

                return (
                  <TouchableOpacity
                    key={`day-${day}`}
                    style={[
                      styles.calendarDayCell,
                      isSelected && [styles.calendarSelectedDayCell, { backgroundColor: themeColor || '#0038a8' }],
                      isCellDisabled && { opacity: 0.25 }
                    ]}
                    onPress={isCellDisabled ? undefined : () => handleSelectDay(day)}
                    disabled={isCellDisabled}
                  >
                    <Text style={[
                      styles.calendarDayCellText,
                      isSelected && styles.calendarSelectedDayCellText,
                      isCellDisabled && { color: '#cbd5e1' }
                    ]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Close Button */}
            <TouchableOpacity
              style={styles.calendarFooterButton}
              onPress={() => setIsCalendarVisible(false)}
            >
              <Text style={styles.calendarFooterButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeAreaContainer: { flex: 1, backgroundColor: '#fafbfd', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 10 },
  navHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#fff' },
  backButton: { flexDirection: 'row', alignItems: 'center', width: 60 },
  backIcon: { fontSize: 16, fontWeight: 'bold' },
  backText: { fontSize: 14, color: '#64748b', marginLeft: 4, fontWeight: '500' },
  navTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fafbfd' },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 15 },
  headerSub: { fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 18 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
  dateSectionLabel: { fontSize: 12, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 12 },
  sectionSubLabel: { fontSize: 11, color: '#94a3b8', marginBottom: 12, marginTop: -6 },
  amenityRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap' },
  amenityCard: { width: '48%', backgroundColor: '#fff', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', marginBottom: 14, shadowColor: '#0f172a', shadowOpacity: 0.02, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  amenityIcon: { fontSize: 26, marginBottom: 4 },
  amenityName: { fontSize: 14, fontWeight: '600', color: '#1e293b', textAlign: 'center' },
  capacityText: { fontSize: 11, color: '#64748b', marginTop: 3 },
  feeText: { fontSize: 11, color: '#16a34a', fontWeight: '700', marginTop: 2 },
  emptyText: { fontSize: 13, color: '#64748b', fontStyle: 'italic', marginVertical: 10 },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  dateChipText: { fontSize: 11, color: '#64748b' },
  slotContainer: { marginBottom: 16 },
  slotRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 10, shadowColor: '#0f172a', shadowOpacity: 0.01, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  slotTimeText: { fontSize: 13, color: '#334155', fontWeight: '500' },
  slotCountText: { fontSize: 11, fontWeight: 'bold' },
  bookingSubmitBtn: { width: '100%', padding: 15, borderRadius: 14, alignItems: 'center', marginTop: 6, marginBottom: 25 },
  bookingSubmitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Tabs layout
  mainTabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  mainTab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', flexDirection: 'row', justifyContent: 'center' },
  mainTabLabel: { fontSize: 13, color: '#64748b', fontWeight: '600' },

  // My Bookings lists styles
  emptyHistoryText: { textAlign: 'center', color: '#64748b', fontSize: 14, marginTop: 40 },
  bookingCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 18, padding: 16, marginBottom: 14, shadowColor: '#0f172a', shadowOpacity: 0.01, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  bookingCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  bookingAmenityName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '800' },
  bookingCardDetails: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, marginBottom: 12, gap: 4 },
  bookingDetailsText: { fontSize: 13, color: '#475569', fontWeight: '500' },
  bookingCardActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  actionBtn: { flex: 1, paddingVertical: 10, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modalCardWindow: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24 },
  modalHeaderTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 6, textAlign: 'center' },
  slotRowMini: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 8 },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, gap: 10 },
  cancelBtn: { flex: 0.35, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 10 },
  submitBtn: { flex: 0.65, paddingVertical: 12, alignItems: 'center', borderRadius: 10, justifyContent: 'center' },

  // Custom Calendar Styles
  calendarModalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  calendarModalView: { width: '100%', backgroundColor: '#fff', borderRadius: 24, padding: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  calendarModalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 16, textAlign: 'center' },
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  calendarMonthText: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  calendarNavBtn: { padding: 8, minWidth: 36, alignItems: 'center' },
  calendarNavBtnText: { fontSize: 14, color: '#64748b', fontWeight: 'bold' },
  calendarDaysOfWeekRow: { flexDirection: 'row', marginBottom: 6 },
  calendarDayOfWeekLabel: { width: '14.28%', textAlign: 'center', fontSize: 12, fontWeight: '700', color: '#94a3b8' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarDayCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 8, marginVertical: 2 },
  calendarDayCellText: { fontSize: 14, color: '#0f172a', fontWeight: '600' },
  calendarSelectedDayCell: { borderRadius: 8 },
  calendarSelectedDayCellText: { color: '#fff', fontWeight: 'bold' },
  calendarEmptyCell: { width: '14.28%', aspectRatio: 1 },
  calendarFooterButton: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', marginTop: 10 },
  calendarFooterButtonText: { fontSize: 14, fontWeight: '700', color: '#475569' },

  // Date Picker Input Style
  datePickerInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 20, shadowColor: '#0f172a', shadowOpacity: 0.01, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  datePickerInputText: { fontSize: 14, color: '#334155', fontWeight: '600' }
});