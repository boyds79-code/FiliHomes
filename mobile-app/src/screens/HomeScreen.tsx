import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Alert, Modal, ActivityIndicator, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
// @ts-ignore
import QRCode from 'react-native-qrcode-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { CondoConfigProvider, useCondoConfig } from '../hooks/CondoConfigContext';
import { useUnit } from '../contexts/UnitContext';
import { UnitSwitcherBar } from '../components/UnitSwitcherBar';
import { Ionicons } from '@expo/vector-icons';
import { useBadge } from '../contexts/BadgeContext';

const { width } = Dimensions.get('window');

const calculateDynamicPenalty = (bill: any, rate: number) => {
  if (bill.status === 'PAID') return 0;
  
  const dueDateStr = bill.due_date;
  if (!dueDateStr) return 0;

  const dueDate = new Date(dueDateStr);
  
  // The penalty starts accruing on the day after the due date, at 00:00:00.
  const penaltyAccrualDate = new Date(dueDate);
  penaltyAccrualDate.setDate(penaltyAccrualDate.getDate() + 1);
  penaltyAccrualDate.setHours(0, 0, 0, 0);

  const today = new Date();
  
  const isOverdue = (bill.status === 'OVERDUE' || bill.status === 'REQUESTED' || today >= penaltyAccrualDate) && bill.status !== 'PAID';
  
  if (!isOverdue) return 0;

  // Calculate delay days
  const delayMs = today.getTime() - dueDate.getTime();
  const rawDelay = Math.ceil(delayMs / (1000 * 60 * 60 * 24));
  // Standard simulator clock offset safety net
  const delayDays = Math.max(14, rawDelay);

  const baseForPenalty = 
    Number(bill.condo_dues || 0) + 
    Number(bill.electricity || 0) + 
    Number(bill.water || 0) + 
    Number(bill.parking_fee || 0) + 
    Number(bill.visitor_parking_fee || 0) + 
    Number(bill.amenity_fee || bill.amenities_fee || 0) + 
    Number(bill.job_order_fee || bill.other_fees || 0) + 
    Number(bill.previous_balance || 0);

  return baseForPenalty * (rate / 30) * delayDays;
};

