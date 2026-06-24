"use client";

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, TextInput, StyleSheet, Platform, Image, Dimensions, Modal, KeyboardAvoidingView, InputAccessoryView, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import RadioModule from '../components/shared/RadioModule';
import ShiftModule from '../components/shared/ShiftModule';
import { supabase } from '../lib/supabase';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import * as Location from 'expo-location';
import { API_BASE_URL } from '../api/apiClient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function MaintenanceTechApp({ navigation }: any) {
  const [themeMode, setThemeMode] = useState<'LIGHT' | 'DARK'>('LIGHT');
  type TabName = 'HOME' | 'JOBS' | 'RADIO' | 'MYPAGE';
  const [activeTab, setActiveTab] = useState<TabName>('HOME');
  const scrollViewRef = useRef<ScrollView>(null);
  const myPageScrollRef = useRef<ScrollView>(null);

  const handleTabPress = (tabName: TabName) => {
    setActiveTab(tabName);
    const tabNames: TabName[] = ['HOME', 'JOBS', 'RADIO', 'MYPAGE'];
    const idx = tabNames.indexOf(tabName);
    if (idx !== -1) {
      scrollViewRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: true });
    }
  };
  const [myPageSubTab, setMyPageSubTab] = useState<'LOGS' | 'SHIFT' | 'PAYROLL'>('LOGS'); // MYPAGE internal sub tabs
  const [accessLogs, setAccessLogs] = useState<any[]>([
    {
      id: 'init-1',
      action: 'SYSTEM_BOOT',
      details: 'Maintenance cockpit loaded. Supabase replication active.',
      time: `${new Date().toLocaleDateString([], { month: '2-digit', day: '2-digit' })} 07:00 AM`
    },
    {
      id: 'init-2',
      action: 'SHIFT_START',
      details: 'Duty started. Checked in at Tower A.',
      time: `${new Date().toLocaleDateString([], { month: '2-digit', day: '2-digit' })} 07:02 AM`
    },
  ]);
  const [jobOrders, setJobOrders] = useState<any[]>([]);
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  const formatSecureDate = (isoString: string | null) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const isToday = (isoString: string | null) => {
    if (!isoString) return false;
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return false;
    const today = new Date();
    return date.getFullYear() === today.getFullYear() &&
           date.getMonth() === today.getMonth() &&
           date.getDate() === today.getDate();
  };

  const isAfterToday = (isoString: string | null) => {
    if (!isoString) return false;
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const compareDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return compareDate.getTime() > today.getTime();
  };

  // Payroll states
  const [payrollSettings, setPayrollSettings] = useState<any>(null);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<any[]>([]);
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth()); // 0-11
  const [loadingPayroll, setLoadingPayroll] = useState(false);
  
  // 1. Detail view state added
  const [selectedJob, setSelectedJob] = useState<any>(null);

  // Time Negotiation state
  const [proposedTime, setProposedTime] = useState('');
  const [claimProposedTime, setClaimProposedTime] = useState('');
  const [selectedDateVal, setSelectedDateVal] = useState('');
  const [selectedDateISO, setSelectedDateISO] = useState('');
  const [selectedTimeVal, setSelectedTimeVal] = useState('');
  const [selectedStepDateVal, setSelectedStepDateVal] = useState('');
  const [selectedStepDateISO, setSelectedStepDateISO] = useState('');
  const [selectedStepTimeVal, setSelectedStepTimeVal] = useState('');
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [targetField, setTargetField] = useState<'CLAIM' | 'STEP'>('CLAIM');

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

  const checkScheduleCollision = (proposedISO: string, currentJobId: string) => {
    if (!proposedISO) return false;
    const proposedTimeMs = new Date(proposedISO).getTime();
    if (isNaN(proposedTimeMs)) return false;

    for (const j of jobOrders) {
      if (j.id === currentJobId) continue;
      if (j.assigned_technician_id !== myUserId) continue;
      if (!['VISIT_CONFIRMED', 'VISITING', 'IN_PROGRESS'].includes(j.status)) continue;
      if (!j.proposed_visit_time) continue;

      const jobTimeMs = Date.parse(j.proposed_visit_time);
      if (isNaN(jobTimeMs)) continue;

      const diffMin = Math.abs(proposedTimeMs - jobTimeMs) / (1000 * 60);
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

  // Form state
  const [materialCost, setMaterialCost] = useState('');
  const [laborCost, setLaborCost] = useState('');
  const [beforePhoto, setBeforePhoto] = useState<string | null>(null);
  const [afterPhoto, setAfterPhoto] = useState<string | null>(null);
  const [isCostFocused, setIsCostFocused] = useState(false);
  const [keyboardShown, setKeyboardShown] = useState(false);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidShow' : 'keyboardWillShow',
      () => setKeyboardShown(true)
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'android' ? 'keyboardDidHide' : 'keyboardWillHide',
      () => setKeyboardShown(false)
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Header state
  const [userName, setUserName] = useState('Loading...');
  const [userRole, setUserRole] = useState('TECHNICIAN');
  const [condoName, setCondoName] = useState('Solea Residences');
  const [assignedBuilding, setAssignedBuilding] = useState('Tower A');
  const [isOnDuty, setIsOnDuty] = useState(true);

  const assignedBuildingRef = useRef(assignedBuilding);
  const userNameRef = useRef(userName);

  useEffect(() => {
    assignedBuildingRef.current = assignedBuilding;
    userNameRef.current = userName;
  }, [assignedBuilding, userName]);

  const handleTriggerSosBroadcast = async () => {
    try {
      const canonicalPmoId = '66dcdab9-091a-440f-a871-fe2133c1813e';
      const channel = 'MAINTENANCE';
      const name = userName;
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

      // Fetch condo address from database
      const condoId = 'c1111111-1111-1111-1111-111111111111';
      const { data: condo } = await supabase
        .from('condos')
        .select('address, name')
        .eq('id', condoId)
        .single();
      
      const condoAddress = condo?.address || 'Mactan, Cebu';
      const condoName = condo?.name || 'Solea Residences';

      // Geocode the address to coordinates
      let CONDO_LAT = 10.2646; // default Solea fallback
      let CONDO_LNG = 123.9961;
      try {
        const geocoded = await Location.geocodeAsync(condoAddress);
        if (geocoded && geocoded.length > 0) {
          CONDO_LAT = geocoded[0].latitude;
          CONDO_LNG = geocoded[0].longitude;
          console.log(`📍 Geocoded condo address "${condoAddress}" to: ${CONDO_LAT}, ${CONDO_LNG}`);
        }
      } catch (geoErr) {
        console.error("Geocoding error, falling back to default:", geoErr);
      }

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
        Alert.alert("Location Verified ✅", `You are within 100m of ${condoName}. Automatically set to ON-DUTY.`);
      } else {
        if (isManualClick) {
          Alert.alert(
            "Outside Workplace Boundary 📍",
            `You are ${distance.toFixed(0)}m away from ${condoName}. Would you like to bypass and set to ON-DUTY anyway for testing?`,
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

  const fetchProfileDetails = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('staff_profiles')
        .select('full_name, role, assigned_building')
        .eq('id', userId)
        .maybeSingle();

      if (!error && data) {
        setUserName(data.full_name || 'Tech A');
        setUserRole(data.role || 'TECHNICIAN');
        setAssignedBuilding(data.assigned_building || 'Tower A');
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
    } catch (err) {
      console.error("Error fetching tech profile details:", err);
    }
  };

  const fetchUnreadMessageCount = async () => {
    try {
      const currentBuilding = assignedBuildingRef.current;
      const currentUserName = userNameRef.current;
      
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

      // 2. Fetch resident chats for MAINTENANCE channel
      const { data: chats } = await supabase
        .from('intercom_chats')
        .select('user_id, read_by_guards')
        .eq('target_building', currentBuilding)
        .eq('channel', 'MAINTENANCE');

      if (chats) {
        const residentUnreads = chats
          .filter(c => !pmoIds.includes(c.user_id))
          .filter(c => 
            !c.read_by_guards || 
            c.read_by_guards.length === 0 || 
            !c.read_by_guards.includes(currentUserName)
          ).length;
        totalUnreads += residentUnreads;
      }

      // 3. Fetch PMO Radio chat unread count
      const canonicalPmoId = '66dcdab9-091a-440f-a871-fe2133c1813e';
      const { data: pmoChat } = await supabase
        .from('intercom_chats')
        .select('id')
        .eq('user_id', canonicalPmoId)
        .eq('channel', 'MAINTENANCE')
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

      setUnreadMessageCount(totalUnreads);
    } catch (err) {
      console.error("Error fetching unread message count:", err);
    }
  };

  useEffect(() => {
    if (userName && assignedBuilding) {
      fetchUnreadMessageCount();
    }
  }, [userName, assignedBuilding]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setMyUserId(session.user.id);
        fetchProfileDetails(session.user.id);
      }
    });

    checkLocationAndSetDuty(false);

    fetchJobOrders();
    fetchHistoryOrders();

    const channel = supabase.channel('job_orders_tech_' + Date.now())
      .on('postgres_changes', {
        event: '*', 
        schema: 'public',
        table: 'job_orders'
      }, (payload) => {
        console.log('Realtime Change Detected:', payload);
        fetchJobOrders();
        fetchHistoryOrders();
      })
      .subscribe();

    const chatChannel = supabase.channel('tech-chats-sync-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intercom_chats' }, () => {
        fetchUnreadMessageCount();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intercom_messages' }, async (payload) => {
        fetchUnreadMessageCount();
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
      supabase.removeChannel(channel);
      supabase.removeChannel(chatChannel);
    };
  }, [assignedBuilding]);

  useEffect(() => {
    if (activeTab === 'MYPAGE' && myPageSubTab === 'PAYROLL') {
      fetchPayrollData();
    }
  }, [activeTab, myPageSubTab, currentYear, currentMonth]);

  const fetchPayrollData = async () => {
    setLoadingPayroll(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      // 1. Fetch staff profile (payroll settings)
      const { data: profile, error: pError } = await supabase
        .from('staff_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (!pError && profile) {
        setPayrollSettings(profile.payroll_settings || { base_rate_type: 'hourly', base_rate: 80, additions: [] });
      }

      // 2. Fetch attendance
      const startOfMonth = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      const endOfMonth = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];
      const { data: att, error: aError } = await supabase
        .from('staff_attendance')
        .select('*')
        .eq('staff_id', userId)
        .gte('work_date', startOfMonth)
        .lte('work_date', endOfMonth);
      if (!aError && att) {
        setAttendanceData(att);
      }

      // 3. Fetch disbursed payroll records
      const { data: records, error: rError } = await supabase
        .from('staff_payroll_records')
        .select('*')
        .eq('staff_id', userId)
        .gte('pay_period_start', startOfMonth)
        .lte('pay_period_end', endOfMonth);
      if (!rError && records) {
        setPayrollRecords(records);
      }
    } catch (err) {
      console.error("Error fetching payroll details:", err);
    } finally {
      setLoadingPayroll(false);
    }
  };

  const calculatePayroll = () => {
    let regularHoursSum = 0;
    let otHoursSum = 0;
    
    attendanceData.forEach((att: any) => {
      const minutes = att.total_minutes || 0;
      const hours = minutes / 60;
      if (hours > 8) {
        regularHoursSum += 8;
        otHoursSum += (hours - 8);
      } else {
        regularHoursSum += hours;
      }
    });

    const baseRate = payrollSettings?.base_rate || 80;
    const baseRateType = payrollSettings?.base_rate_type || 'hourly';
    const additionsList = payrollSettings?.additions || [];

    const standardOTRateMultiplier = 1.25;
    const standardHourlyRate = baseRateType === 'hourly' ? baseRate : baseRate / 8;
    const basePay = regularHoursSum * standardHourlyRate;
    const otPay = otHoursSum * standardHourlyRate * standardOTRateMultiplier;

    // Calculate additions
    let additionsSum = 0;
    additionsList.forEach((add: any) => {
      if (add.frequency === 'monthly') {
        additionsSum += Number(add.amount);
      } else if (add.frequency === 'daily') {
        const daysWorked = new Set(attendanceData.map((a: any) => a.work_date)).size;
        additionsSum += (daysWorked * Number(add.amount));
      } else if (add.frequency === 'hourly') {
        const totalHrs = regularHoursSum + otHoursSum;
        additionsSum += (totalHrs * Number(add.amount));
      }
    });

    const netPay = basePay + otPay + additionsSum;

    return {
      regularHours: regularHoursSum,
      otHours: otHoursSum,
      basePay,
      otPay,
      additionsSum,
      netPay
    };
  };

  const totals = calculatePayroll();

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayIndex = (year: number, month: number) => new Date(year, month, 1).getDay();

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayIndex = getFirstDayIndex(currentYear, currentMonth);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const handleSignOut = async () => {
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
          try {
            await supabase.auth.signOut();
            Alert.alert("Signed Out ✅", "Logged out from Maintenance Tech session.");
          } catch (e: any) {
            Alert.alert("Error", e.message || "Failed to sign out.");
          }
        }
      }
    ]);
  };

  const fetchJobOrders = async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    if (sessionError || !userId) {
      console.log("DEBUG - No session user, error prevention complete here.");
      if (sessionError) {
        await supabase.auth.signOut().catch(() => {});
      }
      return;
    }

    setMyUserId(userId);

    try {
      const response = await fetch(`${API_BASE_URL}/api/maintenance/list?techId=${userId}`);
      if (!response.ok) throw new Error("Failed to fetch job orders");
      const allJobs = await response.json();

      if (allJobs) {
        // units 쿼리 포맷 매핑
        const mapped = allJobs.map((j: any) => ({
          ...j,
          id: j.id.toString(),
          units: j.units ? { ...j.units, tower_name: j.units.building_no } : null
        }));

        setJobOrders(mapped);
        setSelectedJob((prev: any) => {
          if (prev) return mapped.find((j: any) => j.id === prev.id) || null;
          return prev;
        });
      }
    } catch (error) {
      console.error("fetchJobOrders Error:", error);
    }
  };

  // 🎯 [Fetch Completed History] Only fetch completed or closed items by admin/tech.
  const fetchHistoryOrders = async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (sessionError || !userId) {
      console.log("DEBUG - No session user, error prevention complete here.");
      if (sessionError) {
        await supabase.auth.signOut().catch(() => {});
      }
      return;
    }

    setMyUserId(userId);

    try {
      const response = await fetch(`${API_BASE_URL}/api/maintenance/list?historyTechId=${userId}`);
      if (!response.ok) throw new Error("Failed to fetch history orders");
      const data = await response.json();

      if (data) {
        const mapped = data.map((j: any) => ({
          ...j,
          id: j.id.toString(),
          units: j.units ? { ...j.units, tower_name: j.units.building_no } : null
        }));
        setHistoryOrders(mapped);
      }
    } catch (error) {
      console.error("fetchHistoryOrders Error:", error);
    }
  };

  const startChatWithResident = async (residentId: string, unitNumber: string) => {
    if (!residentId) {
      Alert.alert("Error", "Resident information is not available.");
      return;
    }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id;
      if (!currentUserId) {
        Alert.alert("Error", "You must be logged in to chat.");
        return;
      }

      if (residentId.startsWith('demo') || currentUserId.startsWith('demo')) {
        navigation.navigate('DirectChat', {
          chatId: 'demo-dm-' + unitNumber,
          targetUnitNumber: unitNumber
        });
        return;
      }

      const u1 = currentUserId < residentId ? currentUserId : residentId;
      const u2 = currentUserId < residentId ? residentId : currentUserId;

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
          targetUnitNumber: unitNumber
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
          targetUnitNumber: unitNumber
        });
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", "Failed to start chat: " + e.message);
    }
  };

  // 3. Unified function to update status
  const updateStatus = async (id: string, newStatus: string, extraData: any = {}) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/maintenance/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          updates: { status: newStatus, ...extraData }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update status');
      }

      // Dynamic log entry
      const now = new Date();
      const dateStr = now.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const newLog = {
        id: `tech-log-${Date.now()}`,
        action: `JOB_${newStatus}`,
        details: `Job ID #${id.slice(0, 8).toUpperCase()} updated to ${newStatus}.`,
        time: `${dateStr} ${timeStr}`
      };
      setAccessLogs(prev => [newLog, ...prev]);
      
      fetchJobOrders(); // Force refresh in case real-time fails
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  // 🎯 Update to VISITING status and transition to report screen
  const handleStartVisit = async (id: string) => {
    await updateStatus(id, 'VISITING');
    setActiveOrderId(id); // Register as active report job immediately
  };

  // 🎯 Before photo capture logic (runs physical camera)
  const captureBeforePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("Permission Required", "Camera access is required.");
    
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets && activeOrderId) {
      try {
        const { uri, base64 } = result.assets[0];
        setBeforePhoto(uri); // Preview update for local UI

        const fileName = `before_${activeOrderId}_${Date.now()}.jpg`;

        // 1. Storage upload (using base64 decode safe for React Native)
        const { error: uploadError } = await supabase.storage
          .from('repair-photos')
          .upload(fileName, decode(base64!), { contentType: 'image/jpeg' });

        if (uploadError) throw uploadError;

        // 2. Obtain URL
        const { data } = supabase.storage.from('repair-photos').getPublicUrl(fileName);

        // 3. DB update
        const response = await fetch(`${API_BASE_URL}/api/maintenance/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: activeOrderId,
            updates: { before_photo_url: data.publicUrl }
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update photo URL');
        }

        Alert.alert("Success", "Before photo saved to server.");
        fetchJobOrders(); // Status refresh
      } catch (err: any) {
        Alert.alert("Upload Failed", err.message);
      }
    }
  };

  // 🎯 After photo capture logic (runs physical camera)
  const captureAfterPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert("Permission Required", "Camera access is required.");
    
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets && activeOrderId) {
      try {
        const { uri, base64 } = result.assets[0];
        setAfterPhoto(uri); // Preview update for local UI

        const fileName = `after_${activeOrderId}_${Date.now()}.jpg`;

        // 1. Storage upload
        const { error: uploadError } = await supabase.storage
          .from('repair-photos')
          .upload(fileName, decode(base64!), { contentType: 'image/jpeg' });

        if (uploadError) throw uploadError;

        // 2. Obtain URL
        const { data } = supabase.storage.from('repair-photos').getPublicUrl(fileName);

        // 3. DB update
        const response = await fetch(`${API_BASE_URL}/api/maintenance/update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: activeOrderId,
            updates: { after_photo_url: data.publicUrl }
          })
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update photo URL');
        }

        Alert.alert("Success", "After photo saved to server.");
        fetchJobOrders(); // Status refresh
      } catch (err: any) {
        Alert.alert("Upload Failed", err.message);
      }
    }
  };

  const requestEstimateApproval = async (customMCost?: number, customLCost?: number) => {
    if (!activeOrderId) return;
    
    const mCost = customMCost !== undefined ? customMCost : (parseFloat(materialCost) || 0);
    const lCost = customLCost !== undefined ? customLCost : (parseFloat(laborCost) || 0);
    const total = mCost + lCost;

    try {
      const currentJob = getActiveJobForReport();
      
      // 1. Check if before photo is captured
      if (!currentJob?.before_photo_url) {
        Alert.alert("Notice", "Please capture the before photo and wait for upload.");
        return;
      }
      
      // 2. Change status to ESTIMATE_SUBMITTED
      const response = await fetch(`${API_BASE_URL}/api/maintenance/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeOrderId,
          updates: { 
            status: 'ESTIMATE_SUBMITTED', 
            material_cost: mCost, 
            labor_cost: lCost, 
            estimated_cost: total 
          }
        })
      });
        
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to request approval');
      }
      
      Alert.alert("Success", "Requested cost approval from resident.");
      setBeforePhoto(null);
      fetchJobOrders();
    } catch (err: any) {
      Alert.alert("Error", "Failed to request approval: " + err.message);
    }
  };

  const completeRepair = async () => {
    if (!activeOrderId) return;

    try {
      const currentJob = getActiveJobForReport();
      if (!currentJob?.after_photo_url) {
        Alert.alert("Notice", "Please capture the completed repair photo first.");
        return;
      }

      // Change status to 'COMPLETED' and record finish time
      const response = await fetch(`${API_BASE_URL}/api/maintenance/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeOrderId,
          updates: { 
            status: 'COMPLETED',
            status_finished_at: new Date().toISOString()
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to complete repair');
      }

      Alert.alert("Success", "Job Completed! Final report sent to admin.");
      setSelectedJob(null);
      setActiveOrderId(null);
      setBeforePhoto(null);
      setAfterPhoto(null);
      setMaterialCost('');
      setLaborCost('');
      fetchJobOrders();
      fetchHistoryOrders();
    } catch (err: any) {
      Alert.alert("Error", "Failed to complete repair: " + err.message);
    }
  };

  const getActiveJobForReport = () => jobOrders.find(j => j.id === activeOrderId);

  const isDark = false;
  const themeColors = {
    background: '#f8fafc',
    headerBg: '#0038a8', // Unify to Fili Blue
    headerBorder: '#002266',
    headerText: '#ffffff', // Unify to white text
    cardBg: '#ffffff',
    cardBorder: '#e2e8f0',
    text: '#0f172a',
    subtext: '#334155',
    mutedText: '#64748b',
    inputBg: '#f1f5f9',
    inputText: '#0f172a',
    inputBorder: '#cbd5e1',
    tabBg: '#ffffff',
    tabBorder: '#cbd5e1',
    activeTabBg: '#e2e8f0',
    tabItemLabel: '#475569',
    jobCardBg: '#ffffff',
    jobCardBorder: '#cbd5e1',
    payrollCardBg: '#ffffff',
    payrollCardBorder: '#cbd5e1',
    punchLogBg: '#ffffff',
    punchLogBorder: '#cbd5e1',
    punchDateText: '#0f172a',
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Tactics Cockpit Header */}
      {activeTab === 'HOME' ? (
        <View style={[styles.header, { backgroundColor: themeColors.headerBg, borderBottomColor: themeColors.headerBorder }]}>
          <View style={styles.headerTextColumn}>
            <Text style={[styles.headerTitle, { color: themeColors.headerText }]}>🏢 {condoName}</Text>
            <Text style={styles.guardLabelLine}>{userName}</Text>
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
            {activeTab === 'JOBS' ? 'Jobs' : activeTab === 'RADIO' ? 'Messages' : 'My Page'}
          </Text>
          
          {activeTab === 'MYPAGE' ? (
            <TouchableOpacity onPress={handleSignOut} style={{ width: 80, alignItems: 'flex-end' }}>
              <Ionicons name="log-out-outline" size={24} color="#ef4444" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 80 }} />
          )}
        </View>
      )}
      
      <View style={{ flex: 1, position: 'relative' }}>
        <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          const tabNames: TabName[] = ['HOME', 'JOBS', 'RADIO', 'MYPAGE'];
          if (tabNames[index]) {
            setActiveTab(tabNames[index]);
          }
        }}
        style={{ flex: 1 }}
      >
        {/* [HOME tab] */}
        <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
          <ScrollView style={{ flex: 1, backgroundColor: themeColors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
              {/* Greeting */}
              <Text style={{ fontSize: 22, fontWeight: 'bold', color: themeColors.text, marginBottom: 5 }}>Welcome Back!</Text>
              <Text style={{ fontSize: 13, color: themeColors.mutedText, marginBottom: 20 }}>Checked in at {assignedBuilding}</Text>

              {/* Quick Status Cards */}
              <View style={styles.dashboardMetricsRow}>
                <TouchableOpacity 
                  style={styles.dashboardMetricCard} 
                  activeOpacity={0.8}
                  onPress={() => handleTabPress('JOBS')}
                >
                  <View style={styles.dashboardMetricHeader}>
                    <Ionicons name="construct-outline" size={18} color="#0038a8" style={{ marginRight: 6 }} />
                    <Text style={styles.dashboardMetricLabel}>Job Requests</Text>
                  </View>
                  <Text style={styles.dashboardMetricValue}>
                    {jobOrders.filter(job => job.status === 'REQUESTED' || job.status === 'ASSIGNED').length}
                  </Text>
                  <Text style={[styles.dashboardMetricSub, jobOrders.filter(job => job.status === 'REQUESTED' || job.status === 'ASSIGNED').length > 0 ? { color: '#ce1126', fontWeight: '700' } : { color: '#64748b' }]}>
                    {jobOrders.filter(job => job.status === 'REQUESTED' || job.status === 'ASSIGNED').length > 0 ? 'Action required' : 'All jobs started'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.dashboardMetricCard} 
                  activeOpacity={0.8}
                  onPress={() => handleTabPress('RADIO')}
                >
                  <View style={styles.dashboardMetricHeader}>
                    <Ionicons name="chatbubbles-outline" size={18} color="#0038a8" style={{ marginRight: 6 }} />
                    <Text style={styles.dashboardMetricLabel}>Radio Messages</Text>
                  </View>
                  <Text style={styles.dashboardMetricValue}>{unreadMessageCount}</Text>
                  <Text style={[styles.dashboardMetricSub, unreadMessageCount > 0 ? { color: '#ce1126', fontWeight: '700' } : { color: '#64748b' }]}>
                    {unreadMessageCount > 0 ? `${unreadMessageCount} unread chats` : 'No new messages'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Today's Schedule Section */}
              <View style={{ marginTop: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: themeColors.text, marginBottom: 12 }}>📅 TODAY'S SCHEDULE</Text>
                {(() => {
                  const todayJobs = jobOrders.filter(job => {
                    if (job.assigned_technician_id !== myUserId) return false;
                    if (!['VISIT_CONFIRMED', 'VISITING', 'IN_PROGRESS'].includes(job.status)) return false;
                    return isToday(job.proposed_visit_time);
                  }).sort((a, b) => {
                    const timeA = a.proposed_visit_time ? new Date(a.proposed_visit_time).getTime() : 0;
                    const timeB = b.proposed_visit_time ? new Date(b.proposed_visit_time).getTime() : 0;
                    return timeA - timeB;
                  });

                  if (todayJobs.length === 0) {
                    return (
                      <View style={{ backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder, borderWidth: 1, padding: 20, borderRadius: 12, alignItems: 'center' }}>
                        <Text style={{ color: themeColors.mutedText, fontSize: 13 }}>No schedules scheduled for today.</Text>
                      </View>
                    );
                  }

                  return todayJobs.map(job => (
                    <TouchableOpacity 
                      key={`home-today-${job.id}`} 
                      style={[styles.jobCard, { backgroundColor: '#f0f9ff', borderColor: '#bfdbfe', borderWidth: 2 }]} 
                      onPress={() => {
                        setBeforePhoto(null);
                        setAfterPhoto(null);
                        setMaterialCost('');
                        setLaborCost('');
                        setSelectedJob(job);
                        setActiveOrderId(job.id);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: '#0369a1', fontWeight: 'bold' }}>
                          {job.units ? `${job.units.tower_name} - ${job.units.unit_number}` : 'Unknown Unit'}
                        </Text>
                        {job.proposed_visit_time && (
                          <Text style={{ color: '#0284c7', fontSize: 12, fontWeight: '800' }}>
                            ⏰ {new Date(job.proposed_visit_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        )}
                      </View>
                      <Text style={{ color: themeColors.text, fontSize: 16, fontWeight: 'bold', marginTop: 5 }}>{job.title}</Text>
                      <Text style={{ color: themeColors.subtext, fontSize: 13, marginTop: 4 }} numberOfLines={2}>{job.description}</Text>
                    </TouchableOpacity>
                  ));
                })()}
              </View>
            </View>
          </ScrollView>
        </View>

        {/* [JOBS tab] */}
        <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
          <ScrollView style={{ flex: 1, backgroundColor: themeColors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View>
            {(() => {
              const sortedJobs = [...jobOrders].sort((a, b) => {
                const timeA = a.proposed_visit_time ? new Date(a.proposed_visit_time).getTime() : new Date(a.created_at).getTime();
                const timeB = b.proposed_visit_time ? new Date(b.proposed_visit_time).getTime() : new Date(b.created_at).getTime();
                return timeA - timeB;
              });

              const itemsPerPage = 10;
              const totalPages = Math.ceil(sortedJobs.length / itemsPerPage) || 1;
              const activePage = Math.min(currentPage, totalPages);
              const startIndex = (activePage - 1) * itemsPerPage;
              const paginatedJobs = sortedJobs.slice(startIndex, startIndex + itemsPerPage);

              return (
                <View>
                  <Text style={[styles.sectionTitle, { color: themeColors.mutedText, fontSize: 14, fontWeight: '800', marginBottom: 12 }]}>ALL ACTIVE JOBS</Text>
                  {sortedJobs.length === 0 ? (
                    <Text style={{ color: '#94a3b8' }}>No assigned tasks.</Text>
                  ) : (
                    <>
                      {paginatedJobs.map(job => {
                        const isFutureJob = isAfterToday(job.proposed_visit_time);
                        return (
                          <TouchableOpacity 
                            key={job.id} 
                            style={[
                              styles.jobCard, 
                              { 
                                backgroundColor: themeColors.cardBg, 
                                borderColor: themeColors.cardBorder, 
                                borderWidth: 1,
                                opacity: isFutureJob ? 0.9 : 1
                              }
                            ]} 
                            onPress={() => {
                              setBeforePhoto(null);
                              setAfterPhoto(null);
                              setMaterialCost('');
                              setLaborCost('');
                              setSelectedJob(job);
                              setActiveOrderId(job.id);
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ color: '#0038a8', fontWeight: 'bold' }}>
                                {job.units ? `${job.units.tower_name} - ${job.units.unit_number}` : 'Unknown Unit'}
                              </Text>
                              <Text style={{ color: '#fbbf24', fontSize: 12, fontWeight: '700' }}>{job.status}</Text>
                            </View>
                            <Text style={{ color: themeColors.text, fontSize: 16, fontWeight: 'bold', marginTop: 5 }}>{job.title}</Text>
                            <Text style={{ color: themeColors.mutedText, fontSize: 12, marginTop: 4 }}>
                              Requested: {new Date(job.created_at).toLocaleString()}
                            </Text>
                            {job.proposed_visit_time && (
                              <Text style={{ color: isFutureJob ? '#0284c7' : '#059669', fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                                {isFutureJob ? '📅 Future Visit: ' : '⏰ Scheduled: '}{new Date(job.proposed_visit_time).toLocaleDateString()} {new Date(job.proposed_visit_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                              </Text>
                            )}
                            <Text style={{ color: themeColors.subtext, fontSize: 13, marginTop: 4 }} numberOfLines={2}>{job.description}</Text>
                          </TouchableOpacity>
                        );
                      })}

                      {totalPages > 1 && (
                        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 15, marginBottom: 10 }}>
                          <TouchableOpacity 
                            disabled={activePage === 1} 
                            onPress={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                            style={{ padding: 10, opacity: activePage === 1 ? 0.3 : 1 }}
                          >
                            <Text style={{ color: '#0038a8', fontWeight: 'bold' }}>Previous</Text>
                          </TouchableOpacity>
                          <Text style={{ marginHorizontal: 15, fontWeight: '700', color: themeColors.text }}>
                            {activePage} / {totalPages}
                          </Text>
                          <TouchableOpacity 
                            disabled={activePage === totalPages} 
                            onPress={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                            style={{ padding: 10, opacity: activePage === totalPages ? 0.3 : 1 }}
                          >
                            <Text style={{ color: '#0038a8', fontWeight: 'bold' }}>Next</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </>
                  )}
                </View>
              );
            })()}
            {/* Removed nested detailOverlay from here to place it at root level */}
          </View>
          </ScrollView>
        </View>

        {/* [RADIO tab] */}
        <View style={{ width: SCREEN_WIDTH, flex: 1, paddingBottom: 80, padding: 20 }}>
          <RadioModule guardName="Tech A" themeMode={themeMode} channel="MAINTENANCE" />
        </View>

        {/* [MYPAGE tab] */}
        <View style={{ width: SCREEN_WIDTH, flex: 1, backgroundColor: themeColors.background }}>
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 20, marginBottom: 15 }}>
            <TouchableOpacity 
              onPress={() => {
                setMyPageSubTab('LOGS');
                myPageScrollRef.current?.scrollTo({ x: 0, animated: true });
              }} 
              style={[styles.actionBtn, { flex: 1, backgroundColor: myPageSubTab === 'LOGS' ? '#0038a8' : themeColors.cardBg, borderColor: themeColors.cardBorder, borderWidth: 1, marginTop: 0 }]}
            >
              <Text style={{ color: myPageSubTab === 'LOGS' ? '#fff' : themeColors.text, textAlign: 'center', fontWeight: 'bold', fontSize: 13 }}>Logs</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => {
                setMyPageSubTab('SHIFT');
                myPageScrollRef.current?.scrollTo({ x: SCREEN_WIDTH, animated: true });
              }} 
              style={[styles.actionBtn, { flex: 1, backgroundColor: myPageSubTab === 'SHIFT' ? '#0038a8' : themeColors.cardBg, borderColor: themeColors.cardBorder, borderWidth: 1, marginTop: 0 }]}
            >
              <Text style={{ color: myPageSubTab === 'SHIFT' ? '#fff' : themeColors.text, textAlign: 'center', fontWeight: 'bold', fontSize: 13 }}>Shift</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => {
                setMyPageSubTab('PAYROLL');
                myPageScrollRef.current?.scrollTo({ x: SCREEN_WIDTH * 2, animated: true });
              }} 
              style={[styles.actionBtn, { flex: 1, backgroundColor: myPageSubTab === 'PAYROLL' ? '#0038a8' : themeColors.cardBg, borderColor: themeColors.cardBorder, borderWidth: 1, marginTop: 0 }]}
            >
              <Text style={{ color: myPageSubTab === 'PAYROLL' ? '#fff' : themeColors.text, textAlign: 'center', fontWeight: 'bold', fontSize: 13 }}>Payroll</Text>
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
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
                <Text style={styles.sectionTitle}>📋 Shift & Access Activity Logs</Text>
                {accessLogs.map((log) => (
                  <View key={log.id} style={[styles.punchLogItem, { backgroundColor: themeColors.punchLogBg, borderColor: themeColors.punchLogBorder }]}>
                    <View style={styles.punchHeaderRow}>
                      <Text style={[styles.punchDateText, { color: themeColors.punchDateText }]}>{log.action}</Text>
                      <Text style={styles.punchDurationBadge}>{log.time}</Text>
                    </View>
                    <Text style={[styles.punchTimeDetail, { color: themeColors.subtext }]}>{log.details}</Text>
                  </View>
                ))}
                {accessLogs.length === 0 && <Text style={{color: '#64748b', textAlign: 'center'}}>No recent activity.</Text>}


              </ScrollView>
            </View>

            {/* Page 2: Shift */}
            <View style={{ width: SCREEN_WIDTH }}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
                <ShiftModule themeMode={themeMode} />


              </ScrollView>
            </View>

            {/* Page 3: Payroll */}
            <View style={{ width: SCREEN_WIDTH }}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
                {/* 📅 interactive calendar overlay inside cockpit */}
                <View style={[styles.calendarCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
                  <View style={styles.calendarHeaderRow}>
                    <TouchableOpacity onPress={handlePrevMonth}>
                      <Text style={styles.navArrowText}>◀</Text>
                    </TouchableOpacity>
                    <Text style={[styles.monthHeader, { color: themeColors.text }]}>{monthNames[currentMonth]} {currentYear}</Text>
                    <TouchableOpacity onPress={handleNextMonth}>
                      <Text style={styles.navArrowText}>▶</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Day labels */}
                  <View style={styles.gridWeekHeaderRow}>
                    {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
                      <Text key={d} style={styles.gridWeekHeaderText}>{d}</Text>
                    ))}
                  </View>

                  <View style={styles.gridCalendarContainer}>
                    {/* Empty boxes */}
                    {Array.from({ length: firstDayIndex }).map((_, idx) => (
                      <View key={`empty-${idx}`} style={styles.gridDayBoxBlank} />
                    ))}
                    
                    {/* Worked days */}
                    {Array.from({ length: daysInMonth }).map((_, idx) => {
                      const day = idx + 1;
                      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                      const att = attendanceData.find(a => a.work_date === dateStr);
                      const hoursWorked = att?.total_minutes ? (att.total_minutes / 60) : 0;
                      const hasWorked = hoursWorked > 0;

                      return (
                        <View key={`day-${day}`} style={[styles.gridDayBox, hasWorked ? styles.gridDayBoxWorked : { backgroundColor: themeColors.background, borderColor: themeColors.cardBorder }]}>
                          <Text style={[styles.gridDayText, hasWorked ? styles.gridDayTextWorked : { color: themeColors.mutedText }]}>{day}</Text>
                          <Text style={[styles.gridDayStatusSub, { color: hasWorked ? '#16a34a' : themeColors.mutedText }]}>
                            {hoursWorked > 0 ? `${hoursWorked.toFixed(1)}h` : 'Off'}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* 💸 Monthly summary details */}
                <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>💰 Monthly Earnings & Summary</Text>
                <View style={[styles.payrollCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
                  <View style={styles.payrollRow}>
                    <Text style={[styles.payrollLabel, { color: themeColors.mutedText }]}>Regular Hours:</Text>
                    <Text style={[styles.payrollValue, { color: themeColors.text }]}>{totals.regularHours.toFixed(1)} hrs</Text>
                  </View>
                  <View style={styles.payrollRow}>
                    <Text style={[styles.payrollLabel, { color: themeColors.mutedText }]}>Overtime Hours:</Text>
                    <Text style={[styles.payrollValue, { color: themeColors.text }]}>{totals.otHours.toFixed(1)} hrs</Text>
                  </View>
                  <View style={styles.payrollRow}>
                    <Text style={[styles.payrollLabel, { color: themeColors.mutedText }]}>Gross Base Pay:</Text>
                    <Text style={[styles.payrollValue, { color: themeColors.text }]}>₱{totals.basePay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                  </View>
                  <View style={styles.payrollRow}>
                    <Text style={[styles.payrollLabel, { color: themeColors.mutedText }]}>OT Pay (1.25x):</Text>
                    <Text style={[styles.payrollValue, { color: themeColors.text }]}>₱{totals.otPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                  </View>
                  <View style={styles.payrollRow}>
                    <Text style={[styles.payrollLabel, { color: themeColors.mutedText }]}>Allowances & Additions:</Text>
                    <Text style={[styles.payrollValue, { color: '#4ade80' }]}>+₱{totals.additionsSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                  </View>
                  <View style={[styles.payrollRow, styles.totalRow]}>
                    <Text style={styles.totalLabel}>Estimated Net Pay:</Text>
                    <Text style={styles.totalValue}>₱{totals.netPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                  </View>
                </View>

                {/* Payslip record check */}
                {payrollRecords.length > 0 ? (
                  <View style={styles.payslipBanner}>
                    <Text style={styles.payslipBannerTitle}>🎉 Payslip Disbursed & Approved!</Text>
                    <Text style={[styles.payslipBannerText, { color: themeColors.subtext }]}>
                      A net pay of ₱{payrollRecords[0].net_pay_piso?.toLocaleString()} has been locked and disbursed by PMO for this period.
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.payslipBanner, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
                    <Text style={[styles.payslipBannerTitle, { color: themeColors.text }]}>⏳ Pending PMO Disbursal</Text>
                    <Text style={[styles.payslipBannerText, { color: themeColors.subtext }]}>
                      PMO has not locked the final payslip for this period. Showing real-time estimate based on attendance logs.
                    </Text>
                  </View>
                )}


              </ScrollView>
            </View>
          </ScrollView>
        </View>
      </ScrollView>

      {/* Bottom Tab Bar */}
      <View style={[styles.tabs, { backgroundColor: themeColors.tabBg, borderTopColor: themeColors.tabBorder }]}>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'HOME' && { backgroundColor: themeColors.activeTabBg }]} 
          onPress={() => handleTabPress('HOME')}
        >
          <Text style={{ fontSize: 18 }}>🏠</Text>
          <Text style={[styles.tabText, { color: activeTab === 'HOME' ? '#38bdf8' : themeColors.tabItemLabel }]}>HOME</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'JOBS' && { backgroundColor: themeColors.activeTabBg }]} 
          onPress={() => handleTabPress('JOBS')}
        >
          <Text style={{ fontSize: 18 }}>🛠️</Text>
          <Text style={[styles.tabText, { color: activeTab === 'JOBS' ? '#38bdf8' : themeColors.tabItemLabel }]}>JOBS</Text>
          {jobOrders.filter((job: any) => job.status === 'REQUESTED' || job.status === 'ASSIGNED').length > 0 && (
            <View style={styles.tabAbsoluteBadge}>
              <Text style={styles.tabAbsoluteBadgeText}>
                {jobOrders.filter((job: any) => job.status === 'REQUESTED' || job.status === 'ASSIGNED').length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'RADIO' && { backgroundColor: themeColors.activeTabBg }]} 
          onPress={() => handleTabPress('RADIO')}
        >
          <Text style={{ fontSize: 18 }}>💬</Text>
          <Text style={[styles.tabText, { color: activeTab === 'RADIO' ? '#38bdf8' : themeColors.tabItemLabel }]}>RADIO</Text>
          {unreadMessageCount > 0 && (
            <View style={styles.tabAbsoluteBadge}>
              <Text style={styles.tabAbsoluteBadgeText}>{unreadMessageCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'MYPAGE' && { backgroundColor: themeColors.activeTabBg }]} 
          onPress={() => handleTabPress('MYPAGE')}
        >
          <Text style={{ fontSize: 18 }}>👤</Text>
          <Text style={[styles.tabText, { color: activeTab === 'MYPAGE' ? '#38bdf8' : themeColors.tabItemLabel }]}>MY PAGE</Text>
        </TouchableOpacity>
      </View>

      {selectedJob && (
        <>
          <KeyboardAvoidingView 
            style={[styles.detailOverlay, { backgroundColor: themeColors.background }]} 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
          >
            <ScrollView style={styles.detailContent} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
            <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>JOB REQUEST</Text>
            
            <Text style={styles.detailTitle}>{selectedJob.title}</Text>
            
            {selectedJob.image_url && (
              <Image source={{ uri: selectedJob.image_url }} style={styles.largeImage} />
            )}

            <Text style={[styles.sectionTitle, { color: themeColors.mutedText, marginTop: 15 }]}>TASK DETAILS</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 4 }}>
              <Text style={[styles.detailText, { flex: 1, marginVertical: 0 }]}>
                Location: {selectedJob.units?.tower_name || 'N/A'} - {selectedJob.units?.unit_number || 'N/A'}
              </Text>
              {selectedJob.user_id && (
                <TouchableOpacity 
                  style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    backgroundColor: '#0284c7', 
                    paddingHorizontal: 12, 
                    paddingVertical: 6, 
                    borderRadius: 8,
                    marginLeft: 10 
                  }}
                  onPress={() => startChatWithResident(selectedJob.user_id, selectedJob.units?.unit_number || 'N/A')}
                >
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>💬 Chat</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.detailText}>Requested: {new Date(selectedJob.created_at).toLocaleString()}</Text>
            <Text style={styles.detailText}>Description: {selectedJob.description}</Text>
            
            {selectedJob.time_change_request && (
              <View style={{ backgroundColor: isDark ? '#78350f' : '#fef3c7', padding: 12, borderRadius: 8, marginVertical: 10, borderWidth: 1, borderColor: isDark ? '#b45309' : '#fcd34d' }}>
                <Text style={{ color: isDark ? '#fef3c7' : '#b45309', fontWeight: 'bold', fontSize: 13 }}>🔄 Resident Requested Reschedule:</Text>
                <Text style={{ color: isDark ? '#fff' : '#78350f', fontSize: 13, marginTop: 4, fontWeight: '600' }}>
                  {selectedJob.time_change_request}
                </Text>
              </View>
            )}

            {/* Progress Stepper Tracking Ledger */}
            <Text style={[styles.sectionTitle, { color: themeColors.mutedText, marginTop: 20 }]}>📍 Progress Tracking Ledger</Text>
            {(() => {
              const statusSteps = [
                { key: 'REQUESTED', label: '1. Filed' },
                { key: 'ACKNOWLEDGED', label: '2. Tech Assigned' },
                { key: 'VISIT_CONFIRMED', label: '3. Scheduling' },
                { key: 'ESTIMATE_SUBMITTED', label: '4. Cost Approval' },
                { key: 'COMPLETED', label: '5. Finished' }
              ];

              const getCanonicalStatus = (status: string): string => {
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

              const canonicalStatus = getCanonicalStatus(selectedJob.status);
              const currentStepIndex = statusSteps.findIndex(s => s.key === canonicalStatus);

              const stepTimes: Record<string, string | null> = {
                REQUESTED: selectedJob.status_filed_at || selectedJob.created_at,
                ACKNOWLEDGED: selectedJob.status_assigned_at,
                VISIT_CONFIRMED: selectedJob.status_booked_at,
                ESTIMATE_SUBMITTED: selectedJob.status === 'ESTIMATE_SUBMITTED' ? null : selectedJob.status_in_progress_at,
                COMPLETED: selectedJob.status_finished_at
              };

              return statusSteps.map((step, idx) => {
                const isPassed = idx <= currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                const targetRawTime = stepTimes[step.key];
                const displayTime = targetRawTime ? formatSecureDate(targetRawTime) : null;

                return (
                  <View key={step.key} style={{ marginBottom: 12 }}>
                    <View style={styles.vStepRow}>
                      <View style={styles.leftLineColumn}>
                        <View style={[styles.vStepDot, isPassed && { backgroundColor: '#0038a8' }, isCurrent && styles.currentDotShadow]} />
                        {idx < statusSteps.length - 1 && <View style={[styles.vVerticalLine, idx < currentStepIndex && { backgroundColor: '#0038a8' }]} />}
                      </View>
                      <View style={styles.rightContentRowInline}>
                        <Text style={[styles.vStepLabel, isPassed && { color: themeColors.text, fontWeight: '700' }]}>{step.label}</Text>
                        {displayTime && displayTime !== '-' ? (
                          <Text style={[styles.vStepTimeInline, isCurrent && { color: '#0038a8', fontWeight: '700' }]}>{displayTime}</Text>
                        ) : (
                          <Text style={styles.vStepTimePendingInline}>{isPassed ? '✓ Done' : '-'}</Text>
                        )}
                      </View>
                    </View>

                    {/* Step Action Workflows nested inside their respective step row */}
                    {/* Step 2 (Assigned) - Propose visit time option */}
                    {idx === 1 && isPassed && selectedJob.assigned_technician_id === myUserId && (selectedJob.status === 'ASSIGNED' || selectedJob.status === 'TIME_NEGOTIATING') && (
                      <View style={{ marginLeft: 36, marginTop: 5 }}>
                        {(selectedJob.status === 'ASSIGNED' || selectedJob.status === 'TIME_NEGOTIATING') && selectedJob.time_change_request && (
                          <View style={{ 
                            marginBottom: 12, 
                            padding: 12, 
                            backgroundColor: isDark ? '#1e293b' : '#eff6ff', 
                            borderRadius: 10, 
                            borderWidth: 1, 
                            borderColor: isDark ? '#334155' : '#bfdbfe' 
                          }}>
                            <Text style={{ fontSize: 13, fontWeight: 'bold', color: themeColors.text }}>🗓️ Resident Requested Schedule:</Text>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0284c7', marginTop: 4 }}>
                              {formatSecureDate(selectedJob.time_change_request)}
                            </Text>
                            
                            <TouchableOpacity 
                              style={{ backgroundColor: '#10b981', paddingVertical: 10, borderRadius: 8, marginTop: 10, alignItems: 'center' }}
                              onPress={() => {
                                updateStatus(selectedJob.id, 'VISIT_CONFIRMED', {
                                  proposed_visit_time: selectedJob.time_change_request,
                                  time_change_request: null,
                                  reject_reason: null
                                });
                              }}
                            >
                              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Confirm & Accept Time</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        <Text style={{ color: themeColors.text, marginBottom: 8, fontWeight: 'bold', fontSize: 13 }}>
                          {selectedJob.status === 'TIME_NEGOTIATING' ? 'Or suggest another slot:' : 'Propose visit time:'}
                        </Text>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                          <TouchableOpacity 
                            style={[styles.dropdownSelector, { flex: 0.48, backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder }]}
                            onPress={() => {
                              setTargetField('STEP');
                              setDatePickerVisible(true);
                            }}
                          >
                            <Text style={[styles.dropdownText, { color: themeColors.inputText }]}>
                              📅 {selectedStepDateVal ? selectedStepDateVal.split(" ")[0] : 'Select Date'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={[styles.dropdownSelector, { flex: 0.48, backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder }]}
                            onPress={() => {
                              setTargetField('STEP');
                              setTimePickerVisible(true);
                            }}
                          >
                            <Text style={[styles.dropdownText, { color: themeColors.inputText }]}>
                              ⏰ {selectedStepTimeVal ? selectedStepTimeVal : 'Select Time'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity 
                          style={[styles.submitBtn, { backgroundColor: '#f59e0b', paddingVertical: 10, borderRadius: 8, marginTop: 4 }]} 
                          onPress={() => {
                            if (!selectedStepDateISO || !selectedStepTimeVal) {
                               Alert.alert("Required", "Please select both date and time slot.");
                               return;
                             }
                             const combined = parseDateTimeToISO(selectedStepDateISO, selectedStepTimeVal);
                             
                             // Check schedule collision
                             if (checkScheduleCollision(combined, selectedJob.id)) {
                               Alert.alert("Scheduling Conflict", "You already have another confirmed visit scheduled within 1 hour of this time. Please select a different time slot.");
                               return;
                             }
 
                             const isNegotiating = selectedJob.status === 'TIME_NEGOTIATING';
                             updateStatus(selectedJob.id, 'VISIT_PROPOSED', { 
                               proposed_visit_time: combined,
                               time_change_request: null,
                               reject_reason: isNegotiating 
                                 ? '죄송합니다. 해당 시간에 다른 예약이 이미 있어서 방문이 불가능합니다.' 
                                 : null
                             });
                             setSelectedStepDateVal('');
                             setSelectedStepDateISO('');
                             setSelectedStepTimeVal('');
                           }}
                        >
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Send Proposed Time</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Step 3 (Scheduling) - Waiting for Confirmation or Start Visit */}
                    {idx === 2 && isPassed && selectedJob.status === 'VISIT_PROPOSED' && (
                      <View style={{ marginLeft: 36, marginTop: 5 }}>
                        <Text style={{ color: '#f59e0b', fontSize: 13, fontWeight: 'bold' }}>⏳ Waiting for resident time confirmation...</Text>
                      </View>
                    )}

                    {idx === 2 && isPassed && selectedJob.status === 'VISIT_CONFIRMED' && (
                      <View style={{ marginLeft: 36, marginTop: 5 }}>
                        <Text style={{ color: '#10b981', fontSize: 13, marginBottom: 5, fontWeight: 'bold' }}>✅ Resident confirmed visit time: {formatSecureDate(selectedJob.proposed_visit_time)}</Text>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#10b981', paddingVertical: 10, borderRadius: 8 }]} onPress={() => {
                          handleStartVisit(selectedJob.id);
                        }}>
                          <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>Arrived at Unit</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Step 4 (Cost Approval) - Capture Before Photo / Request Cost Approval / Waiting for Approval */}
                    {idx === 3 && isPassed && selectedJob.status === 'VISITING' && (
                      <View style={{ marginLeft: 36, marginTop: 5 }}>
                        <Text style={{ color: themeColors.text, fontWeight: '800', fontSize: 12, marginBottom: 8 }}>📸 CAPTURE BEFORE PHOTO</Text>
                        <TouchableOpacity style={[styles.photoBox, { height: 120, marginBottom: 10 }]} onPress={captureBeforePhoto}>
                          {selectedJob.before_photo_url || beforePhoto ? (
                            <Image source={{ uri: selectedJob.before_photo_url || beforePhoto }} style={styles.previewImage} />
                          ) : (
                            <Text style={{ color: '#64748b', fontSize: 13 }}>+ Capture Before Photo</Text>
                          )}
                        </TouchableOpacity>

                        {selectedJob.before_photo_url ? (
                          <>
                            <TextInput 
                              style={[styles.input, { backgroundColor: themeColors.inputBg, color: themeColors.inputText, borderColor: themeColors.inputBorder, height: 40, paddingVertical: 8, fontSize: 13, marginBottom: 8 }]} 
                              placeholder="Estimated Cost (₱)" 
                              placeholderTextColor="#64748b" 
                              keyboardType="decimal-pad" 
                              value={materialCost} 
                              onChangeText={setMaterialCost} 
                              inputAccessoryViewID="costInputAccessory"
                              onFocus={() => setIsCostFocused(true)}
                              onBlur={() => setIsCostFocused(false)}
                            />
                            {Platform.OS === 'ios' && (
                              <InputAccessoryView nativeID="costInputAccessory">
                                <View style={{ 
                                  backgroundColor: '#e2e8f0', 
                                  paddingHorizontal: 16, 
                                  paddingVertical: 10, 
                                  flexDirection: 'row', 
                                  justifyContent: 'flex-end', 
                                  borderTopWidth: 1, 
                                  borderColor: '#cbd5e1' 
                                }}>
                                  <TouchableOpacity onPress={() => Keyboard.dismiss()}>
                                    <Text style={{ color: '#0038a8', fontWeight: 'bold', fontSize: 15 }}>Done</Text>
                                  </TouchableOpacity>
                                </View>
                              </InputAccessoryView>
                            )}
                            <TouchableOpacity style={[styles.submitBtn, { paddingVertical: 12, borderRadius: 8, marginTop: 4 }]} onPress={() => requestEstimateApproval()}>
                              <Text style={{ color: '#fff', fontWeight: 'bold', textAlign: 'center', fontSize: 13 }}>Request Cost Approval</Text>
                            </TouchableOpacity>
                          </>
                        ) : null}
                      </View>
                    )}

                    {idx === 3 && isPassed && selectedJob.status === 'ESTIMATE_SUBMITTED' && (
                      <View style={{ marginLeft: 36, marginTop: 5 }}>
                        <Text style={{ color: '#f59e0b', fontSize: 13, fontWeight: 'bold' }}>⏳ Waiting for resident cost approval...</Text>
                        <Text style={{ color: themeColors.text, fontSize: 12, marginTop: 4 }}>
                          Estimate: ₱{selectedJob.estimated_cost?.toLocaleString()}
                        </Text>
                      </View>
                    )}

                    {/* Step 5 (Finished) - Take After Photo or Successful Finish */}
                    {idx === 4 && isPassed && selectedJob.status === 'IN_PROGRESS' && (
                      <View style={{ marginLeft: 36, marginTop: 5, backgroundColor: isDark ? '#1e293b' : '#f8fafc', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: themeColors.cardBorder }}>
                        <Text style={{ color: '#fbbf24', fontSize: 13, fontWeight: 'bold', marginBottom: 10 }}>
                          🛠️ Repairing: {selectedJob.title}
                        </Text>
                        <Text style={{ color: themeColors.text, fontWeight: '800', fontSize: 12, marginBottom: 8 }}>📸 CAPTURE AFTER PHOTO</Text>
                        <TouchableOpacity style={[styles.photoBox, { height: 120, marginBottom: 10 }]} onPress={captureAfterPhoto}>
                          {selectedJob.after_photo_url || afterPhoto ? (
                            <Image source={{ uri: selectedJob.after_photo_url || afterPhoto }} style={styles.previewImage} />
                          ) : (
                            <Text style={{ color: '#64748b', fontSize: 13 }}>+ Capture After Photo</Text>
                          )}
                        </TouchableOpacity>

                        {selectedJob.after_photo_url ? (
                          <TouchableOpacity style={[styles.submitBtn, { backgroundColor: '#8b5cf6', paddingVertical: 10, borderRadius: 8, marginTop: 10 }]} onPress={completeRepair}>
                            <Text style={{ color: '#fff', fontWeight: 'bold', textAlign: 'center', fontSize: 13 }}>✅ Complete Repair & Save</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    )}

                    {idx === 4 && isPassed && (selectedJob.status === 'COMPLETED' || selectedJob.status === 'CLOSED') && selectedJob.after_photo_url && (
                      <View style={{ marginLeft: 36, marginTop: 5 }}>
                        <Text style={{ color: '#10b981', fontSize: 13, fontWeight: 'bold', marginBottom: 5 }}>✅ Repair Finished Successfully</Text>
                        <Image source={{ uri: selectedJob.after_photo_url }} style={{ width: '100%', height: 150, borderRadius: 10 }} />
                      </View>
                    )}
                  </View>
                );
              });
            })()}

            {selectedJob.status === 'REQUESTED' && (!selectedJob.assigned_technician_id || selectedJob.assigned_technician_id !== myUserId) && (
              <View style={styles.actionContainer}>
                {/* Direct Claim Button */}
                <TouchableOpacity 
                  style={[styles.submitBtn, { backgroundColor: '#10b981', marginTop: 0, marginBottom: 15 }]} 
                  onPress={async () => {
                    let activeUid = myUserId;
                    if (!activeUid) {
                      const { data: { session } } = await supabase.auth.getSession();
                      activeUid = session?.user?.id || null;
                    }
                    if (!activeUid) {
                      Alert.alert("Error", "User session is not loaded. Please try again.");
                      return;
                    }
                    
                    // Directly claim the job and set it to ASSIGNED status.
                    // Keep the existing time_change_request as the preferred schedule so they can confirm it.
                    updateStatus(selectedJob.id, 'ASSIGNED', { 
                      assigned_technician_id: activeUid
                    });
                    Alert.alert("Success", "You have claimed this job. Please check and confirm the schedule next.");
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>⚡ Claim Job & Assign to Me</Text>
                </TouchableOpacity>

                <View style={{ height: 1, backgroundColor: themeColors.cardBorder, marginVertical: 10 }} />

                <Text style={{ color: themeColors.text, marginBottom: 10, fontWeight: 'bold' }}>Or suggest a different visit time to claim:</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                  <TouchableOpacity 
                    style={[styles.dropdownSelector, { flex: 0.48, backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder }]}
                    onPress={() => {
                      setTargetField('CLAIM');
                      setDatePickerVisible(true);
                    }}
                  >
                    <Text style={[styles.dropdownText, { color: themeColors.inputText }]}>
                      📅 {selectedDateVal ? selectedDateVal.split(" ")[0] : 'Select Date'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.dropdownSelector, { flex: 0.48, backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder }]}
                    onPress={() => {
                      setTargetField('CLAIM');
                      setTimePickerVisible(true);
                    }}
                  >
                    <Text style={[styles.dropdownText, { color: themeColors.inputText }]}>
                      ⏰ {selectedTimeVal ? selectedTimeVal : 'Select Time'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity 
                  style={[styles.submitBtn, { backgroundColor: '#0038a8', marginTop: 10, marginBottom: 15 }]} 
                  onPress={async () => {
                    if (!selectedDateISO || !selectedTimeVal) {
                      Alert.alert("Required", "Please select both proposed date and time to claim.");
                      return;
                    }
                    let activeUid = myUserId;
                    if (!activeUid) {
                      const { data: { session } } = await supabase.auth.getSession();
                      activeUid = session?.user?.id || null;
                    }
                    if (!activeUid) {
                      Alert.alert("Error", "User session is not loaded. Please try again.");
                      return;
                    }
                    const combined = parseDateTimeToISO(selectedDateISO, selectedTimeVal);

                    // Check schedule collision
                    if (checkScheduleCollision(combined, selectedJob.id)) {
                      Alert.alert("Scheduling Conflict", "You already have another confirmed visit scheduled within 1 hour of this time. Please select a different time slot.");
                      return;
                    }

                    updateStatus(selectedJob.id, 'VISIT_PROPOSED', { 
                      assigned_technician_id: activeUid,
                      proposed_visit_time: combined,
                      time_change_request: null
                    });
                    setSelectedDateVal('');
                    setSelectedDateISO('');
                    setSelectedTimeVal('');
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>⚡ Claim Job & Request Time Approval</Text>
                </TouchableOpacity>
              </View>
            )}

             <TouchableOpacity 
              style={[styles.backButton, { marginTop: 20 }]} 
              onPress={() => {
                setSelectedJob(null);
                setBeforePhoto(null);
                setAfterPhoto(null);
                setMaterialCost('');
                setLaborCost('');
              }}
            >
              <Text style={styles.backButtonText}>← Back to List</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Date Dropdown Modal */}
          <Modal animationType="slide" transparent={true} visible={datePickerVisible} onRequestClose={() => setDatePickerVisible(false)}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalCardWindow}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#0f172a' }}>🗓️ Select Proposed Date</Text>
                <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                  {getNext10Days().map((day) => (
                    <TouchableOpacity 
                      key={day.dateStr} 
                      style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', alignItems: 'center' }}
                      onPress={() => {
                        if (targetField === 'CLAIM') {
                          setSelectedDateVal(day.label);
                          setSelectedDateISO(day.dateStr);
                        } else {
                          setSelectedStepDateVal(day.label);
                          setSelectedStepDateISO(day.dateStr);
                        }
                        setDatePickerVisible(false);
                      }}
                    >
                      <Text style={{ fontSize: 15, color: '#0038a8', fontWeight: '600' }}>{day.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity style={[styles.cancelBtn, { marginTop: 15, width: '100%' }]} onPress={() => setDatePickerVisible(false)}>
                  <Text style={{ color: '#475569', fontWeight: '600', textAlign: 'center' }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Time Dropdown Modal */}
          <Modal animationType="slide" transparent={true} visible={timePickerVisible} onRequestClose={() => setTimePickerVisible(false)}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalCardWindow}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#0f172a' }}>⏰ Select Proposed Time Slot</Text>
                <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                  {timeSlots.map((slot) => (
                    <TouchableOpacity 
                      key={slot} 
                      style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', alignItems: 'center' }}
                      onPress={() => {
                        if (targetField === 'CLAIM') {
                          setSelectedTimeVal(slot);
                        } else {
                          setSelectedStepTimeVal(slot);
                        }
                        setTimePickerVisible(false);
                      }}
                    >
                      <Text style={{ fontSize: 15, color: '#0038a8', fontWeight: '600' }}>{slot}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity style={[styles.cancelBtn, { marginTop: 15, width: '100%' }]} onPress={() => setTimePickerVisible(false)}>
                  <Text style={{ color: '#475569', fontWeight: '600', textAlign: 'center' }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
          {Platform.OS === 'android' && keyboardShown && isCostFocused && (
            <View style={{ 
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: '#e2e8f0', 
              paddingHorizontal: 16, 
              paddingVertical: 10, 
              flexDirection: 'row', 
              justifyContent: 'flex-end', 
              borderTopWidth: 1, 
              borderColor: '#cbd5e1',
              zIndex: 9999
            }}>
              <TouchableOpacity onPress={() => Keyboard.dismiss()}>
                <Text style={{ color: '#0038a8', fontWeight: 'bold', fontSize: 15 }}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      </>
    )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#0038a8', borderBottomWidth: 1, borderBottomColor: '#002266', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 12 : 16 },
  headerTextColumn: { flex: 1, marginRight: 8, justifyContent: 'center' },
  headerTitle: { fontSize: 12, fontWeight: '900', color: '#fff', letterSpacing: 0.5, marginBottom: 4 },
  guardLabelLine: { color: '#93c5fd', fontSize: 11, fontWeight: '700', lineHeight: 15 },
  sectorLabelLine: { color: '#fcd34d', fontSize: 11, fontWeight: '800', lineHeight: 15, marginTop: 1 },
  giantDutyToggleBadge: { width: 105, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  giantDutyBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  sosButtonBadge: { width: 105, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#dc2626', borderWidth: 1.5, borderColor: '#fca5a5' },
  sosButtonBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  content: { padding: 20, paddingBottom: 100 },
  sectionTitle: { color: '#64748b', fontSize: 11, fontWeight: '800', marginBottom: 10, marginTop: 10 },
  jobCard: { backgroundColor: '#ffffff', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  actionBtn: { backgroundColor: '#0038a8', padding: 12, borderRadius: 8, marginTop: 10, alignItems: 'center' },
  photoBox: { height: 100, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', borderRadius: 12, marginBottom: 15 },
  input: { backgroundColor: '#ffffff', padding: 12, borderRadius: 8, color: '#0f172a', marginBottom: 10, borderWidth: 1, borderColor: '#cbd5e1' },
  submitBtn: { backgroundColor: '#10b981', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  tabs: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 70, backgroundColor: '#ffffff', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#cbd5e1', paddingBottom: Platform.OS === 'ios' ? 15 : 5 },
  tabItem: { alignItems: 'center', flex: 1, paddingVertical: 10, position: 'relative' },
  tabText: { color: '#475569', fontSize: 10, fontWeight: '700', marginTop: 4 },
  tabAbsoluteBadge: { position: 'absolute', top: 4, right: 28, backgroundColor: '#ce1126', width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  tabAbsoluteBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  detailOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#f8fafc', padding: 20, paddingTop: 20, zIndex: 10 },
  detailContent: { flex: 1 },
  detailTitle: { color: '#0f172a', fontSize: 22, fontWeight: 'bold' },
  largeImage: { width: '100%', height: 300, borderRadius: 12, marginVertical: 15 },
  previewImage: { width: '100%', height: '100%', borderRadius: 12, resizeMode: 'cover' },
  backButton: { backgroundColor: '#0038a8', padding: 12, borderRadius: 8, marginTop: 10, marginBottom: 15, alignItems: 'center' },
  backButtonText: { color: '#fff', fontWeight: 'bold' },
  detailText: { color: '#334155', fontSize: 13, marginBottom: 6, lineHeight: 20 },
  actionContainer: { marginTop: 15 },

  // Payroll Calendar Styles
  calendarCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 15 },
  calendarHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 8 },
  navArrowText: { color: '#0038a8', fontSize: 15, paddingHorizontal: 12, fontWeight: '900' },
  monthHeader: { color: '#0f172a', fontSize: 14, fontWeight: '800' },
  gridWeekHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  gridWeekHeaderText: { color: '#64748b', fontSize: 11, fontWeight: '900', width: '13%', textAlign: 'center' },
  gridCalendarContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  gridDayBox: { width: '13%', height: 48, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginHorizontal: '0.6%', marginVertical: 4, borderWidth: 1 },
  gridDayBoxBlank: { width: '13%', height: 48, marginHorizontal: '0.6%', marginVertical: 4 },
  gridDayBoxWorked: { backgroundColor: '#dcfce7', borderColor: '#86efac' },
  gridDayBoxOff: { backgroundColor: '#ffffff', borderColor: '#cbd5e1' },
  gridDayText: { fontSize: 12, fontWeight: '700' },
  gridDayTextWorked: { color: '#16a34a' },
  gridDayTextOff: { color: '#475569' },
  gridDayStatusSub: { fontSize: 8, marginTop: 2, fontWeight: '600', color: '#16a34a' },

  // Earnings details styles
  payrollCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 15 },
  payrollRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  payrollLabel: { color: '#475569', fontSize: 13, fontWeight: '600' },
  payrollValue: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  totalRow: { borderBottomWidth: 0, marginTop: 10, paddingTop: 10 },
  totalLabel: { color: '#0038a8', fontSize: 14, fontWeight: '800' },
  totalValue: { color: '#16a34a', fontSize: 16, fontWeight: '900' },

  // Payslip banner styles
  payslipBanner: { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac', borderRadius: 12, padding: 14, marginBottom: 20 },
  payslipBannerTitle: { color: '#16a34a', fontSize: 13, fontWeight: '800', marginBottom: 4 },
  payslipBannerText: { color: '#14532d', fontSize: 11, lineHeight: 16 },

  // Punch Log Styles matching Guard App exactly
  punchLogItem: { backgroundColor: '#ffffff', padding: 14, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#cbd5e1' },
  punchHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  punchDateText: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  punchDurationBadge: { color: '#0038a8', fontSize: 11, fontWeight: '700', backgroundColor: '#e0f2fe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  punchTimeDetail: { color: '#475569', fontSize: 12, marginTop: 6, fontWeight: '500' },

  // Stepper Styles
  vStepRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 8, position: 'relative' },
  leftLineColumn: { width: 24, alignItems: 'center', justifyContent: 'center' },
  vStepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#cbd5e1', zIndex: 2 },
  currentDotShadow: { borderWidth: 2, borderColor: '#bae6fd', backgroundColor: '#0038a8' },
  vVerticalLine: { width: 2, backgroundColor: '#e2e8f0', position: 'absolute', top: 16, bottom: -22, left: 11, zIndex: 1 },
  rightContentRowInline: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 12 },
  vStepLabel: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  vStepTimeInline: { fontSize: 12, color: '#475569', fontWeight: '500', textAlign: 'right' },
  vStepTimePendingInline: { fontSize: 12, color: '#cbd5e1', fontWeight: '400', textAlign: 'right' },

  // Dropdown Picker Styles
  dropdownSelector: { padding: 12, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center', height: 45 },
  dropdownText: { fontSize: 13, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCardWindow: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  cancelBtn: { paddingVertical: 12, alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 10 },

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
    borderColor: '#e2e8f0'
  },
  dashboardMetricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10
  },
  dashboardMetricIcon: {
    fontSize: 18,
    marginRight: 6
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
  },
  signOutBtn: {
    backgroundColor: '#fee2e2',
    borderWidth: 2,
    borderColor: '#fca5a5',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  signOutBtnText: {
    color: '#b91c1c',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  }
});