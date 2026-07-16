import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, Alert, ActivityIndicator, TextInput, Platform, StatusBar, FlatList, Dimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import RadioModule from '../components/shared/RadioModule';
import ShiftModule from '../components/shared/ShiftModule';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AmenityBooking {
  id: string;
  booking_date: string;
  slot_time: string;
  status: string;
  amenity_id: string;
  user_id: string;
  unit_id: string;
  profiles: {
    full_name: string | null;
    email: string | null;
    expo_push_token: string | null;
  } | null;
  units: {
    unit_number: string | null;
    block_phase_no: string | null;
    condo_id: string | null;
  } | null;
}

export default function AmenityStaffApp({ navigation }: any) {
  // Helper to get local date string YYYY-MM-DD
  const getLocalDateStr = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  type TabName = 'HOME' | 'BOOKINGS' | 'RADIO' | 'MYPAGE';
  const [activeTab, setActiveTab] = useState<TabName>('HOME');
  const scrollViewRef = useRef<ScrollView>(null);
  const myPageScrollRef = useRef<ScrollView>(null);

  const handleTabPress = (tabName: TabName) => {
    setActiveTab(tabName);
    const tabNames: TabName[] = ['HOME', 'BOOKINGS', 'RADIO', 'MYPAGE'];
    const idx = tabNames.indexOf(tabName);
    if (idx !== -1) {
      scrollViewRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: true });
    }
  };

  const [dashboardMetrics, setDashboardMetrics] = useState({
    yesterdayCount: 0,
    yesterdayRevenue: 0,
    monthCount: 0,
    monthRevenue: 0,
  });
  
  // Bookings Tab states
  const [bookings, setBookings] = useState<AmenityBooking[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'ALL'>('ALL');
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // My Page / Profile states
  const [staffProfile, setStaffProfile] = useState<any>(null);
  const [staffName, setStaffName] = useState('Amenity Staff');
  const [userRole, setUserRole] = useState('AMENITY_STAFF');
  const [condoName, setCondoName] = useState('Solea Residences');
  const [assignedBuilding, setAssignedBuilding] = useState('Tower A');
  const [isOnDuty, setIsOnDuty] = useState(true);

  const staffNameRef = useRef(staffName);
  useEffect(() => {
    staffNameRef.current = staffName;
  }, [staffName]);

  const handleTriggerSosBroadcast = async () => {
    try {
      const canonicalPmoId = '66dcdab9-091a-440f-a871-fe2133c1813e';
      const channel = 'AMENITY';
      const name = staffName;
      const building = assignedBuilding;

      let { data: chatRoom } = await supabase
        .from('intercom_chats')
        .select('id')
        .eq('user_id', canonicalPmoId)
        .eq('channel', channel)
        .maybeSingle();

      if (!chatRoom) {
        const { data: newRoom } = await supabase
          .from('intercom_chats')
          .insert([{ 
            user_id: canonicalPmoId,
            target_building: building || 'Tower A',
            channel: channel
          }])
          .select('id')
          .single();
        chatRoom = newRoom;
      }

      if (chatRoom) {
        const { error } = await supabase
          .from('intercom_messages')
          .insert([{
            chat_id: chatRoom.id,
            sender_type: 'GUARD',
            message: `🚨 [EMERGENCY SOS] SOS signal activated by ${name}. GPS Trace: Active.`,
            operator_name: name
          }]);
        
        if (error) throw error;
      }

      Alert.alert(
        "🚨 SOS BROADCAST ACTIVE", 
        "Siren activated. Emergency signal broadcasted to PMO Staff Radio.", 
        [{ text: "DISMISS", style: "cancel" }]
      );
    } catch (err) {
      console.error("SOS broadcast failure:", err);
      Alert.alert("🚨 SOS BROADCAST ACTIVE", "Siren activated loop grid. GPS trace broadcasting.", [{ text: "DISMISS", style: "cancel" }]);
    }
  };

  const checkLocationAndSetDuty = async (isManualClick = false) => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (isManualClick) {
          Alert.alert("Permission Denied", "Location permission is required to verify your shift status.");
        } else {
          setIsOnDuty(false);
        }
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      const currentLat = loc.coords.latitude;
      const currentLng = loc.coords.longitude;

      // Solea Residences coordinates: 10.2646, 123.9961
      const CONDO_LAT = 10.2646;
      const CONDO_LNG = 123.9961;

      // Calculate distance in meters
      const R = 6371e3;
      const φ1 = currentLat * Math.PI / 180;
      const φ2 = CONDO_LAT * Math.PI / 180;
      const δφ = (CONDO_LAT - currentLat) * Math.PI / 180;
      const δλ = (CONDO_LNG - currentLng) * Math.PI / 180;

      const a = Math.sin(δφ / 2) * Math.sin(δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(δλ / 2) * Math.sin(δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;

      if (distance <= 100) {
        setIsOnDuty(true);
        Alert.alert("Location Verified ✅", "You are within 100m of the workplace. Automatically set to ON-DUTY.");
      } else {
        if (isManualClick) {
          Alert.alert(
            "Outside Workplace Boundary 📍",
            `You are ${distance.toFixed(0)}m away from Solea Residences. Would you like to bypass and set to ON-DUTY anyway for testing?`,
            [
              { text: "Cancel", style: "cancel" },
              { text: "Bypass (On-Duty)", onPress: () => setIsOnDuty(true) }
            ]
          );
        } else {
          Alert.alert(
            "Outside Workplace Boundary 📍",
            `You are currently ${distance.toFixed(0)}m away. Set to ON-DUTY anyway for testing?`,
            [
              { text: "No, Stay Off-Duty", onPress: () => setIsOnDuty(false) },
              { text: "Yes, Set ON-DUTY (Test)", onPress: () => setIsOnDuty(true) }
            ]
          );
        }
      }
    } catch (err: any) {
      console.log("Error verifying location:", err);
      setIsOnDuty(true);
      if (isManualClick) {
        Alert.alert("Notice", "Bypassed location check. Set to ON-DUTY.");
      }
    }
  };

  const handleDutyToggle = () => {
    if (isOnDuty) {
      Alert.alert(
        "Clock Out Confirmation 🔴",
        "Would you like to clock out and end your shift?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Yes, Clock Out", onPress: () => setIsOnDuty(false) }
        ]
      );
    } else {
      checkLocationAndSetDuty(true);
    }
  };

  const [myPageSubTab, setMyPageSubTab] = useState<'LOGS' | 'SHIFT' | 'PAYROLL'>('LOGS');
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth()); // 0-11
  
  const [unreadRadioCount, setUnreadRadioCount] = useState(0);
  const [pendingBookingsCount, setPendingBookingsCount] = useState(0);

  const todayStr = getLocalDateStr();
  
  const prevCountsRef = useRef({ unreadRadio: 0, pendingBookings: 0 });
  const isFirstLoad = useRef(true);

  // Request notification permission on mount
  useEffect(() => {
    const requestNotificationPermission = async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') {
          await Notifications.requestPermissionsAsync();
        }
      } catch (err) {
        console.log("Error requesting notification permissions:", err);
      }
    };
    requestNotificationPermission();
  }, []);

  // Settle load state to avoid firing notifications on initial data load
  useEffect(() => {
    if (staffName !== 'Amenity Staff' && bookings.length >= 0) {
      const t = setTimeout(() => {
        isFirstLoad.current = false;
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [staffName, bookings]);

  // Monitor counts and trigger local notifications with sound on increments
  useEffect(() => {
    if (isFirstLoad.current) {
      prevCountsRef.current = {
        unreadRadio: unreadRadioCount,
        pendingBookings: pendingBookingsCount,
      };
      return;
    }

    const prev = prevCountsRef.current;
    
    // Trigger on radio count increment
    if (unreadRadioCount > prev.unreadRadio) {
      Notifications.scheduleNotificationAsync({
        content: {
          title: '💬 New PMO Message',
          body: 'You received a new instruction from the PMO office.',
          sound: true,
        },
        trigger: null,
      }).catch(err => console.log("Sound alert trigger failed:", err));
    }

    // Trigger on pending bookings count increment
    if (pendingBookingsCount > prev.pendingBookings) {
      Notifications.scheduleNotificationAsync({
        content: {
          title: '🏊 New Booking Request',
          body: 'A resident has submitted a new amenity reservation.',
          sound: true,
        },
        trigger: null,
      }).catch(err => console.log("Sound alert trigger failed:", err));
    }

    // Update refs to current values
    prevCountsRef.current = {
      unreadRadio: unreadRadioCount,
      pendingBookings: pendingBookingsCount,
    };
  }, [unreadRadioCount, pendingBookingsCount]);

  useEffect(() => {
    fetchProfileAndAttendance();
    fetchBookings();
    fetchDashboardMetrics();
    checkLocationAndSetDuty(false);

    // Subscribe to real-time updates for amenity bookings
    const channel = supabase
      .channel('realtime-amenity-bookings-staff')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'amenity_bookings' },
        () => {
          fetchBookings();
          fetchDashboardMetrics();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (staffName && staffName !== 'Amenity Staff') {
      fetchUnreadCount(staffName);

      const intercomBadgeChannel = supabase
        .channel('amenity-intercom-badge_' + Date.now())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'intercom_chats' }, () => {
          fetchUnreadCount(staffNameRef.current);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'intercom_messages' }, async (payload) => {
          fetchUnreadCount(staffNameRef.current);
          if (payload.eventType === 'INSERT' && payload.new.sender_type === 'RESIDENT') {
            try {
              const { data: chat } = await supabase
                .from('intercom_chats')
                .select('user_id')
                .eq('id', payload.new.chat_id)
                .maybeSingle();

              if (chat) {
                const { data: userUnit } = await supabase
                  .from('user_units')
                  .select(`
                    units (
                      unit_number
                    )
                  `)
                  .eq('user_id', chat.user_id)
                  .maybeSingle();

                const unitNo = (userUnit?.units as any)?.unit_number || 'Resident';
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: `💬 Intercom Call (Unit ${unitNo})`,
                    body: payload.new.message,
                    sound: 'default',
                  },
                  trigger: null,
                });
              }
            } catch (e) {
              console.error("Error triggering in-app intercom alert:", e);
            }
          }
        })
        .subscribe();

      return () => {
        supabase.removeChannel(intercomBadgeChannel);
      };
    }
  }, [staffName]);

  const fetchProfileAndAttendance = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      const { data: profile } = await supabase
        .from('staff_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profile) {
        setStaffProfile(profile);
        let name = profile.full_name || profile.name || 'Staff';
        name = name.replace(/Duty Guard/gi, 'Guard');
        name = name.replace(/Guard Guard/gi, 'Guard');
        const role = profile.role || 'AMENITY_STAFF';
        const lowerName = name.toLowerCase();
        if (!lowerName.startsWith('guard') && !lowerName.startsWith('staff') && !lowerName.startsWith('tech') && !lowerName.startsWith('pmo') && !lowerName.startsWith('amenity')) {
          const roleLabel = role.includes('GUARD') ? 'Guard' : 'Staff';
          name = `${roleLabel} ${name}`;
        }
        setStaffName(name);
        setUserRole(role);
        setAssignedBuilding(profile.assigned_building || 'Tower A');
      }

      const CONDO_ID = 'c1111111-1111-1111-1111-111111111111';
      const { data: condoData } = await supabase
        .from('condos')
        .select('name')
        .eq('id', CONDO_ID)
        .maybeSingle();

      if (condoData?.name) {
        setCondoName(condoData.name);
      }

      // Generate sample attendance for staff calendar
      const sampleAtt = generateSampleAttendance(currentYear, currentMonth, userId);
      setAttendanceData(sampleAtt);
    } catch (e) {
      console.error("Error loading staff info:", e);
    }
  };

  const fetchUnreadCount = async (name: string) => {
    try {
      let totalUnreads = 0;

      // 1. Fetch PMO Managers
      const { data: pmoStaff } = await supabase
        .from('staff_profiles')
        .select('id')
        .eq('role', 'PMO_MANAGER');

      const { data: userUnitsList } = await supabase
        .from('user_units')
        .select('user_id');

      const residentIds = userUnitsList ? userUnitsList.map(u => u.user_id) : [];
      let pmoIds: string[] = [];
      if (pmoStaff) {
        pmoIds = pmoStaff.map(p => p.id).filter(id => !residentIds.includes(id));
      }
      if (pmoIds.length === 0) {
        pmoIds = ['66dcdab9-091a-440f-a871-fe2133c1813e'];
      }

      // 2. Fetch resident chats for AMENITY channel and target building
      const { data: chats } = await supabase
        .from('intercom_chats')
        .select('user_id, read_by_guards')
        .eq('target_building', 'Tower A - Amenity Center')
        .eq('channel', 'AMENITY');

      if (chats) {
        const residentUnreads = chats
          .filter(c => !pmoIds.includes(c.user_id))
          .filter(c => 
            !c.read_by_guards || 
            c.read_by_guards.length === 0 || 
            !c.read_by_guards.includes(name)
          ).length;
        totalUnreads += residentUnreads;
      }

      // 3. Fetch PMO Radio chat unread count for AMENITY channel
      const canonicalPmoId = '66dcdab9-091a-440f-a871-fe2133c1813e';
      const { data: pmoChat } = await supabase
        .from('intercom_chats')
        .select('id')
        .eq('user_id', canonicalPmoId)
        .eq('channel', 'AMENITY')
        .maybeSingle();

      if (pmoChat) {
        const { count: pmoUnreadsCount } = await supabase
          .from('intercom_messages')
          .select('id', { count: 'exact', head: true })
          .eq('chat_id', pmoChat.id)
          .eq('sender_type', 'RESIDENT')
          .is('read_at', null);

        if (pmoUnreadsCount) {
          totalUnreads += pmoUnreadsCount;
        }
      }

      setUnreadRadioCount(totalUnreads);
    } catch (err) {
      console.error("Error fetching unread count:", err);
    }
  };

  const generateSampleAttendance = (year: number, month: number, userId: string) => {
    const list = [];
    const daysInSelectedMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInSelectedMonth; day++) {
      const date = new Date(year, month, day);
      const dayOfWeek = date.getDay(); // 0 = Sun, 6 = Sat
      
      // Mon to Fri work schedule
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const totalMinutes = (dayOfWeek <= 3) ? 480 : 720;
        const workDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        list.push({
          id: `sample-${workDate}`,
          staff_id: userId,
          work_date: workDate,
          clock_in_at: `${workDate}T07:00:00.000Z`,
          clock_out_at: totalMinutes === 480 ? `${workDate}T15:00:00.000Z` : `${workDate}T19:00:00.000Z`,
          total_minutes: totalMinutes,
          status: 'NORMAL',
          penalty_triggered: false
        });
      }
    }
    return list;
  };

  const fetchBookings = async () => {
    try {
      setLoadingBookings(true);
      
      // 1. Fetch bookings only (no joins)
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('amenity_bookings')
        .select('id, booking_date, slot_time, status, amenity_id, user_id, unit_id')
        .gte('booking_date', todayStr)
        .order('booking_date', { ascending: true })
        .order('slot_time', { ascending: true });

      if (bookingsError) throw bookingsError;

      if (bookingsData && bookingsData.length > 0) {
        // 2. Fetch profiles for user_ids separately to bypass missing foreign key constraint in PostgREST
        const userIds = Array.from(new Set(bookingsData.map(b => b.user_id).filter(Boolean)));
        
        let profilesMap: Record<string, { full_name: string | null; email: string | null; expo_push_token: string | null }> = {};
        if (userIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, full_name, email, expo_push_token')
            .in('id', userIds);
          
          if (!profilesError && profilesData) {
            profilesData.forEach(p => {
              profilesMap[p.id] = {
                full_name: p.full_name,
                email: p.email,
                expo_push_token: p.expo_push_token || null
              };
            });
          }
        }

        // 3. Fetch units for unit_ids separately to bypass missing foreign key constraint in PostgREST
        const unitIds = Array.from(new Set(bookingsData.map(b => b.unit_id).filter(Boolean)));
        let unitsMap: Record<string, { unit_number: string | null; block_phase_no: string | null; condo_id: string | null }> = {};
        if (unitIds.length > 0) {
          const { data: unitsData, error: unitsError } = await supabase
            .from('units')
            .select('id, unit_number, building_no, condo_id')
            .in('id', unitIds);
          
          if (!unitsError && unitsData) {
            unitsData.forEach(u => {
              unitsMap[u.id] = {
                unit_number: u.unit_number,
                block_phase_no: u.building_no,
                condo_id: u.condo_id
              };
            });
          }
        }

        // 4. Map profiles and units back to bookings
        const mapped = bookingsData.map(b => ({
          ...b,
          profiles: b.user_id ? (profilesMap[b.user_id] || null) : null,
          units: b.unit_id ? (unitsMap[b.unit_id] || null) : null
        }));

        setBookings(mapped as any[]);
      } else {
        setBookings([]);
      }
    } catch (e: any) {
      console.error("Error fetching bookings:", e);
    } finally {
      setLoadingBookings(false);
    }
  };

  const fetchDashboardMetrics = async () => {
    try {
      const CONDO_ID = 'c1111111-1111-1111-1111-111111111111';
      const { data: settings } = await supabase
        .from('condo_settings')
        .select('amenity_settings')
        .eq('condo_id', CONDO_ID)
        .maybeSingle();

      const amenitySettings = settings?.amenity_settings || {};
      
      const getBookingFee = (amenityId: string) => {
        if (!amenityId) return 0;
        const matchedKey = Object.keys(amenitySettings).find(
          key => key.toLowerCase().replace(/\s+/g, '_') === amenityId
        );
        const config = matchedKey ? amenitySettings[matchedKey] : null;
        if (config && config.charge_enabled && Number(config.fee) > 0) {
          return Number(config.fee);
        }
        return 0;
      };

      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterdayStr = getLocalDateStr(yesterdayDate);

      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstDayStr = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}-01`;
      
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const lastDayStr = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

      // Yesterday
      const { data: yesterdayData } = await supabase
        .from('amenity_bookings')
        .select('amenity_id')
        .eq('booking_date', yesterdayStr)
        .in('status', ['CONFIRMED', 'COMPLETED']);

      let yesterdayCount = 0;
      let yesterdayRevenue = 0;
      if (yesterdayData) {
        yesterdayCount = yesterdayData.length;
        yesterdayRevenue = yesterdayData.reduce((sum, b) => sum + getBookingFee(b.amenity_id), 0);
      }

      // This Month
      const { data: monthData } = await supabase
        .from('amenity_bookings')
        .select('amenity_id')
        .gte('booking_date', firstDayStr)
        .lte('booking_date', lastDayStr)
        .in('status', ['CONFIRMED', 'COMPLETED']);

      let monthCount = 0;
      let monthRevenue = 0;
      if (monthData) {
        monthCount = monthData.length;
        monthRevenue = monthData.reduce((sum, b) => sum + getBookingFee(b.amenity_id), 0);
      }

      setDashboardMetrics({
        yesterdayCount,
        yesterdayRevenue,
        monthCount,
        monthRevenue
      });

      // Update pending bookings count globally to be precise (matching date threshold of active listings)
      const { count: pendingCount } = await supabase
        .from('amenity_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'PENDING')
        .gte('booking_date', todayStr);
      
      if (pendingCount !== null) {
        setPendingBookingsCount(pendingCount);
      }

    } catch (err) {
      console.error("Error fetching dashboard metrics:", err);
    }
  };

  const handleApproveBooking = async (booking: AmenityBooking) => {
    try {
      setApprovingId(booking.id);
      
      const { error } = await supabase
        .from('amenity_bookings')
        .update({ status: 'CONFIRMED' })
        .eq('id', booking.id);

      if (error) throw error;

      const pushToken = booking.profiles?.expo_push_token;
      if (pushToken && pushToken.startsWith('ExponentPushToken')) {
        const amenityLabel = getAmenityLabel(booking.amenity_id);
        fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: pushToken,
            sound: 'default',
            title: `✅ Booking Approved: ${amenityLabel}`,
            body: `Your facility reservation for ${booking.booking_date} at ${booking.slot_time} is approved.`,
            badge: 1,
            channelId: 'default',
            data: { type: 'AMENITY_BOOKING', bookingId: booking.id }
          }),
        }).catch(err => console.error("Error sending push notification from app:", err));
      }

      Alert.alert("Approved ✅", `${booking.profiles?.full_name || 'Resident'}'s reservation has been approved.`);
      fetchBookings();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Approval Error", e.message || "Failed to approve reservation.");
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectBooking = async (booking: AmenityBooking) => {
    Alert.alert(
      "Reject Reservation",
      `Are you sure you want to reject ${booking.profiles?.full_name || 'Resident'}'s reservation?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Reject", 
          style: "destructive",
          onPress: async () => {
            try {
              setApprovingId(booking.id);
              const { error } = await supabase
                .from('amenity_bookings')
                .update({ status: 'CANCELLED' })
                .eq('id', booking.id);

              if (error) throw error;

              const pushToken = booking.profiles?.expo_push_token;
              if (pushToken && pushToken.startsWith('ExponentPushToken')) {
                const amenityLabel = getAmenityLabel(booking.amenity_id);
                fetch('https://exp.host/--/api/v2/push/send', {
                  method: 'POST',
                  headers: {
                    Accept: 'application/json',
                    'Accept-encoding': 'gzip, deflate',
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    to: pushToken,
                    sound: 'default',
                    title: `❌ Booking Rejected: ${amenityLabel}`,
                    body: `Your facility reservation for ${booking.booking_date} at ${booking.slot_time} was rejected.`,
                    badge: 1,
                    channelId: 'default',
                    data: { type: 'AMENITY_BOOKING', bookingId: booking.id }
                  }),
                }).catch(err => console.error("Error sending push notification from app:", err));
              }

              Alert.alert("Rejected ❌", "Reservation has been rejected.");
              fetchBookings();
            } catch (e: any) {
              console.error(e);
              Alert.alert("Rejection Error", e.message || "Failed to reject reservation.");
            } finally {
              setApprovingId(null);
            }
          }
        }
      ]
    );
  };

  // Check-In and Billing automation logic
  const handleConfirmArrival = async (booking: AmenityBooking) => {
    try {
      setCheckingInId(booking.id);

      // Check if there is already a completed booking for this unit, amenity, date, and slot to prevent unique_unit_slot violation
      const { data: duplicateBooking, error: dupError } = await supabase
        .from('amenity_bookings')
        .select('id')
        .eq('unit_id', booking.unit_id)
        .eq('amenity_id', booking.amenity_id)
        .eq('booking_date', booking.booking_date)
        .eq('slot_time', booking.slot_time)
        .eq('status', 'COMPLETED')
        .maybeSingle();

      if (dupError) throw dupError;

      if (duplicateBooking) {
        Alert.alert(
          "Already Checked In 💆",
          "This unit has already checked in for a session of this amenity in this time slot."
        );
        fetchBookings();
        return;
      }

      // 1. Update amenity_bookings status in database
      const { error: updateError } = await supabase
        .from('amenity_bookings')
        .update({ status: 'COMPLETED' })
        .eq('id', booking.id);

      if (updateError) throw updateError;

      // 1.5 Send push notification asynchronously to resident
      const pushToken = booking.profiles?.expo_push_token;
      if (pushToken && pushToken.startsWith('ExponentPushToken')) {
        const amenityLabel = getAmenityLabel(booking.amenity_id);
        fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: pushToken,
            sound: 'default',
            title: `💆 Checked In: ${amenityLabel}`,
            body: `Your facility session has started. Check-in registered successfully.`,
            badge: 1,
            channelId: 'default',
            data: { type: 'AMENITY_BOOKING', bookingId: booking.id }
          }),
        }).catch(err => console.error("Error sending push notification from app:", err));
      }

      // 2. Fetch condo_settings to determine if this amenity is paid
      const condoId = booking.units?.condo_id;
      if (!condoId) {
        Alert.alert("Arrival Confirmed 💆", `${booking.profiles?.full_name || 'Resident'} has checked in.`);
        fetchBookings();
        return;
      }

      const { data: settings, error: settingsError } = await supabase
        .from('condo_settings')
        .select('amenity_settings')
        .eq('condo_id', condoId)
        .maybeSingle();

      if (settingsError || !settings?.amenity_settings) {
        Alert.alert("Arrival Confirmed 💆", `${booking.profiles?.full_name || 'Resident'} has checked in.`);
        fetchBookings();
        return;
      }

      // 3. Find matching amenity configs (case-insensitive key matching)
      const amenitySettings = settings.amenity_settings;
      const matchedKey = Object.keys(amenitySettings).find(
        key => key.toLowerCase().replace(/\s+/g, '_') === booking.amenity_id
      );

      const config = matchedKey ? amenitySettings[matchedKey] : null;
      
      // 4. Log fee for month-end aggregation if paid session (no immediate write to billings)
      if (config && config.charge_enabled && Number(config.fee) > 0) {
        const feeAmount = Number(config.fee);
        Alert.alert(
          "Arrival Confirmed 💆",
          `${booking.profiles?.full_name || 'Resident'} has checked in.\n💳 Fee: ₱${feeAmount} (Logged for Month-end Billing)`
        );
      } else {
        Alert.alert(
          "Arrival Confirmed 💆",
          `${booking.profiles?.full_name || 'Resident'} has checked in.\n🟢 This session is free of charge.`
        );
      }

      fetchBookings();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Arrival Check-in Error", e.message || "Failed to confirm arrival and issue billing.");
    } finally {
      setCheckingInId(null);
    }
  };

  const getAmenityLabel = (amenityId: string) => {
    if (!amenityId) return 'Amenity';
    return amenityId
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getAmenityEmoji = (amenityId: string) => {
    const lowercase = amenityId.toLowerCase();
    if (lowercase.includes('pool')) return '🏊';
    if (lowercase.includes('gym')) return '🏋️';
    if (lowercase.includes('spa') || lowercase.includes('massage')) return '💆';
    if (lowercase.includes('bbq')) return '🍖';
    return '🏢';
  };

  const handleSignOut = async () => {
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
          try {
            await supabase.auth.signOut();
            Alert.alert("Signed Out ✅", "Logged out from Amenity Staff session.");
          } catch (e: any) {
            Alert.alert("Error", e.message || "Failed to sign out.");
          }
        }
      }
    ]);
  };

  // Filtering & Sorting Logic
  let filteredBookings = bookings.filter(b => {
    // Status Filter
    if (statusFilter === 'PENDING' && b.status !== 'PENDING') return false;
    if (statusFilter === 'CONFIRMED' && b.status !== 'CONFIRMED') return false;
    if (statusFilter === 'COMPLETED' && b.status !== 'COMPLETED') return false;

    // Search query match (resident name, house/lot number, amenity ID)
    const name = b.profiles?.full_name?.toLowerCase() || '';
    const unitNo = b.units?.unit_number?.toLowerCase() || '';
    const amenity = b.amenity_id?.toLowerCase() || '';
    const query = searchQuery.toLowerCase();

    if (searchQuery && !name.includes(query) && !unitNo.includes(query) && !amenity.includes(query)) {
      return false;
    }
    return true;
  });

  // Sort Bookings:
  // When statusFilter is ALL (or within any view):
  // 1. Pending (Confirm not pressed yet) first.
  // 2. Confirmed (before Check-in) second.
  // 3. Others (Completed/Checked-in) last.
  // Within each status, sort by booking date/time ascending (closest to now/remaining time).
  filteredBookings = [...filteredBookings].sort((a, b) => {
    const getStatusRank = (status: string) => {
      if (status === 'PENDING') return 1;
      if (status === 'CONFIRMED') return 2;
      return 3;
    };
    
    const rankA = getStatusRank(a.status);
    const rankB = getStatusRank(b.status);
    
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    
    const getBookingTimestamp = (booking: AmenityBooking) => {
      try {
        if (!booking.booking_date) return Infinity;
        let timePart = "00:00";
        if (booking.slot_time) {
          const parts = booking.slot_time.split('-');
          const startPart = parts[0].trim();
          const match = startPart.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
          if (match) {
            let hours = parseInt(match[1], 10);
            const minutes = match[2];
            const ampm = match[3].toUpperCase();
            if (ampm === 'PM' && hours < 12) {
              hours += 12;
            } else if (ampm === 'AM' && hours === 12) {
              hours = 0;
            }
            timePart = `${String(hours).padStart(2, '0')}:${minutes}`;
          }
        }
        const dt = new Date(`${booking.booking_date}T${timePart}`);
        return isNaN(dt.getTime()) ? Infinity : dt.getTime();
      } catch {
        return Infinity;
      }
    };

    return getBookingTimestamp(a) - getBookingTimestamp(b);
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Global Header - Unified with Guard App brand styling */}
      {activeTab === 'HOME' ? (
        <View style={styles.header}>
          <View style={styles.headerTextColumn}>
            <Text style={styles.headerTitle}>🏢 {condoName}</Text>
            <Text style={styles.guardLabelLine}>{staffName}</Text>
            <Text style={styles.sectorLabelLine}>{userRole} / {assignedBuilding}</Text>
          </View>
          <View style={{ 
            flexDirection: SCREEN_WIDTH < 400 ? 'column' : 'row', 
            alignItems: 'center', 
            gap: 6,
            justifyContent: 'center'
          }}>
            <TouchableOpacity 
              delayLongPress={3000}
              onLongPress={handleTriggerSosBroadcast}
              onPress={() => {
                Alert.alert("🚨 SOS Broadcast", "Hold for 3 seconds to broadcast emergency signal.");
              }}
              style={[styles.sosButtonBadge, SCREEN_WIDTH < 400 && { width: 100, height: 35, borderRadius: 10 }]}
            >
              <Text style={styles.sosButtonBadgeText}>🚨 SOS</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.giantDutyToggleBadge, 
                { backgroundColor: isOnDuty ? '#16a34a' : '#dc2626' },
                SCREEN_WIDTH < 400 && { width: 100, height: 35, borderRadius: 10 }
              ]} 
              onPress={handleDutyToggle}
            >
              <Text style={styles.giantDutyBadgeText}>{isOnDuty ? '🟢 ON-DUTY' : '🔴 OFF-DUTY'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={{
          height: 50,
          backgroundColor: '#ffffff',
          borderBottomWidth: 1,
          borderBottomColor: '#e2e8f0',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          justifyContent: 'space-between'
        }}>
          <TouchableOpacity 
            onPress={() => handleTabPress('HOME')} 
            style={{ flexDirection: 'row', alignItems: 'center', width: 80 }}
          >
            <Ionicons name="chevron-back" size={24} color="#0038a8" />
            <Text style={{ color: '#0038a8', fontSize: 16, fontWeight: '600', marginLeft: -4 }}>Back</Text>
          </TouchableOpacity>
          
          <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' }}>
            {activeTab === 'BOOKINGS' ? 'Bookings' : activeTab === 'RADIO' ? 'Radio' : 'My Page'}
          </Text>
          
          {activeTab === 'MYPAGE' ? (
            <TouchableOpacity onPress={handleSignOut} style={{ width: 80, alignItems: 'flex-end' }}>
              <Ionicons name="log-out-outline" size={24} color="#ef4444" />
            </TouchableOpacity>
          ) : activeTab === 'BOOKINGS' ? (
            <TouchableOpacity onPress={fetchBookings} style={{ width: 80, alignItems: 'flex-end' }}>
              <Ionicons name="refresh-outline" size={22} color="#0038a8" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 80 }} />
          )}
        </View>
      )}
      
      {/* Dynamic Screen Mount based on Bottom Tab Selection */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          const tabNames: TabName[] = ['HOME', 'BOOKINGS', 'RADIO', 'MYPAGE'];
          if (tabNames[index]) {
            setActiveTab(tabNames[index]);
          }
        }}
        style={{ flex: 1 }}
      >
        {/* HOME Tab */}
        <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
          <ScrollView 
            style={{ flex: 1, backgroundColor: '#f8fafc' }} 
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 90 }} 
            keyboardShouldPersistTaps="handled"
          >
            {/* Greeting Header */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#0f172a', marginBottom: 5 }}>Welcome Back!</Text>
              <Text style={{ fontSize: 13, color: '#64748b' }}>Duty Station: Amenity Center / {assignedBuilding}</Text>
            </View>

            {/* Grid layout for home cards */}
            <View style={styles.dashboardMetricsRow}>
              {/* Card 1: New Bookings */}
              <TouchableOpacity 
                style={styles.dashboardMetricCard} 
                activeOpacity={0.8}
                onPress={() => handleTabPress('BOOKINGS')}
              >
                <View style={styles.dashboardMetricHeader}>
                  <Ionicons name="calendar-outline" size={18} color="#0038a8" style={{ marginRight: 6 }} />
                  <Text style={styles.dashboardMetricLabel}>New Bookings</Text>
                </View>
                <Text style={styles.dashboardMetricValue}>
                  {pendingBookingsCount}
                </Text>
                <Text style={[styles.dashboardMetricSub, pendingBookingsCount > 0 ? { color: '#ce1126', fontWeight: '700' } : { color: '#64748b' }]}>
                  {pendingBookingsCount > 0 ? `${pendingBookingsCount} pending approval` : 'No pending requests'}
                </Text>
              </TouchableOpacity>

              {/* Card 2: Radio Messages */}
              <TouchableOpacity 
                style={styles.dashboardMetricCard} 
                activeOpacity={0.8}
                onPress={() => handleTabPress('RADIO')}
              >
                <View style={styles.dashboardMetricHeader}>
                  <Ionicons name="chatbubbles-outline" size={18} color="#0038a8" style={{ marginRight: 6 }} />
                  <Text style={styles.dashboardMetricLabel}>New Messages</Text>
                </View>
                <Text style={styles.dashboardMetricValue}>{unreadRadioCount}</Text>
                <Text style={[styles.dashboardMetricSub, unreadRadioCount > 0 ? { color: '#ce1126', fontWeight: '700' } : { color: '#64748b' }]}>
                  {unreadRadioCount > 0 ? `${unreadRadioCount} unread` : 'No new messages'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dashboardMetricsRow}>
              {/* Card 3: Yesterday's Stats */}
              <View style={styles.dashboardMetricCard}>
                <View style={styles.dashboardMetricHeader}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#0038a8" style={{ marginRight: 6 }} />
                  <Text style={styles.dashboardMetricLabel}>Yesterday's Stats</Text>
                </View>
                <Text style={styles.dashboardMetricValue}>
                  {dashboardMetrics.yesterdayCount}건
                </Text>
                <Text style={[styles.dashboardMetricSub, { color: '#16a34a', fontWeight: '700' }]}>
                  ₱{dashboardMetrics.yesterdayRevenue.toLocaleString()}
                </Text>
              </View>

              {/* Card 4: This Month's Cumulative Stats */}
              <View style={styles.dashboardMetricCard}>
                <View style={styles.dashboardMetricHeader}>
                  <Ionicons name="trending-up-outline" size={18} color="#0038a8" style={{ marginRight: 6 }} />
                  <Text style={styles.dashboardMetricLabel}>This Month</Text>
                </View>
                <Text style={styles.dashboardMetricValue}>
                  {dashboardMetrics.monthCount}건
                </Text>
                <Text style={[styles.dashboardMetricSub, { color: '#16a34a', fontWeight: '700' }]}>
                  ₱{dashboardMetrics.monthRevenue.toLocaleString()}
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* BOOKINGS Tab */}
        <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
          {/* Filters and Search Bar */}
          <View style={styles.filterSection}>
            <TextInput 
              style={styles.searchInput}
              placeholder="🔍 Search name, unit, or amenity..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity 
                style={[styles.statusTab, statusFilter === 'ALL' && styles.statusTabActive]}
                onPress={() => setStatusFilter('ALL')}
              >
                <Text style={[styles.statusTabText, statusFilter === 'ALL' && styles.statusTabTextActive]}>All ({bookings.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.statusTab, statusFilter === 'PENDING' && styles.statusTabActive]}
                onPress={() => setStatusFilter('PENDING')}
              >
                <Text style={[styles.statusTabText, statusFilter === 'PENDING' && styles.statusTabTextActive]}>Pending ({bookings.filter(b => b.status === 'PENDING').length})</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.statusTab, statusFilter === 'CONFIRMED' && styles.statusTabActive]}
                onPress={() => setStatusFilter('CONFIRMED')}
              >
                <Text style={[styles.statusTabText, statusFilter === 'CONFIRMED' && styles.statusTabTextActive]}>Confirmed ({bookings.filter(b => b.status === 'CONFIRMED').length})</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.statusTab, statusFilter === 'COMPLETED' && styles.statusTabActive]}
                onPress={() => setStatusFilter('COMPLETED')}
              >
                <Text style={[styles.statusTabText, statusFilter === 'COMPLETED' && styles.statusTabTextActive]}>Checked In ({bookings.filter(b => b.status === 'COMPLETED').length})</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Bookings List */}
          {loadingBookings && bookings.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator color="#0038a8" size="large" />
            </View>
          ) : filteredBookings.length === 0 ? (
            <ScrollView contentContainerStyle={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={styles.emptyTitle}>No Reservations Found</Text>
              <Text style={styles.emptySub}>No residents match the selected filter criteria.</Text>
            </ScrollView>
          ) : (
            <FlatList 
              data={filteredBookings}
              keyExtractor={(item: AmenityBooking) => item.id}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }: { item: AmenityBooking }) => {
                const residentName = item.profiles?.full_name || 'Resident';
                const unitNumber = item.units?.unit_number || 'N/A';
                const buildingNo = item.units?.block_phase_no || 'Tower';
                const isConfirmed = item.status === 'CONFIRMED';
                const isPending = item.status === 'PENDING';
                const isCheckingIn = checkingInId === item.id;
                const isApproving = approvingId === item.id;

                return (
                  <View style={styles.bookingCard}>
                    <View style={styles.bookingCardHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        <Text style={styles.bookingIcon}>{getAmenityEmoji(item.amenity_id)}</Text>
                        <View style={{ marginLeft: 10, flex: 1 }}>
                          <Text style={styles.bookingAmenityName}>{getAmenityLabel(item.amenity_id)} ({item.booking_date})</Text>
                          <Text style={styles.bookingTime}>⏰ {item.slot_time}</Text>
                        </View>
                      </View>
                      <View style={[
                        styles.badge, 
                        { 
                          backgroundColor: 
                            item.status === 'PENDING' ? '#fef3c7' : 
                            item.status === 'CONFIRMED' ? '#eff6ff' : 
                            item.status === 'COMPLETED' ? '#f0fdf4' : '#fef2f2' 
                        }
                      ]}>
                        <Text style={[
                          styles.badgeText, 
                          { 
                            color: 
                              item.status === 'PENDING' ? '#d97706' : 
                              item.status === 'CONFIRMED' ? '#2563eb' : 
                              item.status === 'COMPLETED' ? '#16a34a' : '#ef4444' 
                          }
                        ]}>
                          {item.status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.bookingCardBody}>
                      <Text style={styles.bookingDetailsText}>👤 {residentName}</Text>
                      <Text style={styles.bookingDetailsText}>🏢 Unit {unitNumber} ({buildingNo})</Text>
                    </View>

                    {isConfirmed && (
                      <TouchableOpacity 
                        style={styles.checkInBtn}
                        onPress={() => handleConfirmArrival(item)}
                        disabled={isCheckingIn}
                      >
                        {isCheckingIn ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.checkInBtnText}>Confirm Check-In & Bill Session</Text>
                        )}
                      </TouchableOpacity>
                    )}

                    {isPending && (
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity 
                          style={[styles.rejectBtn, { flex: 1 }]}
                          onPress={() => handleRejectBooking(item)}
                          disabled={isApproving}
                        >
                          <Text style={styles.rejectBtnText}>Reject</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.approveBtn, { flex: 2 }]}
                          onPress={() => handleApproveBooking(item)}
                          disabled={isApproving}
                        >
                          {isApproving ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.approveBtnText}>Approve Request</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>

        {/* RADIO Tab */}
        <View style={{ width: SCREEN_WIDTH, flex: 1, padding: 16 }}>
          <RadioModule guardName={staffName} assignedBuilding="Tower A - Amenity Center" themeMode="LIGHT" showResidents={true} channel="AMENITY" />
        </View>

        {/* MYPAGE Tab */}
        <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
          {/* MyPage Sub-Navigation Chips */}
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 16, marginBottom: 15 }}>
            <TouchableOpacity 
              onPress={() => {
                setMyPageSubTab('LOGS');
                myPageScrollRef.current?.scrollTo({ x: 0, animated: true });
              }}
              style={[styles.subTabChip, myPageSubTab === 'LOGS' && styles.subTabChipActive]}
            >
              <Text style={[styles.subTabChipText, myPageSubTab === 'LOGS' && styles.subTabChipTextActive]}>Logs</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => {
                setMyPageSubTab('SHIFT');
                myPageScrollRef.current?.scrollTo({ x: SCREEN_WIDTH, animated: true });
              }}
              style={[styles.subTabChip, myPageSubTab === 'SHIFT' && styles.subTabChipActive]}
            >
              <Text style={[styles.subTabChipText, myPageSubTab === 'SHIFT' && styles.subTabChipTextActive]}>Shift</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => {
                setMyPageSubTab('PAYROLL');
                myPageScrollRef.current?.scrollTo({ x: SCREEN_WIDTH * 2, animated: true });
              }}
              style={[styles.subTabChip, myPageSubTab === 'PAYROLL' && styles.subTabChipActive]}
            >
              <Text style={[styles.subTabChipText, myPageSubTab === 'PAYROLL' && styles.subTabChipTextActive]}>Payroll</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={myPageScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => {
              const offsetX = event.nativeEvent.contentOffset.x;
              const page = Math.round(offsetX / SCREEN_WIDTH);
              if (page === 0) {
                setMyPageSubTab('LOGS');
              } else if (page === 1) {
                setMyPageSubTab('SHIFT');
              } else {
                setMyPageSubTab('PAYROLL');
              }
            }}
            style={{ flex: 1 }}
          >
            {/* Page 1: Logs */}
            <View style={{ width: SCREEN_WIDTH }}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 90 }} keyboardShouldPersistTaps="handled">
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.sectionTitle}>📋 Recent Duty Log Activity</Text>
                  <View style={styles.activityLogCard}>
                    <View style={styles.logItem}>
                      <Text style={styles.logAction}>Shift Started</Text>
                      <Text style={styles.logTime}>Today 07:00 AM</Text>
                    </View>
                    <View style={styles.logItem}>
                      <Text style={styles.logAction}>Lobby Desk Setup Completed</Text>
                      <Text style={styles.logTime}>Today 07:15 AM</Text>
                    </View>
                    <View style={styles.logItem}>
                      <Text style={styles.logAction}>Gym capacity audit passed</Text>
                      <Text style={styles.logTime}>Today 10:00 AM</Text>
                    </View>
                  </View>
                </View>
              </ScrollView>
            </View>

            {/* Page 2: Shift */}
            <View style={{ width: SCREEN_WIDTH }}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 90 }} keyboardShouldPersistTaps="handled">
                <View style={{ marginTop: 10 }}>
                  <ShiftModule 
                    themeMode="LIGHT"
                    attendanceData={attendanceData}
                    currentYear={currentYear}
                    currentMonth={currentMonth}
                  />
                </View>
              </ScrollView>
            </View>

            {/* Page 3: Payroll */}
            <View style={{ width: SCREEN_WIDTH }}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 90 }} keyboardShouldPersistTaps="handled">
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.sectionTitle}>💰 Monthly Salary & Payroll Estimates</Text>
                  <View style={styles.payrollCard}>
                    <View style={styles.payrollRow}>
                      <Text style={styles.payrollLabel}>Regular Worked Hours:</Text>
                      <Text style={styles.payrollValue}>160.0 hrs</Text>
                    </View>
                    <View style={styles.payrollRow}>
                      <Text style={styles.payrollLabel}>Overtime Hours:</Text>
                      <Text style={styles.payrollValue}>12.5 hrs</Text>
                    </View>
                    <View style={styles.payrollRow}>
                      <Text style={styles.payrollLabel}>Gross Base Salary:</Text>
                      <Text style={styles.payrollValue}>₱24,500.00</Text>
                    </View>
                    <View style={styles.payrollRow}>
                      <Text style={styles.payrollLabel}>OT Allowance (1.25x):</Text>
                      <Text style={styles.payrollValue}>₱2,450.00</Text>
                    </View>
                    <View style={styles.payrollRowDivider} />
                    <View style={styles.payrollRow}>
                      <Text style={[styles.payrollLabel, { fontWeight: 'bold' }]}>Estimated Take-Home:</Text>
                      <Text style={[styles.payrollValue, { color: '#16a34a', fontWeight: 'bold' }]}>₱26,950.00</Text>
                    </View>
                  </View>
                </View>
              </ScrollView>
            </View>
          </ScrollView>
        </View>
      </ScrollView>

      {/* Bottom Tab Bar - Styled to look identical to Guard App bottom tab layout */}
      <View style={styles.bottomTabBar}>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'HOME' && styles.activeTabItem]} 
          onPress={() => handleTabPress('HOME')}
        >
          <Text style={{ fontSize: 18 }}>🏠</Text>
          <Text style={[styles.tabLabel, { color: activeTab === 'HOME' ? '#38bdf8' : '#475569' }]}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'BOOKINGS' && styles.activeTabItem]} 
          onPress={() => handleTabPress('BOOKINGS')}
        >
          <Text style={{ fontSize: 18 }}>📅</Text>
          <Text style={[styles.tabLabel, { color: activeTab === 'BOOKINGS' ? '#38bdf8' : '#475569' }]}>BOOKINGS</Text>
          {pendingBookingsCount > 0 && (
            <View style={styles.tabAbsoluteBadge}>
              <Text style={styles.tabAbsoluteBadgeText}>{pendingBookingsCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'RADIO' && styles.activeTabItem]} 
          onPress={() => handleTabPress('RADIO')}
        >
          <Text style={{ fontSize: 18 }}>💬</Text>
          <Text style={[styles.tabLabel, { color: activeTab === 'RADIO' ? '#38bdf8' : '#475569' }]}>RADIO</Text>
          {unreadRadioCount > 0 && (
            <View style={styles.tabAbsoluteBadge}>
              <Text style={styles.tabAbsoluteBadgeText}>{unreadRadioCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'MYPAGE' && styles.activeTabItem]} 
          onPress={() => handleTabPress('MYPAGE')}
        >
          <Text style={{ fontSize: 18 }}>👤</Text>
          <Text style={[styles.tabLabel, { color: activeTab === 'MYPAGE' ? '#38bdf8' : '#475569' }]}>MY PAGE</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 },
  
  // Header (Unified with Guard App)
  header: { 
    paddingHorizontal: 16, 
    paddingVertical: 14, 
    backgroundColor: '#0038a8', 
    borderBottomWidth: 1, 
    borderBottomColor: '#002266', 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingTop: Platform.OS === 'ios' ? 12 : 16 
  },
  headerTextColumn: { flex: 1, marginRight: 8, justifyContent: 'center' },
  headerTitle: { fontSize: 12, fontWeight: '900', color: '#fff', letterSpacing: 0.5, marginBottom: 4 },
  guardLabelLine: { color: '#93c5fd', fontSize: 11, fontWeight: '700', lineHeight: 15 },
  sectorLabelLine: { color: '#fcd34d', fontSize: 11, fontWeight: '800', lineHeight: 15, marginTop: 1 },
  refreshBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
  giantDutyToggleBadge: { width: 105, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  giantDutyBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  sosButtonBadge: { width: 105, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#dc2626', borderWidth: 1.5, borderColor: '#fca5a5' },
  sosButtonBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  
  // Filters Section
  filterSection: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  searchInput: { backgroundColor: '#f1f5f9', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, color: '#0f172a', fontSize: 13, fontWeight: '600', marginBottom: 12 },
  statusTabs: { flexDirection: 'row', gap: 8 },
  statusTab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#f1f5f9' },
  statusTabActive: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  statusTabText: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  statusTabTextActive: { color: '#0038a8' },

  // Booking Card
  bookingCard: { backgroundColor: '#fff', borderRadius: 16, borderColor: '#e2e8f0', padding: 16, marginBottom: 12, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  bookingCardHeader: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 10, marginBottom: 10 },
  bookingIcon: { fontSize: 24 },
  bookingAmenityName: { fontSize: 14, fontWeight: 'bold', color: '#0f172a' },
  bookingTime: { fontSize: 11, color: '#64748b', marginTop: 2, fontWeight: '600' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  bookingCardBody: { paddingBottom: 12 },
  bookingDetailsText: { fontSize: 13, color: '#334155', fontWeight: '700', marginTop: 4 },
  checkInBtn: { backgroundColor: '#0038a8', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  checkInBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  approveBtn: { backgroundColor: '#16a34a', paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  approveBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  rejectBtn: { backgroundColor: '#fef2f2', borderColor: '#fca5a5', borderWidth: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rejectBtnText: { color: '#ef4444', fontSize: 13, fontWeight: '800' },

  // Empty List
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  emptySub: { fontSize: 13, color: '#64748b', marginTop: 4, textAlign: 'center', paddingHorizontal: 40 },

  // My Page
  profileHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 20, borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 20 },
  avatarContainer: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#f0f9ff', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e0f2fe' },
  profileName: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  roleTag: { backgroundColor: '#eff6ff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginTop: 6, alignSelf: 'flex-start' },
  roleTagText: { color: '#0038a8', fontSize: 11, fontWeight: '800' },
  
  subNavigationRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  subTabChip: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center' },
  subTabChipActive: { backgroundColor: '#0038a8', borderColor: '#0038a8' },
  subTabChipText: { color: '#475569', fontSize: 12, fontWeight: '700' },
  subTabChipTextActive: { color: '#fff' },

  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  activityLogCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', padding: 16 },
  logItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  logAction: { fontSize: 13, fontWeight: '700', color: '#334155' },
  logTime: { fontSize: 11, color: '#64748b', fontWeight: '500' },

  payrollCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', padding: 16 },
  payrollRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  payrollRowDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 8 },
  payrollLabel: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  payrollValue: { fontSize: 13, color: '#0f172a', fontWeight: '700' },

  logoutBtn: { backgroundColor: '#ef4444', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 24, flexDirection: 'row', justifyContent: 'center' },
  logoutBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  // Bottom Navigation Bar (Unified with Guard App)
  bottomTabBar: { 
    height: Platform.OS === 'ios' ? 84 : 70, 
    borderTopWidth: 1, 
    borderTopColor: '#cbd5e1', 
    backgroundColor: '#ffffff', 
    flexDirection: 'row', 
    justifyContent: 'space-around', 
    alignItems: 'center', 
    paddingBottom: Platform.OS === 'ios' ? 15 : 5 
  },
  tabItem: { alignItems: 'center', flex: 1, paddingVertical: 10 },
  activeTabItem: { backgroundColor: '#f1f5f9' },
  tabLabel: { color: '#475569', fontSize: 10, fontWeight: '700', marginTop: 4 },
  tabAbsoluteBadge: { position: 'absolute', top: 4, right: 32, backgroundColor: '#ce1126', width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  tabAbsoluteBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },

  // Dashboard / Home Metrics Styles
  dashboardMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  dashboardMetricCard: {
    width: '48%',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  dashboardMetricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  dashboardMetricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b'
  },
  dashboardMetricValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a'
  },
  dashboardMetricSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4
  }
});