export default function HomeScreen({ navigation }: any) {
  // 🎯 [핵심 수정] 하드코딩된 유닛/콘도 정보 대신, 중앙 Context에서 동적 데이터를 가져옵니다.
  const { 
    themeColor, 
    unitId, 
    unitNumber, 
    condoName, 
    condoId,
    configLoading, 
    visitorParkingEnabled, 
    amenityBookingEnabled,
    visitorParkingBillingEnabled,
    amenityBillingEnabled,
    isCommunityEnabled,
    isBazaarEnabled
  } = useCondoConfig();
  const { currentUnit, myUnits, switchUnit } = useUnit();
  const [unitModalVisible, setUnitModalVisible] = useState(false);

  const activeUnitId = currentUnit?.unit_id || unitId;
  const activeUnitNumber = currentUnit?.unit_number || unitNumber;
  const activeCondoName = currentUnit?.condo_name || condoName;
  const targetCondoId = currentUnit?.condo_id || condoId || 'c1111111-1111-1111-1111-111111111111';

  // ⚡ 거주자용 원터치 초고속 하이패스 QR 모달 제어 상태 변수
  const [quickPassVisible, setQuickPassVisible] = useState(false);
  const residentToken = `FILIHOMES-RESIDENT-UNIT${activeUnitNumber}-SECURE-2026`; 

  const seenNotifIdsRef = React.useRef<Set<string>>(new Set());
  const initialNotifsLoadedRef = React.useRef<boolean>(false);

  const activeLayout: 'dashboard' | 'concierge' | 'classic' = 'dashboard';
  const colorTheme: 'phili-flag' | 'teal' | 'charcoal' = 'phili-flag';

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good MORNING';
    if (hour < 18) return 'Good AFTERNOON';
    return 'Good EVENING';
  };

  const getThemeColors = () => {
    switch (colorTheme as string) {
      case 'phili-flag':
        return {
          headerBg: '#0038a8', // Philippine Flag Blue (전체 색상)
          accent: '#0038a8',   // Philippine Flag Blue (전체 색상 통일)
          switcherBg: '#0038a8',
          warning: '#ce1126'   // 뱃지 컨트롤 색상만 필리핀 국기 빨간색
        };
      case 'charcoal':
        return {
          headerBg: '#0f172a',
          accent: '#475569',
          switcherBg: '#334155',
          warning: '#f59e0b'
        };
      case 'teal':
      default:
        return {
          headerBg: '#115e59',
          accent: '#0d9488',
          switcherBg: '#0d9488',
          warning: '#f59e0b'
        };
    }
  };
  const currentColors = getThemeColors();

  // State for latest bill metadata (counts are now handled by BadgeContext)
  const [latestBillAmount, setLatestBillAmount] = useState(0);
  const [latestBillStatus, setLatestBillStatus] = useState('PAID');
  const [latestBillMonthLabel, setLatestBillMonthLabel] = useState('Latest');

  const { 
    unreadNoticeCount: unreadCount, 
    unpaidBillsCount, 
    holdingParcelsCount, 
    pendingVisitorsCount, 
    activeJobOrdersCount,
    refreshBadges 
  } = useBadge();

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

  const fetchLatestBillInfo = async () => {
    // 1. getUser() 대신 getSession()을 사용하여 세션 존재 여부 확인
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id;

    // 2. 방어적 코드: 유저가 없으면 로직을 조기 종료
    if (sessionError || !userId) {
      console.log("DEBUG - 세션 유저 없음, 여기서 에러 방지 완료.");
      if (sessionError) {
        await supabase.auth.signOut().catch(() => {});
      }
      return; 
    }

    // Fetch all billings to extract latest statement and unpaid counts
    if (activeUnitId) {
      // 1. Fetch penalty rate from database
      let penaltyRate = 0.02;
      try {
        const { data: condoData } = await supabase
          .from('condos')
          .select('penalty_rate')
          .eq('id', targetCondoId)
          .single();
        if (condoData && condoData.penalty_rate !== undefined && condoData.penalty_rate !== null) {
          penaltyRate = Number(condoData.penalty_rate);
        }
      } catch (e) {
        console.error("Failed to fetch penalty rate on HomeScreen:", e);
      }

      // 2. Fetch billings
      const { data: bData, error: billsError } = await supabase
        .from('billings')
        .select('*')
        .eq('unit_id', activeUnitId)
        .order('billing_month', { ascending: false });

      if (!billsError && bData && bData.length > 0) {
        const latest = bData[0];
        
        // Calculate dynamic penalty
        const calculatedPenalty = calculateDynamicPenalty(latest, penaltyRate);
        
        const latestAmount = (latest.total_due !== undefined && latest.total_due !== null && latest.status === 'PAID')
          ? Number(latest.total_due)
          : (
            Number(latest.condo_dues || 0) + 
            Number(latest.electricity || 0) + 
            Number(latest.water || 0) + 
            Number(latest.parking_fee || 0) + 
            (visitorParkingBillingEnabled ? Number(latest.visitor_parking_fee || 0) : 0) + 
            (amenityBillingEnabled ? Number(latest.amenity_fee || latest.amenities_fee || 0) : 0) + 
            Number(latest.job_order_fee || latest.other_fees || 0) +
            Number(latest.previous_balance || 0) + 
            Number(latest.penalty_amount || 0) +
            calculatedPenalty
          );

        setLatestBillAmount(latestAmount);
        setLatestBillStatus(latest.status);

        const yr = latest.billing_month.substring(0, 4);
        const moVal = latest.billing_month.substring(5, 7); // Handle format YYYY-MM
        const matchMo = monthsList.find(m => m.value === moVal);
        setLatestBillMonthLabel(matchMo ? `${matchMo.label} ${yr}` : latest.billing_month);
      } else {
        setLatestBillAmount(0);
        setLatestBillStatus('PAID');
        setLatestBillMonthLabel('Latest');
      }
    }
  };

  useFocusEffect(
    useCallback(() => {
      refreshBadges();
      fetchLatestBillInfo();
    }, [activeUnitId, activeUnitNumber, targetCondoId, visitorParkingBillingEnabled, amenityBillingEnabled, refreshBadges])
  );


  useEffect(() => {
    if (!activeUnitNumber) return;
    const unitStr = String(activeUnitNumber).trim();

    // Reset seen notifs cache when active unit changes
    seenNotifIdsRef.current = new Set();
    initialNotifsLoadedRef.current = false;

    const translateNotification = (title: string, message: string) => {
      let cleanTitle = title || '';
      let cleanMessage = message || '';

      const isVisitorApproval = cleanTitle.includes("방문객 승인 요청");
      const isVisitorArrival = cleanTitle.includes("방문객 도착 알림");
      const isEmergencyRepair = cleanTitle.includes("긴급 야간 수리 요청");

      if (isVisitorApproval) {
        cleanTitle = "🔑 Visitor Approval Required";
        if (cleanMessage.includes("님이 방문했습니다.")) {
          const name = cleanMessage.replace("님이 방문했습니다.", "").trim();
          cleanMessage = `${name} is at the gate requesting entry. Please approve.`;
        }
      } else if (isVisitorArrival) {
        cleanTitle = "Visitor Arrived 🚶";
        if (cleanMessage.includes("님이 단지 정문에 도착했습니다.")) {
          const name = cleanMessage.replace("님이 단지 정문에 도착했습니다.", "").trim();
          cleanMessage = `${name} has entered the premises.`;
        }
      } else if (isEmergencyRepair) {
        cleanTitle = "Urgent Night Repair Request 🚨";
        if (cleanMessage.includes("야간 수리 요청이 접수되었습니다. 확인 바랍니다.")) {
          cleanMessage = "A night repair request has been received. Please verify.";
        }
      }

      return { title: cleanTitle, message: cleanMessage };
    };

    // ⚡ Add 4-second polling fallback in case database level realtime publication is disabled for notifications
    const pollNotifications = async () => {
      if (!activeUnitId) return;
      try {
        const { data: notifs, error } = await supabase
          .from('notifications')
          .select('id, title, message, type, created_at')
          .eq('unit_id', activeUnitId)
          .order('created_at', { ascending: false })
          .limit(10);
          
        if (error) {
          console.error("Error polling notifications:", error);
          return;
        }

        if (notifs) {
          // If first run, just populate cache and skip alerts
          if (!initialNotifsLoadedRef.current) {
            notifs.forEach(n => seenNotifIdsRef.current.add(n.id));
            initialNotifsLoadedRef.current = true;
            return;
          }

          let hasNew = false;
          // Find any notification whose ID has not been seen yet
          notifs.forEach(n => {
            if (!seenNotifIdsRef.current.has(n.id)) {
              seenNotifIdsRef.current.add(n.id);
              hasNew = true;

              const { title, message } = translateNotification(n.title, n.message);
              const isApprovalReq = title.includes("Approval Required") || message.includes("approve") || n.type === 'VISITOR_APPROVAL';

              if (isApprovalReq) {
                Alert.alert(
                  `🔔 ${title}`,
                  message,
                  [
                    { text: "Later", style: "cancel" },
                    { 
                      text: "Go to Approvals", 
                      onPress: () => {
                        navigation.navigate('VisitorManage');
                      } 
                    }
                  ]
                );
              } else {
                // Display alert banner & play system sound
                Alert.alert(
                  `🔔 ${title}`,
                  message,
                  [{ text: "OK", style: "default" }]
                );
              }
            }
          });

          if (hasNew) {
            refreshBadges();
            fetchLatestBillInfo();
          }
        }
      } catch (err) {
        console.error("Exception polling notifications:", err);
      }
    };

    pollNotifications();
    const interval = setInterval(pollNotifications, 4000);

    // ⚡ 앱을 켜두고 있을 때 (Foreground) 실시간 알림 팝업 제공 (푸시 알림 시뮬레이션)
    const channelName = `home-parcel-alerts-${Date.now()}`;
    const realtimeNotifier = supabase
      .channel(channelName)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'parcels',
        filter: `unit_no=eq.${unitStr}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          Alert.alert("📦 New Parcel Arrived!", `A new package has been dropped off at the lobby for Unit ${unitStr}.`);
        }
        refreshBadges();
        fetchLatestBillInfo();
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: activeUnitId ? `unit_id=eq.${activeUnitId}` : undefined
      }, (payload) => {
        refreshBadges();
        fetchLatestBillInfo();
        
        // Add to seen notifications to prevent duplicate alerts from polling fallback
        if (payload.new?.id) {
          seenNotifIdsRef.current.add(payload.new.id);
        }

        const nType = payload.new.type;
        if (nType === 'VISITOR' || nType === 'VISITOR_APPROVAL') {
          const { title, message } = translateNotification(payload.new.title, payload.new.message);
          const isApprovalReq = title.includes("Approval Required") || message.includes("approve") || nType === 'VISITOR_APPROVAL';
          
          if (isApprovalReq) {
            Alert.alert(
              `🔔 ${title}`,
              message,
              [
                { text: "Later", style: "cancel" },
                { 
                  text: "Go to Approvals", 
                  onPress: () => {
                    navigation.navigate('VisitorManage');
                  } 
                }
              ]
            );
          } else {
            // Visitor arrival notification (already entry confirmed)
            Alert.alert(
              `🔔 ${title}`,
              message,
              [{ text: "OK", style: "default" }]
            );
          }
        } else {
          const { title, message } = translateNotification(payload.new.title, payload.new.message);
          Alert.alert(
            `🔔 ${title}`,
            message,
            [{ text: "OK", style: "default" }]
          );
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'billings',
        filter: activeUnitId ? `unit_id=eq.${activeUnitId}` : undefined
      }, () => {
        refreshBadges();
        fetchLatestBillInfo();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notices',
        filter: `condo_id=eq.${targetCondoId}`
      }, () => {
        refreshBadges();
        fetchLatestBillInfo();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'visitor_passes',
        filter: activeUnitId ? `unit_id=eq.${activeUnitId}` : undefined
      }, () => {
        refreshBadges();
        fetchLatestBillInfo();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(realtimeNotifier);
      clearInterval(interval);
    };
  }, [activeUnitNumber, activeUnitId, targetCondoId, refreshBadges]);

  // [방어막] configLoading이 true일 때만 로딩 화면을 보여줍니다.
  if (configLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0038a8" />
      </View>
    );
  }

  // activeUnitId가 없으면 오류 메시지와 로그아웃 버튼을 보여줍니다.
  if (!activeUnitId) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 18, color: '#ef4444', marginBottom: 20, textAlign: 'center' }}>
          Profile could not be loaded or session is invalid.
        </Text>
        <TouchableOpacity 
          style={{ backgroundColor: '#0038a8', padding: 15, borderRadius: 8 }}
          onPress={async () => await supabase.auth.signOut().catch(() => {})}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      {/* Dynamic Top Hero Header Section */}
      {activeLayout === 'dashboard' ? (
        <View style={[styles.dashboardHeroSection, { backgroundColor: currentColors.headerBg }]}>
          <View style={styles.headerRow}>
            <View style={styles.condoSelector}>
              <Text style={styles.dashboardCondoName}>{activeCondoName}</Text>
              <Text style={styles.dashboardGreeting}>{getGreeting()}</Text>
              <Text style={styles.dashboardUnitText}>Unit {activeUnitNumber}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
              <TouchableOpacity style={styles.dashboardMyPassBtn} onPress={() => setQuickPassVisible(true)}>
                <Ionicons name="qr-code-outline" size={14} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.dashboardMyPassText}>My Pass</Text>
              </TouchableOpacity>
              
              {currentUnit?.role === 'owner' && myUnits && myUnits.length > 1 && (
                <TouchableOpacity 
                  style={styles.compactUnitSwitcherBtn} 
                  onPress={() => setUnitModalVisible(true)}
                >
                  <Text style={styles.compactUnitSwitcherText}>
                    Unit {activeUnitNumber} ▼
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      ) : activeLayout === 'concierge' ? (
        <View style={styles.conciergeHeroSection}>
          <View style={styles.headerRow}>
            <View style={styles.condoSelector}>
              <Text style={styles.conciergeBrandText}>{activeCondoName}</Text>
              <Text style={styles.conciergeSubText}>Resident Services Portal • Unit {activeUnitNumber}</Text>
            </View>
            <View style={styles.conciergeActions}>
              <TouchableOpacity style={styles.conciergeNotifBtn} onPress={() => navigation.navigate('NoticeList')}>
                <Text style={{ fontSize: 18 }}>🔔</Text>
                {unreadCount > 0 && <View style={styles.conciergeBadgeDot} />}
              </TouchableOpacity>
              <TouchableOpacity style={styles.conciergeQrBtn} onPress={() => setQuickPassVisible(true)}>
                <Text style={styles.conciergeQrBtnText}>📷 SCAN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : (
        <View style={[styles.topHeroSection, { backgroundColor: themeColor }]}>
          <View style={styles.headerRow}>
            <View style={styles.condoSelector}>
              <Text style={styles.condoNameText}>{activeCondoName}</Text>
              <Text style={styles.unitNumberText}>Unit {activeUnitNumber}</Text>
            </View>
            <View style={styles.headerIcons}>
              <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('NoticeList')}>
                <Text style={styles.notifIcon}>🔔</Text>
                {unreadCount > 0 && (
                  <View style={styles.headerBadge}>
                    <Text style={styles.headerBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickPassBtn} onPress={() => setQuickPassVisible(true)}>
                <Text style={styles.quickPassIcon}>⚡ QUICK PASS</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}




      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {activeLayout === 'dashboard' ? (
          /* ========================================================================= */
          /* 📊 DASHBOARD HUB LAYOUT */
          /* ========================================================================= */
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            {/* Quick Status Billing & Parcel Cards */}
            <View style={styles.dashboardMetricsRow}>
              <TouchableOpacity 
                style={styles.dashboardMetricCard} 
                activeOpacity={0.8}
                onPress={() => {
                  if (currentUnit?.role === 'short_term_renter') {
                    Alert.alert("Access Denied", "Short-term renters do not have access to billing records.");
                    return;
                  }
                  navigation.navigate('BillingScreen');
                }}
              >
                <View style={styles.dashboardMetricHeader}>
                  <Ionicons name="cash-outline" size={18} color="#64748b" style={{ marginRight: 6 }} />
                  <Text style={styles.dashboardMetricLabel}>Account Billings</Text>
                </View>
                <Text style={styles.dashboardMetricValue}>
                  ₱ {latestBillAmount.toLocaleString(undefined, {minimumFractionDigits: 0})}
                </Text>
                <Text style={[styles.dashboardMetricSub, unpaidBillsCount > 0 ? { color: currentColors.warning, fontWeight: '700' } : { color: '#64748b' }]}>
                  {unpaidBillsCount > 0 ? `${unpaidBillsCount} Unpaid Statements` : 'All dues cleared'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.dashboardMetricCard} 
                activeOpacity={0.8}
                onPress={() => navigation.navigate('ParcelDelivery')}
              >
                <View style={styles.dashboardMetricHeader}>
                  <Ionicons name="cube-outline" size={18} color="#64748b" style={{ marginRight: 6 }} />
                  <Text style={styles.dashboardMetricLabel}>Mail & Parcels</Text>
                </View>
                <Text style={styles.dashboardMetricValue}>{holdingParcelsCount}</Text>
                <Text style={[styles.dashboardMetricSub, holdingParcelsCount > 0 ? { color: currentColors.warning, fontWeight: '700' } : { color: '#64748b' }]}>
                  {holdingParcelsCount > 0 ? `${holdingParcelsCount} Parcels Waiting` : 'No pending delivery'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Resident Service Hub (2x3 grid) */}
            <Text style={styles.dashboardSectionTitle}>Resident Service Hub</Text>
            <View style={styles.dashboardGrid}>
              {[
                visitorParkingEnabled && { id: 'visitor', title: 'Visitor', icon: 'key-outline', screen: 'VisitorManage', desc: 'Pre-authorize' },
                { id: 'maintenance', title: 'Job Order', icon: 'build-outline', screen: 'Maintenance', desc: 'Repair requests' },
                isCommunityEnabled && { id: 'community', title: 'Community', icon: 'people-outline', screen: 'Community', desc: 'Board discussions' },
                { id: 'notice', title: 'Notices', icon: 'megaphone-outline', screen: 'NoticeList', desc: 'Announcements' },
                amenityBookingEnabled && { id: 'amenity', title: 'Amenities', icon: 'calendar-outline', screen: 'Amenity', desc: 'Reserve pool/gym' },
                isBazaarEnabled && { id: 'bazaar', title: 'Bazaar', icon: 'cart-outline', screen: 'Bazaar', desc: 'Marketplace' }
              ].filter(Boolean).map((item: any) => {
                const getBadgeCount = () => {
                  if (item.id === 'notice') return unreadCount;
                  if (item.id === 'visitor') return pendingVisitorsCount;
                  if (item.id === 'maintenance') return activeJobOrdersCount;
                  return 0;
                };
                const badgeCount = getBadgeCount();

                return (
                  <TouchableOpacity 
                    key={item.id} 
                    style={styles.dashboardGridItem}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate(item.screen)}
                  >
                    <View style={styles.dashboardItemIconWrap}>
                      <Ionicons name={item.icon as any} size={22} color={currentColors.accent} />
                    </View>
                    <Text style={styles.dashboardItemTitle}>{item.title}</Text>
                    <Text style={styles.dashboardItemDesc}>{item.desc}</Text>
                    {badgeCount > 0 && (
                      <View style={styles.gridItemBadge}>
                        <Text style={styles.gridItemBadgeText}>{badgeCount}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Ad Banner */}
            <TouchableOpacity style={styles.adBanner} activeOpacity={0.9}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="notifications-outline" size={18} color="#1e3a8a" style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.adTitle}>QuickClean Laundry Express</Text>
                  <Text style={styles.adSubtitle}>Free drop-off & pick-up at your doorstep.</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        ) : activeLayout === 'concierge' ? (
          /* ========================================================================= */
          /* 🛎️ LIFESTYLE CONCIERGE LAYOUT */
          /* ========================================================================= */
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <View style={styles.conciergeWelcome}>
              <Text style={styles.conciergeWelcomeTitle}>Welcome to Concierge Services</Text>
              <Text style={styles.conciergeWelcomeSub}>How can we assist you in your residency today?</Text>
            </View>

            {/* Services Grid (Large card style) */}
            <View style={styles.conciergeGrid}>
              <TouchableOpacity 
                style={styles.conciergeCard} 
                activeOpacity={0.8}
                onPress={() => navigation.navigate('VisitorManage')}
              >
                <View style={styles.conciergeCardHeader}>
                  <View style={[styles.conciergeIconBg, { backgroundColor: '#f0fdf4' }]}>
                    <Text style={{ fontSize: 24 }}>🔑</Text>
                  </View>
                  {pendingVisitorsCount > 0 && (
                    <View style={styles.conciergeCountBadge}>
                      <Text style={styles.conciergeCountText}>{pendingVisitorsCount}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.conciergeCardTitle}>Guest Entry Request</Text>
                <Text style={styles.conciergeCardDesc}>Pre-authorize your visitors and share entry passes</Text>
                <Text style={[styles.conciergeCardLink, { color: themeColor || '#0038a8' }]}>Authorize Guest ❯</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.conciergeCard} 
                activeOpacity={0.8}
                onPress={() => navigation.navigate('Amenity')}
              >
                <View style={styles.conciergeCardHeader}>
                  <View style={[styles.conciergeIconBg, { backgroundColor: '#eff6ff' }]}>
                    <Text style={{ fontSize: 24 }}>🏊</Text>
                  </View>
                </View>
                <Text style={styles.conciergeCardTitle}>Reserve Facilities</Text>
                <Text style={styles.conciergeCardDesc}>Book club house, pool slots, gym, or function rooms</Text>
                <Text style={[styles.conciergeCardLink, { color: themeColor || '#0038a8' }]}>Book Facility ❯</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.conciergeCard} 
                activeOpacity={0.8}
                onPress={() => navigation.navigate('Maintenance')}
              >
                <View style={styles.conciergeCardHeader}>
                  <View style={[styles.conciergeIconBg, { backgroundColor: '#fff7ed' }]}>
                    <Text style={{ fontSize: 24 }}>🛠️</Text>
                  </View>
                  {activeJobOrdersCount > 0 && (
                    <View style={styles.conciergeCountBadge}>
                      <Text style={styles.conciergeCountText}>{activeJobOrdersCount}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.conciergeCardTitle}>Request Maintenance</Text>
                <Text style={styles.conciergeCardDesc}>Report unit faults, leaks, or common area issues</Text>
                <Text style={[styles.conciergeCardLink, { color: themeColor || '#0038a8' }]}>File Job Order ❯</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.conciergeCard} 
                activeOpacity={0.8}
                onPress={() => navigation.navigate('VehicleManage')}
              >
                <View style={styles.conciergeCardHeader}>
                  <View style={[styles.conciergeIconBg, { backgroundColor: '#f5f5f7' }]}>
                    <Text style={{ fontSize: 24 }}>🚗</Text>
                  </View>
                </View>
                <Text style={styles.conciergeCardTitle}>Vehicle Management</Text>
                <Text style={styles.conciergeCardDesc}>Register vehicles, manage resident & guest parking RFID</Text>
                <Text style={[styles.conciergeCardLink, { color: themeColor || '#0038a8' }]}>Manage RFID ❯</Text>
              </TouchableOpacity>
            </View>

            {/* Condo Life Feed Section */}
            <Text style={styles.conciergeSectionHeader}>Latest Feed & News</Text>
            
            {/* Integrated Notices Feed item */}
            <TouchableOpacity 
              style={styles.conciergeFeedItem} 
              activeOpacity={0.8}
              onPress={() => navigation.navigate('NoticeList')}
            >
              <View style={styles.conciergeFeedMeta}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.conciergeFeedTag}>ANNOUNCEMENT</Text>
                  {unreadCount > 0 && (
                    <View style={[styles.conciergeCountBadge, { marginLeft: 6 }]}>
                      <Text style={styles.conciergeCountText}>{unreadCount}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.conciergeFeedTime}>June 19</Text>
              </View>
              <Text style={styles.conciergeFeedTitle}>⚠️ Scheduled Water Distro Interruption</Text>
              <Text style={styles.conciergeFeedSnippet} numberOfLines={2}>
                Water services will be temporarily shut down for tank cleaning in Sector A and B this Sunday from 1:00 AM to 5:00 AM.
              </Text>
            </TouchableOpacity>

            {/* Integrated Intercom Support item */}
            <TouchableOpacity 
              style={styles.conciergeFeedItem} 
              activeOpacity={0.8}
              onPress={() => navigation.navigate('MessagesTab')}
            >
              <View style={styles.conciergeFeedMeta}>
                <Text style={[styles.conciergeFeedTag, { backgroundColor: '#eff6ff', color: '#1d4ed8' }]}>SUPPORT</Text>
                <Text style={styles.conciergeFeedTime}>24/7 Hotline</Text>
              </View>
              <Text style={styles.conciergeFeedTitle}>💬 Chat with PMO & Lobby Guards</Text>
              <Text style={styles.conciergeFeedSnippet}>
                Need instant assistance or have guest arrival issues? Click here to text directly with lobby guards.
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* ========================================================================= */
          /* 💎 CLASSIC LAYOUT */
          /* ========================================================================= */
          <>
            {/* Section 1: Quick Access */}
            <View style={[styles.sectionContainer, { marginTop: 24 }]}>
              <View style={styles.quickAccessRow}>
                <TouchableOpacity 
                  style={[styles.quickAccessCard, { borderLeftColor: currentColors.warning, borderLeftWidth: 4 }]} 
                  activeOpacity={0.8}
                  onPress={() => {
                    if (currentUnit?.role === 'short_term_renter') {
                      Alert.alert("Access Denied", "Short-term renters do not have access to billing records. Please contact the home owner.");
                      return;
                    }
                    navigation.navigate('BillingScreen');
                  }}
                >
                  {unpaidBillsCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unpaidBillsCount}</Text>
                    </View>
                  )}
                  <View style={styles.quickAccessHeader}>
                    <Text style={styles.quickAccessIcon}>💵</Text>
                    <Text style={styles.quickAccessLabel}>Billings</Text>
                  </View>
                  <Text style={styles.quickAccessValue}>
                    ₱ {latestBillAmount.toLocaleString(undefined, {minimumFractionDigits: 0})}
                  </Text>
                  <Text style={styles.quickAccessSub}>
                    {latestBillMonthLabel} Bill: {latestBillStatus}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.quickAccessCard, { borderLeftColor: currentColors.warning, borderLeftWidth: 4 }]} 
                  activeOpacity={0.8}
                  onPress={() => navigation.navigate('ParcelDelivery')}
                >
                  {holdingParcelsCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{holdingParcelsCount}</Text>
                    </View>
                  )}
                  <View style={styles.quickAccessHeader}>
                    <Text style={styles.quickAccessIcon}>📦</Text>
                    <Text style={styles.quickAccessLabel}>Parcels</Text>
                  </View>
                  <Text style={styles.quickAccessValue}>{holdingParcelsCount}</Text>
                  <Text style={styles.quickAccessSub}>Awaiting pickup</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Section 2: Lifestyle & Facilities */}
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Lifestyle & Facilities</Text>
              <View style={styles.lifestyleGrid}>
                {[
                  visitorParkingEnabled && { id: 'visitor', title: 'Visitor Mgt', icon: '🔑', screen: 'VisitorManage' },
                  { id: 'maintenance', title: 'Job Order', icon: '🛠️', screen: 'Maintenance' },
                  amenityBookingEnabled && { id: 'amenity', title: 'Amenities', icon: '🏊', screen: 'Amenity' },
                ].filter((item): item is Exclude<typeof item, false | undefined> => !!item).map((item) => (
                  <TouchableOpacity 
                    key={item.id} 
                    style={styles.lifestyleItem}
                    activeOpacity={0.6}
                    onPress={() => navigation.navigate(item.screen)}
                  >
                    <View>
                      <View style={styles.iconCircle}>
                        <Text style={styles.menuIconEmoji}>{item.icon}</Text>
                      </View>
                      {item.id === 'visitor' && pendingVisitorsCount > 0 && (
                        <View style={styles.iconBadge}>
                          <Text style={styles.badgeText}>{pendingVisitorsCount}</Text>
                        </View>
                      )}
                      {item.id === 'maintenance' && activeJobOrdersCount > 0 && (
                        <View style={styles.iconBadge}>
                          <Text style={styles.badgeText}>{activeJobOrdersCount}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.menuItemTitle}>{item.title}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Section 3: Community */}
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Community</Text>
              <View style={styles.communityList}>
                {[
                  { id: 'notice', title: 'Notices', subtitle: 'Elevator B maintenance...', icon: '📢', screen: 'NoticeList' },
                  { id: 'chat', title: 'Support Chat', subtitle: 'Contact admin or guards', icon: '💬', screen: 'MessagesTab' },
                ].map((item, index) => (
                  <TouchableOpacity 
                    key={item.id}
                    style={[styles.communityListItem, index !== 1 && styles.communityListBorder]}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate(item.screen)}
                  >
                    <View style={styles.communityIconWrap}>
                      <Text style={styles.communityIcon}>{item.icon}</Text>
                      {item.id === 'notice' && unreadCount > 0 && (
                        <View style={styles.iconBadge}>
                          <Text style={styles.badgeText}>{unreadCount}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.communityTextWrap}>
                      <Text style={styles.communityTitle}>{item.title}</Text>
                      <Text style={styles.communitySubtitle} numberOfLines={1}>{item.subtitle}</Text>
                    </View>
                    <Text style={styles.chevronIcon}>❯</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 광고 배너 영역 */}
            <TouchableOpacity style={styles.adBanner}>
              <Text style={styles.adTitle}>📢 QuickClean Laundry Express</Text>
              <Text style={styles.adSubtitle}>Free drop-off & pick-up at your doorstep.</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      {/* 🎯 컴팩트 유닛 스위처 모달 */}
      <Modal 
        visible={unitModalVisible} 
        transparent={true} 
        animationType="fade" 
        onRequestClose={() => setUnitModalVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setUnitModalVisible(false)}>
          <View style={styles.modalContentCard}>
            <Text style={styles.modalTitle}>Select Asset / Unit</Text>
            <FlatList
              data={myUnits}
              keyExtractor={(item: any) => item.unit_id}
              style={{ marginTop: 15, maxHeight: 300 }}
              renderItem={({ item }: { item: any }) => (
                <TouchableOpacity
                  style={[
                    styles.unitItem,
                    item.unit_id === currentUnit?.unit_id && { borderColor: themeColor || '#0038a8', borderWidth: 1.5 }
                  ]}
                  onPress={() => {
                    switchUnit(item.unit_id);
                    setUnitModalVisible(false);
                  }}
                >
                  <Text style={styles.itemCondo}>{item.condo_name}</Text>
                  <Text style={styles.itemUnit}>Unit {item.unit_number} - {item.role.toUpperCase()}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 5. Resident Instant QR Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={quickPassVisible}
        onRequestClose={() => setQuickPassVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <Text style={styles.modalTitle}>{condoName}</Text>
            <Text style={styles.modalSub}>RESIDENT HIGH-PASS ID</Text>
            
            <View style={styles.modalQrWrapper}>
              <QRCode
                value={residentToken}
                size={180}
                color="#0f172a"
                backgroundColor="#fff"
              />
            </View>

            <View style={styles.modalUnitBadge}>
              <Text style={styles.modalUnitText}>UNIT {activeUnitNumber}</Text>
            </View>

            <Text style={styles.modalGuide}>Scan at the main lobby or vehicle scanner terminal for instant gate opening.</Text>

            <TouchableOpacity 
              style={[styles.modalCloseBtn, { backgroundColor: themeColor }]} 
              onPress={() => setQuickPassVisible(false)}
            >
              <Text style={styles.modalCloseBtnText}>Close Pass</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  /* Color Switcher styles */
  colorSwitcherBar: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  colorSwitcherTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5
  },
  colorSwitcherOptions: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
    flex: 0.82,
    justifyContent: 'space-between',
    gap: 4
  },
  colorSwitcherBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center'
  },
  colorSwitcherBtnText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64748b'
  },

  /* Layout Switcher styles */
  layoutSwitcherBar: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  layoutSwitcherTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5
  },
  layoutSwitcherOptions: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    padding: 3,
    flex: 0.82,
    justifyContent: 'space-between'
  },
  layoutSwitcherBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center'
  },
  layoutSwitcherBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1
  },
  layoutSwitcherBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b'
  },
  layoutSwitcherBtnTextActive: {
    color: '#0f172a',
    fontWeight: '700'
  },

  /* Dashboard Styles */
  dashboardHeroSection: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    paddingTop: 65,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4
  },
  dashboardGreeting: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  dashboardCondoName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginTop: 2
  },
  dashboardUnitText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
    fontWeight: '500'
  },
  dashboardMyPassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20
  },
  dashboardMyPassIcon: {
    fontSize: 14,
    marginRight: 6,
    color: '#fff'
  },
  dashboardMyPassText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff'
  },
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
  dashboardSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12
  },
  dashboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24
  },
  dashboardGridItem: {
    width: '31%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    position: 'relative'
  },
  dashboardItemIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  dashboardItemTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center'
  },
  dashboardItemDesc: {
    fontSize: 9,
    color: '#94a3b8',
    marginTop: 2,
    textAlign: 'center'
  },
  dashboardAnnounceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  dashboardAnnounceCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    marginBottom: 16
  },
  dashboardAnnounceBadge: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#fee2e2'
  },
  dashboardAnnounceBadgeText: {
    color: '#ef4444',
    fontSize: 9,
    fontWeight: '800'
  },
  dashboardAnnounceTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6
  },
  dashboardAnnounceText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 12
  },
  dashboardAnnounceFooter: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8
  },
  dashboardAnnounceDate: {
    fontSize: 10,
    color: '#94a3b8'
  },

  /* Concierge Styles */
  conciergeHeroSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 65,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  conciergeBrandText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a'
  },
  conciergeSubText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2
  },
  conciergeActions: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  conciergeNotifBtn: {
    marginRight: 16,
    position: 'relative',
    padding: 4
  },
  conciergeBadgeDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444'
  },
  conciergeQrBtn: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8
  },
  conciergeQrBtnText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800'
  },
  conciergeWelcome: {
    marginBottom: 20
  },
  conciergeWelcomeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a'
  },
  conciergeWelcomeSub: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4
  },
  conciergeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24
  },
  conciergeCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 8
  },
  conciergeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  conciergeIconBg: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center'
  },
  conciergeCountBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4
  },
  conciergeCountText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800'
  },
  conciergeCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4
  },
  conciergeCardDesc: {
    fontSize: 10,
    color: '#64748b',
    lineHeight: 14,
    marginBottom: 12
  },
  conciergeCardLink: {
    fontSize: 11,
    fontWeight: '700'
  },
  conciergeSectionHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 12,
    marginTop: 8
  },
  conciergeFeedItem: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 6
  },
  conciergeFeedMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  conciergeFeedTag: {
    fontSize: 9,
    fontWeight: '800',
    backgroundColor: '#f1f5f9',
    color: '#475569',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  conciergeFeedTime: {
    fontSize: 10,
    color: '#94a3b8'
  },
  conciergeFeedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6
  },
  conciergeFeedSnippet: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18
  },

  mainContainer: { flex: 1, backgroundColor: '#f8fafc' },
  topHeroSection: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 70, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  condoSelector: { flex: 0.6 },
  condoNameText: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  unitNumberText: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2, fontWeight: '500' },
  headerIcons: { flexDirection: 'row', flex: 0.4, justifyContent: 'flex-end', alignItems: 'center' },
  notifBtn: { marginRight: 12, position: 'relative' },
  notifIcon: { fontSize: 22 },
  headerBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#ce1126', borderRadius: 10, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, zIndex: 10 },
  headerBadgeText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  iconEmoji: { fontSize: 22, color: '#fff', marginLeft: 14 },
  quickPassBtn: { backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  quickPassIcon: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  
  sectionContainer: { marginHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 12, marginLeft: 4 },
  
  // Section 1: Quick Access
  quickAccessRow: { flexDirection: 'row', justifyContent: 'space-between' },
  quickAccessCard: { width: '48%', backgroundColor: '#fff', padding: 16, borderRadius: 16, elevation: 4, shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, borderWidth: 1, borderColor: '#f1f5f9' },
  quickAccessHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  quickAccessIcon: { fontSize: 18, marginRight: 6 },
  quickAccessLabel: { fontSize: 13, fontWeight: '600', color: '#475569' },
  quickAccessValue: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  quickAccessSub: { fontSize: 11, color: '#64748b', marginTop: 2, fontWeight: '500' },

  // Ad Banner
  adBanner: { marginHorizontal: 16, marginTop: 24, padding: 16, backgroundColor: '#eff6ff', borderRadius: 16, borderWidth: 1, borderColor: '#bfdbfe' },
  adTitle: { fontSize: 14, fontWeight: 'bold', color: '#1e3a8a', marginBottom: 4 },
  adSubtitle: { fontSize: 12, color: '#3b82f6' },

  // Section 2: Lifestyle & Facilities
  lifestyleGrid: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#0f172a', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  lifestyleItem: { alignItems: 'center', width: '30%' },
  iconCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#f1f5f9' },
  menuIconEmoji: { fontSize: 22 },
  menuItemTitle: { fontSize: 11, fontWeight: '600', color: '#334155', textAlign: 'center' },

  // Section 3: Community & Security
  communityList: { backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#0f172a', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  communityListItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  communityListBorder: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  communityIconWrap: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', marginRight: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  communityIcon: { fontSize: 20 },
  communityTextWrap: { flex: 1 },
  communityTitle: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  communitySubtitle: { fontSize: 12, color: '#64748b', marginTop: 3 },
  chevronIcon: { fontSize: 14, color: '#cbd5e1', fontWeight: 'bold' },

  // Badge Styles
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#ce1126',
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  iconBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ce1126',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },

  // Modal Style Sheets
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContentCard: { width: width * 0.82, backgroundColor: '#fff', borderRadius: 28, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 11, fontWeight: '700', color: '#64748b', marginTop: 3, letterSpacing: 1 },
  modalQrWrapper: { padding: 14, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f1f5f9', marginTop: 20, marginBottom: 16, elevation: 2 },
  modalUnitBadge: { paddingHorizontal: 14, paddingVertical: 5, backgroundColor: '#f0fdf4', borderRadius: 8, marginBottom: 14 },
  modalUnitText: { fontSize: 12, fontWeight: '800', color: '#16a34a' },
  modalGuide: { fontSize: 12, color: '#64748b', textAlign: 'center', lineHeight: 18, paddingHorizontal: 10, marginBottom: 20 },
  modalCloseBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  modalCloseBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  gridItemBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#ce1126',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: '#fff',
    zIndex: 10
  },
  gridItemBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
    textAlign: 'center'
  },
  compactUnitSwitcherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingVertical: 5,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  compactUnitSwitcherText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  unitItem: {
    width: '100%',
    padding: 15,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  itemCondo: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  itemUnit: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '600',
  }
});
