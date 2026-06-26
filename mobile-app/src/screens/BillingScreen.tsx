import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert, 
  ScrollView, 
  Platform, 
  StatusBar, 
  Modal, 
  Dimensions 
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext'; 
import { API_BASE_URL } from '../api/apiClient';
import { useUnit } from '../contexts/UnitContext';
import { UnitSwitcherBar } from '../components/UnitSwitcherBar';
import { useBadge } from '../contexts/BadgeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function BillingScreen({ navigation }: any) {
  const { 
    themeColor, 
    unitId, 
    visitorParkingBillingEnabled, 
    amenityBillingEnabled 
  } = useCondoConfig(); 
  const { currentUnit } = useUnit();
  const { refreshBadges } = useBadge();
  const activeUnitId = currentUnit?.unit_id || unitId;

  const [billings, setBillings] = useState<any[]>([]);
  const [filteredBillings, setFilteredBillings] = useState<any[]>([]);
  const [parkingFeeTiers, setParkingFeeTiers] = useState<number[]>([]);
  const [baseParkingFee, setBaseParkingFee] = useState<number>(0);
  const [visitorLogs, setVisitorLogs] = useState<any[]>([]);
  const [amenityBookings, setAmenityBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'detail' | 'history'>('detail');
  const scrollViewRef = useRef<ScrollView>(null);

  const handleTabPress = (tabName: 'detail' | 'history') => {
    setActiveTab(tabName);
    const idx = tabName === 'detail' ? 0 : 1;
    scrollViewRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: true });
  };

  // Month states
  const [latestBillingMonth, setLatestBillingMonth] = useState('2026-06'); // Always latest
  const [selectedYear, setSelectedYear] = useState('2026'); // Independent picker/chart state
  const [selectedMonth, setSelectedMonth] = useState('06'); // Independent picker/chart state
  
  const [yearPickerVisible, setYearPickerVisible] = useState(false);
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);

  // Detail modal states
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [electricityModalVisible, setElectricityModalVisible] = useState(false);
  const [waterModalVisible, setWaterModalVisible] = useState(false);
  const [amenityModalVisible, setAmenityModalVisible] = useState(false);
  
  const [activeDetailsMonth, setActiveDetailsMonth] = useState<string | null>(null);
  const [activeModalMonth, setActiveModalMonth] = useState('2026-06');

  const yearsList = ['2025', '2026'];
  const monthsList = [
    { label: 'January', value: '01' },
    { label: 'February', value: '02' },
    { label: 'March', value: '03' },
    { label: 'April', value: '04' },
    { label: 'May', value: '05' },
    { label: 'June', value: '06' },
    { label: 'July', value: '07' },
    { label: 'August', value: '08' },
    { label: 'September', value: '09' },
    { label: 'October', value: '10' },
    { label: 'November', value: '11' },
    { label: 'December', value: '12' },
  ];

  const getMonthName = (m: string) => {
    if (!m) return 'January';
    return monthsList.find(item => item.value === m)?.label || 'January';
  };

  const formatDateTime = (isoString: string) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit', 
      hour12: true 
    });
  };

  const markMonthAsRead = async (month: string) => {
    try {
      await AsyncStorage.setItem(`billing_read_${month}`, 'true');
      refreshBadges();
    } catch (e) {
      console.log("Error marking month as read:", e);
    }
  };

  useEffect(() => {
    fetchMyBillings();
    fetchMyVisitorLogs();
    fetchMyAmenityBookings();
    if (currentUnit?.condo_id) {
      fetchCondoParkingTiers(currentUnit.condo_id);
    }
  }, [activeUnitId, visitorParkingBillingEnabled, amenityBillingEnabled, currentUnit]);

  const fetchCondoParkingTiers = async (condoId: string) => {
    try {
      const { data, error } = await supabase
        .from('condos')
        .select('base_parking_fee, features')
        .eq('id', condoId)
        .single();
      if (!error && data) {
        setBaseParkingFee(data.base_parking_fee || 0);
        if (data.features && Array.isArray(data.features.parking_fee_tiers)) {
          setParkingFeeTiers(data.features.parking_fee_tiers.map(Number));
        } else {
          setParkingFeeTiers([data.base_parking_fee || 0]);
        }
      }
    } catch (err) {
      console.log("Error fetching condo parking tiers:", err);
    }
  };

  const getParkingBreakdown = (totalParkingFee: number) => {
    if (totalParkingFee <= 0) return [];
    let remaining = totalParkingFee;
    const breakdown = [];
    let i = 0;
    while (remaining > 0) {
      const tierFee = parkingFeeTiers[i] !== undefined 
        ? parkingFeeTiers[i] 
        : (parkingFeeTiers[parkingFeeTiers.length - 1] || baseParkingFee || 1500);
      if (remaining >= tierFee) {
        breakdown.push({
          label: i + 1 === 1 ? '1st Car Parking Fee' : i + 1 === 2 ? '2nd Car Parking Fee' : i + 1 === 3 ? '3rd Car Parking Fee' : `${i + 1}th Car Parking Fee`,
          fee: tierFee
        });
        remaining -= tierFee;
      } else {
        breakdown.push({
          label: i + 1 === 1 ? '1st Car Parking Fee' : i + 1 === 2 ? '2nd Car Parking Fee' : i + 1 === 3 ? '3rd Car Parking Fee' : `${i + 1}th Car Parking Fee`,
          fee: remaining
        });
        remaining = 0;
      }
      i++;
      if (i > 100) break;
    }
    return breakdown;
  };

  useEffect(() => {
    applyFilters();
  }, [selectedYear, selectedMonth, billings]);

  // Mark latest month as read when tab is detail
  useEffect(() => {
    if (latestBillingMonth && activeTab === 'detail') {
      markMonthAsRead(latestBillingMonth);
    }
  }, [latestBillingMonth, activeTab]);

  // Mark selected billing month in history tab as read when it changes
  useEffect(() => {
    if (selectedYear && selectedMonth && activeTab === 'history') {
      markMonthAsRead(`${selectedYear}-${selectedMonth}`);
    }
  }, [selectedYear, selectedMonth, activeTab]);

  const fetchMyVisitorLogs = async () => {
    try {
      if (!activeUnitId) return;
      const { data, error } = await supabase
        .from('visitor_logs')
        .select(`
          id,
          access_time,
          exit_time,
          parking_fee,
          is_paid,
          visitor_passes!inner (
            unit_id,
            plate_number,
            visitor_name,
            vehicle_type
          )
        `)
        .eq('visitor_passes.unit_id', activeUnitId)
        .eq('is_paid', false);

      if (!error && data) {
        setVisitorLogs(data);
      }
    } catch (err) {
      console.log("Error fetching visitor logs:", err);
    }
  };

  const fetchMyAmenityBookings = async () => {
    try {
      if (!activeUnitId) return;
      const { data, error } = await supabase
        .from('amenity_bookings')
        .select(`
          id,
          booking_date,
          slot_time,
          status,
          amenities (
            id,
            name,
            icon
          )
        `)
        .eq('unit_id', activeUnitId)
        .eq('status', 'CONFIRMED');

      if (!error && data) {
        setAmenityBookings(data);
      }
    } catch (err) {
      console.log("Error fetching amenity bookings:", err);
    }
  };

  const fetchMyBillings = async () => {
    try {
      console.log("DEBUG - 현재 사용하는 activeUnitId:", activeUnitId);
      setLoading(true);
      if (!activeUnitId) {
        setBillings([]);
        setLoading(false);
        return;
      }

      const { data: bData, error: bError } = await supabase
        .from('billings')
        .select('*')
        .eq('unit_id', activeUnitId)
        .order('due_date', { ascending: false });

      if (!bError && bData && bData.length > 0) {
        const enrichedBillings = bData.map((b: any) => {
          let uiCategory = 'DUES';
          if (b.category === 'UTILITIES' || b.category === 'Maintenance') {
            uiCategory = 'UTILITIES';
          } else if (b.category === 'AMENITY') {
            uiCategory = 'AMENITY';
          } else if (b.category === 'Parking_Visitor' || b.category === 'Parking_Resident') {
            uiCategory = 'DUES';
          } else {
            uiCategory = b.category || (Number(b.condo_dues) > 0 ? 'DUES' : Number(b.electricity) > 0 ? 'UTILITIES' : 'AMENITY');
          }

          const amount = (b.total_due !== undefined && b.total_due !== null)
            ? Number(b.total_due)
            : (
              Number(b.condo_dues || 0) + 
              Number(b.electricity || 0) + 
              Number(b.water || 0) + 
              Number(b.parking_fee || 0) + 
              (visitorParkingBillingEnabled ? Number(b.visitor_parking_fee || 0) : 0) + 
              (amenityBillingEnabled ? Number(b.amenity_fee || 0) : 0) + 
              Number(b.job_order_fee || 0) + 
              Number(b.previous_balance || 0) + 
              Number(b.penalty_amount || 0)
            );

          return {
            ...b,
            unit_number: b.unit_number || '1204',
            condo_name: b.condo_name || 'Phili-One Condominium',
            category: uiCategory, 
            billing_month: b.billing_month || '2026-05',
            billing_period: b.billing_period || 'Monthly Statement',
            title: b.description || b.title || (Number(b.condo_dues) > 0 ? 'Association Dues' : 'Utility Statement'),
            amount: amount,
            details: {
              condo_dues: Number(b.condo_dues || 0),
              electricity: Number(b.electricity || 0),
              water: Number(b.water || 0),
              parking_fee: Number(b.parking_fee || 0),
              visitor_parking_fee: visitorParkingBillingEnabled ? Number(b.visitor_parking_fee || 0) : 0,
              amenity_fee: amenityBillingEnabled ? Number(b.amenity_fee || 0) : 0,
              job_order_fee: Number(b.job_order_fee || 0),
              previous_balance: Number(b.previous_balance || 0),
              penalty_amount: Number(b.penalty_amount || 0)
            }
          };
        });

        setBillings(enrichedBillings);

        // Mark all current unpaid bills as read since the user is viewing the Billing Screen
        enrichedBillings.forEach((b: any) => {
          if (['ISSUED', 'OVERDUE', 'UNPAID', 'PENDING'].includes(b.status)) {
            markMonthAsRead(b.billing_month);
          }
        });

        // Track and extract the latest month from database on load
        const months = enrichedBillings.map((b: any) => b.billing_month);
        months.sort();
        const latestMonthStr = months[months.length - 1]; 
        if (latestMonthStr) {
          setLatestBillingMonth(latestMonthStr);
          if (!isInitialized) {
            const [lYear, lMonth] = latestMonthStr.split('-');
            setSelectedYear(lYear);
            setSelectedMonth(lMonth);
          }
          setIsInitialized(true);
        }
      } else {
        setBillings([]);
      }
    } catch (err) {
      console.log(err);
      setBillings([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    const targetMonth = `${selectedYear}-${selectedMonth}`;
    const result = billings.filter(b => b.billing_month === targetMonth);
    setFilteredBillings(result);
  };

  // Compile detailed sums for all bills in a specific month
  const getMonthDetails = (targetMonth: string) => {
    const monthBills = billings.filter(b => b.billing_month === targetMonth);

    return monthBills.reduce((acc, b) => {
      acc.condo_dues += Number(b.details?.condo_dues || 0);
      acc.electricity += Number(b.details?.electricity || 0);
      acc.water += Number(b.details?.water || 0);
      acc.parking_fee += Number(b.details?.parking_fee || 0);
      acc.visitor_parking_fee += Number(b.details?.visitor_parking_fee || 0);
      acc.amenity_fee += Number(b.details?.amenity_fee || 0);
      acc.job_order_fee += Number(b.details?.job_order_fee || 0);
      acc.previous_balance += Number(b.details?.previous_balance || 0);
      acc.penalty_amount += Number(b.details?.penalty_amount || 0);
      return acc;
    }, {
      condo_dues: 0,
      electricity: 0,
      water: 0,
      parking_fee: 0,
      visitor_parking_fee: 0,
      amenity_fee: 0,
      job_order_fee: 0,
      previous_balance: 0,
      penalty_amount: 0
    });
  };

  // Center selected month as the 6th month (index 5) in a 12-month array
  const getChartData = () => {
    const chartData = [];
    const selYear = parseInt(selectedYear);
    const selMonth = parseInt(selectedMonth) - 1; // 0-indexed month (0-11)
    
    // Create base date for middle-left (offset = 0 at index 5)
    const baseDate = new Date(selYear, selMonth, 15);
    
    for (let i = 0; i < 12; i++) {
      const offset = i - 5; // selected month is index 5
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + offset, 15);
      const yyyy = d.getFullYear().toString();
      const mm = (d.getMonth() + 1).toString().padStart(2, '0');
      const monthStr = `${yyyy}-${mm}`;
      
      const monthBills = billings.filter(b => b.billing_month === monthStr);
      const totalAmount = monthBills.reduce((sum, b) => sum + Number(b.amount), 0);
      const label = d.toLocaleString('en-US', { month: 'short' }); 
      
      chartData.push({
        monthStr,
        year: yyyy,
        month: mm,
        label,
        amount: totalAmount
      });
    }
    return chartData;
  };

  const chartData = getChartData();
  const maxAmount = Math.max(...chartData.map(c => c.amount), 1000);

  const openVisitorDetails = (monthStr: string) => {
    setActiveDetailsMonth(monthStr);
    setDetailsModalVisible(true);
  };

  const getFilteredVisitorLogs = () => {
    if (!activeDetailsMonth) return [];
    return visitorLogs.filter(log => {
      if (!log.exit_time) return false;
      return log.exit_time.substring(0, 7) === activeDetailsMonth;
    });
  };

  const filteredVisitorLogs = getFilteredVisitorLogs();

  const getAmenityFee = (id: string) => {
    switch (id) {
      case 'pool': return 300;
      case 'bbq': return 100;
      case 'tennis': return 200;
      case 'lounge': return 500;
      default: return 0;
    }
  };

  const uploadReceipt = async (billingId: number | string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        console.log("DEBUG - 세션 유저 없음, 여기서 에러 방지 완료.");
        return;
      }

      const handleImageResult = async (result: ImagePicker.ImagePickerResult) => {
        if (result.canceled || !result.assets || !result.assets[0].base64) return;
        try {
          setUploading(true);
          const base64 = result.assets[0].base64;
          const fileExt = result.assets[0].uri.split('.').pop() || 'jpg';
          const fileName = `${userId}/${Date.now()}.${fileExt}`;

          await supabase.storage.from('receipts').upload(fileName, decode(base64), { contentType: `image/${fileExt}` });
          const { data: publicUrlData } = supabase.storage.from('receipts').getPublicUrl(fileName);

          const response = await fetch(`${API_BASE_URL}/api/upload-receipt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              billingId: billingId, 
              receiptUrl: publicUrlData.publicUrl 
            })
          });

          if (!response.ok) throw new Error("Failed to sync receipt");
          
          Alert.alert('Success', 'Receipt uploaded! System is verifying your payment automatically.');
          fetchMyBillings();
        } catch (error: any) {
          Alert.alert('Upload Error', error.message);
        } finally {
          setUploading(false);
        }
      };

      Alert.alert(
        "Upload Receipt",
        "Choose an option to attach a receipt photo",
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
                aspect: [3, 4],
                quality: 0.6,
                base64: true,
              });
              handleImageResult(result);
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
                aspect: [3, 4],
                quality: 0.6,
                base64: true,
              });
              handleImageResult(result);
            }
          },
          {
            text: "Cancel",
            style: "cancel"
          }
        ]
      );
    } catch (error: any) {
      Alert.alert('Upload Error', error.message);
    }
  };

  const cancelReceiptUpload = async (billingId: number | string) => {
    Alert.alert(
      "Cancel Submission",
      "Are you sure you want to cancel this receipt submission? This will delete the uploaded receipt and let you upload a new one.",
      [
        { text: "No", style: "cancel" },
        { 
          text: "Yes, Cancel", 
          style: "destructive",
          onPress: async () => {
            try {
              setUploading(true);
              const response = await fetch(`${API_BASE_URL}/api/cancel-receipt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ billingId: billingId })
              });

              if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || "Failed to cancel receipt submission");
              }

              Alert.alert('Cancelled', 'Your receipt submission has been cancelled. You can now upload a new receipt.');
              fetchMyBillings();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            } finally {
              setUploading(false);
            }
          }
        }
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID': return '#16a34a';
      case 'PENDING_APPROVAL': return '#ea580c';
      case 'REQUESTED': return '#ea580c';
      default: return '#dc2626';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'PAID': return '#f0fdf4';
      case 'PENDING_APPROVAL': return '#fff7ed';
      case 'REQUESTED': return '#fff7ed';
      default: return '#fef2f2';
    }
  };

  const renderBillingDetailBanner = (targetMonth: string) => {
    const monthDetails = getMonthDetails(targetMonth);
    const currentMonthTotalAmount = 
      monthDetails.condo_dues + 
      monthDetails.electricity + 
      monthDetails.water + 
      monthDetails.parking_fee + 
      monthDetails.visitor_parking_fee + 
      monthDetails.amenity_fee + 
      monthDetails.job_order_fee + 
      monthDetails.previous_balance + 
      monthDetails.penalty_amount;
    
    const hasMonthDetails = currentMonthTotalAmount > 0;
    const activeMonthBill = billings.find(b => b.billing_month === targetMonth);
    
    const getMonthStatuses = () => {
      const monthBills = billings.filter(b => b.billing_month === targetMonth);
      return Array.from(new Set(monthBills.map(b => b.status)));
    };
    const uniqueStatuses = getMonthStatuses();
    
    const [tYear, tMonth] = targetMonth.split('-');
    const unpaidBalanceWithPenalties = Number(monthDetails.previous_balance || 0) + Number(monthDetails.penalty_amount || 0);

    return (
      <View style={styles.whiteSummaryCard}>
        <View style={styles.bannerHeaderRow}>
          <Text style={styles.bannerMetaLabel}>Billing for {getMonthName(tMonth)} {tYear}</Text>
          <Text style={styles.bannerCurrencyValue}>
            ₱{currentMonthTotalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}
          </Text>
        </View>

        {uniqueStatuses.length > 0 && (
          <View style={styles.bannerStatusContainer}>
            <Text style={styles.bannerStatusLabel}>Status: </Text>
            {uniqueStatuses.map(status => (
              <View key={status} style={[styles.bannerStatusBadge, { backgroundColor: getStatusBg(status) }]}>
                <Text style={[styles.bannerStatusText, { color: getStatusColor(status) }]}>
                  {status}
                </Text>
              </View>
            ))}
          </View>
        )}

        {hasMonthDetails ? (
          <View style={styles.bannerDetailsBox}>
            <View style={styles.bannerDivider} />
            
            {monthDetails.condo_dues > 0 && (
              <View style={styles.bannerDetailRow}>
                <Text style={styles.bannerDetailLabel}>• Association Dues</Text>
                <Text style={styles.bannerDetailValue}>₱{monthDetails.condo_dues.toLocaleString(undefined, {minimumFractionDigits: 2})}</Text>
              </View>
            )}

            {monthDetails.electricity > 0 && (
              <View style={styles.bannerDetailRow}>
                <Text style={styles.bannerDetailLabel}>• Electricity Utility</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity 
                    style={styles.bannerDetailLinkButton} 
                    onPress={() => {
                      setActiveModalMonth(targetMonth);
                      setElectricityModalVisible(true);
                    }}
                  >
                    <Text style={styles.bannerDetailLinkText}>Detail ❯</Text>
                  </TouchableOpacity>
                  <Text style={styles.bannerDetailValue}>₱{monthDetails.electricity.toLocaleString(undefined, {minimumFractionDigits: 2})}</Text>
                </View>
              </View>
            )}

            {monthDetails.water > 0 && (
              <View style={styles.bannerDetailRow}>
                <Text style={styles.bannerDetailLabel}>• Water Utility</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity 
                    style={styles.bannerDetailLinkButton} 
                    onPress={() => {
                      setActiveModalMonth(targetMonth);
                      setWaterModalVisible(true);
                    }}
                  >
                    <Text style={styles.bannerDetailLinkText}>Detail ❯</Text>
                  </TouchableOpacity>
                  <Text style={styles.bannerDetailValue}>₱{monthDetails.water.toLocaleString(undefined, {minimumFractionDigits: 2})}</Text>
                </View>
              </View>
            )}

            {monthDetails.parking_fee > 0 && (
              <View style={{ marginVertical: 2 }}>
                <View style={styles.bannerDetailRow}>
                  <Text style={styles.bannerDetailLabel}>• Parking Fee (Total)</Text>
                  <Text style={styles.bannerDetailValue}>₱{monthDetails.parking_fee.toLocaleString(undefined, {minimumFractionDigits: 2})}</Text>
                </View>
                {getParkingBreakdown(monthDetails.parking_fee).map((carFee, idx) => (
                  <View key={idx} style={[styles.bannerDetailRow, { paddingLeft: 20, marginVertical: 1 }]}>
                    <Text style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>└ {carFee.label}</Text>
                    <Text style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>₱{carFee.fee.toLocaleString(undefined, {minimumFractionDigits: 2})}</Text>
                  </View>
                ))}
              </View>
            )}

            {visitorParkingBillingEnabled && monthDetails.visitor_parking_fee > 0 && (
              <View style={styles.bannerDetailRow}>
                <Text style={styles.bannerDetailLabel}>• Visitor Parking Fee</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity style={styles.bannerDetailLinkButton} onPress={() => openVisitorDetails(targetMonth)}>
                    <Text style={styles.bannerDetailLinkText}>Detail ❯</Text>
                  </TouchableOpacity>
                  <Text style={styles.bannerDetailValue}>₱{monthDetails.visitor_parking_fee.toLocaleString(undefined, {minimumFractionDigits: 2})}</Text>
                </View>
              </View>
            )}

            {amenityBillingEnabled && monthDetails.amenity_fee > 0 && (
              <View style={styles.bannerDetailRow}>
                <Text style={styles.bannerDetailLabel}>• Amenity Booking Fee</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity 
                    style={styles.bannerDetailLinkButton} 
                    onPress={() => {
                      setActiveModalMonth(targetMonth);
                      setAmenityModalVisible(true);
                    }}
                  >
                    <Text style={styles.bannerDetailLinkText}>Detail ❯</Text>
                  </TouchableOpacity>
                  <Text style={styles.bannerDetailValue}>₱{monthDetails.amenity_fee.toLocaleString(undefined, {minimumFractionDigits: 2})}</Text>
                </View>
              </View>
            )}

            {monthDetails.job_order_fee > 0 && (
              <View style={styles.bannerDetailRow}>
                <Text style={styles.bannerDetailLabel}>• Maintenance & Repairs</Text>
                <Text style={styles.bannerDetailValue}>₱{monthDetails.job_order_fee.toLocaleString(undefined, {minimumFractionDigits: 2})}</Text>
              </View>
            )}

            {/* Consolidated Arrears & Penalty Row, always visible as requested */}
            <View style={styles.bannerDetailRow}>
              <Text style={styles.bannerDetailLabel}>• Arrears & Penalties</Text>
              <Text style={styles.bannerDetailValue}>
                ₱{unpaidBalanceWithPenalties.toLocaleString(undefined, {minimumFractionDigits: 2})}
              </Text>
            </View>

            {/* Action Buttons inside/under the Banner */}
            {activeMonthBill && ['PENDING', 'ISSUED', 'OVERDUE', 'UNPAID'].includes(activeMonthBill.status) && (
              <TouchableOpacity 
                style={[styles.bannerUploadButton, { backgroundColor: themeColor || '#0038a8' }]} 
                onPress={() => uploadReceipt(activeMonthBill.id)} 
                disabled={uploading}
              >
                <Text style={styles.bannerUploadButtonText}>
                  {uploading ? 'Processing...' : '📸 Upload Payment Receipt'}
                </Text>
              </TouchableOpacity>
            )}

            {activeMonthBill && ['REQUESTED', 'PENDING_APPROVAL'].includes(activeMonthBill.status) && (
              <View style={{ gap: 8, marginTop: 14 }}>
                <View style={[styles.bannerStatusBoxWaiting, { marginTop: 0 }]}>
                  <Text style={styles.bannerStatusBoxWaitingText}>⏳ PMO Verification in Progress</Text>
                </View>
                <TouchableOpacity 
                  style={[styles.bannerUploadButton, { backgroundColor: '#dc2626', marginTop: 0 }]} 
                  onPress={() => cancelReceiptUpload(activeMonthBill.id)} 
                  disabled={uploading}
                >
                  <Text style={styles.bannerUploadButtonText}>
                    {uploading ? 'Processing...' : '❌ Cancel Submission'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {activeMonthBill && activeMonthBill.status === 'PAID' && (
              <View style={styles.bannerStatusBoxSuccess}>
                <Text style={styles.bannerStatusBoxSuccessText}>✅ Settled (Fully Paid)</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.bannerDetailsBox}>
            <View style={styles.bannerDivider} />
            <Text style={styles.allSettledText}>No statements recorded for this month</Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return <ActivityIndicator style={styles.centered} size="large" color={themeColor || '#0038a8'} />;
  }

  return (
    <View style={styles.safeAreaContainer}>
      <View style={styles.navHeaderBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.6}>
          <Text style={[styles.backIcon, { color: themeColor || '#0038a8' }]}>❮</Text>
          <Text style={styles.backText}>Home</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Billings</Text>
        <View style={{ width: 60 }} />
      </View>

      <UnitSwitcherBar />

      {/* Premium Segmented Control / Tab Switcher */}
      <View style={styles.segmentedControlContainer}>
        <View style={styles.segmentedControlBg}>
          <TouchableOpacity 
            style={[styles.segmentButton, activeTab === 'detail' && [styles.segmentActiveButton, { backgroundColor: themeColor || '#0038a8' }]]} 
            onPress={() => handleTabPress('detail')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, activeTab === 'detail' && styles.segmentActiveText]}>
              Billing Detail
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.segmentButton, activeTab === 'history' && [styles.segmentActiveButton, { backgroundColor: themeColor || '#0038a8' }]]} 
            onPress={() => handleTabPress('history')}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentText, activeTab === 'history' && styles.segmentActiveText]}>
              Billing History
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          const tabs: ('detail' | 'history')[] = ['detail', 'history'];
          if (tabs[index]) {
            setActiveTab(tabs[index]);
          }
        }}
        style={{ flex: 1 }}
      >
        <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
          <ScrollView style={styles.scrollList} showsVerticalScrollIndicator={false}>
            <View>
            {/* Billing Detail Header */}
            <View style={styles.topFixedHeader}>
              <Text style={styles.headerTitle}>Billing Detail</Text>
              <Text style={styles.headerSub}>Track and settle monthly and itemized billing statements.</Text>
            </View>

            {/* Billing for Selected Month Banner with Breakdown and Status */}
            {renderBillingDetailBanner(latestBillingMonth)}
          </View>
        </ScrollView>
      </View>

      <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
        <ScrollView style={styles.scrollList} showsVerticalScrollIndicator={false}>
          <View>
            {/* Billing History Section */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Billing History</Text>
              <Text style={styles.sectionSub}>Select a billing period to view details or trace history.</Text>
            </View>

            {/* Date Filter Row (Directly above Graph) */}
            <View style={styles.filterRow}>
              <TouchableOpacity style={styles.filterButton} onPress={() => setYearPickerVisible(true)} activeOpacity={0.7}>
                <Text style={styles.filterButtonText}>📅 Year: {selectedYear} ▾</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.filterButton} onPress={() => setMonthPickerVisible(true)} activeOpacity={0.7}>
                <Text style={styles.filterButtonText}>🗓️ Month: {getMonthName(selectedMonth)} ▾</Text>
              </TouchableOpacity>
            </View>

            {/* Dynamic 12-Month Bar Chart */}
            <View style={styles.chartWrapper}>
              <Text style={styles.chartTitle}>Past 12 Months Billing History</Text>
              <View style={styles.chartBarRow}>
                {chartData.map((item) => {
                  const isSelected = selectedYear === item.year && selectedMonth === item.month;
                  const barHeight = (item.amount / maxAmount) * 100;
                  
                  return (
                    <TouchableOpacity 
                      key={item.monthStr} 
                      style={styles.chartBarTouchArea} 
                      onPress={() => {
                        setSelectedYear(item.year);
                        setSelectedMonth(item.month);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.barContainer}>
                        <Text style={[styles.barValueText, isSelected && { color: themeColor || '#0038a8', fontWeight: 'bold' }]}>
                          {item.amount > 0 ? `₱${Math.round(item.amount / 100) / 10}k` : '₱0'}
                        </Text>
                        <View style={[
                          styles.bar, 
                          { 
                            height: Math.max(barHeight, 6), 
                            backgroundColor: isSelected ? (themeColor || '#0038a8') : '#cbd5e1',
                          }
                        ]} />
                      </View>
                      <Text style={[styles.barLabel, isSelected && { color: themeColor || '#0038a8', fontWeight: 'bold' }]}>
                        {item.label}
                      </Text>
                      <Text style={[styles.barYearLabel, isSelected && { color: themeColor || '#0038a8', fontWeight: 'bold' }]}>
                        {item.year.substring(2)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Detailed Statement Below the Graph */}
            <View style={{ marginTop: 10 }}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Selected Month Statement</Text>
                <Text style={styles.sectionSub}>Details for the period selected in the chart above.</Text>
              </View>
              {renderBillingDetailBanner(`${selectedYear}-${selectedMonth}`)}
            </View>
          </View>
          <View style={{ height: 50 }} />
        </ScrollView>
      </View>
    </ScrollView>

      {/* Year Selector Modal */}
      <Modal visible={yearPickerVisible} transparent={true} animationType="fade" onRequestClose={() => setYearPickerVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setYearPickerVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Year</Text>
            {yearsList.map(year => (
              <TouchableOpacity 
                key={year} 
                style={[styles.modalOption, selectedYear === year && { backgroundColor: '#f1f5f9' }]} 
                onPress={() => {
                  setSelectedYear(year);
                  setYearPickerVisible(false);
                }}
              >
                <Text style={[styles.modalOptionText, selectedYear === year && { color: themeColor || '#0038a8', fontWeight: 'bold' }]}>
                  {year}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Month Selector Modal */}
      <Modal visible={monthPickerVisible} transparent={true} animationType="fade" onRequestClose={() => setMonthPickerVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMonthPickerVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Month</Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {monthsList.map(item => (
                <TouchableOpacity 
                  key={item.value} 
                  style={[styles.modalOption, selectedMonth === item.value && { backgroundColor: '#f1f5f9' }]} 
                  onPress={() => {
                    setSelectedMonth(item.value);
                    setMonthPickerVisible(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, selectedMonth === item.value && { color: themeColor || '#0038a8', fontWeight: 'bold' }]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Visitor Parking Details Modal */}
      <Modal visible={detailsModalVisible} transparent={true} animationType="fade" onRequestClose={() => setDetailsModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setDetailsModalVisible(false)}>
          <View style={styles.modalContentLarge}>
            <Text style={styles.modalTitle}>🚗 Visitor Parking Details</Text>
            <Text style={styles.modalSubtitle}>Unit visits for {getMonthName(activeDetailsMonth?.split('-')[1] || '')} {activeDetailsMonth?.split('-')[0]}</Text>
            
            <ScrollView style={{ maxHeight: 350, marginVertical: 10 }} showsVerticalScrollIndicator={false}>
              {filteredVisitorLogs.length === 0 ? (
                <Text style={styles.noLogsText}>No visitor parking logs found for this month.</Text>
              ) : (
                filteredVisitorLogs.map((log: any) => (
                  <View key={log.id} style={styles.visitorDetailCard}>
                    <View style={styles.visitorDetailRow}>
                      <Text style={styles.visitorDetailPlate}>{log.visitor_passes?.plate_number}</Text>
                      <Text style={styles.visitorDetailFee}>₱{Number(log.parking_fee).toLocaleString(undefined, {minimumFractionDigits: 2})}</Text>
                    </View>
                    <View style={styles.visitorDetailDivider} />
                    <View style={styles.visitorDetailRow}>
                      <Text style={styles.visitorDetailLabel}>Visitor Name</Text>
                      <Text style={styles.visitorDetailValue}>{log.visitor_passes?.visitor_name}</Text>
                    </View>
                    <View style={styles.visitorDetailRow}>
                      <Text style={styles.visitorDetailLabel}>Vehicle Type</Text>
                      <Text style={styles.visitorDetailValue}>{log.visitor_passes?.vehicle_type}</Text>
                    </View>
                    <View style={styles.visitorDetailRow}>
                      <Text style={styles.visitorDetailLabel}>Access Period</Text>
                      <Text style={styles.visitorDetailTime}>
                        {formatDateTime(log.access_time)} → {formatDateTime(log.exit_time)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <TouchableOpacity style={[styles.closeButton, { backgroundColor: themeColor || '#0038a8' }]} onPress={() => setDetailsModalVisible(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Electricity Utility Details Modal */}
      <Modal visible={electricityModalVisible} transparent={true} animationType="fade" onRequestClose={() => setElectricityModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setElectricityModalVisible(false)}>
          <View style={styles.modalContentLarge}>
            <Text style={styles.modalTitle}>⚡ Electricity Utility Details</Text>
            <Text style={styles.modalSubtitle}>Statement for {getMonthName(activeModalMonth.split('-')[1])} {activeModalMonth.split('-')[0]}</Text>
            
            {(() => {
              const modalBill = billings.find(b => b.billing_month === activeModalMonth);
              return modalBill ? (
                <View style={styles.utilityDetailCard}>
                  <View style={styles.utilityDetailRow}>
                    <Text style={styles.utilityDetailLabel}>Previous Meter Reading</Text>
                    <Text style={styles.utilityDetailValue}>{modalBill.electricity_prev_meter || 0} kWh</Text>
                  </View>
                  <View style={styles.utilityDetailRow}>
                    <Text style={styles.utilityDetailLabel}>Current Meter Reading</Text>
                    <Text style={styles.utilityDetailValue}>{modalBill.electricity_curr_meter || 0} kWh</Text>
                  </View>
                  <View style={styles.utilityDetailDivider} />
                  <View style={styles.utilityDetailRow}>
                    <Text style={styles.utilityDetailLabel}>Net Consumption</Text>
                    <Text style={styles.utilityDetailHighlight}>{(modalBill.electricity_usage || 0)} kWh</Text>
                  </View>
                  <View style={styles.utilityDetailRow}>
                    <Text style={styles.utilityDetailLabel}>Estimated Rate</Text>
                    <Text style={styles.utilityDetailValue}>₱{((modalBill.electricity || 0) / Math.max(modalBill.electricity_usage || 1, 1)).toFixed(2)} / kWh</Text>
                  </View>
                  <View style={styles.utilityDetailDivider} />
                  <View style={styles.utilityDetailRow}>
                    <Text style={styles.utilityDetailLabel}>Total Electricity Fee</Text>
                    <Text style={styles.utilityDetailTotal}>₱{Number(modalBill.electricity || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</Text>
                  </View>
                </View>
              ) : (
                <Text style={styles.noLogsText}>No billing data found for this month.</Text>
              );
            })()}

            <TouchableOpacity style={[styles.closeButton, { backgroundColor: themeColor || '#0038a8' }]} onPress={() => setElectricityModalVisible(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Water Utility Details Modal */}
      <Modal visible={waterModalVisible} transparent={true} animationType="fade" onRequestClose={() => setWaterModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setWaterModalVisible(false)}>
          <View style={styles.modalContentLarge}>
            <Text style={styles.modalTitle}>💧 Water Utility Details</Text>
            <Text style={styles.modalSubtitle}>Statement for {getMonthName(activeModalMonth.split('-')[1])} {activeModalMonth.split('-')[0]}</Text>
            
            {(() => {
              const modalBill = billings.find(b => b.billing_month === activeModalMonth);
              return modalBill ? (
                <View style={styles.utilityDetailCard}>
                  <View style={styles.utilityDetailRow}>
                    <Text style={styles.utilityDetailLabel}>Previous Meter Reading</Text>
                    <Text style={styles.utilityDetailValue}>{modalBill.water_prev_meter || 0} m³</Text>
                  </View>
                  <View style={styles.utilityDetailRow}>
                    <Text style={styles.utilityDetailLabel}>Current Meter Reading</Text>
                    <Text style={styles.utilityDetailValue}>{modalBill.water_curr_meter || 0} m³</Text>
                  </View>
                  <View style={styles.utilityDetailDivider} />
                  <View style={styles.utilityDetailRow}>
                    <Text style={styles.utilityDetailLabel}>Net Consumption</Text>
                    <Text style={styles.utilityDetailHighlight}>{(modalBill.water_usage || 0)} m³</Text>
                  </View>
                  <View style={styles.utilityDetailRow}>
                    <Text style={styles.utilityDetailLabel}>Estimated Rate</Text>
                    <Text style={styles.utilityDetailValue}>₱{((modalBill.water || 0) / Math.max(modalBill.water_usage || 1, 1)).toFixed(2)} / m³</Text>
                  </View>
                  <View style={styles.utilityDetailDivider} />
                  <View style={styles.utilityDetailRow}>
                    <Text style={styles.utilityDetailLabel}>Total Water Fee</Text>
                    <Text style={styles.utilityDetailTotal}>₱{Number(modalBill.water || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</Text>
                  </View>
                </View>
              ) : (
                <Text style={styles.noLogsText}>No billing data found for this month.</Text>
              );
            })()}

            <TouchableOpacity style={[styles.closeButton, { backgroundColor: themeColor || '#0038a8' }]} onPress={() => setWaterModalVisible(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Amenity Booking Details Modal */}
      <Modal visible={amenityModalVisible} transparent={true} animationType="fade" onRequestClose={() => setAmenityModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setAmenityModalVisible(false)}>
          <View style={styles.modalContentLarge}>
            <Text style={styles.modalTitle}>🏛️ Amenity Booking Details</Text>
            <Text style={styles.modalSubtitle}>Reservations for {getMonthName(activeModalMonth.split('-')[1])} {activeModalMonth.split('-')[0]}</Text>
            
            <ScrollView style={{ maxHeight: 350, marginVertical: 10 }} showsVerticalScrollIndicator={false}>
              {(() => {
                const filteredBookings = amenityBookings.filter(b => {
                  if (!b.booking_date) return false;
                  return b.booking_date.substring(0, 7) === activeModalMonth;
                });
                return filteredBookings.length === 0 ? (
                  <Text style={styles.noLogsText}>No amenity bookings found for this month.</Text>
                ) : (
                  filteredBookings.map((booking: any) => (
                    <View key={booking.id} style={styles.visitorDetailCard}>
                      <View style={styles.visitorDetailRow}>
                        <Text style={styles.visitorDetailPlate}>
                          {booking.amenities?.icon || '🏛️'} {booking.amenities?.name || 'Amenity'}
                        </Text>
                        <Text style={styles.visitorDetailFee}>
                          ₱{getAmenityFee(booking.amenities?.id).toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </Text>
                      </View>
                      <View style={styles.visitorDetailDivider} />
                      <View style={styles.visitorDetailRow}>
                        <Text style={styles.visitorDetailLabel}>Booking Date</Text>
                        <Text style={styles.visitorDetailValue}>{booking.booking_date}</Text>
                      </View>
                      <View style={styles.visitorDetailRow}>
                        <Text style={styles.visitorDetailLabel}>Time Slot</Text>
                        <Text style={styles.visitorDetailValue}>{booking.slot_time}</Text>
                      </View>
                      <View style={styles.visitorDetailRow}>
                        <Text style={styles.visitorDetailLabel}>Booking Status</Text>
                        <Text style={[styles.visitorDetailValue, { color: getStatusColor(booking.status) }]}>{booking.status}</Text>
                      </View>
                    </View>
                  ))
                );
              })()}
            </ScrollView>

            <TouchableOpacity style={[styles.closeButton, { backgroundColor: themeColor || '#0038a8' }]} onPress={() => setAmenityModalVisible(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safeAreaContainer: { flex: 1, backgroundColor: '#fafbfd', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 44 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fafbfd' },
  navHeaderBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#fff' },
  backButton: { flexDirection: 'row', alignItems: 'center', width: 60 },
  backIcon: { fontSize: 16, fontWeight: 'bold' },
  backText: { fontSize: 14, color: '#64748b', marginLeft: 4, fontWeight: '500' },
  navTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  topFixedHeader: { paddingHorizontal: 20, marginTop: 16, marginBottom: 14 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 },
  headerSub: { fontSize: 12, color: '#64748b', marginTop: 4 },
  sectionHeader: { paddingHorizontal: 20, marginTop: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', letterSpacing: -0.3 },
  sectionSub: { fontSize: 12, color: '#64748b', marginTop: 3 },
  filterRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 16, gap: 10 },
  filterButton: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  filterButtonText: { fontSize: 14, fontWeight: '600', color: '#334155' },
  totalSummaryBanner: { marginHorizontal: 20, marginBottom: 16, borderRadius: 16, padding: 18, shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 6 },
  whiteSummaryCard: { marginHorizontal: 20, marginBottom: 16, borderRadius: 16, padding: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#0f172a', shadowOpacity: 0.02, shadowRadius: 8, elevation: 1 },
  bannerHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bannerMetaLabel: { color: '#64748b', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  bannerCurrencyValue: { fontSize: 22, fontWeight: '900' },
  bannerStatusContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  bannerStatusLabel: { color: '#475569', fontSize: 13, fontWeight: '600' },
  bannerStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginLeft: 6 },
  bannerStatusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  bannerDetailsBox: { marginTop: 12 },
  bannerDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 8 },
  bannerDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  bannerDetailLabel: { color: '#475569', fontSize: 13, fontWeight: '500' },
  bannerDetailValue: { color: '#0f172a', fontSize: 13, fontWeight: '700' },
  bannerDetailSubText: { color: '#64748b', fontSize: 11, marginLeft: 10, marginTop: 1, marginBottom: 2, fontWeight: '500' },
  bannerDetailLinkButton: { marginRight: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#f1f5f9' },
  bannerDetailLinkText: { fontSize: 10, fontWeight: '700' },
  allSettledText: { color: '#64748b', fontSize: 13, fontWeight: '600', textAlign: 'center', marginVertical: 4 },
  chartWrapper: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 20, padding: 16, marginHorizontal: 20, marginBottom: 20, shadowColor: '#0f172a', shadowOpacity: 0.02, shadowRadius: 8, elevation: 1 },
  chartTitle: { fontSize: 13, fontWeight: '700', color: '#64748b', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  chartBarRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%' },
  chartBarTouchArea: { flex: 1, alignItems: 'center' },
  barContainer: { height: 110, justifyContent: 'flex-end', alignItems: 'center', width: '100%', marginBottom: 6 },
  barValueText: { fontSize: 7, color: '#94a3b8', marginBottom: 2, fontWeight: '600', textAlign: 'center' },
  bar: { width: 10, borderRadius: 3, minHeight: 6 },
  barLabel: { fontSize: 8, color: '#64748b', fontWeight: '600', textAlign: 'center' },
  barYearLabel: { fontSize: 7, color: '#94a3b8', marginTop: 1, fontWeight: '500', textAlign: 'center' },
  scrollList: { flex: 1 },
  emptyBox: { alignItems: 'center', marginTop: 60 },
  emptyIcon: { fontSize: 50, marginBottom: 12 },
  emptyText: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', borderRadius: 24, width: Dimensions.get('window').width * 0.8, padding: 20, shadowColor: '#0f172a', shadowOpacity: 0.1, shadowRadius: 16, elevation: 4 },
  modalContentLarge: { backgroundColor: '#fff', borderRadius: 24, width: Dimensions.get('window').width * 0.9, padding: 20, shadowColor: '#0f172a', shadowOpacity: 0.1, shadowRadius: 16, elevation: 4 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 6, textAlign: 'center', letterSpacing: -0.3 },
  modalSubtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', marginBottom: 12, fontWeight: '500' },
  modalOption: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginVertical: 3, alignItems: 'center' },
  modalOptionText: { fontSize: 15, color: '#475569', fontWeight: '600' },
  closeButton: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  closeButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  noLogsText: { color: '#64748b', textAlign: 'center', fontSize: 14, marginVertical: 40, fontWeight: '500' },
  visitorDetailCard: { backgroundColor: '#f8fafc', padding: 14, borderRadius: 16, marginVertical: 6, borderWidth: 1, borderColor: '#e2e8f0' },
  visitorDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 3 },
  visitorDetailPlate: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  visitorDetailFee: { fontSize: 14, fontWeight: '800', color: '#dc2626' },
  visitorDetailDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 8 },
  visitorDetailLabel: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  visitorDetailValue: { fontSize: 12, color: '#334155', fontWeight: '700' },
  visitorDetailTime: { fontSize: 11, color: '#334155', fontWeight: '600' },
  utilityDetailCard: { backgroundColor: '#f8fafc', padding: 16, borderRadius: 16, marginVertical: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  utilityDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 6 },
  utilityDetailDivider: { height: 1, backgroundColor: '#e2e8f0', marginVertical: 10 },
  utilityDetailLabel: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  utilityDetailValue: { fontSize: 13, color: '#334155', fontWeight: '700' },
  utilityDetailHighlight: { fontSize: 14, color: '#0f172a', fontWeight: '800' },
  utilityDetailTotal: { fontSize: 16, color: '#dc2626', fontWeight: '800' },
  bannerUploadButton: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginTop: 14 },
  bannerUploadButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  bannerStatusBoxWaiting: { backgroundColor: '#fff7ed', padding: 12, borderRadius: 12, alignItems: 'center', marginTop: 14, borderWidth: 1, borderColor: '#ffedd5' },
  bannerStatusBoxWaitingText: { color: '#c2410c', fontSize: 13, fontWeight: '700' },
  bannerStatusBoxSuccess: { backgroundColor: '#f0fdf4', padding: 12, borderRadius: 12, alignItems: 'center', marginTop: 14, borderWidth: 1, borderColor: '#dcfce7' },
  bannerStatusBoxSuccessText: { color: '#15803d', fontSize: 13, fontWeight: '700' },
  bannerMeterDetailBox: { marginTop: 6, paddingLeft: 8, gap: 2 },
  segmentedControlContainer: { paddingHorizontal: 20, marginVertical: 14 },
  segmentedControlBg: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 14, padding: 4 },
  segmentButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  segmentActiveButton: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  segmentText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  segmentActiveText: { color: '#fff', fontWeight: '800' }
});