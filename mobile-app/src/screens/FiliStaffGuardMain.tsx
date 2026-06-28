"use client";

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Platform, TouchableOpacity, TextInput, Alert, ScrollView, ActivityIndicator, Modal, Image, Keyboard, KeyboardAvoidingView, Dimensions, InputAccessoryView } from 'react-native';
import { supabase } from '../lib/supabase';
import * as Notifications from 'expo-notifications';
import RadioModule from '../components/shared/RadioModule';
import ShiftModule from '../components/shared/ShiftModule';
import { Camera, CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import SignatureScreen from 'react-native-signature-canvas';
import { VisitorPass, VisitorLog } from '../../../shared-types/visitor';
import { Ionicons } from '@expo/vector-icons';

// API key placeholder (user needs to replace this securely or use EXPO_PUBLIC_GEMINI_API_KEY in .env)
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "YOUR_API_KEY_HERE"; // Recommend applying environment variables

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Parcel {
  id: string;
  unit: string;
  tracking: string;
  registered_by: string;
  status: string;
  secure_pass_code: string; // 🎯 Aligned with Core Database Schema for proxy token cross-checking
  recipient_name?: string;
  building_no?: string; // 🏢 Added building name for tower-level grouping
  created_at?: string; // 🕒 Added created_at to calculate overdue parcels
}

export default function FiliStaffGuardMain({ navigation }: any) {
  // Helper to get local date string YYYY-MM-DD
  const getLocalDateStr = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [pass, setPass] = useState<VisitorPass | null>(null);
  
  const [activeTab, setActiveTab] = useState<'HOME' | 'GATE' | 'PARCEL' | 'RADIO' | 'MY_PAGE'>('HOME');
  const [guardSubTab, setGuardSubTab] = useState<'LOGS' | 'SHIFT' | 'PAYROLL'>('LOGS');
  const [loading, setLoading] = useState(false);
  const [guardName, setGuardName] = useState('Loading...');
  const guardNameRef = useRef('Loading...');
  const assignedBuildingRef = useRef('Tower A');
  const [unreadRadioCount, setUnreadRadioCount] = useState(0);
  const [isOnDuty, setIsOnDuty] = useState(true);

  // 🎯 Gemini OCR Implementation Code (For Guard App)
  const [accessLogs, setAccessLogs] = useState<any[]>([
    {
      id: 'init-1',
      action: 'SYSTEM_BOOT',
      details: 'Gate terminal initialized successfully. Live replication active.',
      time: `${new Date().toLocaleDateString([], { month: '2-digit', day: '2-digit' })} 07:00 AM`
    },
    {
      id: 'init-2',
      action: 'SHIFT_START',
      details: 'Duty started at Main Gate. GPS coordinates logged.',
      time: `${new Date().toLocaleDateString([], { month: '2-digit', day: '2-digit' })} 07:02 AM`
    },
    {
      id: 'init-3',
      action: 'GATE_ENTRY_CONFIRMED',
      details: 'Resident vehicle (ABC1234) verified. Barrier gate released.',
      time: `${new Date().toLocaleDateString([], { month: '2-digit', day: '2-digit' })} 08:15 AM`
    },
    {
      id: 'init-4',
      action: 'PARCEL_ARRIVED',
      details: 'Courier delivered parcel for Unit 1206. SMS notification sent.',
      time: `${new Date().toLocaleDateString([], { month: '2-digit', day: '2-digit' })} 09:30 AM`
    }
  ]); // 🎯 Guard activity log state added with realistic sample logs
  
  const [isOffline, setIsOffline] = useState(false);
  const [processedItems, setProcessedItems] = useState<string[]>([]); 

  // Guard Sector Meta
  const [assignedBuilding, setAssignedBuilding] = useState('Tower A');
  const [condoName, setCondoName] = useState('Solea Residences');

  // Camera Modal States
  const [isCameraLive, setIsCameraLive] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<'GATE' | 'PARCEL' | 'PLATE' | 'PARCEL_RELEASE'>('GATE');
  const [permission, requestPermission] = useCameraPermissions();

  // Meal Break Tracker
  const cameraRef = useRef<any>(null);
  const signatureRef = useRef<any>(null);
  const isProcessingScan = useRef(false);

  // Gate Forms
  const [inputPlate, setInputPlate] = useState('');
  const [vehicleTargetUnit, setVehicleTargetUnit] = useState('');
  const [manualVisitorType, setManualVisitorType] = useState('');
  const [manualTargetUnit, setManualTargetUnit] = useState('');
  const [manualVisitorName, setManualVisitorName] = useState('');
  
  // 🎯 Condo Policy State
  const [condoPolicy, setCondoPolicy] = useState({
    approval_required: true,
    visitor_parking_billing: true,
    base_parking_fee: 0,
    visitor_parking_fee_per_hour: 50,
    max_visitor_parking_fee: 300,
    parking_grace_period_mins: 15,
    visitor_scope: 'MAIN_GATE_ONLY',
    parcel_lockers_enabled: false,
    amenity_booking_required: true,
    parcel_delivery_policy: 'GUARD_HOUSE'
  });

  // Direct Courier Delivery states
  const [directUnits, setDirectUnits] = useState(''); // Comma separated, e.g. "1204, 1502"
  const [courierPhoto, setCourierPhoto] = useState<string | null>(null);
  const [courierBase64, setCourierBase64] = useState<string | null>(null);
  const [directTracking, setDirectTracking] = useState('');

  const fetchCondoPolicy = async () => {
    // 🎯 Make sure to explicitly include the condo ID for testing.
    const CONDO_ID = 'c1111111-1111-1111-1111-111111111111'; 

    try {
      const { data: settingsData } = await supabase
        .from('condo_settings')
        .select('*')
        .eq('condo_id', CONDO_ID)
        .maybeSingle();

      const { data: condoData } = await supabase
        .from('condos')
        .select('name, base_parking_fee, visitor_parking_fee_per_hour, max_visitor_parking_fee, parking_grace_period_mins')
        .eq('id', CONDO_ID)
        .maybeSingle();

      console.log("🚀 Policy loaded from DB:", settingsData, condoData); 

      if (condoData && condoData.name) {
        setCondoName(condoData.name);
      } 

      setCondoPolicy({
        approval_required: settingsData ? settingsData.approval_policy === 'REQUIRED' : true,
        visitor_parking_billing: settingsData ? settingsData.visitor_parking_policy === 'BILLING_ENABLED' : true,
        base_parking_fee: condoData && condoData.base_parking_fee !== null ? Number(condoData.base_parking_fee) : 0,
        visitor_parking_fee_per_hour: condoData && condoData.visitor_parking_fee_per_hour !== null ? Number(condoData.visitor_parking_fee_per_hour) : 50,
        max_visitor_parking_fee: condoData && condoData.max_visitor_parking_fee !== null ? Number(condoData.max_visitor_parking_fee) : 300,
        parking_grace_period_mins: condoData && condoData.parking_grace_period_mins !== null ? Number(condoData.parking_grace_period_mins) : 15,
        visitor_scope: settingsData ? settingsData.visitor_scope || 'MAIN_GATE_ONLY' : 'MAIN_GATE_ONLY',
        parcel_lockers_enabled: settingsData ? !!settingsData.parcel_lockers_enabled : false,
        amenity_booking_required: settingsData ? settingsData.amenity_booking_required !== false : true,
        parcel_delivery_policy: settingsData ? settingsData.parcel_delivery_policy || 'GUARD_HOUSE' : 'GUARD_HOUSE'
      });
    } catch (err) {
      console.error("Error fetching condo policy:", err);
    }
  };

  const captureCourierPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission Required", "Camera access is required.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets && result.assets[0].base64) {
      setCourierPhoto(result.assets[0].uri);
      setCourierBase64(result.assets[0].base64);
    }
  };

  const submitDirectCourier = async () => {
    if (!directUnits.trim()) {
      Alert.alert("Error", "Please enter at least one unit number.");
      return;
    }
    if (!courierBase64) {
      Alert.alert("Photo Required", "Please capture a photo of the courier.");
      return;
    }

    setLoading(true);
    try {
      // 1. Upload courier photo
      const fileName = `courier_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('parcel-images')
        .upload(fileName, decode(courierBase64), { contentType: 'image/jpeg' });
      
      let uploadedImageUrl = null;
      if (!uploadError) {
        const { data } = supabase.storage.from('parcel-images').getPublicUrl(fileName);
        uploadedImageUrl = data.publicUrl;
      } else {
        throw uploadError;
      }

      // 2. Split units
      const unitList = directUnits
        .split(',')
        .map(u => u.trim())
        .filter(u => u.length > 0);

      const CORRECT_CONDO_ID = 'c1111111-1111-1111-1111-111111111111';

      // Loop and insert into parcels & notifications
      for (const unitNo of unitList) {
        // Find unit UUID
        const { data: foundUnit } = await supabase
          .from('units')
          .select('id')
          .eq('condo_id', CORRECT_CONDO_ID)
          .eq('unit_number', unitNo)
          .maybeSingle();

        const securePass = `DIRECT-${unitNo}-${getLocalDateStr().replace(/-/g, '')}`;

        // Insert parcel record
        await supabase.from('parcels').insert([{
          unit_no: unitNo,
          carrier_name: 'Direct Courier',
          tracking_number: directTracking.trim().toUpperCase() || 'DIRECT-COURIER',
          image_url: uploadedImageUrl,
          status: 'IN_TRANSIT',
          secure_pass_code: securePass,
          registered_by: guardName,
          recipient_name: 'Resident'
        }]);

        // Insert notification
        await supabase.from('notifications').insert([{
          unit_id: foundUnit?.id || null,
          title: "🏃‍♂️ Courier Visiting Unit!",
          message: `A courier is visiting Unit ${unitNo} directly. Photo attached for verification.`,
          data: { secure_pass_code: securePass, courier_image: uploadedImageUrl },
          type: 'PARCEL'
        }]);

        // Fetch tokens and notify
        if (foundUnit?.id) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('expo_push_token')
            .eq('unit_id', foundUnit.id);

          if (profiles && profiles.length > 0) {
            const pushMessages = profiles
              .map(p => p.expo_push_token)
              .filter((token): token is string => !!token)
              .map(token => ({
                to: token,
                sound: 'default',
                title: '🏃‍♂️ Courier Visiting Unit!',
                body: `A courier is delivering a package directly to your unit. Verify courier photo in app.`,
                data: { type: 'COURIDR_DIRECT_VISIT', courier_image: uploadedImageUrl },
                badge: 1,
                channelId: 'default',
              }));

            if (pushMessages.length > 0) {
              await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                  'Accept-encoding': 'gzip, deflate',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(pushMessages),
              });
            }
          }
        }

        logGuardActivity("COURIER_DIRECT", `Courier dispatched to Unit ${unitNo}.`);
      }

      Alert.alert("Success 🎉", `Courier dispatch notifications sent to ${unitList.length} units.`);
      setDirectUnits('');
      setDirectTracking('');
      setCourierPhoto(null);
      setCourierBase64(null);
    } catch (err: any) {
      console.error(err);
      Alert.alert("Error", err.message || "Failed to dispatch courier.");
    } finally {
      setLoading(false);
    }
  };

  // Parcel Registry Forms
  const [scanUnit, setScanUnit] = useState('');
  const [scanTracking, setScanTracking] = useState('');
  const [parcelPhoto, setParcelPhoto] = useState<string | null>(null);
  const [parcelPhotoBase64, setParcelPhotoBase64] = useState<string | null>(null);
  const [bulkList, setBulkList] = useState<any[]>([]);
  
  // 1. Add state variable (Real-time DB sync pool)
  const [dbParcels, setDbParcels] = useState<Parcel[]>([]);
  const [parcelSubView, setParcelSubView] = useState<'RECEIVE' | 'RELEASE'>('RECEIVE');
  const [gateSubView, setGateSubView] = useState<'WALK_IN' | 'VEHICLE'>('WALK_IN');
  const [walkInPasses, setWalkInPasses] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [unitsMap, setUnitsMap] = useState<Record<string, { unit_number: string, building_no: string }>>({});
  const [selectedTowerFilter, setSelectedTowerFilter] = useState<string>('ALL');
  const [unitFilterQuery, setUnitFilterQuery] = useState<string>('');
  const [availableTowers, setAvailableTowers] = useState<string[]>(['Tower A', 'Tower B']);
  const [isTowerDropdownOpen, setIsTowerDropdownOpen] = useState<boolean>(false);
  const [themeMode] = useState<'LIGHT' | 'DARK'>('LIGHT');

  // 🎯 Release Handover Modal Form States
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [selectedUnitParcels, setSelectedUnitParcels] = useState<Parcel[]>([]);
  const [claimantName, setClaimantName] = useState('');
  const [claimantRelationship, setClaimantRelationship] = useState('TENANT_OWNER');
  const [enteredPassCode, setEnteredPassCode] = useState('');
  const [isSignatureDrawn, setIsSignatureDrawn] = useState<boolean>(false);

  // Radio Chat Controls
  const [radioSubTab, setRadioSubTab] = useState<'PMO' | 'RESIDENTS'>('PMO');
  const [pmoMessage, setPmoMessage] = useState('');
  const [isUnitChatOpen, setIsUnitChatOpen] = useState(false);
  const [activeChatUnit, setActiveChatUnit] = useState<string>('');
  const [unitMessage, setUnitMessage] = useState('');

  // PMO Logs
  const [pmoLogs, setPmoLogs] = useState([
    { id: 'p1', sender: 'PMO Office', msg: 'Guard Juan, check the main gate water valve please.', time: '2:40 AM' },
    { id: 'p2', sender: 'PMO Management', msg: 'Elevator B maintenance team has just logged out.', time: '3:10 AM' }
  ]);

  // Intercom Rooms
  const [residentChatRooms, setResidentChatRooms] = useState([
    { id: 'r1', unit: '1204', residentName: 'Unit 1204', lastMsg: 'Guest arriving in 5 mins via silver sedan.', time: '2:45 AM', unread: true, currentHandler: 'Juan (You)', lastAnsweredBy: 'None' },
    { id: 'r2', unit: '1502', residentName: 'Unit 1502', lastMsg: 'Water delivery boy is waiting outside.', time: '1:15 AM', unread: true, currentHandler: 'Mariano (Guard B)', lastAnsweredBy: 'Mariano' }, 
    { id: 'r3', unit: '0809', residentName: 'Unit 0809', lastMsg: 'Did my Lazada express parcel arrive?', time: 'Yesterday', unread: false, currentHandler: 'None', lastAnsweredBy: 'Juan (You)' }
  ]);

  const totalUnreadCount = residentChatRooms.filter(room => room.unread).length;
  const scrollViewRef = useRef<ScrollView>(null);
  const myPageScrollRef = useRef<ScrollView>(null);
  const gateScrollRef = useRef<ScrollView>(null);
  const parcelScrollRef = useRef<ScrollView>(null);

  const handleTabPress = (tabName: 'HOME' | 'GATE' | 'PARCEL' | 'RADIO' | 'MY_PAGE') => {
    setActiveTab(tabName);
    const tabNames: ('HOME' | 'GATE' | 'PARCEL' | 'RADIO' | 'MY_PAGE')[] = ['HOME', 'GATE', 'PARCEL', 'RADIO', 'MY_PAGE'];
    const idx = tabNames.indexOf(tabName);
    if (idx !== -1) {
      scrollViewRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: true });
    }
  };

  const [unitMessages, setUnitMessages] = useState<any>({
    '1204': [{ id: 'm1', sender: 'Unit 1204', msg: 'Guest arriving in 5 mins via silver sedan.', time: '2:45 AM', operator_name: null }],
    '1502': [{ id: 'm2', sender: 'Unit 1502', msg: 'Water delivery boy is waiting outside.', time: '1:15 AM', operator_name: 'Mariano' }],
    '0809': [{ id: 'm3', sender: 'Unit 0809', msg: 'Did my Lazada express parcel arrive?', time: 'Yesterday', operator_name: 'Juan' }]
  });

  // Calendar Attendance States
  const [attendancePeriod, setAttendancePeriod] = useState<'WEEKLY' | 'MONTHLY'>('WEEKLY');
  const weeklyDays = [25, 26, 27, 28, 29, 30, 31];
  const workedDaysList = [4, 5, 11, 12, 18, 19, 25, 26, 27, 28, 29, 30]; 
  const monthlyFullDays = Array.from({ length: 31 }, (_, i) => i + 1);

  const mockDbAttendanceLogs = [
    { id: 'l1', work_date: '2026-05-30', clock_in: '02:48 AM', clock_out: 'On Duty', duration: 'Active Shift', isWeekly: true },
    { id: 'l2', work_date: '2026-05-29', clock_in: '07:00 AM', clock_out: '07:00 PM', duration: '720 mins', isWeekly: true },
    { id: 'l3', work_date: '2026-05-28', clock_in: '07:00 AM', clock_out: '07:00 PM', duration: '720 mins', isWeekly: true },
    { id: 'l4', work_date: '2026-05-27', clock_in: '07:00 AM', clock_out: '07:00 PM', duration: '720 mins', isWeekly: true },
    { id: 'l5', work_date: '2026-05-26', clock_in: '07:00 AM', clock_out: '07:00 PM', duration: '720 mins', isWeekly: true }
  ];

  const fetchCondoTowers = async () => {
    try {
      const { data, error } = await supabase
        .from('units')
        .select('building_no')
        .eq('condo_id', 'c1111111-1111-1111-1111-111111111111');
      if (!error && data) {
        const towers = Array.from(new Set(data.map(u => u.building_no).filter(Boolean))) as string[];
        if (towers.length > 0) {
          setAvailableTowers(towers.sort());
        }
      }
    } catch (err) {
      console.error("Error fetching towers:", err);
    }
  };

  const getGroupedParcels = () => {
    let holdingParcels = dbParcels.filter(p => p.status === 'ARRIVED' || p.status === 'HOLDING');

    if (selectedTowerFilter !== 'ALL') {
      holdingParcels = holdingParcels.filter(p => 
        p.building_no === selectedTowerFilter
      );
    }

    if (unitFilterQuery.trim()) {
      const q = unitFilterQuery.toLowerCase().trim();
      holdingParcels = holdingParcels.filter(p => 
        p.unit.toLowerCase().includes(q)
      );
    }

    const groups: { [key: string]: any[] } = {};
    
    holdingParcels.forEach(parcel => {
      if (!groups[parcel.unit]) { groups[parcel.unit] = []; }
      groups[parcel.unit].push(parcel);
    });
    
    return Object.keys(groups).map(unitNo => ({
      unit: unitNo,
      parcels: groups[unitNo],
      count: groups[unitNo].length,
      building_no: groups[unitNo][0]?.building_no || 'Tower A'
    })).sort((a, b) => {
      const numA = parseInt(a.unit.replace(/[^0-9]/g, ''), 10);
      const numB = parseInt(b.unit.replace(/[^0-9]/g, ''), 10);
      if (isNaN(numA) && isNaN(numB)) return a.unit.localeCompare(b.unit);
      if (isNaN(numA)) return 1;
      if (isNaN(numB)) return -1;
      return numA - numB;
    });
  };

  useEffect(() => {
    fetchGuardDetails();
    fetchParcelsFromDB(); // 3. Add real-time subscription to useEffect
    fetchWalkInPasses();
    fetchUnitsMap();
    fetchCondoPolicy();
    fetchCondoTowers();
    fetchPayrollData();

    const timeInterval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000);


    // 🎯 [Real-time Sync] Real-time notification to guard upon tech visit
    const channel = supabase.channel('guard_job_orders_' + Date.now())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'job_orders' }, payload => {
        if (payload.new.status === 'VISITING' && payload.old.status !== 'VISITING') {
          // Trigger alert when tech is VISITING a specific unit
          const unitId = payload.new.unit_id;
          
          // Get unit number and display in alert
          supabase.from('units').select('unit_number').eq('id', unitId).maybeSingle().then(({ data }) => {
            const unitNo = data?.unit_number || 'Unknown';
            Alert.alert(
              "🛠️ Technician Arriving", 
              `A technician is visiting Unit ${unitNo} for maintenance.\nPlease clear them at the gate.`
            );
            
            // Auto-record in PMO logs
            setPmoLogs(prev => [{
              id: Date.now().toString(),
              sender: 'SYSTEM ALARM',
              msg: `[ACCESS] Tech visiting Unit ${unitNo} for repair: ${payload.new.title || 'Task'}`,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }, ...prev]);
          });
        }
      })
      .subscribe();
      
    // 🎯 [Real-time Sync] Auto refresh bottom list on parcel insert/update
    const parcelsChannel = supabase.channel('realtime-parcels_' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parcels' }, () => {
        fetchParcelsFromDB();
      })
      .subscribe();

    // 🎯 Detect immediately in Guard App when resident approves!
    const approvalChannel = supabase.channel('guard-approval-monitor_' + Date.now())
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'visitor_passes'
      }, (payload) => {
        fetchWalkInPasses();
        if (payload.eventType === 'UPDATE' && payload.new.status === 'APPROVED' && (payload.old ? payload.old.status !== 'APPROVED' : true)) {
          Alert.alert(
            "✅ Resident Approval",
            `${payload.new.visitor_name}'s entry has been approved. Permit entry?`,
            [
              { text: "Later", style: "cancel" },
              { 
                text: "Permit Entry", 
                onPress: () => {
                  processVisitorEntry(
                    payload.new.id, 
                    payload.new.visitor_name, 
                    payload.new.unit_id, 
                    payload.new.visit_type
                  );
                } 
              }
            ]
          );
        }
      })
      .subscribe();

    // 🎯 Real-time subscription to update the intercom badge count on the navigation bar
    const intercomBadgeChannel = supabase.channel('guard-intercom-badge_' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intercom_chats' }, () => {
        fetchUnreadCount(assignedBuildingRef.current, guardNameRef.current);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intercom_messages' }, async (payload) => {
        fetchUnreadCount(assignedBuildingRef.current, guardNameRef.current);
        
        // Show an in-app Alert/banner in Guard app when a resident sends a new message
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
      supabase.removeChannel(parcelsChannel);
      supabase.removeChannel(approvalChannel);
      supabase.removeChannel(intercomBadgeChannel);
      clearInterval(timeInterval);
    };
  }, []);

  const fetchUnreadCount = async (building: string, name: string) => {
    try {
      // 1. Fetch PMO Managers to exclude them
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

      // 2. Fetch chats
      const { data: chats } = await supabase
        .from('intercom_chats')
        .select('user_id, read_by_guards')
        .eq('target_building', building);

      let totalUnreads = 0;

      if (chats) {
        // A) Resident chats unread count
        const residentUnreads = chats
          .filter(c => !pmoIds.includes(c.user_id))
          .filter(c => 
            !c.read_by_guards || 
            c.read_by_guards.length === 0 || 
            !c.read_by_guards.includes(name)
          ).length;
        totalUnreads += residentUnreads;
      }

      // B) PMO Radio chat unread count
      const canonicalPmoId = '66dcdab9-091a-440f-a871-fe2133c1813e';
      const { data: pmoChat } = await supabase
        .from('intercom_chats')
        .select('id')
        .eq('user_id', canonicalPmoId)
        .eq('channel', 'SECURITY')
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

  const fetchGuardLogs = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('guard_activity_logs')
        .select('id, action, details, created_at')
        .eq('guard_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        const mappedLogs = data.map((log: any) => {
          const now = new Date(log.created_at);
          const dateStr = now.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
          const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return {
            id: log.id,
            action: log.action,
            details: log.details,
            time: `${dateStr} ${timeStr}`
          };
        });
        setAccessLogs(mappedLogs);
      }
    } catch (err) {
      console.error("Error fetching guard logs:", err);
    }
  };

  const fetchGuardDetails = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        setGuardName('Staff Guard');
        setAssignedBuilding('Tower A');
        return;
      }

      fetchGuardLogs(userId);

      const { data, error } = await supabase
        .from('staff_profiles')
        .select('full_name, role, assigned_building')
        .eq('id', userId)
        .maybeSingle();

      if (!error && data) {
        let name = data.full_name || 'Juan';
        name = name.replace(/Duty Guard/gi, 'Guard');
        name = name.replace(/Guard Guard/gi, 'Guard');
        const role = data.role || 'GUARD';
        const lowerName = name.toLowerCase();
        if (!lowerName.startsWith('guard') && !lowerName.startsWith('staff') && !lowerName.startsWith('tech') && !lowerName.startsWith('pmo')) {
          const roleLabel = role === 'PMO_MANAGER' ? 'Staff' : 'Guard';
          name = `${roleLabel} ${name}`;
        }
        const building = data.assigned_building || 'Tower A';
        setGuardName(name);
        setAssignedBuilding(building);
        guardNameRef.current = name;
        assignedBuildingRef.current = building;
        fetchUnreadCount(building, name);
      } else {
        setGuardName('Guard Juan');
        setAssignedBuilding('Tower A');
        guardNameRef.current = 'Guard Juan';
        assignedBuildingRef.current = 'Tower A';
        fetchUnreadCount('Tower A', 'Guard Juan');
      }
    } catch (err) {
      console.error("Error fetching guard details:", err);
      setGuardName('Guard Juan');
      setAssignedBuilding('Tower A');
      guardNameRef.current = 'Guard Juan';
      assignedBuildingRef.current = 'Tower A';
      fetchUnreadCount('Tower A', 'Guard Juan');
    }
  };

  // Payroll states
  const [payrollSettings, setPayrollSettings] = useState<any>(null);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<any[]>([]);
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth()); // 0-11
  const [loadingPayroll, setLoadingPayroll] = useState(false);

  useEffect(() => {
    if (activeTab === 'MY_PAGE' && guardSubTab === 'PAYROLL') {
      fetchPayrollData();
    }
  }, [activeTab, guardSubTab, currentYear, currentMonth]);

  const generateSampleAttendance = (year: number, month: number, userId: string) => {
    const list = [];
    const daysInSelectedMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInSelectedMonth; day++) {
      const date = new Date(year, month, day);
      const dayOfWeek = date.getDay(); // 0 = Sun, 6 = Sat
      
      // Work Monday to Friday
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        // Mon, Tue, Wed: 8 hours (480 mins)
        // Thu, Fri: 12 hours (720 mins, includes 4h overtime)
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

  const fetchPayrollData = async () => {
    setLoadingPayroll(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || '867c5dcd-51d3-4f04-b455-df6b01300d6e'; // default guard ID for fallback

      // 1. Fetch staff profile (payroll settings)
      const { data: profile, error: pError } = await supabase
        .from('staff_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (!pError && profile) {
        setPayrollSettings(profile.payroll_settings || { base_rate_type: 'hourly', base_rate: 80, additions: [] });
      } else {
        setPayrollSettings({ base_rate_type: 'hourly', base_rate: 80, additions: [] });
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
      
      const sampleAtt = generateSampleAttendance(currentYear, currentMonth, userId);
      if (!aError && att) {
        const mergedAtt = [...sampleAtt];
        att.forEach((realItem: any) => {
          const index = mergedAtt.findIndex(s => s.work_date === realItem.work_date);
          if (index !== -1) {
            mergedAtt[index] = realItem;
          } else {
            mergedAtt.push(realItem);
          }
        });
        mergedAtt.sort((a, b) => a.work_date.localeCompare(b.work_date));
        setAttendanceData(mergedAtt);
      } else {
        setAttendanceData(sampleAtt);
      }

      // 3. Fetch disbursed payroll records
      const { data: records, error: rError } = await supabase
        .from('staff_payroll_records')
        .select('*')
        .eq('staff_id', userId)
        .gte('pay_period_start', startOfMonth)
        .lte('pay_period_end', endOfMonth);
      if (!rError && records && records.length > 0) {
        setPayrollRecords(records);
      } else {
        // Fallback to sample disbursed record of the previous month
        const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        const startOfPrevMonth = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
        const endOfPrevMonth = new Date(prevYear, prevMonth + 1, 0).toISOString().split('T')[0];
        
        // Calculate estimated last month pay based on sample data
        const prevSampleAtt = generateSampleAttendance(prevYear, prevMonth, userId);
        let regHours = 0;
        let otHours = 0;
        prevSampleAtt.forEach((a) => {
          const hrs = a.total_minutes / 60;
          if (hrs > 8) {
            regHours += 8;
            otHours += (hrs - 8);
          } else {
            regHours += hrs;
          }
        });
        const estLastMonthPay = (regHours * 80) + (otHours * 80 * 1.25);

        setPayrollRecords([{
          id: 'sample-payroll-disbursed',
          staff_id: userId,
          pay_period_start: startOfPrevMonth,
          pay_period_end: endOfPrevMonth,
          net_pay_piso: estLastMonthPay,
          status: 'DISBURSED'
        }]);
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

  const fetchUnitsMap = async () => {
    try {
      const { data, error } = await supabase
        .from('units')
        .select('id, unit_number, building_no');
      
      if (!error && data) {
        const mapping: Record<string, { unit_number: string, building_no: string }> = {};
        data.forEach(u => {
          mapping[u.id] = {
            unit_number: u.unit_number || '',
            building_no: u.building_no || 'Tower A'
          };
        });
        setUnitsMap(mapping);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchWalkInPasses = async () => {
    try {
      // Calculate local date string to handle timezone shifts correctly
      const localDate = new Date();
      const year = localDate.getFullYear();
      const month = String(localDate.getMonth() + 1).padStart(2, '0');
      const day = String(localDate.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;

      const { data, error } = await supabase
        .from('visitor_passes')
        .select(`
          id,
          visitor_name,
          visit_type,
          purpose,
          status,
          unit_id,
          created_at,
          qr_code_value
        `)
        .or('status.eq.PENDING,status.eq.APPROVED,status.eq.USED')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error fetching walk in passes:", error);
      } else if (data) {
        const filtered = data.filter((pass: any) => {
          if (pass.qr_code_value) {
            const parts = pass.qr_code_value.split('|');
            const tokenData: Record<string, string> = {};
            parts.forEach((part: string) => {
              const idx = part.indexOf(':');
              if (idx !== -1) {
                tokenData[part.slice(0, idx)] = part.slice(idx + 1);
              }
            });
            const fromStr = tokenData['FROM'];
            const toStr = tokenData['TO'];

            if (fromStr && toStr) {
              // 1. Starts today, ends today -> disappear 24h after created_at
              if (fromStr === todayStr && toStr === todayStr) {
                const createdTime = new Date(pass.created_at).getTime();
                if (Date.now() - createdTime > 24 * 60 * 60 * 1000) {
                  return false;
                }
              }
              // 2. Range validation: must be within active date range
              if (todayStr < fromStr || todayStr > toStr) {
                if (pass.status === 'PENDING') {
                  return true;
                }
                return false;
              }
            }
          }
          return true;
        });

        setWalkInPasses(filtered);
        if (Object.keys(unitsMap).length === 0) {
          fetchUnitsMap();
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 2. Function to load data from DB
  const fetchParcelsFromDB = async () => {
    const { data, error } = await supabase
      .from('parcels')
      .select('*')
      .in('status', ['ARRIVED', 'HOLDING'])
      .order('created_at', { ascending: false });

    if (!error && data) {
      const uniqueUnitNos = Array.from(new Set(data.map(p => p.unit_no).filter(Boolean)));
      const unitMapping: Record<string, string> = {};

      if (uniqueUnitNos.length > 0) {
        const { data: unitData } = await supabase
          .from('units')
          .select('unit_number, building_no')
          .in('unit_number', uniqueUnitNos);
        
        if (unitData) {
          unitData.forEach(u => {
            if (u.unit_number) {
              unitMapping[u.unit_number] = u.building_no || '';
            }
          });
        }
      }

      const parsed: Parcel[] = data.map(p => ({
        id: p.id.toString(),
        unit: p.unit_no || 'Unknown',
        tracking: p.tracking_number || 'Unknown',
        registered_by: p.registered_by || 'Unknown',
        status: p.status,
        secure_pass_code: p.secure_pass_code || '',
        recipient_name: p.recipient_name || 'Resident',
        building_no: unitMapping[p.unit_no] || 'Tower A',
        created_at: p.created_at || new Date().toISOString()
      }));
      setDbParcels(parsed);
    }
  };

  // 🎯 Guard activity logging function
  const logGuardActivity = async (action: string, details: string) => {
    const now = new Date();
    const dateStr = now.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newLog = {
      id: Date.now().toString(),
      action,
      details,
      time: `${dateStr} ${timeStr}`
    };
    setAccessLogs(prev => [newLog, ...prev].slice(0, 20));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      await supabase.from('guard_activity_logs').insert({
        guard_id: userId || null,
        action,
        details
      });
    } catch (err) {
      console.warn("Failed to insert guard log to database:", err);
    }
  };

  // 🎯 Link existing submitParcelRegistration for submission
  const handleAddParcelToSharedPool = () => {
    submitParcelRegistration();
  };

  const debugUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    console.log("👤 Current logged-in user info:", user);
  };
  // debugUser(); // 🎯 Removed to prevent re-renders / logging spam
  // fetchGuardDetails(); // 🎯 Removed to prevent re-renders

  const handleSignOut = async () => {
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
          try {
            await supabase.auth.signOut();
            Alert.alert("Signed Out ✅", "Logged out from guard session.");
          } catch (e: any) {
            Alert.alert("Error", e.message || "Failed to sign out.");
          }
        }
      }
    ]);
  };

  // 🎯 Merge Gemini OCR implementation and place correctly
  const processAddressWithGemini = async (base64Image: string) => {
    setLoading(true);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "Extract only the Unit Number from this parcel shipping label photo. Return only the numbers." },
                { inline_data: { mime_type: "image/jpeg", data: base64Image } }
              ]
            }]
          })
        }
      );

      const data = await response.json();
      
      if (data.error) {
        console.error("Gemini API Error:", data.error);
        throw new Error(data.error.message);
      }

      if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts) {
        const extractedText = data.candidates[0].content.parts[0].text.trim();
        const numericUnit = extractedText.match(/\d+/);
        const cleanUnit = numericUnit ? numericUnit[0] : extractedText.replace(/[^0-9]/g, '');
        
        if (cleanUnit) {
          setScanUnit(cleanUnit);
          Alert.alert("OCR Success ✅", `Extracted Unit: ${cleanUnit}`);
        } else {
          Alert.alert("OCR Failed ⚠️", "Cannot find unit number in the image.");
        }
      } else {
        Alert.alert("OCR Failed ⚠️", "Invalid response structure.");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Analysis Failed", "Please capture the image again.");
    } finally {
      setLoading(false);
    }
  };

  // 🔍 [Added] Address/Unit OCR function
  const runAddressOCR = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Camera access is required.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.3,
        base64: true, // Request base64 data for Gemini API
      });

      if (!result.canceled && result.assets && result.assets[0].base64) {
        await processAddressWithGemini(result.assets[0].base64); // Call Gemini OCR function
      }
    } catch (e) {
      console.error(e);
    }
  };

  const processPlateWithGemini = async (base64Image: string): Promise<string | null> => {
    setLoading(true);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "Extract only the vehicle license plate number from this photo. Return only the uppercase letters and numbers of the plate with no spaces or special characters (e.g. AAA1234 or GHI123)." },
                { inline_data: { mime_type: "image/jpeg", data: base64Image } }
              ]
            }]
          })
        }
      );

      const data = await response.json();
      
      if (data.error) {
        console.error("Gemini API Error:", data.error);
        throw new Error(data.error.message);
      }

      if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts) {
        const extractedText = data.candidates[0].content.parts[0].text.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        return extractedText || null;
      }
      return null;
    } catch (error) {
      console.error("Gemini Plate OCR Error:", error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const capturePlatePhotoAndRecognize = async (): Promise<string | null> => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission Required", "Camera access is required to scan the license plate.");
        return null;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.3,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0].base64) {
        const recognized = await processPlateWithGemini(result.assets[0].base64);
        if (recognized) {
          Alert.alert("License Plate Recognized 📸", `Recognized Plate Number: ${recognized}`);
          return recognized;
        } else {
          Alert.alert("OCR Failed ⚠️", "Could not recognize plate number. Please enter manually.");
        }
      }
      return null;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  // 📸 [Added] Capture parcel photo
  const captureParcelPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission Required ⚠️", "Camera access is required to take photos of parcels.");
      return;
    }
    let result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.3,
      base64: true,
    });

    if (result.canceled || !result.assets) {
      return; 
    }

    setParcelPhoto(result.assets[0].uri);
    setParcelPhotoBase64(result.assets[0].base64 || null);
  };

  const submitParcelRegistration = async () => {
    if (!scanTracking.trim() || !scanUnit.trim()) {
      Alert.alert("Input Required ⚠️", "Please enter Tracking barcode and Unit Number.");
      return;
    }
    if (!parcelPhotoBase64) {
      Alert.alert("Photo Required ⚠️", "Please capture a parcel photo first.");
      return;
    }

    setLoading(true);
    try {
      const targetUnit = scanUnit.trim();
      const dateStr = getLocalDateStr().replace(/-/g, '');
      const securePass = `PASS-${targetUnit}-${dateStr}`; 

      let uploadedImageUrl = null;

      const fileName = `parcel_${targetUnit}_${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('parcel-images')
        .upload(fileName, decode(parcelPhotoBase64), { contentType: 'image/jpeg' });
      
      if (!uploadError) {
        const { data } = supabase.storage.from('parcel-images').getPublicUrl(fileName);
        uploadedImageUrl = data.publicUrl;
      }

      // 1. Insert into parcels table
      const { error: insertError } = await supabase
        .from('parcels')
        .insert([{
          unit_no: targetUnit,
          carrier_name: 'Lobby Drop-off',
          tracking_number: scanTracking.trim().toUpperCase(),
          image_url: uploadedImageUrl,
          status: 'ARRIVED',
          secure_pass_code: securePass,
          registered_by: guardName,
          recipient_name: 'Resident'
        }]);

      if (insertError) {
        Alert.alert("Error ❌", "Registration failed inside database.");
        setLoading(false);
        return;
      }

      // 2. Query unit_id
      const CORRECT_CONDO_ID = 'c1111111-1111-1111-1111-111111111111';
      const { data: foundUnit } = await supabase
        .from('units')
        .select('id')
        .eq('condo_id', CORRECT_CONDO_ID)
        .eq('unit_number', targetUnit)
        .maybeSingle();

      // 3. Insert notification
      await supabase.from('notifications').insert([{
        unit_id: foundUnit?.id || null,
        title: "📦 Parcel Arrived!",
        message: `A parcel has arrived for Unit ${targetUnit}.`,
        data: { secure_pass_code: securePass },
        type: 'PARCEL'
      }]);

      logGuardActivity("PARCEL_RECEIVE", `Unit ${targetUnit} parcel received: ${scanTracking.trim().toUpperCase()}`);
      
      // Reset form states
      setScanUnit('');
      setScanTracking('');
      setParcelPhoto(null);
      setParcelPhotoBase64(null);
      
      Alert.alert("Success 🎉", "Parcel registered successfully.");
      fetchParcelsFromDB();
    } catch (err) {
      console.error("Parcel dispatch error:", err);
      Alert.alert("Error ❌", "Failed to process parcel.");
    } finally {
      setLoading(false);
    }
  };

  // 🎯 3-Minute Approval Timeout Tracker
  const startApprovalTimeoutTracker = (passId: number, targetUnitId: string, unitNo: string, visitorName: string, visitType: string) => {
    let minutesElapsed = 0;
    
    const intervalId = setInterval(async () => {
      minutesElapsed += 1;
      
      // 1. Fetch current status of the pass
      const { data: passData, error } = await supabase
        .from('visitor_passes')
        .select('status')
        .eq('id', passId)
        .maybeSingle();

      if (error || !passData) {
        clearInterval(intervalId);
        return;
      }

      // If already APPROVED or ENTERED or CANCELLED, stop checking
      if (passData.status !== 'PENDING') {
        clearInterval(intervalId);
        return;
      }

      if (minutesElapsed < 3) {
        // Send retry push notification & database notification insert
        try {
          const typeIcon = visitType === 'VEHICLE' ? '🚗' : '🚶';
          const title = `⚠️ Reminder: Visitor Approval Required [${minutesElapsed}m]`;
          const message = `Reminder: ${visitorName} is still waiting at the gate. Please approve.`;
          
          await supabase.from('notifications').insert([{
            unit_id: targetUnitId,
            title,
            message,
            type: 'VISITOR',
            data: { pass_id: passId }
          }]);

          const { data: profiles } = await supabase
            .from('profiles')
            .select('expo_push_token')
            .eq('unit_id', targetUnitId);

          if (profiles && profiles.length > 0) {
            const pushMessages = profiles
              .map(p => p.expo_push_token)
              .filter((token): token is string => !!token)
              .map(token => ({
                to: token,
                sound: 'default',
                title,
                body: `[Reminder ${minutesElapsed}m] ${visitorName} is at the gate. Please approve.`,
                data: { type: 'VISITOR_APPROVAL', passId },
                badge: 1,
                channelId: 'default',
              }));

            if (pushMessages.length > 0) {
              await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                  'Accept-encoding': 'gzip, deflate',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(pushMessages),
              });
            }
          }
        } catch (e) {
          console.error("Failed to send timeout reminder notification:", e);
        }
      } else {
        // 3 minutes exceeded and still pending -> Auto Reject / Deny entry!
        clearInterval(intervalId);
        
        // Update DB status to REJECTED (or EXPIRED)
        await supabase
          .from('visitor_passes')
          .update({ status: 'REJECTED' })
          .eq('id', passId);

        // Notify resident of timeout
        await supabase.from('notifications').insert([{
          unit_id: targetUnitId,
          title: "❌ Visitor Approval Timeout",
          message: `Approval request for ${visitorName} timed out (3m). Entry has been denied.`,
          type: 'VISITOR',
          data: { pass_id: passId }
        }]);

        // Send timeout push notification
        const { data: profiles } = await supabase
          .from('profiles')
          .select('expo_push_token')
          .eq('unit_id', targetUnitId);

        if (profiles && profiles.length > 0) {
          const pushMessages = profiles
            .map(p => p.expo_push_token)
            .filter((token): token is string => !!token)
            .map(token => ({
              to: token,
              sound: 'default',
              title: "❌ Visitor Approval Timeout",
              body: `Approval request for ${visitorName} timed out. Entry has been denied.`,
              data: { type: 'VISITOR_TIMEOUT', passId },
              badge: 1,
              channelId: 'default',
            }));

          if (pushMessages.length > 0) {
            await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(pushMessages),
            });
          }
        }

        // Trigger Alert on Guard Tablet to notify the guard
        Alert.alert(
          "Approval Timeout ❌",
          `Unit ${unitNo} did not respond within 3 minutes.\n\nVisitor Name: ${visitorName}\nEntry has been Denied.\n\nIf needed, please instruct the visitor to contact the resident directly by phone or use intercom.`,
          [{ text: "OK" }]
        );

        fetchWalkInPasses(); // refresh list
      }
    }, 60000); // Check every 1 minute
  };

  // 🎯 New Vehicle Entry Logic (Policy Based)
  const handleVehicleEntry = async () => {
    // Check for resident sticker (Mocking sticker check with 'RES' prefix)
    const isResidentSticker = (plate: string) => plate.toUpperCase().startsWith('RES');
    
    if (inputPlate && isResidentSticker(inputPlate)) {
      logGuardActivity("RESIDENT_ENTRY", `Resident sticker detected for plate ${inputPlate}. Passed automatically.`);
      Alert.alert("Resident Passed 🟢", "Vehicle with resident sticker passed.");
      setInputPlate('');
      return;
    }

    if (!inputPlate || !vehicleTargetUnit) {
       Alert.alert("Input Error ⚠️", "Please enter both Target Unit and Vehicle Plate Number.");
       return;
    }

    // Find target unit UUID
    const CORRECT_CONDO_ID = 'c1111111-1111-1111-1111-111111111111';
    const { data: foundUnit, error: unitError } = await supabase
      .from('units')
      .select('id')
      .eq('condo_id', CORRECT_CONDO_ID)
      .eq('unit_number', vehicleTargetUnit.trim())
      .maybeSingle();

    if (unitError || !foundUnit) {
      Alert.alert("Error", `Unit ${vehicleTargetUnit} not found.`);
      return;
    }

    const actualUnitId = foundUnit.id;
    // Calculate local date string to handle timezone shifts correctly
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    // Create a visitor pass with PENDING status for the vehicle
    const { data: passData, error: passError } = await supabase
      .from('visitor_passes')
      .insert([{
        unit_id: actualUnitId,
        visitor_name: `Vehicle Guest (${inputPlate.trim().toUpperCase()})`,
        visit_type: 'VEHICLE',
        plate_number: inputPlate.trim().toUpperCase(),
        status: 'PENDING',
        purpose: 'Vehicle Access Request',
        visit_date: today
      }])
      .select('id')
      .single();

    if (passError || !passData) {
      console.error("Supabase Insert Error (visitor_passes for vehicle):", passError);
      Alert.alert("Error", `Failed to create vehicle pass: ${passError?.message}`);
      return;
    }

    // Insert notification for the resident app
    await supabase.from('notifications').insert([{
      unit_id: actualUnitId,
      title: "🚗 Vehicle Entry Request",
      message: `Vehicle (${inputPlate.trim().toUpperCase()}) is requesting entry to your unit. Please approve.`,
      type: 'VISITOR',
      data: { pass_id: passData.id }
    }]);

    // Send push notification
    const { data: profiles } = await supabase
      .from('profiles')
      .select('expo_push_token')
      .eq('unit_id', actualUnitId);

    if (profiles && profiles.length > 0) {
      const pushMessages = profiles
        .map(p => p.expo_push_token)
        .filter((token): token is string => !!token)
        .map(token => ({
          to: token,
          sound: 'default',
          title: '🚗 Vehicle Entry Request',
          body: `Vehicle (${inputPlate.trim().toUpperCase()}) is at the gate. Please approve.`,
          data: { type: 'VISITOR_APPROVAL', passId: passData.id },
          badge: 1,
          channelId: 'default',
        }));

      if (pushMessages.length > 0) {
        try {
          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(pushMessages),
          });
        } catch (e) {
          console.error("Failed to send push notification", e);
        }
      }
    }

    Alert.alert("Request Dispatched ✅", `Request sent to Unit ${vehicleTargetUnit}.`);
    startApprovalTimeoutTracker(passData.id, actualUnitId, vehicleTargetUnit.trim(), `Vehicle Guest (${inputPlate.trim().toUpperCase()})`, 'VEHICLE');
    setInputPlate('');
    setVehicleTargetUnit('');
    fetchWalkInPasses(); // refresh list
  };

  const handleVisitorEntry = async () => {
    if (!manualTargetUnit) {
      Alert.alert("Input Error ⚠️", "Please enter the Target Unit.");
      return;
    }

    const visitorName = manualVisitorName.trim() || manualVisitorType.trim() || 'Walk-in Guest';

    // 🎯 Fix Condo ID as a variable and include it in search conditions!
    const CORRECT_CONDO_ID = 'c1111111-1111-1111-1111-111111111111';

    const { data: foundUnit, error: unitError } = await supabase
      .from('units')
      .select('id')
      .eq('condo_id', CORRECT_CONDO_ID) // 🎯 Required: MUST filter by this condo ID first.
      .eq('unit_number', manualTargetUnit.trim())
      .maybeSingle();

    if (unitError || !foundUnit) {
      Alert.alert("Error", `Unit ${manualTargetUnit} not found.`);
      return;
    }

    const actualUnitId = foundUnit.id; // Obtain the actual UUID here
    // Calculate local date string to handle timezone shifts correctly
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`; // 🎯 Auto-generate visit date (today)

    if (condoPolicy.approval_required) {
      // 1) Insert into visitor_passes with PENDING status (to expose to resident app's approval queue)
      const { data: passData, error: passError } = await supabase
        .from('visitor_passes')
        .insert([{
          unit_id: actualUnitId,
          visitor_name: visitorName,
          visit_type: 'WALK_IN', // 🎯 Set to WALK_IN since it's walk-in manual entry
          status: 'PENDING',
          purpose: manualVisitorType, // 🎯 Put guard's input (Grab Food, etc.) here!
          visit_date: today // 🎯 Must include the date!
        }])
        .select('id')
        .single();

      if (passError || !passData) {
        console.error("Supabase Insert Error (visitor_passes):", passError);
        Alert.alert("Error", `Failed to create pass: ${passError?.message}`);
        return;
      }

      // 2) Insert notification for the resident app real-time subscription & log feed
      await supabase.from('notifications').insert([{
        unit_id: actualUnitId,
        title: "🔑 Visitor Approval Required",
        message: `${visitorName} is at the gate requesting entry. Please approve.`,
        type: 'VISITOR',
        data: { pass_id: passData.id }
      }]);

      // 🎯 FiliStaffGuardMain.tsx query logic
      const { data: profiles } = await supabase
        .from('profiles')
        .select('expo_push_token')
        .eq('unit_id', actualUnitId);

      console.log("✅ Profiles query result count:", profiles?.length); 

      if (profiles && profiles.length > 0) {
        const pushMessages = profiles
          .map(p => p.expo_push_token)
          .filter((token): token is string => !!token)
          .map(token => ({
            to: token,
            sound: 'default',
            title: 'Visitor Approval Required',
            body: `${visitorName} is at the gate. Please approve.`,
            data: { type: 'VISITOR_APPROVAL', passId: passData.id },
            badge: 1,
            channelId: 'default',
          }));

        if (pushMessages.length > 0) {
          try {
            await fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(pushMessages),
            });
            console.log(`Push notifications sent to ${pushMessages.length} tokens.`);
          } catch (e) {
            console.error("Failed to send push notification", e);
          }
        }
      }

      Alert.alert("Push Dispatch ✅", `Request sent to Unit ${manualTargetUnit}.`);
      startApprovalTimeoutTracker(passData.id, actualUnitId, manualTargetUnit.trim(), visitorName, 'WALK_IN');
    } else {
      // 3) Approval not required: create visitor_passes with ENTERED status immediately and log
      const { data: passData, error: passError } = await supabase
        .from('visitor_passes')
        .insert([{
          unit_id: actualUnitId,
          visitor_name: visitorName,
          visit_type: 'WALK_IN', // 🎯 Set to WALK_IN since it's walk-in manual entry
          status: 'USED', // 🎯 Guard verified, so set to USED immediately
          purpose: manualVisitorType,
          visit_date: today // 🎯 Add visit date even in logic where approval is not required!
        }])
        .select('id')
        .single();

      if (passError || !passData) {
        console.error("Supabase Insert Error (visitor_passes):", passError);
        Alert.alert("Error", `Failed to create pass: ${passError?.message}`);
        return;
      }

      const { error } = await supabase.from('visitor_logs').insert([{
        pass_id: passData.id,
        gate_location: 'Main Gate'
      }]);

      if (error) {
        console.error("Supabase Insert Error (visitor_logs):", error);
        Alert.alert("Error", `Failed: ${error.message}`);
      } else {
        logGuardActivity("GATE_ENTRY_CONFIRMED", `Manual visitor ${visitorName} entered (Unit ${manualTargetUnit}).`);
        Alert.alert("Access Granted 🟢", "Visitor logged.");
      }
    }

    setManualTargetUnit(''); 
    setManualVisitorName('');
    fetchWalkInPasses();
  };

  const processVisitorEntry = async (passId: number, visitorName: string, unitId: string | null, visitType: string | null) => {
    // 🎯 Query if the pass is reusable
    const { data: passInfo } = await supabase
      .from('visitor_passes')
      .select('qr_code_value')
      .eq('id', passId)
      .maybeSingle();

    const isReusable = passInfo?.qr_code_value?.includes('REUSABLE:TRUE') || false;

    const updatePayload = isReusable 
      ? { entry_time: new Date().toISOString() } // Keep status as APPROVED for multi-entry!
      : { status: 'USED', entry_time: new Date().toISOString() };

    const { error: updateError } = await supabase
      .from('visitor_passes')
      .update(updatePayload)
      .eq('id', passId);

    if (updateError) {
      Alert.alert("Error Updating Status", updateError.message, [
        { text: "OK", onPress: () => {
          setIsCameraLive(false);
          isProcessingScan.current = false;
        } }
      ]);
      return;
    }

    // Log record
    await supabase.from('visitor_logs').insert([{ 
      pass_id: passId, 
      gate_location: 'Main Gate' 
    }]);

    logGuardActivity("GATE_ENTRY_CONFIRMED", `Visitor ${visitorName} physically entered.`);

    // 🎯 Send arrival notification to the resident
    if (unitId) {
      try {
        const { data: unitData } = await supabase
          .from('units')
          .select('unit_number')
          .eq('id', unitId)
          .maybeSingle();

        const unitNo = unitData?.unit_number || 'Unknown';
        const typeIcon = visitType === 'VEHICLE' ? '🚗' : '🚶';

        // 1. Insert into notifications table (in-app live feed and badge counts)
        await supabase.from('notifications').insert([{
          unit_id: unitId,
          title: `Visitor Arrived ${typeIcon}`,
          message: `${visitorName} has entered the premises via Main Gate.`,
          type: 'VISITOR',
          data: { pass_id: passId }
        }]);

        // 2. Query push tokens and send immediate mobile OS alerts
        const { data: profiles } = await supabase
          .from('profiles')
          .select('expo_push_token')
          .eq('unit_id', unitId);

        if (profiles && profiles.length > 0) {
          const pushMessages = profiles
            .map(p => p.expo_push_token)
            .filter((token): token is string => !!token)
            .map(token => ({
              to: token,
              sound: 'default',
              title: `Visitor Arrived ${typeIcon}`,
              body: `${visitorName} has arrived.`,
              data: { type: 'VISITOR_ARRIVED', passId },
              badge: 1,
              channelId: 'default',
            }));

          if (pushMessages.length > 0) {
            try {
              await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                  'Accept-encoding': 'gzip, deflate',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(pushMessages),
              });
              console.log(`Push notifications sent successfully to ${pushMessages.length} residents.`);
            } catch (e) {
              console.error("Failed to send push notifications", e);
            }
          }
        }
      } catch (notifErr) {
        console.error("Failed to process visitor arrival notification:", notifErr);
      }
    }

    fetchWalkInPasses();

    const isVehicle = visitType === 'VEHICLE';
    Alert.alert(
      "Access Granted 🟢", 
      isVehicle 
        ? "Vehicle entry has been permitted." 
        : "Pedestrian entry has been permitted.",
      [{ text: "OK", onPress: () => {
        setIsCameraLive(false);
        isProcessingScan.current = false;
      } }]
    );
  };

  const showVisitorPassDetails = async (pass: any) => {
    let unitNo = unitsMap[pass.unit_id]?.unit_number;
    let building = unitsMap[pass.unit_id]?.building_no;

    if ((!unitNo || !building) && pass.unit_id) {
      try {
        const { data: unitData } = await supabase
          .from('units')
          .select('unit_number, building_no')
          .eq('id', pass.unit_id)
          .maybeSingle();
        if (unitData) {
          unitNo = unitData.unit_number;
          building = unitData.building_no;
        }
      } catch (err) {
        console.error("Error fetching fallback unit details:", err);
      }
    }

    const finalUnitNo = unitNo || 'N/A';
    const finalBuilding = building || 'N/A';
    const registeredDateTime = pass.created_at 
      ? new Date(pass.created_at).toLocaleString() 
      : 'N/A';

    Alert.alert(
      "📋 Visitor Pass Details",
      `• Visitor Name: ${pass.visitor_name}\n• Target Unit: Unit ${finalUnitNo} (${finalBuilding})\n• Purpose: ${pass.purpose || 'Walk-in'}\n• Status: ${pass.status}\n• Type: ${pass.visit_type}\n• Registered At: ${registeredDateTime}`,
      [
        { text: "Close", style: "cancel" }
      ]
    );
  };

  const handleReRequestApproval = async (pass: any) => {
    try {
      setLoading(true);
      
      let unitNumber = unitsMap[pass.unit_id]?.unit_number;
      if (!unitNumber && pass.unit_id) {
        try {
          const { data: unitData } = await supabase
            .from('units')
            .select('unit_number')
            .eq('id', pass.unit_id)
            .maybeSingle();
          if (unitData) {
            unitNumber = unitData.unit_number;
          }
        } catch (err) {
          console.error("Error fetching fallback unit number for re-request:", err);
        }
      }
      const finalUnitNumber = unitNumber || 'Unknown';
      
      const { error: notifError } = await supabase.from('notifications').insert([{
        unit_id: pass.unit_id,
        title: "🔑 Visitor Approval Required (Reminder) ⚠️",
        message: `${pass.visitor_name} is still waiting at the gate. Please check and approve.`,
        type: 'VISITOR',
        data: { pass_id: pass.id }
      }]);

      if (notifError) throw notifError;

      const { data: profiles } = await supabase
        .from('profiles')
        .select('expo_push_token')
        .eq('unit_id', pass.unit_id);

      if (profiles && profiles.length > 0) {
        const pushMessages = profiles
          .map(p => p.expo_push_token)
          .filter((token): token is string => !!token)
          .map(token => ({
            to: token,
            sound: 'default',
            title: '🔑 Visitor Approval Required (Reminder) ⚠️',
            body: `${pass.visitor_name} is still waiting at the gate. Please check and approve.`,
            data: { pass_id: pass.id },
            badge: 1,
            channelId: 'default',
          }));

        if (pushMessages.length > 0) {
          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(pushMessages)
          });
        }
      }

      Alert.alert("Alert Sent 📲", `Approval reminder has been resent to Unit ${finalUnitNumber}.`);
    } catch (err: any) {
      console.error("Error re-requesting approval:", err);
      Alert.alert("Error", `Failed to resend alert: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToBulkQueue = () => {
    if (!scanUnit.trim() || !scanTracking.trim()) {
      Alert.alert("Input Void ⚠️", "Please fill in both Unit number and Tracking barcode reference.");
      return;
    }
    setBulkList(prev => [...prev, { unit: scanUnit.trim(), tracking: scanTracking.trim().toUpperCase() }]);
    setScanTracking('');
  };

  const handleDeployBulkToSharedInventory = () => {
    if (bulkList.length === 0) return;
    const newIngestedItems = bulkList.map((item, idx) => ({
      id: `p_idx_new_${Date.now()}_${idx}`,
      unit: item.unit,
      tracking: item.tracking,
      registered_by: `${guardName} (You)`,
      status: 'HOLDING',
      secure_pass_code: `PASS-${Math.floor(1000 + Math.random() * 9000)}`
    }));
    setDbParcels(prev => [...newIngestedItems, ...prev]);
    setBulkList([]);
    Alert.alert("Batch Uploaded 🎉", "All queued items deployed to shared property inventory.");
  };

  const handleOpenUnitSignatureGate = (unitNo: string, parcelsList: any[]) => {
    Alert.alert(
      "Select Handover Method",
      "How will the resident confirm the pickup?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Scan QR", 
          onPress: () => {
            // Activate QR scan mode (using existing camera feature)
            setCameraTarget('PARCEL_RELEASE'); 
            isProcessingScan.current = false;
            setIsCameraLive(true);
          } 
        },
        { 
          text: "Manual Signature", 
          onPress: () => {
            // Execute existing signature modal
            setSelectedUnit(unitNo);
            setSelectedUnitParcels(parcelsList);
            setClaimantName('');
            setClaimantRelationship('TENANT_OWNER');
            setEnteredPassCode('');
            setIsSignatureDrawn(false);
            setIsSignatureModalOpen(true);
          } 
        }
      ]
    );
  };

  // 3. Separate auth logic (function to change status immediately after signature and show success alert)
  const proceedWithHandover = async () => {
    const targetIds = selectedUnitParcels.map(p => p.id);
    
    // 🎯 Add server update code!
    const { error } = await supabase
      .from('parcels')
      .update({ 
        status: 'COLLECTED', 
        released_by: guardName,
        collected_at: new Date().toISOString() 
      })
      .in('id', targetIds);

    if (error) {
      Alert.alert("Update Failed", error.message);
      return;
    }

    setDbParcels(prev => prev.map(parcel => 
      targetIds.includes(parcel.id) ? { ...parcel, status: 'COLLECTED', released_by: guardName } : parcel
    ));
    
    // Log the handover activity
    logGuardActivity("PARCEL_RELEASED", `Unit ${selectedUnit} parcel(s) released to ${claimantName} (${claimantRelationship}) with signature verification.`);

    setIsSignatureModalOpen(false);
    Alert.alert(
      "Handover Completed 🔐",
      `[SUCCESS DEPLOYED]\nUnit No: ${selectedUnit}\nClaimant: ${claimantName} (${claimantRelationship})\nItems Cleared: ${targetIds.length} Parcels\nSentry Proof: Immutable Signature Encoded.`
    );

    setClaimantName('');
    setEnteredPassCode('');
    setIsSignatureDrawn(false);
  };

  // 🎯 [Core Integration]: Guard verifies proxy code and signature validity via terminal
  const handleBatchReleaseWithSingleSignature = () => {
    if (!claimantName.trim()) {
      Alert.alert("Input Deficiency ⚠️", "Please enter the legal name of the person taking physical custody of the package.");
      return;
    }

    // 🔒 Proxy Token Match Check: Cross-check owner's passcode hash when proxy receives
    if (claimantRelationship !== 'TENANT_OWNER') {
      const targetMasterPass = selectedUnitParcels[0]?.secure_pass_code || "PASS-9821";
      if (enteredPassCode.trim().toUpperCase() !== targetMasterPass) {
        Alert.alert(
          "SECURITY BREACH ❌",
          `The validation code [${enteredPassCode}] does not match the occupant terminal token.\n\nHandover Denied.`
        );
        return;
      }
    }

    // 1. Send force save signature command to signature pad
    if (signatureRef.current) {
      signatureRef.current.readSignature(); 
    }
  };

  const handleTriggerSosBroadcast = async () => {
    try {
      const canonicalPmoId = '66dcdab9-091a-440f-a871-fe2133c1813e';
      const channel = 'SECURITY';
      const name = guardName;
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

  const handleSendPmoSignal = () => {
    if (!pmoMessage.trim()) return;
    setPmoLogs(prev => [...prev, { id: Date.now().toString(), sender: 'Me (Guard)', msg: pmoMessage, time: 'Now' }]);
    logGuardActivity("PMO_MESSAGE", `Sent message to PMO: "${pmoMessage.trim()}"`); // 🎯 Automated activity record
    setPmoMessage('');
  };

  const handleSendUnitMessage = () => {
    if (!unitMessage.trim() || !activeChatUnit) return;
    setUnitMessages((prev: any) => ({
      ...prev,
      [activeChatUnit]: [...(prev[activeChatUnit] || []), { id: Date.now().toString(), sender: 'Me (Guard)', msg: unitMessage, time: 'Now', operator_name: guardName }]
    }));
    logGuardActivity("INTERCOM_CHAT", `Chat with Unit ${activeChatUnit}: "${unitMessage.trim()}"`); // 🎯 Automated activity record
    setResidentChatRooms(prev => prev.map(room => room.unit === activeChatUnit ? { ...room, lastMsg: unitMessage, time: 'Now', unread: false, lastAnsweredBy: guardName, currentHandler: `${guardName} (You)` } : room));
    setUnitMessage('');
  };

  const handleOpenUnitChatWindow = (unit: string) => {
    setActiveChatUnit(unit);
    setIsUnitChatOpen(true);
    setResidentChatRooms(prev => prev.map(room => room.unit === unit ? { ...room, unread: false, currentHandler: `${guardName} (You)` } : room));
  };

  const handleParcelReleaseScan = async (scannedData: string) => {
    try {
      let code = scannedData;
      if (scannedData.startsWith('{')) {
        const parsed = JSON.parse(scannedData);
        code = parsed.code || scannedData;
      }

      // Query database for parcels with this secure_pass_code that are ARRIVED or HOLDING
      const { data: parcels, error } = await supabase
        .from('parcels')
        .select('*')
        .eq('secure_pass_code', code)
        .in('status', ['ARRIVED', 'HOLDING']);

      if (error || !parcels || parcels.length === 0) {
        Alert.alert("Verification Failed ❌", "No pending parcels found matching this QR code.", [
          { text: "OK", onPress: () => {
            setIsCameraLive(false);
            isProcessingScan.current = false;
          } }
        ]);
        return;
      }

      // Found matching parcels!
      const targetUnit = parcels[0].unit_no || 'Unknown';
      const recipientName = parcels[0].recipient_name || 'Resident';

      // Load building info if available
      let buildingNo = 'Tower A';
      const { data: unitData } = await supabase
        .from('units')
        .select('building_no')
        .eq('unit_number', targetUnit)
        .maybeSingle();
      if (unitData) {
        buildingNo = unitData.building_no || 'Tower A';
      }

      // Load into modal states
      setSelectedUnit(targetUnit);
      setSelectedUnitParcels(parcels.map(p => ({
        id: p.id.toString(),
        unit: p.unit_no || 'Unknown',
        tracking: p.tracking_number || 'Unknown',
        registered_by: p.registered_by || 'Unknown',
        status: p.status,
        secure_pass_code: p.secure_pass_code || '',
        recipient_name: p.recipient_name || 'Resident',
        building_no: buildingNo,
        created_at: p.created_at || new Date().toISOString()
      })));

      setClaimantName(recipientName); // Pre-fill claimant name
      setClaimantRelationship('TENANT_OWNER');
      setEnteredPassCode(code); // Pre-fill code

      // Turn off camera and open signature modal
      setIsCameraLive(false);
      setIsSignatureDrawn(false);
      setIsSignatureModalOpen(true);
      isProcessingScan.current = false;
    } catch (err) {
      console.error("Parcel release scan processing error:", err);
      Alert.alert("Scan Error ⚠️", "Failed to parse parcel QR data.", [
        { text: "OK", onPress: () => {
          setIsCameraLive(false);
          isProcessingScan.current = false;
        } }
      ]);
    }
  };

  const handleQrVerification = async (scannedData: string) => {
    try {
      // 1. Check if QR data is JSON (Data generated from resident app)
      if (scannedData.startsWith('{')) {
        await handleParcelReleaseScan(scannedData);
        return;
      }

      // (Maintain existing Visitor Pass validation logic)
      let passData: any = null;

      const { data, error } = await supabase
        .from('visitor_passes')
        .select('*')
        .eq('qr_code_value', scannedData)
        .maybeSingle();

      if (error) {
        console.error("DB Query Error:", error);
        Alert.alert("Error", `Failed to retrieve data: ${error.message}`, [
          { text: "OK", onPress: () => {
            setIsCameraLive(false);
            isProcessingScan.current = false;
          } }
        ]);
        return;
      }

      passData = data;

      // Fallback: If not found but starts with 'FILICONDO-VMS|', parse the token components
      if (!passData && scannedData.startsWith('FILICONDO-VMS|')) {
        const parts = scannedData.split('|');
        const tokenData: Record<string, string> = {};
        parts.forEach(part => {
          const idx = part.indexOf(':');
          if (idx !== -1) {
            tokenData[part.slice(0, idx)] = part.slice(idx + 1);
          }
        });

        const name = tokenData['NAME'];
        const plate = tokenData['PLATE'];
        const type = tokenData['TYPE'];

        if (name) {
          let fallbackQuery = supabase
            .from('visitor_passes')
            .select('*')
            .eq('visitor_name', name);
          
          if (type === 'VEHICLE' && plate && plate !== 'WALK-IN') {
            fallbackQuery = fallbackQuery.eq('plate_number', plate);
          }

          const { data: fallbackData } = await fallbackQuery
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          passData = fallbackData;
        }
      }

      if (!passData) {
        Alert.alert("Access Denied ❌", "Unregistered or invalid QR code.", [
          { text: "OK", onPress: () => {
            setIsCameraLive(false);
            isProcessingScan.current = false;
          } }
        ]);
        return;
      }

      // Expiration / validity dates verification
      const qrValue = passData.qr_code_value;
      if (qrValue) {
        const parts = qrValue.split('|');
        const tokenData: Record<string, string> = {};
        parts.forEach((part: string) => {
          const idx = part.indexOf(':');
          if (idx !== -1) {
            tokenData[part.slice(0, idx)] = part.slice(idx + 1);
          }
        });
        
        const fromStr = tokenData['FROM'];
        const toStr = tokenData['TO'];
        const expStr = tokenData['EXP'];
        // Calculate local date string to handle timezone shifts correctly
        const localDate = new Date();
        const year = localDate.getFullYear();
        const month = String(localDate.getMonth() + 1).padStart(2, '0');
        const day = String(localDate.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;
        
        if (fromStr && todayStr < fromStr) {
          Alert.alert("Access Denied ❌", `This pass is not active yet (Valid starting: ${fromStr}).`, [
            { text: "OK", onPress: () => {
              setIsCameraLive(false);
              isProcessingScan.current = false;
            } }
          ]);
          return;
        }
        
        if (toStr && todayStr > toStr) {
          Alert.alert("Access Denied ❌", `This pass has expired (Valid until: ${toStr}).`, [
            { text: "OK", onPress: () => {
              setIsCameraLive(false);
              isProcessingScan.current = false;
            } }
          ]);
          return;
        }
        
        if (expStr && expStr.startsWith('2HOURS-')) {
          const timestamp = parseInt(expStr.split('-')[1]);
          if (!isNaN(timestamp) && Date.now() - timestamp > 2 * 60 * 60 * 1000) {
            Alert.alert("Access Denied ❌", "This quick pass has expired (2-hour limit).", [
              { text: "OK", onPress: () => {
                setIsCameraLive(false);
                isProcessingScan.current = false;
              } }
            ]);
            return;
          }
        }
      }

      // Check if this is a reusable pass that is currently checked-in (needs checkout/exit)
      const isReusable = passData.qr_code_value?.includes('REUSABLE:TRUE');
      const isMultiEntry = passData.qr_code_value?.includes('MULTI_ENTRY:TRUE');
      let openLog = null;
      if (isReusable && !isMultiEntry) {
        const { data: logData } = await supabase
          .from('visitor_logs')
          .select('id, access_time')
          .eq('pass_id', passData.id)
          .is('exit_time', null)
          .order('access_time', { ascending: false })
          .limit(1)
          .maybeSingle();
        openLog = logData;
      }

      if (openLog) {
        // They are currently inside, so this scan is an EXIT/CHECKOUT!
        const plate = passData.plate_number || 'WALK-IN';
        const targetUnitNo = unitsMap[passData.unit_id]?.unit_number || 'N/A';
        const targetBuilding = unitsMap[passData.unit_id]?.building_no || '';
        
        Alert.alert(
          "Visitor Exit QR Scanned 🔄",
          `Confirm checkout for reusable pass?\nVisitor Name: ${passData.visitor_name}\nUnit: ${targetUnitNo} ${targetBuilding ? `(${targetBuilding})` : ''}\nType: ${passData.visit_type || 'PERSON'}${passData.plate_number ? `\nPlate: ${passData.plate_number}` : ''}`,
          [
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => {
                setIsCameraLive(false);
                isProcessingScan.current = false;
              }
            },
            {
              text: "Confirm Checkout",
              onPress: async () => {
                // For reusable passes, do NOT update status of pass. Just update the log's exit time.
                await handleVisitorCheckoutAndBill(openLog.id, passData.visitor_name, openLog.access_time, plate);
                setIsCameraLive(false);
                isProcessingScan.current = false;
              }
            }
          ]
        );
        return;
      }

      // Allow BOTH APPROVED and PENDING visitor passes to enter upon guard scanning
      if (passData.status !== 'APPROVED' && passData.status !== 'PENDING') {
        if (passData.status === 'USED' && !passData.exit_time) {
          // If status is USED and it's a vehicle (or has plate number), let's trigger CHECKOUT!
          const plate = passData.plate_number;
          if (plate) {
            const targetUnitNo = unitsMap[passData.unit_id]?.unit_number || 'N/A';
            const targetBuilding = unitsMap[passData.unit_id]?.building_no || '';
            Alert.alert(
              "Visitor Exit QR Scanned 🚗",
              `Confirm checkout for vehicle?\nVisitor Name: ${passData.visitor_name}\nUnit: ${targetUnitNo} ${targetBuilding ? `(${targetBuilding})` : ''}\nPlate: ${plate}`,
              [
                {
                  text: "Cancel",
                  style: "cancel",
                  onPress: () => {
                    setIsCameraLive(false);
                    isProcessingScan.current = false;
                  }
                },
                {
                  text: "Confirm Checkout",
                  onPress: async () => {
                    // 1. Update status of pass to USED and set exit_time
                    await supabase.from('visitor_passes').update({ status: 'USED', exit_time: new Date().toISOString() }).eq('id', passData.id);
                    // 2. Process checkout and billing
                    await handleVisitorCheckoutAndBill('TEMP_LOG_ID', passData.visitor_name, passData.entry_time || passData.created_at, plate);
                    setIsCameraLive(false);
                    isProcessingScan.current = false;
                  }
                }
              ]
            );
            return;
          }
        }

        if (passData.status === 'USED' && passData.exit_time) {
          Alert.alert("Already Entered ⚠️", `This pass has already been used.`, [
            { text: "OK", onPress: () => {
              setIsCameraLive(false);
              isProcessingScan.current = false;
            } }
          ]);
        } else {
          Alert.alert("Access Denied ❌", `This pass is not active (Status: ${passData.status}).`, [
            { text: "OK", onPress: () => {
              setIsCameraLive(false);
              isProcessingScan.current = false;
            } }
          ]);
        }
        return;
      }

      // Check if walk-in or group pass is scanned at the Vehicle Gate subview
      const isWalkInPass = passData.visit_type === 'WALK_IN' || passData.visit_type === 'PERSON';

      if (gateSubView === 'VEHICLE') {
        const targetUnitNo = unitsMap[passData.unit_id]?.unit_number || 'N/A';
        const targetBuilding = unitsMap[passData.unit_id]?.building_no || '';
        setVehicleTargetUnit(targetUnitNo);
        setIsCameraLive(false);
        isProcessingScan.current = false;

        Alert.alert(
          "QR Verified ✅",
          `Unit ${targetUnitNo} automatically entered.\nNow, please capture the license plate photo to recognize the plate number automatically.`,
          [
            {
              text: "Cancel",
              style: "cancel"
            },
            {
              text: "📸 Capture Plate",
              onPress: async () => {
                const plate = await capturePlatePhotoAndRecognize();
                if (plate) {
                  setInputPlate(plate);
                  
                  // Ask if they want to permit vehicle entry immediately!
                  Alert.alert(
                    "Vehicle Entry Check-in",
                    `Confirm entry for vehicle?\nVisitor Name: ${passData.visitor_name}\nUnit: ${targetUnitNo} (${targetBuilding})\nPlate: ${plate}`,
                    [
                      {
                        text: "Cancel",
                        style: "cancel"
                      },
                      {
                        text: "Permit Entry",
                        onPress: async () => {
                          // Update pass status to APPROVED and update DB
                          const { error: updatePassErr } = await supabase
                            .from('visitor_passes')
                            .update({ 
                              visit_type: 'VEHICLE', 
                              plate_number: plate,
                              status: 'APPROVED'
                            })
                            .eq('id', passData.id);
                            
                          if (!updatePassErr) {
                            await processVisitorEntry(passData.id, passData.visitor_name, passData.unit_id, 'VEHICLE');
                            setInputPlate('');
                            setVehicleTargetUnit('');
                          } else {
                            console.error("Failed to update visitor pass type/plate:", updatePassErr);
                          }
                        }
                      }
                    ]
                  );
                }
              }
            }
          ]
        );
        return;
      }

      // Show details popup for valid QR scan, allowing entry on confirmation
      const targetUnitNo = unitsMap[passData.unit_id]?.unit_number || 'N/A';
      const targetBuilding = unitsMap[passData.unit_id]?.building_no || '';
      
      // Close camera modal first to prevent accidental touch/press propagation during scan transition
      setIsCameraLive(false);

      Alert.alert(
        "Visitor Access QR Verified ✅",
        `Visitor Name: ${passData.visitor_name}\nTarget Unit: ${targetUnitNo} ${targetBuilding ? `(${targetBuilding})` : ''}\nPurpose: ${passData.purpose || 'Walk-in'}\nType: ${passData.visit_type || 'PERSON'}${passData.plate_number ? `\nPlate Number: ${passData.plate_number}` : ''}`,
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => {
              isProcessingScan.current = false;
            }
          },
          {
            text: "Confirm Entry", // Confirm Button
            onPress: async () => {
              await processVisitorEntry(passData.id, passData.visitor_name, passData.unit_id, passData.visit_type);
            }
          }
        ]
      );
    } catch (err) {
      Alert.alert("Scan Error", "Unable to read QR data.", [
        { text: "OK", onPress: () => {
          setIsCameraLive(false);
          isProcessingScan.current = false;
        } }
      ]);
    }
  };

  

  // 1. Camera capture and OCR processing function
const takeAddressPhoto = async () => {
  // Check if camera ref is ready
  if (!cameraRef.current) {
    Alert.alert("Error", "Camera is not ready yet.");
    return;
  }

  setLoading(true);
  try {
    const photo = await cameraRef.current.takePictureAsync({
      quality: 0.4, // Compress to improve upload speed
      base64: true,
    });

    if (photo && photo.base64) {
      await processAddressWithGemini(photo.base64);
    }
  } catch (error) {
    console.error(error);
    Alert.alert("Capture Failed", "An error occurred while capturing the photo.");
  } finally {
    setLoading(false);
  }
};

  const handleMarkAsDone = (itemId: string) => {
    setProcessedItems(prev => [...prev, itemId]);
    Alert.alert("Success", "Item marked as completed.");
  };

  const handleVisitorCheckoutAndBill = async (logId: string, visitorName: string, entryTime: string, plate: string) => {
    setLoading(true);
    try {
      if (!plate) {
        Alert.alert("Error", "Please enter plate number to checkout.");
        setLoading(false);
        return;
      }

      // 1. Search for an unclosed or resident-reported visitor log matching the plate number
      const { data: activeLog, error: activeLogError } = await supabase
        .from('visitor_logs')
        .select(`
          id, 
          access_time, 
          is_resident_reported, 
          resident_reported_exit_time, 
          visitor_passes!inner (unit_id, visitor_name)
        `)
        .eq('visitor_passes.plate_number', plate.trim().toUpperCase())
        .or('exit_time.is.null,is_resident_reported.eq.true')
        .order('access_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      let targetLogId = logId !== 'TEMP_LOG_ID' ? logId : (activeLog?.id || null);
      let targetUnitId = (activeLog?.visitor_passes as any)?.unit_id || null;
      let targetEntryTime = activeLog?.access_time || entryTime || new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      let targetVisitorName = (activeLog?.visitor_passes as any)?.visitor_name || visitorName || 'Guest';

      if (!targetUnitId) {
        // Fallback to registered vehicles table using plate
        const { data: vehicleData } = await supabase
          .from('vehicles')
          .select('unit_id')
          .eq('plate_number', plate.trim().toUpperCase())
          .maybeSingle();
        targetUnitId = vehicleData?.unit_id || null;
      }

      // 2. Calculate parking fee and check for cheating resident
      const exitTime = new Date().toISOString();
      let fee = 0;
      let isCheatingDetected = false;

      const baseFee = condoPolicy.base_parking_fee || 0;
      const hourlyRate = condoPolicy.visitor_parking_fee_per_hour;
      const maxDailyFee = condoPolicy.max_visitor_parking_fee;
      const gracePeriodMins = condoPolicy.parking_grace_period_mins;

      // Calculate total stayed minutes
      const stayedMins = Math.max(0, Math.floor((new Date(exitTime).getTime() - new Date(targetEntryTime).getTime()) / (1000 * 60)));

      if (plate === 'WALK-IN') {
        fee = 0;
      } else if (activeLog?.is_resident_reported) {
        // 🚨 Resident reported exit early to avoid fee but vehicle is physically leaving now!
        isCheatingDetected = true;
        // Apply daily recurring cap without grace period for cheating resident
        const days = Math.floor(stayedMins / (24 * 60));
        const remMins = stayedMins % (24 * 60);
        const remHours = Math.ceil(remMins / 60);
        const remHoursFee = remHours > 0 ? Math.min(baseFee + (remHours * hourlyRate), maxDailyFee) : 0;
        fee = (days * maxDailyFee) + remHoursFee;
      } else {
        if (!condoPolicy.visitor_parking_billing) {
          fee = 0;
        } else if (stayedMins <= gracePeriodMins) {
          // Parking Grace Period (free parking if exit is within the grace period)
          fee = 0;
        } else {
          // Standard stayed calculation with daily recurring cap:
          // (full 24h periods * maxDailyFee) + min(baseFee + remaining hours * hourlyRate, maxDailyFee)
          const days = Math.floor(stayedMins / (24 * 60));
          const remMins = stayedMins % (24 * 60);
          const remHours = Math.ceil(remMins / 60);
          const remHoursFee = remHours > 0 ? Math.min(baseFee + (remHours * hourlyRate), maxDailyFee) : 0;
          fee = (days * maxDailyFee) + remHoursFee;
        }
      }

      // 3. Update visitor_logs record
      if (!targetLogId) {
        Alert.alert("Checkout Error ❌", `No active check-in record found for plate ${plate}.`);
        setLoading(false);
        return;
      }

      const { error: logUpdateError } = await supabase
        .from('visitor_logs')
        .update({ 
          exit_time: exitTime, 
          parking_fee: fee, 
          is_paid: isCheatingDetected ? false : true, // Billed to unit if cheating detected
          is_resident_reported: false 
        })
        .eq('id', targetLogId);

      if (logUpdateError) {
        console.error("Log update error during checkout:", logUpdateError);
        throw logUpdateError;
      }

      // 4. Send record to billing ledger
      if (fee > 0 && targetUnitId) {
        const { error: billError } = await supabase.from('billings').insert([{
          unit_id: targetUnitId,
          total_due: fee,
          description: isCheatingDetected
            ? `Visitor Overstay Penalty (${plate}) - Adjusted: ₱${fee}`
            : `Visitor Parking (${plate}): ₱${fee}`,
          status: isCheatingDetected ? 'UNPAID' : 'PENDING',
          due_date: new Date().toISOString()
        }]);
        if (billError) throw billError;
      }

      // Notify the resident of vehicle exit and parking fee
      if (targetUnitId && !isCheatingDetected) {
        try {
          const { data: unitData } = await supabase
            .from('units')
            .select('unit_number')
            .eq('id', targetUnitId)
            .maybeSingle();
          const unitNo = unitData?.unit_number || 'Unknown';

          const title = fee > 0 ? "🚗 Visitor Vehicle Exited (Fee Charged)" : "🚗 Visitor Vehicle Exited";
          const message = fee > 0 
            ? `Visiting vehicle (${plate}) has exited. Parking fee of ₱${fee} has been billed to your unit.` 
            : `Visiting vehicle (${plate}) has exited the premises.`;
          const body = fee > 0
            ? `Visitor vehicle (${plate}) checked out. Parking fee of ₱${fee} has been charged.`
            : `Visitor vehicle (${plate}) checked out.`;

          await supabase.from('notifications').insert([{
            unit_id: targetUnitId,
            title,
            message,
            type: 'VISITOR',
            data: { plate, fee }
          }]);

          const { data: profiles } = await supabase
            .from('profiles')
            .select('expo_push_token')
            .eq('unit_id', targetUnitId);

          if (profiles && profiles.length > 0) {
            const pushMessages = profiles
              .map(p => p.expo_push_token)
              .filter((token): token is string => !!token)
              .map(token => ({
                to: token,
                sound: 'default',
                title,
                body,
                data: { type: 'VEHICLE_EXITED', plate, fee },
                badge: 1,
                channelId: 'default',
              }));

            if (pushMessages.length > 0) {
              await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                  'Accept-encoding': 'gzip, deflate',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(pushMessages),
              });
            }
          }
        } catch (notifErr) {
          console.error("Failed to notify resident of vehicle exit/billing:", notifErr);
        }
      }

      // 5. If resident cheated, send immediate push notification alerting them of the adjustment
      if (isCheatingDetected && targetUnitId) {
        try {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('expo_push_token')
            .eq('unit_id', targetUnitId);

          if (profiles && profiles.length > 0) {
            const pushMessages = profiles
              .map(p => p.expo_push_token)
              .filter((token): token is string => !!token)
              .map(token => ({
                to: token,
                sound: 'default',
                title: '🚗 Parking Charge Corrected',
                body: `Visitor stay fee adjusted to ₱${maxDailyFee}. Vehicle detected leaving gate after your self-reported time.`,
                data: { type: 'PARKING_CORRECTION', fee: maxDailyFee },
                badge: 1,
                channelId: 'default',
              }));

            if (pushMessages.length > 0) {
              await fetch('https://exp.host/--/api/v2/push/send', {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                  'Accept-encoding': 'gzip, deflate',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(pushMessages),
              });
            }
          }
        } catch (pushErr) {
          console.error("Failed to send parking correction notification:", pushErr);
        }
      }

      if (isCheatingDetected) {
        Alert.alert("Checkout Success 🚨", `Overstay detected. Penalty/Daily Cap of ₱${fee} applied to unit.`);
      } else {
        Alert.alert("Checkout Success", `Parking fee ₱${fee} applied to unit.`);
      }

      logGuardActivity("VEHICLE_OUT", `Vehicle ${plate} checked out. Fee: ₱${fee}. Cheated: ${isCheatingDetected}`);
      setInputPlate('');
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to process exit billing.");
    } finally {
      setLoading(false);
    }
  };

  // 🎯 Step-by-step status (Scan -> Unit/Photo -> Final Submit)
  const isPhotoStep = cameraTarget === 'PARCEL';

  const currentStep = !scanTracking.trim() ? 1 : (!scanUnit.trim() ? 2 : (!parcelPhoto ? 3 : 4));

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
    divider: '#cbd5e1',
    punchLogBg: '#ffffff',
    punchLogBorder: '#cbd5e1',
    punchDateText: '#0f172a',
    availableTowersBg: '#ffffff',
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Tactics Cockpit Header */}
      {/* Tactics Cockpit Header or Sub-Tab Navigation Header */}
      {activeTab === 'HOME' ? (
        <View style={[styles.header, { backgroundColor: themeColors.headerBg, borderBottomColor: themeColors.headerBorder }]}>
          <View style={styles.headerTextColumn}>
            <Text style={[styles.headerTitle, { color: themeColors.headerText }]}>🏢 {condoName}</Text>
            <Text style={styles.guardLabelLine}>{guardName}</Text>
            <Text style={styles.sectorLabelLine}>{condoPolicy.visitor_scope === 'MAIN_GATE_ONLY' ? 'Main Gate' : assignedBuilding}</Text>
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
              onPress={() => setIsOnDuty(!isOnDuty)}
            >
              <Text style={styles.giantDutyBadgeText}>{isOnDuty ? '🟢 ON-DUTY' : '🔴 OFF-DUTY'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={{
          height: 55,
          backgroundColor: '#ffffff',
          borderBottomWidth: 1,
          borderBottomColor: '#cbd5e1',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          justifyContent: 'space-between',
        }}>
          <TouchableOpacity 
            onPress={() => handleTabPress('HOME')} 
            style={{ flexDirection: 'row', alignItems: 'center', width: 80 }}
          >
            <Ionicons name="chevron-back" size={24} color="#0038a8" />
            <Text style={{ color: '#0038a8', fontSize: 16, fontWeight: '600', marginLeft: -4 }}>Back</Text>
          </TouchableOpacity>
          
          <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' }}>
            {activeTab === 'GATE' ? 'Gate' : activeTab === 'PARCEL' ? 'Parcel' : activeTab === 'RADIO' ? 'Radio' : 'My Page'}
          </Text>
          
          {activeTab === 'MY_PAGE' ? (
            <TouchableOpacity onPress={handleSignOut} style={{ width: 80, alignItems: 'flex-end' }}>
              <Ionicons name="log-out-outline" size={24} color="#ef4444" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 80 }} />
          )}
        </View>
      )}

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          const tabNames: ('HOME' | 'GATE' | 'PARCEL' | 'RADIO' | 'MY_PAGE')[] = ['HOME', 'GATE', 'PARCEL', 'RADIO', 'MY_PAGE'];
          if (tabNames[index]) {
            setActiveTab(tabNames[index]);
          }
        }}
        style={{ flex: 1 }}
      >
        {/* ==================== [TAB 0] HOME SCREEN ==================== */}
        <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
          <ScrollView 
            style={{ flex: 1, backgroundColor: themeColors.background }} 
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 90 }} 
            keyboardShouldPersistTaps="handled"
          >
            {/* Greeting Header */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 22, fontWeight: 'bold', color: themeColors.text, marginBottom: 5 }}>Welcome Back!</Text>
              <Text style={{ fontSize: 13, color: themeColors.mutedText }}>Duty Station: {condoPolicy.visitor_scope === 'MAIN_GATE_ONLY' ? 'Main Gate' : assignedBuilding}</Text>
            </View>

            {/* Grid layout for home cards */}
            <View style={styles.dashboardMetricsRow}>
              {/* Card 1: Gate Visitor Queue */}
              <TouchableOpacity 
                style={styles.dashboardMetricCard} 
                activeOpacity={0.8}
                onPress={() => {
                  handleTabPress('GATE');
                  setGateSubView('WALK_IN');
                  setTimeout(() => {
                    gateScrollRef.current?.scrollTo({ x: 0, animated: false });
                  }, 50);
                }}
              >
                <View style={styles.dashboardMetricHeader}>
                  <Ionicons name="people-outline" size={18} color="#0038a8" style={{ marginRight: 6 }} />
                  <Text style={styles.dashboardMetricLabel}>Visitor Pass</Text>
                </View>
                <Text style={styles.dashboardMetricValue}>
                  {walkInPasses.filter((p: any) => p.status === 'PENDING').length}
                </Text>
                <Text style={[styles.dashboardMetricSub, walkInPasses.filter((p: any) => p.status === 'PENDING').length > 0 ? { color: '#dc2626', fontWeight: '700' } : { color: '#64748b' }]}>
                  {walkInPasses.filter((p: any) => p.status === 'PENDING').length > 0 ? 'Pending Walk-ins' : 'No pending requests'}
                </Text>
              </TouchableOpacity>

              {/* Card 2: Overdue Parcels */}
              <TouchableOpacity 
                style={styles.dashboardMetricCard} 
                activeOpacity={0.8}
                onPress={() => {
                  handleTabPress('PARCEL');
                  setParcelSubView('RECEIVE');
                  setTimeout(() => {
                    parcelScrollRef.current?.scrollTo({ x: 0, animated: false });
                  }, 50);
                }}
              >
                <View style={styles.dashboardMetricHeader}>
                  <Ionicons name="cube-outline" size={18} color="#0038a8" style={{ marginRight: 6 }} />
                  <Text style={styles.dashboardMetricLabel}>Overdue Parcels</Text>
                </View>
                <Text style={styles.dashboardMetricValue}>
                  {dbParcels.filter(p => {
                    if (!p.created_at) return false;
                    const createdTime = new Date(p.created_at).getTime();
                    return (Date.now() - createdTime) > 24 * 60 * 60 * 1000;
                  }).length}
                </Text>
                <Text style={[styles.dashboardMetricSub, dbParcels.filter(p => {
                  if (!p.created_at) return false;
                  const createdTime = new Date(p.created_at).getTime();
                  return (Date.now() - createdTime) > 24 * 60 * 60 * 1000;
                }).length > 0 ? { color: '#dc2626', fontWeight: '700' } : { color: '#64748b' }]}>
                  {dbParcels.filter(p => {
                    if (!p.created_at) return false;
                    const createdTime = new Date(p.created_at).getTime();
                    return (Date.now() - createdTime) > 24 * 60 * 60 * 1000;
                  }).length > 0 ? 'Unclaimed >24h' : 'All packages current'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dashboardMetricsRow}>
              {/* Card 3: Radio Messages */}
              <TouchableOpacity 
                style={styles.dashboardMetricCard} 
                activeOpacity={0.8}
                onPress={() => handleTabPress('RADIO')}
              >
                <View style={styles.dashboardMetricHeader}>
                  <Ionicons name="chatbubbles-outline" size={18} color="#0038a8" style={{ marginRight: 6 }} />
                  <Text style={styles.dashboardMetricLabel}>Radio Chats</Text>
                </View>
                <Text style={styles.dashboardMetricValue}>{unreadRadioCount}</Text>
                <Text style={[styles.dashboardMetricSub, unreadRadioCount > 0 ? { color: '#dc2626', fontWeight: '700' } : { color: '#64748b' }]}>
                  {unreadRadioCount > 0 ? `${unreadRadioCount} unread` : 'No new messages'}
                </Text>
              </TouchableOpacity>

              {/* Card 4: Attendance Summary */}
              <TouchableOpacity 
                style={styles.dashboardMetricCard} 
                activeOpacity={0.8}
                onPress={() => {
                  handleTabPress('MY_PAGE');
                  setGuardSubTab('SHIFT');
                  setTimeout(() => {
                    myPageScrollRef.current?.scrollTo({ x: SCREEN_WIDTH, animated: false });
                  }, 50);
                }}
              >
                <View style={styles.dashboardMetricHeader}>
                  <Ionicons name="time-outline" size={18} color="#0038a8" style={{ marginRight: 6 }} />
                  <Text style={styles.dashboardMetricLabel}>Duty Stats</Text>
                </View>
                <Text style={styles.dashboardMetricValue}>
                  {new Set(attendanceData.map((a: any) => a.work_date)).size}d
                </Text>
                <Text style={[styles.dashboardMetricSub, { color: '#64748b' }]}>
                  {totals.regularHours + totals.otHours}h worked this month
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* ==================== [TAB 1] GATE MANAGEMENT ==================== */}
        <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
          {/* Sub Tab Selection Bar for Gate */}
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 10, marginBottom: 15 }}>
            <TouchableOpacity 
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: themeColors.inputBorder,
                backgroundColor: gateSubView === 'WALK_IN' ? '#0038a8' : themeColors.tabBg,
                alignItems: 'center'
              }}
              onPress={() => {
                setGateSubView('WALK_IN');
                gateScrollRef.current?.scrollTo({ x: 0, animated: true });
              }}
            >
              <Text style={{ color: gateSubView === 'WALK_IN' ? '#fff' : themeColors.text, fontWeight: 'bold', fontSize: 13 }}>🚶 Walk-in</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: themeColors.inputBorder,
                backgroundColor: gateSubView === 'VEHICLE' ? '#0038a8' : themeColors.tabBg,
                alignItems: 'center'
              }}
              onPress={() => {
                setGateSubView('VEHICLE');
                gateScrollRef.current?.scrollTo({ x: SCREEN_WIDTH, animated: true });
              }}
            >
              <Text style={{ color: gateSubView === 'VEHICLE' ? '#fff' : themeColors.text, fontWeight: 'bold', fontSize: 13 }}>🚗 Vehicle</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={gateScrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => {
              const offsetX = event.nativeEvent.contentOffset.x;
              const page = Math.round(offsetX / SCREEN_WIDTH);
              if (page === 0) {
                setGateSubView('WALK_IN');
              } else {
                setGateSubView('VEHICLE');
              }
            }}
            style={{ flex: 1 }}
          >
            {/* Page 1: Walk-in */}
            <View style={{ width: SCREEN_WIDTH }}>
              <ScrollView 
                style={{ flex: 1, backgroundColor: themeColors.background }} 
                contentContainerStyle={[styles.mainScroll, { paddingBottom: 90 }]} 
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.sectionTitle}>🎫 Visitor Pass</Text>
                <TouchableOpacity style={[styles.qrScannerLayout, { marginTop: 0, marginBottom: 15 }]} onPress={() => { setCameraTarget('GATE'); isProcessingScan.current = false; setIsCameraLive(true); }}>
                  <Text style={{ fontSize: 32 }}>📸</Text><Text style={styles.qrCenterLabel}>QR Scan</Text>
                </TouchableOpacity>

                <Text style={styles.sectionTitle}>💡 Express Manual Entry Dispatch</Text>
                <View style={styles.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                    <TextInput style={[styles.hugeInput, { flex: 0.4, fontSize: 13, textAlign: 'center' }]} value={manualVisitorType} onChangeText={setManualVisitorType} placeholder="Purpose (e.g. Grab)" placeholderTextColor="#64748b" />
                    <TextInput 
                      style={[styles.hugeInput, { flex: 0.55, fontSize: 13, textAlign: 'center' }]} 
                      keyboardType="number-pad" 
                      value={manualTargetUnit} 
                      onChangeText={setManualTargetUnit} 
                      placeholder="Target Unit" 
                      placeholderTextColor="#64748b" 
                      returnKeyType="done"
                      onSubmitEditing={() => Keyboard.dismiss()}
                      inputAccessoryViewID="guardTargetUnitAccessory"
                    />
                  </View>
                  {Platform.OS === 'ios' && (
                    <InputAccessoryView nativeID="guardTargetUnitAccessory">
                      <View style={{ 
                        backgroundColor: '#f1f5f9', 
                        paddingHorizontal: 16, 
                        paddingVertical: 8, 
                        flexDirection: 'row', 
                        justifyContent: 'flex-end', 
                        borderTopWidth: 1, 
                        borderColor: '#e2e8f0' 
                      }}>
                        <TouchableOpacity onPress={() => Keyboard.dismiss()}>
                          <Text style={{ color: '#0038a8', fontWeight: 'bold', fontSize: 15 }}>Done</Text>
                        </TouchableOpacity>
                      </View>
                    </InputAccessoryView>
                  )}
                  <TextInput style={[styles.hugeInput, { marginBottom: 12, fontSize: 13, textAlign: 'center' }]} value={manualVisitorName} onChangeText={setManualVisitorName} placeholder="Visitor Name (Optional)" placeholderTextColor="#64748b" />
                  
                  <TouchableOpacity style={styles.submitBtn} onPress={handleVisitorEntry}>
                    <Text style={styles.submitBtnText}>⚡ Visitor Entry</Text>
                  </TouchableOpacity>
                </View>
 
                <Text style={styles.sectionTitle}>📋 Walk-in Visitor Queue</Text>
                {walkInPasses.filter(p => p.visit_type === 'WALK_IN' || p.visit_type === 'PERSON' || !p.visit_type).length === 0 ? (
                  <Text style={{ color: themeColors.mutedText, textAlign: 'center', marginVertical: 20 }}>No pending walk-in visitors.</Text>
                ) : (
                  walkInPasses.filter(p => p.visit_type === 'WALK_IN' || p.visit_type === 'PERSON' || !p.visit_type).map(pass => {
                    const isPending = pass.status === 'PENDING';
                    const isApproved = pass.status === 'APPROVED';
                    const isEntered = pass.status === 'ENTERED' || pass.status === 'USED';
                    const isPreRegistered = !!pass.qr_code_value; // Resident created if QR value exists
                    
                    const createdTime = pass.created_at ? new Date(pass.created_at).getTime() : 0;
                    const timeElapsedMs = currentTime - createdTime;
                    const showResend = isPending && !isPreRegistered && (timeElapsedMs >= 120000);
                    
                    const remainingMs = 120000 - timeElapsedMs;
                    const remainingSecs = Math.max(0, Math.ceil(remainingMs / 1000));
                    const remainingText = remainingSecs > 60 
                      ? `Resend in ${Math.floor(remainingSecs / 60)}m ${remainingSecs % 60}s` 
                      : `Resend in ${remainingSecs}s`;

                    const unitNo = unitsMap[pass.unit_id]?.unit_number || 'N/A';
                    const building = unitsMap[pass.unit_id]?.building_no || 'N/A';

                    return (
                      <TouchableOpacity 
                        key={pass.id} 
                        style={[styles.card, { marginBottom: 10, padding: 12, opacity: isEntered ? 0.6 : 1.0 }]}
                        onPress={() => showVisitorPassDetails(pass)}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: themeColors.text, fontWeight: 'bold', fontSize: 15 }}>Unit {unitNo} ({building})</Text>
                            <Text style={{ color: themeColors.subtext, fontSize: 12, marginTop: 2 }}>
                              {pass.visitor_name}
                            </Text>
                            <Text style={{ color: themeColors.mutedText, fontSize: 11, marginTop: 2 }}>
                              Purpose: {pass.purpose || 'Walk-in Access'}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            {isPending && (
                              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                                <Text style={{ color: '#eab308', fontWeight: 'bold', fontSize: 12 }}>
                                  {isPreRegistered ? '🎫 PRE-REGISTERED' : '⏳ PENDING APPROVAL'}
                                </Text>
                                {!isPreRegistered && (
                                  showResend ? (
                                    <TouchableOpacity 
                                      style={{ backgroundColor: '#f97316', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}
                                      onPress={() => handleReRequestApproval(pass)}
                                    >
                                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>🔔 Resend Alert</Text>
                                    </TouchableOpacity>
                                  ) : (
                                    <Text style={{ color: themeColors.mutedText, fontSize: 10, fontStyle: 'italic' }}>
                                      {remainingText}
                                    </Text>
                                  )
                                )}
                              </View>
                            )}
                            {isApproved && (
                              <TouchableOpacity 
                                style={{ backgroundColor: '#16a34a', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                                onPress={() => processVisitorEntry(pass.id, pass.visitor_name, pass.unit_id, pass.visit_type)}
                              >
                                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>🟢 Permit Entry</Text>
                              </TouchableOpacity>
                            )}
                            {isEntered && <Text style={{ color: '#3b82f6', fontWeight: 'bold', fontSize: 12 }}>✔️ ENTERED PREMISES</Text>}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>

            {/* Page 2: Vehicle */}
            <View style={{ width: SCREEN_WIDTH }}>
              <ScrollView 
                style={{ flex: 1, backgroundColor: themeColors.background }} 
                contentContainerStyle={[styles.mainScroll, { paddingBottom: 90 }]} 
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.sectionTitle}>🎫 Visitor Pass</Text>
                <TouchableOpacity 
                  style={[styles.qrScannerLayout, { marginTop: 0, marginBottom: 15 }]} 
                  onPress={() => { setCameraTarget('GATE'); isProcessingScan.current = false; setIsCameraLive(true); }}
                >
                  <Text style={{ fontSize: 32 }}>📸</Text>
                  <Text style={styles.qrCenterLabel}>QR Scan</Text>
                </TouchableOpacity>

                <Text style={styles.sectionTitle}>🚗 Vehicle Control</Text>
                <View style={styles.card}>
                  <TextInput 
                    style={[styles.hugeInput, { marginBottom: 10 }]} 
                    keyboardType="number-pad" 
                    placeholder="Target Unit (e.g. 1204)" 
                    placeholderTextColor="#64748b" 
                    value={vehicleTargetUnit} 
                    onChangeText={setVehicleTargetUnit} 
                    returnKeyType="done"
                    onSubmitEditing={() => Keyboard.dismiss()}
                    inputAccessoryViewID="guardTargetUnitAccessory"
                  />
                  <TouchableOpacity 
                    style={{ backgroundColor: '#0038a8', paddingVertical: 10, borderRadius: 10, alignItems: 'center', marginBottom: 10, flexDirection: 'row', justifyContent: 'center', gap: 6 }} 
                    onPress={() => { setCameraTarget('PLATE'); isProcessingScan.current = false; setIsCameraLive(true); }}
                  >
                    <Text style={{ fontSize: 16 }}>📸</Text>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Scan License Plate</Text>
                  </TouchableOpacity>
                  <TextInput 
                    style={[styles.hugeInput, { marginBottom: 12 }]} 
                    placeholder="Scan / Enter Plate No (e.g. GHI1234)" 
                    placeholderTextColor="#64748b" 
                    value={inputPlate} 
                    onChangeText={setInputPlate} 
                  />
                  <View style={styles.dualRow}>
                    <TouchableOpacity style={[styles.gateBtn, { backgroundColor: '#16a34a' }]} onPress={handleVehicleEntry}>
                      <Text style={styles.gateBtnText}>▲ Vehicle-In</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.gateBtn, { backgroundColor: '#ef4444' }]} onPress={() => handleVisitorCheckoutAndBill('TEMP_LOG_ID', 'TEMP_NAME', new Date().toISOString(), inputPlate)}>
                      <Text style={styles.gateBtnText}>▼ Vehicle-Out</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={styles.sectionTitle}>📋 Vehicle Visitor Queue</Text>
                {walkInPasses.filter(p => p.visit_type === 'VEHICLE').length === 0 ? (
                  <Text style={{ color: themeColors.mutedText, textAlign: 'center', marginVertical: 20 }}>No recent vehicle visitors.</Text>
                ) : (
                  walkInPasses.filter(p => p.visit_type === 'VEHICLE').map(pass => {
                    const isPending = pass.status === 'PENDING';
                    const isApproved = pass.status === 'APPROVED';
                    const isEntered = pass.status === 'ENTERED' || pass.status === 'USED';
                    const isPreRegistered = !!pass.qr_code_value;
                    
                    const createdTime = pass.created_at ? new Date(pass.created_at).getTime() : 0;
                    const timeElapsedMs = currentTime - createdTime;
                    const showResend = isPending && !isPreRegistered && (timeElapsedMs >= 120000);
                    
                    const remainingMs = 120000 - timeElapsedMs;
                    const remainingSecs = Math.max(0, Math.ceil(remainingMs / 1000));
                    const remainingText = remainingSecs > 60 
                      ? `Resend in ${Math.floor(remainingSecs / 60)}m ${remainingSecs % 60}s` 
                      : `Resend in ${remainingSecs}s`;

                    const unitNo = unitsMap[pass.unit_id]?.unit_number || 'N/A';
                    const building = unitsMap[pass.unit_id]?.building_no || 'N/A';

                    return (
                      <TouchableOpacity 
                        key={pass.id} 
                        style={[styles.card, { marginBottom: 10, padding: 12, opacity: isEntered ? 0.6 : 1.0 }]}
                        onPress={() => showVisitorPassDetails(pass)}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: themeColors.text, fontWeight: 'bold', fontSize: 15 }}>Unit {unitNo} ({building})</Text>
                            <Text style={{ color: themeColors.subtext, fontSize: 12, marginTop: 2 }}>
                              {pass.visitor_name}
                            </Text>
                            <Text style={{ color: themeColors.mutedText, fontSize: 11, marginTop: 2 }}>
                              Purpose: {pass.purpose || 'Vehicle Access'}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            {isPending && (
                              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                                <Text style={{ color: '#eab308', fontWeight: 'bold', fontSize: 12 }}>
                                  {isPreRegistered ? '🎫 PRE-REGISTERED' : '⏳ PENDING APPROVAL'}
                                </Text>
                                {!isPreRegistered && (
                                  showResend ? (
                                    <TouchableOpacity 
                                      style={{ backgroundColor: '#f97316', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}
                                      onPress={() => handleReRequestApproval(pass)}
                                    >
                                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>🔔 Resend Alert</Text>
                                    </TouchableOpacity>
                                  ) : (
                                    <Text style={{ color: themeColors.mutedText, fontSize: 10, fontStyle: 'italic' }}>
                                      {remainingText}
                                    </Text>
                                  )
                                )}
                              </View>
                            )}
                            {isApproved && (
                              <TouchableOpacity 
                                style={{ backgroundColor: '#16a34a', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                                onPress={() => processVisitorEntry(pass.id, pass.visitor_name, pass.unit_id, pass.visit_type)}
                              >
                                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>🟢 Permit Entry</Text>
                              </TouchableOpacity>
                            )}
                            {isEntered && <Text style={{ color: '#3b82f6', fontWeight: 'bold', fontSize: 12 }}>✔️ ENTERED PREMISES</Text>}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </ScrollView>
        </View>

        {/* ==================== [TAB 2] PARCEL PROCESSING (REBUILD TRIGGER) ==================== */}
        <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
          {condoPolicy.parcel_delivery_policy === 'DIRECT_UNIT' ? (
            <ScrollView 
              style={{ flex: 1, backgroundColor: themeColors.background }} 
              contentContainerStyle={[styles.mainScroll, { paddingBottom: 90 }]} 
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.sectionTitle}>🏃‍♂️ Direct Courier Unit Entry Sentry</Text>
              <View style={styles.card}>
                <Text style={{ color: '#94a3b8', fontSize: 12, marginBottom: 12 }}>
                  Courier is permitted to deliver directly to resident units. Take a photo of the courier and log target units below.
                </Text>

                {/* Courier photo preview */}
                <TouchableOpacity style={styles.photoBox} onPress={captureCourierPhoto}>
                  {courierPhoto ? (
                    <Image source={{ uri: courierPhoto }} style={styles.previewImage} />
                  ) : (
                    <Text style={{ color: '#64748b' }}>+ Take Courier Photo *</Text>
                  )}
                </TouchableOpacity>

                {/* Target units input */}
                <Text style={styles.modalInputLabelMeta}>Target Units (Comma separated, e.g. 1204, 1502)</Text>
                <TextInput 
                  style={[styles.hugeInput, { marginBottom: 12 }]} 
                  value={directUnits} 
                  onChangeText={setDirectUnits} 
                  placeholder="e.g. 1204, 1502, 809"
                  placeholderTextColor="#64748b"
                />

                {/* Tracking details */}
                <Text style={styles.modalInputLabelMeta}>Carrier / Tracking (Optional)</Text>
                <TextInput 
                  style={[styles.hugeInput, { marginBottom: 16 }]} 
                  value={directTracking} 
                  onChangeText={setDirectTracking} 
                  placeholder="e.g. Lalamove, Grab Express"
                  placeholderTextColor="#64748b"
                />

                <TouchableOpacity style={[styles.submitBtn, { backgroundColor: '#ea580c' }]} onPress={submitDirectCourier}>
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitBtnText}>⚡ Dispatch Courier & Notify Units</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <View style={{ flex: 1 }}>
              {/* Sub Tab Selection Bar */}
              <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 10, marginBottom: 15 }}>
                <TouchableOpacity 
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: themeColors.inputBorder,
                    backgroundColor: parcelSubView === 'RECEIVE' ? '#0038a8' : themeColors.tabBg,
                    alignItems: 'center'
                  }}
                  onPress={() => {
                    setParcelSubView('RECEIVE');
                    parcelScrollRef.current?.scrollTo({ x: 0, animated: true });
                  }}
                >
                  <Text style={{ color: parcelSubView === 'RECEIVE' ? '#fff' : themeColors.text, fontWeight: 'bold', fontSize: 13 }}>📥 Receive</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: themeColors.inputBorder,
                    backgroundColor: parcelSubView === 'RELEASE' ? '#0038a8' : themeColors.tabBg,
                    alignItems: 'center'
                  }}
                  onPress={() => {
                    setParcelSubView('RELEASE');
                    parcelScrollRef.current?.scrollTo({ x: SCREEN_WIDTH, animated: true });
                  }}
                >
                  <Text style={{ color: parcelSubView === 'RELEASE' ? '#fff' : themeColors.text, fontWeight: 'bold', fontSize: 13 }}>📤 Release</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                ref={parcelScrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onMomentumScrollEnd={(event) => {
                  const offsetX = event.nativeEvent.contentOffset.x;
                  const page = Math.round(offsetX / SCREEN_WIDTH);
                  if (page === 0) {
                    setParcelSubView('RECEIVE');
                  } else {
                    setParcelSubView('RELEASE');
                  }
                }}
                style={{ flex: 1 }}
              >
                {/* Page 1: Receive */}
                <View style={{ width: SCREEN_WIDTH }}>
                  <ScrollView 
                    style={{ flex: 1, backgroundColor: themeColors.background }} 
                    contentContainerStyle={[styles.mainScroll, { paddingBottom: 90 }]} 
                    keyboardShouldPersistTaps="handled"
                  >
                    {/* 1. SCAN BARCODE / ENTER TRACKING */}
                    <View style={[styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
                      <Text style={[styles.modalInputLabelMeta, { color: themeColors.mutedText }]}>1. SCAN BARCODE / ENTER TRACKING</Text>
                      
                      <TouchableOpacity style={styles.scanBtn} onPress={() => { setCameraTarget('PARCEL'); isProcessingScan.current = false; setIsCameraLive(true); }}>
                        <Text style={styles.scanBtnText}>📸 Scan Barcode</Text>
                      </TouchableOpacity>

                      <TextInput 
                        style={[styles.modalInternalInput, { backgroundColor: themeColors.inputBg, color: themeColors.inputText, borderColor: themeColors.inputBorder, marginTop: 10 }]} 
                        value={scanTracking} 
                        onChangeText={setScanTracking} 
                        placeholder="Enter Tracking ID manually..."
                        placeholderTextColor={themeColors.mutedText}
                        onSubmitEditing={Keyboard.dismiss}
                        returnKeyType="done"
                      />
                    </View>

                    {/* 2. OCR & UNIT NUMBER INPUT */}
                    <View style={[styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
                      <Text style={[styles.modalInputLabelMeta, { color: themeColors.mutedText }]}>2. OCR & UNIT NUMBER INPUT</Text>
                      <View style={styles.unitRow}>
                         <TextInput 
                           style={[styles.unitInput, { backgroundColor: themeColors.inputBg, color: themeColors.inputText, borderColor: themeColors.inputBorder }]} 
                           value={scanUnit} 
                           onChangeText={(val) => { setScanUnit(val); }} 
                           placeholder="Unit Number (e.g. 1204)"
                           placeholderTextColor={themeColors.mutedText}
                           onSubmitEditing={Keyboard.dismiss}
                           returnKeyType="done"
                         />
                         <TouchableOpacity style={[styles.ocrBtn, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder }]} onPress={takeAddressPhoto}>
                           <Text style={styles.ocrBtnText}>🔍 OCR</Text>
                         </TouchableOpacity>
                      </View>
                    </View>

                    {/* 3. TAKE PARCEL PHOTO */}
                    <View style={[styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
                      <Text style={[styles.modalInputLabelMeta, { color: themeColors.mutedText }]}>3. TAKE PARCEL PHOTO</Text>
                      
                      {parcelPhoto === null ? (
                        <TouchableOpacity style={[styles.scanBtn, { backgroundColor: '#ea580c', borderColor: '#f97316' }]} onPress={captureParcelPhoto}>
                          <Text style={[styles.scanBtnText, { color: '#ffedd5' }]}>📸 Take Parcel Photo</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={{ alignItems: 'center', marginTop: 8 }}>
                          <Image source={{ uri: parcelPhoto }} style={{ width: 140, height: 180, borderRadius: 12, borderWidth: 1, borderColor: themeColors.cardBorder, marginBottom: 12 }} />
                          <TouchableOpacity style={[styles.scanBtn, { width: '100%', backgroundColor: '#334155', borderColor: '#475569', paddingVertical: 12 }]} onPress={captureParcelPhoto}>
                            <Text style={[styles.scanBtnText, { color: '#94a3b8', fontSize: 14 }]}>📸 Retake Photo</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>

                    {/* 4. SUBMIT & REGISTER */}
                    <View style={[styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
                      <Text style={[styles.modalInputLabelMeta, { color: themeColors.mutedText }]}>4. SUBMIT & REGISTER</Text>
                      
                      <TouchableOpacity 
                        style={[styles.submitBtn, { paddingVertical: 18, opacity: (scanTracking.trim() && scanUnit.trim() && parcelPhoto) ? 1 : 0.5 }]} 
                        onPress={handleAddParcelToSharedPool} 
                        disabled={loading || !(scanTracking.trim() && scanUnit.trim() && parcelPhoto)}
                      >
                        {loading ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={[styles.submitBtnText, { fontSize: 16 }]}>✅ Submit & Register Parcel</Text>
                        )}
                      </TouchableOpacity>
                    </View>

                    {bulkList.length > 0 && (
                      <View style={[styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
                        <Text style={[styles.queueCountHeader, { color: themeColors.text }]}>Temporary Batch Queue ({bulkList.length} items)</Text>
                        {bulkList.map((item, idx) => <Text key={idx} style={{ color: themeColors.subtext, fontSize: 12, marginVertical: 2 }}>📦 Queued Slot: Unit {item.unit} ➔ {item.tracking}</Text>)}
                        <TouchableOpacity style={styles.bulkSubmitBtn} onPress={handleDeployBulkToSharedInventory}><Text style={styles.bulkSubmitBtnText}>⚡ Deploy Bulk Notification & Push to Ledger</Text></TouchableOpacity>
                      </View>
                    )}
                  </ScrollView>
                </View>

                {/* Page 2: Release */}
                <View style={{ width: SCREEN_WIDTH }}>
                  <ScrollView 
                    style={{ flex: 1, backgroundColor: themeColors.background }} 
                    contentContainerStyle={[styles.mainScroll, { paddingBottom: 90 }]} 
                    keyboardShouldPersistTaps="handled"
                  >
                    {/* Premium Tower Dropdown & Unit input cards */}
                    <View style={[styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
                      <TouchableOpacity 
                        style={[styles.scanBtn, { backgroundColor: '#0038a8', borderColor: '#0038a8', marginBottom: 15 }]} 
                        onPress={() => { 
                          setCameraTarget('PARCEL_RELEASE'); 
                          isProcessingScan.current = false; 
                          setIsCameraLive(true); 
                        }}
                      >
                        <Text style={[styles.scanBtnText, { color: '#ffffff' }]}>📸 Scan Resident QR Code</Text>
                      </TouchableOpacity>

                      <Text style={[styles.modalInputLabelMeta, { color: themeColors.mutedText, marginBottom: 6 }]}>1. Filter by Tower</Text>
                      <TouchableOpacity 
                        style={[styles.modalInternalInput, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder }]} 
                        onPress={() => setIsTowerDropdownOpen(!isTowerDropdownOpen)}
                      >
                        <Text style={{ color: themeColors.text, fontWeight: '700' }}>
                          {selectedTowerFilter === 'ALL' ? 'All Towers' : selectedTowerFilter}
                        </Text>
                        <Text style={{ color: '#38bdf8', fontSize: 12 }}>{isTowerDropdownOpen ? '▲' : '▼'}</Text>
                      </TouchableOpacity>

                      {isTowerDropdownOpen && (
                        <View style={{ marginTop: 8, backgroundColor: themeColors.cardBg, borderRadius: 10, borderWidth: 1, borderColor: themeColors.inputBorder, overflow: 'hidden' }}>
                          <TouchableOpacity 
                            style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: themeColors.divider }}
                            onPress={() => {
                              setSelectedTowerFilter('ALL');
                              setIsTowerDropdownOpen(false);
                            }}
                          >
                            <Text style={{ color: themeColors.text, fontWeight: selectedTowerFilter === 'ALL' ? 'bold' : 'normal' }}>All Towers</Text>
                          </TouchableOpacity>
                          {availableTowers.map((tower) => (
                            <TouchableOpacity 
                              key={tower}
                              style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: themeColors.divider }}
                              onPress={() => {
                                setSelectedTowerFilter(tower);
                                setIsTowerDropdownOpen(false);
                              }}
                            >
                              <Text style={{ color: themeColors.text, fontWeight: selectedTowerFilter === tower ? 'bold' : 'normal' }}>{tower}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      <Text style={[styles.modalInputLabelMeta, { color: themeColors.mutedText, marginTop: 14, marginBottom: 6 }]}>2. Search Room Unit Number</Text>
                      <TextInput 
                        style={[styles.modalInternalInput, { backgroundColor: themeColors.inputBg, color: themeColors.inputText, borderColor: themeColors.inputBorder }]} 
                        value={unitFilterQuery} 
                        onChangeText={setUnitFilterQuery} 
                        placeholder="Type unit number..."
                        placeholderTextColor={themeColors.mutedText}
                        onSubmitEditing={Keyboard.dismiss}
                        returnKeyType="done"
                        keyboardType="numeric"
                      />
                    </View>

                    {/* Grouped Inventory Feed */}
                    <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>📋 All Parcels ({assignedBuilding})</Text>
                    <View style={[styles.queueContainer, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
                      {getGroupedParcels().filter(g => !processedItems.includes(g.unit)).length > 0 ? (
                        getGroupedParcels()
                          .filter(g => !processedItems.includes(g.unit)) 
                          .map((group) => (
                          <View key={group.unit} style={[styles.parcelSharedRowCard, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder }]}>
                            <View style={{ flex: 0.72 }}>
                              <Text style={{ color: themeColors.text, fontWeight: '900', fontSize: 15 }}>📍 Resident Unit {group.unit} ({group.building_no})</Text>
                              <View style={styles.parcelCountBadge}>
                                <Text style={styles.parcelCountBadgeText}>📦 {group.count} {group.count > 1 ? 'Parcels' : 'Parcel'} Holding</Text>
                              </View>
                            </View>
                            <View style={{ flex: 0.28, alignItems: 'flex-end' }}>
                              <TouchableOpacity style={styles.rowReleaseBtn} onPress={() => handleOpenUnitSignatureGate(group.unit, group.parcels)}>
                                <Text style={{ color: '#0f172a', fontSize: 11, fontWeight: '900' }}>✍️ RELEASE</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))
                      ) : (
                        <Text style={{ color: themeColors.mutedText, fontSize: 12, textAlign: 'center', paddingVertical: 20 }}>No holding inventory matches this query.</Text>
                      )}
                    </View>
                  </ScrollView>
                </View>
              </ScrollView>
            </View>
          )}
        </View>

        {/* ==================== [TAB 3] RADIO MANAGEMENT ==================== */}
        <View style={{ width: SCREEN_WIDTH, flex: 1, paddingBottom: 70, padding: 16 }}>
          <RadioModule guardName={guardName} processedItems={processedItems} assignedBuilding={assignedBuilding} themeMode={themeMode} channel="SECURITY" />
        </View>

        {/* ==================== [TAB 4] MY PAGE ==================== */}
        <View style={{ width: SCREEN_WIDTH, flex: 1, backgroundColor: themeColors.background }}>
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 16, marginBottom: 15 }}>
            <TouchableOpacity 
              onPress={() => {
                setGuardSubTab('LOGS');
                myPageScrollRef.current?.scrollTo({ x: 0, animated: true });
              }} 
              style={[styles.periodChip, { flex: 1, backgroundColor: guardSubTab === 'LOGS' ? '#0038a8' : themeColors.cardBg, borderColor: themeColors.cardBorder, borderWidth: 1 }]}
            >
              <Text style={{ color: guardSubTab === 'LOGS' ? '#fff' : themeColors.text, textAlign: 'center', fontWeight: 'bold', fontSize: 13 }}>Logs</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => {
                setGuardSubTab('SHIFT');
                myPageScrollRef.current?.scrollTo({ x: SCREEN_WIDTH, animated: true });
              }} 
              style={[styles.periodChip, { flex: 1, backgroundColor: guardSubTab === 'SHIFT' ? '#0038a8' : themeColors.cardBg, borderColor: themeColors.cardBorder, borderWidth: 1 }]}
            >
              <Text style={{ color: guardSubTab === 'SHIFT' ? '#fff' : themeColors.text, textAlign: 'center', fontWeight: 'bold', fontSize: 13 }}>Shift</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => {
                setGuardSubTab('PAYROLL');
                myPageScrollRef.current?.scrollTo({ x: SCREEN_WIDTH * 2, animated: true });
              }} 
              style={[styles.periodChip, { flex: 1, backgroundColor: guardSubTab === 'PAYROLL' ? '#0038a8' : themeColors.cardBg, borderColor: themeColors.cardBorder, borderWidth: 1 }]}
            >
              <Text style={{ color: guardSubTab === 'PAYROLL' ? '#fff' : themeColors.text, textAlign: 'center', fontWeight: 'bold', fontSize: 13 }}>Payroll</Text>
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
                setGuardSubTab('LOGS');
              } else if (page === 1) {
                setGuardSubTab('SHIFT');
              } else {
                setGuardSubTab('PAYROLL');
              }
            }}
            style={{ flex: 1 }}
          >
            {/* Page 1: Logs */}
            <View style={{ width: SCREEN_WIDTH }}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 90 }} keyboardShouldPersistTaps="handled">
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
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 90 }} keyboardShouldPersistTaps="handled">
                <ShiftModule 
                  themeMode={themeMode} 
                  attendanceData={attendanceData} 
                  currentYear={currentYear} 
                  currentMonth={currentMonth} 
                />
                

              </ScrollView>
            </View>

            {/* Page 3: Payroll */}
            <View style={{ width: SCREEN_WIDTH }}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 90 }} keyboardShouldPersistTaps="handled">
                {/* 📅 interactive calendar overlay inside cockpit */}
                <View style={[styles.calendarCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
                  <View style={styles.calendarNavHeader}>
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
                <Text style={styles.sectionTitle}>💰 Monthly Earnings & Summary</Text>
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

      {/* 🎯 ✍️ [Batch signature integrated security modal reform] */}
      <Modal animationType="fade" transparent={true} visible={isSignatureModalOpen}>
        <View style={styles.centeredModalOverlay}>
          <View style={[styles.card, { width: '92%', padding: 20 }]}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 20 }}>
              FINAL HANDOVER: {selectedUnit}
            </Text>

            {/* Step 1: Input name */}
            <Text style={styles.modalInputLabelMeta}>1. Actual Claimant Name *</Text>
            <TextInput 
              placeholder="Type receiver's legal name..." 
              placeholderTextColor="#475569"
              value={claimantName}
              onChangeText={setClaimantName}
              style={styles.modalInternalInput}
              onSubmitEditing={Keyboard.dismiss}
              returnKeyType="done"
            />

            {/* Step 2: Show signature pad after confirming name input */}
            {claimantName.trim().length > 0 ? (
              <>
                <Text style={[styles.modalInputLabelMeta, { marginTop: 20 }]}>2. Signature for: {claimantName}</Text>
                <View 
                  onTouchStart={Keyboard.dismiss}
                  style={{ height: 200, width: '100%', borderWidth: 1, borderColor: '#334155', borderRadius: 12 }}
                >
                  <SignatureScreen
                    ref={signatureRef}
                    descriptionText="Sign here"
                    onOK={(signature) => {
                      // 🎯 Change status explicitly here
                      setIsSignatureDrawn(true);
                      console.log("Signature capture successful, status changed");
                      // 🎯 Call auth logic immediately here!
                      proceedWithHandover();
                    }}
                    onEmpty={() => {
                      console.log("Signature is empty");
                      Alert.alert("Signature Required ✍️", "Please sign on the canvas to proceed.");
                    }}
                    webStyle={`
                      .m-signature-pad { box-shadow: none; border: none; }
                      .m-signature-pad--body { border: none; }
                    `}
                  />
                </View>
                
                <Text style={{ color: '#94a3b8', fontSize: 11, textAlign: 'center', marginTop: 8, fontStyle: 'italic', fontWeight: 'bold' }}>
                  * Please write your name inside the signature box.
                </Text>

                <TouchableOpacity 
                  style={[styles.bulkSubmitBtn, { backgroundColor: '#10b981' }]} 
                  onPress={handleBatchReleaseWithSingleSignature}
                >
                  <Text style={styles.bulkSubmitBtnText}>Verify & Authorize Handover</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={{ color: '#94a3b8', textAlign: 'center', marginTop: 20 }}>Please enter the name to enable signature.</Text>
            )}

            <TouchableOpacity style={{ marginTop: 15 }} onPress={() => setIsSignatureModalOpen(false)}>
              <Text style={{ color: '#ef4444', textAlign: 'center' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" transparent={false} visible={isCameraLive}>
        <SafeAreaView style={styles.container}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a', paddingHorizontal: 20 }}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 30 }}>
              {cameraTarget === 'PARCEL' ? 'Scan Parcel Barcode' : cameraTarget === 'PLATE' ? 'Scan License Plate' : cameraTarget === 'PARCEL_RELEASE' ? 'Scan Resident Parcel QR' : 'Scan Guest QR Pass'}
            </Text>
            
            {permission?.granted ? (
              <View style={{ height: 350, width: '100%', overflow: 'hidden', borderRadius: 20, borderWidth: 2, borderColor: '#38bdf8' }}>
                {/* 🎯 Photo capture guide overlay */}
                {isPhotoStep && (
                  <View style={styles.overlayTextContainer}>
                    <Text style={styles.overlayText}>PLEASE CAPTURE THE PACKAGE</Text>
                  </View>
                )}

                <CameraView
                  ref={cameraRef}
                  style={{ flex: 1 }}
                  facing="back"
                  onBarcodeScanned={cameraTarget === 'PLATE' ? undefined : async ({ data }) => {
                    if (isProcessingScan.current || !isCameraLive) return;
                    isProcessingScan.current = true;

                    if (cameraTarget === 'PARCEL') {
                      setIsCameraLive(false);
                      setScanTracking(data);
                      isProcessingScan.current = false;
                      try {
                        // Search for mapped unit based on tracking number in DB
                        const { data: unitData } = await supabase
                          .from('delivery_mapping') 
                          .select('unit_number')
                          .eq('tracking_id', data)
                          .single();

                        if (unitData) {
                          setScanUnit(unitData.unit_number);
                          Alert.alert("Auto Mapped 🎯", `Unit ${unitData.unit_number} automatically matched.`);
                        }
                      } catch (e) {
                        // Silently pass for manual input if mapping fails
                      }
                    } else if (cameraTarget === 'PARCEL_RELEASE') {
                      await handleParcelReleaseScan(data);
                    } else {
                      await handleQrVerification(data);
                      // isProcessingScan.current is intentionally left as true here and will be reset to false in the Alert's OK button press to lock further camera scans until dismissed.
                    }
                  }}
                />
                
                {/* 🎯 Scan guideline overlay */}
                <View style={StyleSheet.absoluteFillObject}>
                  <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)' }} />
                  {cameraTarget === 'PLATE' ? (
                    <View style={{ flexDirection: 'row', height: 100 }}>
                      <View style={{ flex: 0.05, backgroundColor: 'rgba(15, 23, 42, 0.5)' }} />
                      <View style={{ flex: 0.9, borderColor: '#10b981', borderWidth: 2, backgroundColor: 'transparent' }} />
                      <View style={{ flex: 0.05, backgroundColor: 'rgba(15, 23, 42, 0.5)' }} />
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', height: 180 }}>
                      <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)' }} />
                      <View style={{ width: 250, borderColor: '#10b981', borderWidth: 2, backgroundColor: 'transparent' }} />
                      <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)' }} />
                    </View>
                  )}
                  <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)' }} />
                </View>
              </View>
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: '#fff', marginBottom: 20 }}>Camera permission is required.</Text>
                <TouchableOpacity style={styles.bulkSubmitBtn} onPress={requestPermission}>
                  <Text style={styles.bulkSubmitBtnText}>Grant Permission</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 📸 Custom Scan Button for Plate OCR */}
            {cameraTarget === 'PLATE' && (
              <TouchableOpacity 
                disabled={loading}
                style={{ 
                  backgroundColor: loading ? '#64748b' : '#10b981', 
                  paddingHorizontal: 24, 
                  paddingVertical: 12, 
                  borderRadius: 12, 
                  marginTop: 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8
                }}
                onPress={async () => {
                  if (!cameraRef.current) {
                    Alert.alert("Error", "Camera is not ready yet.");
                    return;
                  }
                  if (isProcessingScan.current) return;
                  isProcessingScan.current = true;
                  setLoading(true);
                  try {
                    const photo = await cameraRef.current.takePictureAsync({
                      quality: 0.3,
                      base64: true,
                    });
                    if (photo && photo.base64) {
                      const recognized = await processPlateWithGemini(photo.base64);
                      if (recognized) {
                        setInputPlate(recognized);
                        Alert.alert("License Plate Recognized 📸", `Recognized Plate Number: ${recognized}`);
                        setIsCameraLive(false);
                      } else {
                        Alert.alert("OCR Failed ⚠️", "Could not recognize plate number. Please enter manually.");
                      }
                    } else {
                      Alert.alert("Error", "Failed to capture image.");
                    }
                  } catch (err: any) {
                    console.error("Camera Capture OCR Error:", err);
                    Alert.alert("Error", `Capture failed: ${err.message}`);
                  } finally {
                    setLoading(false);
                    isProcessingScan.current = false;
                  }
                }}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ fontSize: 18 }}>📸</Text>
                )}
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                  {loading ? 'Processing OCR...' : 'Capture & Scan Plate'}
                </Text>
              </TouchableOpacity>
            )}

            <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 30, textAlign: 'center' }}>
              {cameraTarget === 'PLATE'
                ? 'Align the vehicle license plate within the green horizontal frame and tap Capture.'
                : 'Align the barcode or QR code within the green frame to scan.'}
            </Text>
          </View>

          <TouchableOpacity style={styles.closeCameraBtn} onPress={() => setIsCameraLive(false)}>
            <Text style={styles.bulkSubmitBtnText}>Cancel Scan</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>

      {/* Tabs */}
<View style={[styles.bottomTabsLayout, { backgroundColor: themeColors.tabBg, borderTopColor: themeColors.tabBorder }]}>
  <TouchableOpacity style={[styles.tabItem, activeTab === 'HOME' && { backgroundColor: themeColors.activeTabBg }]} onPress={() => handleTabPress('HOME')}>
    <Text style={{ fontSize: 18 }}>🏠</Text>
    <Text style={[styles.tabItemLabel, { color: activeTab === 'HOME' ? '#38bdf8' : themeColors.tabItemLabel }]}>HOME</Text>
  </TouchableOpacity>

  <TouchableOpacity style={[styles.tabItem, activeTab === 'GATE' && { backgroundColor: themeColors.activeTabBg }]} onPress={() => handleTabPress('GATE')}>
    <Text style={{ fontSize: 18 }}>🚗</Text>
    <Text style={[styles.tabItemLabel, { color: activeTab === 'GATE' ? '#38bdf8' : themeColors.tabItemLabel }]}>GATE</Text>
    {walkInPasses.filter((p: any) => p.status === 'PENDING').length > 0 && (
      <View style={styles.tabAbsoluteBadge}>
        <Text style={styles.tabAbsoluteBadgeText}>{walkInPasses.filter((p: any) => p.status === 'PENDING').length}</Text>
      </View>
    )}
  </TouchableOpacity>
 
  <TouchableOpacity style={[styles.tabItem, activeTab === 'PARCEL' && { backgroundColor: themeColors.activeTabBg }]} onPress={() => handleTabPress('PARCEL')}>
    <Text style={{ fontSize: 18 }}>📦</Text>
    <Text style={[styles.tabItemLabel, { color: activeTab === 'PARCEL' ? '#38bdf8' : themeColors.tabItemLabel }]}>PARCEL</Text>
    {dbParcels.filter((p: any) => p.status === 'ARRIVED' || p.status === 'HOLDING').length > 0 && (
      <View style={styles.tabAbsoluteBadge}>
        <Text style={styles.tabAbsoluteBadgeText}>{dbParcels.filter((p: any) => p.status === 'ARRIVED' || p.status === 'HOLDING').length}</Text>
      </View>
    )}
  </TouchableOpacity>
 
  <TouchableOpacity style={[styles.tabItem, activeTab === 'RADIO' && { backgroundColor: themeColors.activeTabBg }]} onPress={() => handleTabPress('RADIO')}>
    <Text style={{ fontSize: 18 }}>💬</Text>
    <Text style={[styles.tabItemLabel, { color: activeTab === 'RADIO' ? '#38bdf8' : themeColors.tabItemLabel }]}>RADIO</Text>
    {unreadRadioCount > 0 && <View style={styles.tabAbsoluteBadge}><Text style={styles.tabAbsoluteBadgeText}>{unreadRadioCount}</Text></View>}
  </TouchableOpacity>
 
  {/* 🎯 MY PAGE Tab */}
  <TouchableOpacity style={[styles.tabItem, activeTab === 'MY_PAGE' && { backgroundColor: themeColors.activeTabBg }]} onPress={() => handleTabPress('MY_PAGE')}>
    <Text style={{ fontSize: 18 }}>👤</Text>
    <Text style={[styles.tabItemLabel, { color: activeTab === 'MY_PAGE' ? '#38bdf8' : themeColors.tabItemLabel }]}>MY PAGE</Text>
  </TouchableOpacity>
</View>
      {Platform.OS === 'ios' && (
        <>
          <InputAccessoryView nativeID="guardTargetUnitAccessory">
            <View style={{ 
              backgroundColor: '#f1f5f9', 
              paddingHorizontal: 16, 
              paddingVertical: 8, 
              flexDirection: 'row', 
              justifyContent: 'flex-end', 
              borderTopWidth: 1, 
              borderColor: '#e2e8f0' 
            }}>
              <TouchableOpacity onPress={() => Keyboard.dismiss()}>
                <Text style={{ color: '#0038a8', fontWeight: 'bold', fontSize: 15 }}>Done</Text>
              </TouchableOpacity>
            </View>
          </InputAccessoryView>

          <InputAccessoryView nativeID="guardUnitSearchAccessory">
            <View style={{ 
              backgroundColor: '#f1f5f9', 
              paddingHorizontal: 16, 
              paddingVertical: 8, 
              flexDirection: 'row', 
              justifyContent: 'flex-end',
              borderTopWidth: 1, 
              borderColor: '#e2e8f0' 
            }}>
              <TouchableOpacity onPress={() => Keyboard.dismiss()}>
                <Text style={{ color: '#0038a8', fontWeight: 'bold', fontSize: 15 }}>Done</Text>
              </TouchableOpacity>
            </View>
          </InputAccessoryView>
        </>
      )}
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
  mainScroll: { padding: 16, paddingBottom: 90 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#64748b', marginTop: 20, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: '#ffffff', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 15 },
  hugeInput: { backgroundColor: '#ffffff', borderRadius: 12, padding: 14, color: '#0f172a', fontSize: 15, fontWeight: '700', borderWidth: 1, borderColor: '#cbd5e1' },
  dualRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  gateBtn: { flex: 0.48, padding: 14, borderRadius: 12, alignItems: 'center' },
  gateBtnText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  qrScannerLayout: { backgroundColor: '#ffffff', borderStyle: 'dashed', borderWidth: 2, borderColor: '#cbd5e1', borderRadius: 20, padding: 30, alignItems: 'center', justifyContent: 'center' },
  qrCenterLabel: { color: '#0038a8', fontSize: 12, fontWeight: '700', marginTop: 8 },
  addQueueBtn: { backgroundColor: '#0038a8', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  addQueueBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  trackingText: { color: '#0f172a', fontSize: 14, fontWeight: '700', marginBottom: 12 },
  unitRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  unitInput: { backgroundColor: '#ffffff', borderRadius: 12, padding: 14, color: '#0f172a', fontSize: 15, fontWeight: '700', borderWidth: 1, borderColor: '#cbd5e1', flex: 0.7 },
  scanBtn: { backgroundColor: '#e0f2fe', paddingVertical: 20, borderRadius: 16, alignItems: 'center', borderWidth: 2, borderColor: '#0038a8', borderStyle: 'dashed' },
  scanBtnText: { color: '#0038a8', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  submitBtn: { backgroundColor: '#10b981', paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  topScanBtn: { backgroundColor: '#e0f2fe', paddingVertical: 20, borderRadius: 16, alignItems: 'center', marginBottom: 16, borderWidth: 2, borderColor: '#0038a8', borderStyle: 'dashed' },
  topScanBtnText: { color: '#0038a8', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  dataDisplayBox: { backgroundColor: '#ffffff', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 16 },
  trackingLabelText: { color: '#475569', fontSize: 14, fontWeight: '700' },
  ocrBtn: { backgroundColor: '#ffffff', paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1' },
  ocrBtnText: { color: '#0038a8', fontSize: 13, fontWeight: '700' },
  finalSubmitBtn: { backgroundColor: '#10b981', paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginBottom: 16 },
  finalSubmitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  bottomTabsLayout: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 70, backgroundColor: '#ffffff', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#cbd5e1', paddingBottom: Platform.OS === 'ios' ? 15 : 5 },
  tabItem: { alignItems: 'center', flex: 1, paddingVertical: 10 },
  activeTabItem: { backgroundColor: '#f1f5f9' },
  tabItemLabel: { color: '#475569', fontSize: 10, fontWeight: '700', marginTop: 4 },
  radioToggleContainer: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#e2e8f0', padding: 4, borderRadius: 14, marginBottom: 16, borderWidth: 1, borderColor: '#cbd5e1' },
  radioTabBtn: { flex: 0.49, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  activeRadioTabBtn: { backgroundColor: '#0038a8', borderWidth: 1, borderColor: '#0038a8' },
  radioTabBtnText: { color: '#475569', fontSize: 12, fontWeight: '800' },
  activeRadioTabBtnText: { color: '#fff' },
  unitRoomCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 10 },
  unitCardMainSection: { flexDirection: 'row', alignItems: 'flex-start', flex: 0.82 },
  unitCardTextWrapper: { marginLeft: 12, flex: 1 }, 
  unitAvatarCircle: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1', marginTop: 2 },
  modalChatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#cbd5e1', paddingBottom: 16 },
  modalCloseBtn: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1' },
  inlineBadge: { backgroundColor: '#ce1126', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginLeft: 6 },
  inlineBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  tabAbsoluteBadge: { position: 'absolute', top: 4, right: 24, backgroundColor: '#ce1126', width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  tabAbsoluteBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  collaborationBadgeContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  collaborationMiniBadge: { fontSize: 10, color: '#16a34a', backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, overflow: 'hidden', fontWeight: '700', marginRight: 4, marginTop: 4 },
  calendarCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 15 },
  calendarNavHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 8 },
  navArrowText: { color: '#0038a8', fontSize: 15, paddingHorizontal: 12, fontWeight: '900' },
  monthHeader: { color: '#0f172a', fontSize: 13, fontWeight: '800' },
  calDayBox: { width: 55, height: 65, backgroundColor: '#f1f5f9', borderRadius: 12, marginRight: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1' },
  calDayText: { color: '#0f172a', fontSize: 12, fontWeight: '700' },
  calDutyLabel: { color: '#475569', fontSize: 9, marginTop: 4, fontWeight: '600' },
  periodRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  periodChip: { flex: 0.48, padding: 12, backgroundColor: '#ffffff', borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1' },
  activePeriodChip: { backgroundColor: '#0038a8', borderColor: '#0038a8' },
  periodText: { color: '#475569', fontSize: 11, fontWeight: '700' },
  activePeriodText: { color: '#fff' },
  punchLogItem: { backgroundColor: '#ffffff', padding: 14, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#cbd5e1' },
  punchHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  punchDateText: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  punchDurationBadge: { color: '#0038a8', fontSize: 11, fontWeight: '700', backgroundColor: '#e0f2fe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  punchTimeDetail: { color: '#475569', fontSize: 12, marginTop: 6, fontWeight: '500' },
  gridWeekHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  gridWeekHeaderText: { color: '#64748b', fontSize: 11, fontWeight: '900', width: '13%', textAlign: 'center' },
  gridCalendarContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  gridDayBox: { width: '13%', height: 50, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginHorizontal: '0.6%', marginVertical: 4, borderWidth: 1 },
  gridDayBoxBlank: { width: '13%', height: 50, marginHorizontal: '0.6%', marginVertical: 4 }, 
  gridDayBoxWorked: { backgroundColor: '#dcfce7', borderColor: '#86efac' }, 
  gridDayBoxOff: { backgroundColor: '#ffffff', borderColor: '#cbd5e1' }, 
  gridDayText: { fontSize: 12, fontWeight: '700' },
  gridDayTextWorked: { color: '#16a34a' },
  gridDayTextOff: { color: '#475569' },
  gridDayStatusSub: { fontSize: 8, marginTop: 2, fontWeight: '600' },
  queueContainer: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#cbd5e1', marginTop: 10 },
  queueCountHeader: { color: '#0f172a', fontSize: 12, fontWeight: '800', marginBottom: 8, textTransform: 'uppercase' },
  bulkSubmitBtn: { backgroundColor: '#f97316', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 14 },
  bulkSubmitBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  centeredModalOverlay: { flex: 1, backgroundColor: 'rgba(9,13,22,0.5)', justifyContent: 'center', alignItems: 'center' },
  parcelSharedRowCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff', padding: 14, borderRadius: 14, marginVertical: 6, borderWidth: 1, borderColor: '#cbd5e1' },
  rowReleaseBtn: { backgroundColor: '#38bdf8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  parcelCountBadge: { backgroundColor: '#ffedd5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start', marginTop: 6, borderWidth: 1, borderColor: '#f97316' },
  parcelCountBadgeText: { color: '#ea580c', fontSize: 10, fontWeight: '800' },
  modalMiniParcelRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#ffffff', padding: 8, borderRadius: 8, marginVertical: 3, borderWidth: 1, borderColor: '#cbd5e1' },
  sosGiganticButton: { backgroundColor: '#fee2e2', borderWidth: 2, borderColor: '#ef4444', padding: 14, borderRadius: 14, alignItems: 'center', marginBottom: 16 },
  sosButtonText: { color: '#b91c1c', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },

  // 🎯 Custom style spectrum for guard mobile layout
  modalInputLabelMeta: { color: '#64748b', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  modalInternalInput: { backgroundColor: '#ffffff', borderRadius: 10, padding: 12, color: '#0f172a', fontSize: 14, fontWeight: '700', borderWidth: 1, borderColor: '#cbd5e1' },
  modalFakeDropdownContainer: { backgroundColor: '#ffffff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#cbd5e1' },
  miniSelectChip: { backgroundColor: '#ffffff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#cbd5e1', marginRight: 6 },
  activeMiniChip: { backgroundColor: '#ea580c', borderColor: '#f97316' },
  chipText: { color: '#475569', fontSize: 11, fontWeight: '700' },
  proxyRequiredBoxContainer: { backgroundColor: '#fff7ed', padding: 12, borderRadius: 12, borderColor: '#ffedd5', borderWidth: 1, marginVertical: 10 },
  proxyCodeInputField: { backgroundColor: '#ffffff', borderRadius: 8, padding: 10, color: '#ea580c', fontSize: 14, fontWeight: '900', borderWidth: 1, borderColor: '#f97316', textAlign: 'center', letterSpacing: 1 },
  modalSignatureCanvasBlock: { width: '100%', height: 90, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', marginTop: 4, overflow: 'hidden' },
  signaturePromptText: { color: '#475569', fontSize: 11, fontWeight: '600', textAlign: 'center', paddingHorizontal: 16 },
  signatureVectorFrame: { width: '100%', height: '100%', backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  signatureStampTag: { position: 'absolute', bottom: 4, right: 6, fontSize: 7, fontWeight: '900', color: '#2563eb', borderColor: '#2563eb', borderWidth: 1, paddingHorizontal: 3, borderRadius: 2 },
  clearCanvasLinkBtn: { color: '#ef4444', fontSize: 11, fontWeight: '700', textDecorationLine: 'underline', alignSelf: 'flex-end', marginTop: 4 },
  closeCameraBtn: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: '#ef4444', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 12, alignItems: 'center', zIndex: 10 },
  
  // 🎯 Newly added UI style
  stepContainer: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#ffffff', paddingVertical: 14, paddingHorizontal: 10, borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#cbd5e1' },
  stepText: { color: '#475569', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  activeStepText: { color: '#10b981' }, 
  overlayTextContainer: { position: 'absolute', top: '20%', alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.9)', padding: 15, borderRadius: 10, zIndex: 10, borderWidth: 1, borderColor: '#cbd5e1' },
  overlayText: { color: '#0f172a', fontSize: 15, fontWeight: 'bold' },
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
  },

  // Direct Courier Photo Styles
  photoBox: { height: 120, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center', borderRadius: 12, marginBottom: 15, borderWidth: 1, borderColor: '#cbd5e1', borderStyle: 'dashed' },
  previewImage: { width: '100%', height: '100%', borderRadius: 12, resizeMode: 'cover' },

  // Earnings details styles
  payrollCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#cbd5e1', marginBottom: 15 },
  payrollRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#cbd5e1' },
  payrollLabel: { color: '#475569', fontSize: 13, fontWeight: '600' },
  payrollValue: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  totalRow: { borderBottomWidth: 0, marginTop: 10, paddingTop: 10 },
  totalLabel: { color: '#0038a8', fontSize: 14, fontWeight: '800' },
  totalValue: { color: '#16a34a', fontSize: 16, fontWeight: '900' },

  // Payslip banner styles
  payslipBanner: { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac', borderRadius: 12, padding: 14, marginBottom: 20 },
  payslipBannerTitle: { color: '#16a34a', fontSize: 13, fontWeight: '800', marginBottom: 4 },
  payslipBannerText: { color: '#14532d', fontSize: 11, lineHeight: 16 },

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
  }
});