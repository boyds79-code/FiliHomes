import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar, ScrollView, Alert, Share, TextInput, ActivityIndicator, Switch, Modal, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
// @ts-ignore
import QRCode from 'react-native-qrcode-svg';
import { useCondoConfig } from '../hooks/CondoConfigContext';
import { useUnit } from '../contexts/UnitContext';
import { supabase } from '../lib/supabase';
import { useBadge } from '../contexts/BadgeContext';
import VisitorHistory from '../components/VisitorHistory';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function VisitorManageScreen({ navigation }: any) {
  const { themeColor, condoName } = useCondoConfig();
  const { currentUnit, unitLoading } = useUnit();
  const { refreshBadges } = useBadge();
  
  // Helper to get local date string YYYY-MM-DD
  const getLocalDateStr = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [activeTab, setActiveTab] = useState<'REGISTRATION' | 'HISTORY'>('REGISTRATION');
  const scrollViewRef = useRef<ScrollView>(null);

  const handleTabPress = (tabName: 'REGISTRATION' | 'HISTORY') => {
    setActiveTab(tabName);
    const idx = tabName === 'REGISTRATION' ? 0 : 1;
    scrollViewRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: true });
    if (tabName === 'REGISTRATION') {
      handleResetForm();
    }
  };
  const [pendingCount, setPendingCount] = useState(0);

  // Input form state variables
  const todayStr = getLocalDateStr();
  const [visitorName, setVisitorName] = useState('');
  const [purpose, setPurpose] = useState('');         
  const [startDate, setStartDate] = useState(todayStr); 
  const [endDate, setEndDate] = useState(todayStr); // Defaults to same as startDate
  const [isMultiUser, setIsMultiUser] = useState(false);
  const [salt, setSalt] = useState(Date.now().toString());

  // Loading and transaction variables
  const [submitting, setSubmitting] = useState(false);
  const [qrToken, setQrToken] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  
  const isReusable = !endDate.trim();
  const [approvalRequired, setApprovalRequired] = useState(true);

  // Calendar states
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState<'START' | 'END' | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Parse QR token into dictionary
  const parseQrToken = (token: string) => {
    const parts = token.split('|');
    const result: Record<string, string> = {};
    parts.forEach(p => {
      const idx = p.indexOf(':');
      if (idx !== -1) {
        result[p.slice(0, idx)] = p.slice(idx + 1);
      }
    });
    return result;
  };

  // Check for expiring reusable passes on mount
  useEffect(() => {
    const activeUnitId = currentUnit?.unit_id;
    if (!activeUnitId) return;
    
    const checkExpiringPasses = async () => {
      try {
        const { data: activePasses, error } = await supabase
          .from('visitor_passes')
          .select('*')
          .eq('unit_id', activeUnitId)
          .eq('status', 'APPROVED');
          
        if (error || !activePasses) return;
        
        const today = new Date();
        const todayStr = getLocalDateStr(today);
        
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = getLocalDateStr(tomorrow);
        
        for (const pass of activePasses) {
          const qr = pass.qr_code_value;
          if (!qr || !qr.includes('REUSABLE:TRUE')) continue;
          
          const parsed = parseQrToken(qr);
          const toDate = parsed['TO'];
          if (!toDate) continue;
          
          const isTomorrow = toDate === tomorrowStr;
          const isToday = toDate === todayStr;
          
          if (isToday || isTomorrow) {
            Alert.alert(
              "Pass Expiring Soon ⏰",
              `The reusable pass for ${pass.visitor_name} is expiring ${isTomorrow ? 'tomorrow' : 'today'} (${toDate}).\nWould you like to extend it for 30 more days or terminate it?`,
              [
                {
                  text: "Terminate Pass",
                  style: "destructive",
                  onPress: async () => {
                    const { error: termErr } = await supabase
                      .from('visitor_passes')
                      .update({ status: 'REJECTED', entry_time: new Date().toISOString() })
                      .eq('id', pass.id);
                    if (!termErr) {
                      Alert.alert("Terminated", `The pass for ${pass.visitor_name} has been terminated.`);
                    }
                  }
                },
                {
                  text: "Extend 30 Days",
                  onPress: async () => {
                    const currentTo = new Date(toDate);
                    currentTo.setDate(currentTo.getDate() + 30);
                    const newToDate = currentTo.toISOString().split('T')[0];
                    
                    const updatedToken = qr.replace(`TO:${toDate}`, `TO:${newToDate}`);
                    
                    const { error: extErr } = await supabase
                      .from('visitor_passes')
                      .update({ qr_code_value: updatedToken })
                      .eq('id', pass.id);
                    if (!extErr) {
                      Alert.alert("Extended", `The pass for ${pass.visitor_name} has been extended until ${newToDate}.`);
                    }
                  }
                },
                {
                  text: "Later",
                  style: "cancel"
                }
              ]
            );
            break;
          }
        }
      } catch (err) {
        console.error("Error checking expiring passes:", err);
      }
    };
    
    checkExpiringPasses();
  }, [currentUnit?.unit_id]);


  useEffect(() => {
    const fetchPolicy = async () => {
      const { data } = await supabase
        .from('condo_settings')
        .select('approval_policy')
        .eq('condo_id', 'c1111111-1111-1111-1111-111111111111')
        .maybeSingle();
        
      if (data) {
        setApprovalRequired(data.approval_policy === 'REQUIRED');
      }
    };
    fetchPolicy();
  }, []);

  useEffect(() => {
    const activeUnitId = currentUnit?.unit_id;
    if (!activeUnitId) return;
    
    const fetchCount = async () => {
      const { count } = await supabase
        .from('visitor_passes')
        .select('*', { count: 'exact', head: true })
        .eq('unit_id', activeUnitId)
        .eq('status', 'PENDING');
      setPendingCount(count || 0);
    };

    fetchCount();
    
    const channel = supabase
      .channel(`badge-count-${activeUnitId}-${Date.now()}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'visitor_passes', 
        filter: `unit_id=eq.${activeUnitId}` 
      }, () => {
        fetchCount();
        refreshBadges();
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [currentUnit?.unit_id]);

  const calculateExpiryDate = (startStr: string) => {
    try {
      const date = new Date(startStr);
      if (isNaN(date.getTime())) return getLocalDateStr(new Date(Date.now() + 30*24*60*60*1000));
      date.setDate(date.getDate() + 30);
      return getLocalDateStr(date);
    } catch (e) {
      return getLocalDateStr(new Date(Date.now() + 30*24*60*60*1000));
    }
  };

  // Update token combination and reset registration status when input changes
  useEffect(() => {
    const sanitizedName = visitorName.trim() || 'Guest';
    const sanitizedPlate = 'WALK-IN';
    const reusableStr = isReusable ? '|REUSABLE:TRUE' : '';
    const multiEntryStr = isMultiUser ? '|MULTI_ENTRY:TRUE' : '';
    const calculatedEnd = isReusable ? calculateExpiryDate(startDate) : endDate.trim();
    
    setQrToken(`FILICONDO-VMS|TYPE:WALK_IN|NAME:${sanitizedName}|PLATE:${sanitizedPlate}${reusableStr}${multiEntryStr}|FROM:${startDate}|TO:${calculatedEnd}|SALT:${salt}`);
    setIsRegistered(false);
  }, [visitorName, startDate, endDate, isMultiUser, salt]);

  console.log("🔍 Current unitId:", currentUnit?.unit_id);

  const handleRegisterPass = async () => {
    if (!visitorName.trim()) {
      Alert.alert("Required Input", "Please enter the Visitor Name before submitting.");
      return;
    }

    try {
      setSubmitting(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        console.log("DEBUG - No session user, error prevented.");
        return;
      }

      const finalPurpose = purpose.trim() || 'Quick Mode Entry';

      const { error } = await supabase
        .from('visitor_passes')
        .insert([{
          user_id: userId,
          unit_id: currentUnit?.unit_id,
          visitor_name: visitorName.trim(),
          visit_type: 'WALK_IN',
          plate_number: null,
          vehicle_type: null,
          purpose: finalPurpose,
          visit_date: startDate,
          status: 'APPROVED',
          qr_code_value: qrToken
        }]);

      if (error) {
        console.error("❌ Supabase Insert Error:", error);
        Alert.alert("Error", `Registration failed: ${error.message}`);
        return;
      }

      setIsRegistered(true);
      Alert.alert("Success 🎉", "Access Pass has been registered and activated successfully!");
      refreshBadges();
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSharePass = async () => {
    try {
      const webPassUrl = `https://vms.filicondo.com/pass?token=${encodeURIComponent(qrToken)}`;
      const typeLabel = isMultiUser ? '👥 Multi-User Group Pass' : '🚶 Pedestrian / Walk-in';
      const scheduleDetails = isReusable
        ? `🕒 Validity: Reusable Pass (Expires 30 Days from start date: ${startDate})`
        : `📅 Validity Period: ${startDate} ~ ${endDate}`;

      const shareMessage = `[${condoName || 'Condominium'}] Visitor Access Pass (${approvalRequired ? 'PENDING' : 'APPROVED'}) 🎉\n\n` +
        `👤 Visitor Name: ${visitorName}\n` +
        `📦 Access Type: ${typeLabel}\n` +
        `🎯 Purpose: Quick Mode Entry\n` +
        `${scheduleDetails}\n\n` +
        `📢 IMPORTANT FOR GUEST/RIDER:\n` +
        `Your pass is ${approvalRequired ? 'PENDING and awaiting admin/guard check' : 'verified and ACTIVE'}. Please tap the link below to open your secure entrance QR Code at the main gate terminal:\n\n` +
        `🔗 Tap to Open QR Pass:\n${webPassUrl}`;

      await Share.share({ message: shareMessage });
    } catch (error: any) {
      Alert.alert("Share Error", error.message);
    }
  };

  const handleResetForm = () => {
    const today = getLocalDateStr();
    setVisitorName('');
    setPurpose('');
    setStartDate(today);
    setEndDate(today);
    setIsMultiUser(false);
    setIsRegistered(false);
    setSalt(Date.now().toString());
  };

  // Calendar utility helpers
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
    if (calendarTarget === 'START') {
      setStartDate(selectedStr);
      setEndDate(selectedStr); // Auto pre-fill End Date with the same date as Start Date
    } else {
      setEndDate(selectedStr);
    }
    setIsCalendarVisible(false);
  };

  const handleSetNoExpiration = () => {
    Alert.alert(
      "Pass Validity Reminder",
      "Without a specified end date, this pass will be generated as a reusable pass valid for up to 30 days. You will be notified 1 day before and on the day of expiration to extend or terminate the pass.",
      [
        {
          text: "Confirm",
          onPress: () => {
            setEndDate('');
            setIsCalendarVisible(false);
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeAreaContainer}>
      <View style={styles.navHeader}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.6}>
          <Text style={[styles.backIcon, { color: themeColor || '#0038a8' }]}>❮</Text>
          <Text style={styles.backText}>Home</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Visitor Access Center</Text>
        <View style={{ width: 60 }} /> 
      </View>

      {/* Tab Bar Menu */}
      <View style={styles.mainTabBar}>
        <TouchableOpacity style={[styles.mainTab, activeTab === 'REGISTRATION' && { borderBottomColor: themeColor || '#0038a8' }]} onPress={() => handleTabPress('REGISTRATION')}>
          <Text style={[styles.mainTabLabel, activeTab === 'REGISTRATION' && { color: themeColor || '#0038a8', fontWeight: '700' }]}>Registration</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.mainTab, activeTab === 'HISTORY' && { borderBottomColor: themeColor || '#0038a8' }]} onPress={() => handleTabPress('HISTORY')}>
          <Text style={[styles.mainTabLabel, activeTab === 'HISTORY' && { color: themeColor || '#0038a8', fontWeight: '700' }]}>Visitors</Text>
          {pendingCount > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{pendingCount}</Text></View>
          )}
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
          const tabs: ('REGISTRATION' | 'HISTORY')[] = ['REGISTRATION', 'HISTORY'];
          if (tabs[index]) {
            setActiveTab(tabs[index]);
          }
        }}
        style={{ flex: 1 }}
      >
        <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
          <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.formContainer}>
            <Text style={styles.formHeading}>Registration Details</Text>
            
            <Text style={styles.inputLabel}>Visitor *</Text>
            <TextInput 
              style={styles.textInput}
              placeholder="e.g. Clean Lady, Math Tutor, Uncle Bob"
              placeholderTextColor="#94a3b8"
              value={visitorName}
              onChangeText={setVisitorName}
            />

            <View style={[styles.rowInputs, { marginTop: 12 }]}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[styles.inputLabel, { marginTop: 0 }]}>Start Date *</Text>
                <TouchableOpacity 
                  style={styles.textInput}
                  onPress={() => {
                    setCalendarTarget('START');
                    const currentStart = new Date(startDate);
                    if (!isNaN(currentStart.getTime())) {
                      setCalendarMonth(currentStart);
                    } else {
                      setCalendarMonth(new Date());
                    }
                    setIsCalendarVisible(true);
                  }}
                >
                  <Text style={{ color: '#0f172a', fontSize: 14 }}>{startDate}</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={[styles.inputLabel, { marginTop: 0 }]}>End Date (Optional)</Text>
                <TouchableOpacity 
                  style={styles.textInput}
                  onPress={() => {
                    setCalendarTarget('END');
                    const currentEnd = endDate.trim() ? new Date(endDate) : new Date(startDate);
                    if (!isNaN(currentEnd.getTime())) {
                      setCalendarMonth(currentEnd);
                    } else {
                      setCalendarMonth(new Date());
                    }
                    setIsCalendarVisible(true);
                  }}
                >
                  <Text style={{ color: endDate.trim() ? '#0f172a' : '#94a3b8', fontSize: 14 }}>
                    {endDate.trim() ? endDate : "No Expiration Date"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingHorizontal: 4 }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#1e293b' }}>Allow Multiple Visitors</Text>
                <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Allow multiple entries with this single code.</Text>
              </View>
              <Switch 
                value={isMultiUser}
                onValueChange={setIsMultiUser}
                trackColor={{ false: '#cbd5e1', true: themeColor || '#0038a8' }}
                thumbColor={isMultiUser ? '#fff' : '#f4f3f4'}
              />
            </View>
          </View>

          {!isRegistered ? (
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: themeColor || '#0038a8' }]} 
              onPress={() => { setPurpose('Quick Mode Entry'); handleRegisterPass(); }}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.actionButtonText}>⚡ Generate QR Pass</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: '#16a34a' }]} 
              onPress={handleSharePass}
            >
              <Text style={styles.actionButtonText}>✉️ Share Access Pass Link</Text>
            </TouchableOpacity>
          )}

          {/* Dynamic Visual Token Card Box */}
          {isRegistered ? (
            <View style={styles.qrCard}>
              <Text style={styles.cardCondoName}>{condoName || 'Phili-One Condominium'}</Text>
              <Text style={styles.cardPassType}>
                {isMultiUser ? 'MULTI-USER GROUP PASS' : (isReusable ? 'REUSABLE PASS (30 DAYS MAX)' : 'SINGLE-USE ENTRY PASS')}
              </Text>
              <View style={styles.qrWrapper}>
                <QRCode value={qrToken || 'FILICONDO-VMS'} size={160} color="#0f172a" backgroundColor="#fff" />
              </View>
              <View style={[styles.statusBadge, { backgroundColor: '#eafaf1', borderColor: '#d1fae5' }]}>
                <Text style={[styles.statusText, { color: '#16a34a' }]}>
                  {isMultiUser ? '✓ ACTIVE MULTI-USER PASS' : (isReusable ? '✓ ACTIVE REUSABLE PASS' : '✓ ACTIVE SINGLE-USE PASS')}
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.qrCard, { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1', borderStyle: 'dashed' }]}>
              <Text style={[styles.cardPassType, { color: '#64748b', marginTop: 10 }]}>ACCESS PASS NOT ACTIVE</Text>
              <View style={[styles.qrWrapper, { opacity: 0.15, paddingVertical: 20 }]}>
                <QRCode value="FILICONDO-VMS" size={120} color="#64748b" backgroundColor="#fff" />
              </View>
              <Text style={{ color: '#475569', fontSize: 13, fontWeight: '700', textAlign: 'center', marginHorizontal: 20, marginBottom: 10 }}>
                👉 Tap the button above to generate your QR Pass.
              </Text>
            </View>
          )}

          {isRegistered && (
            <TouchableOpacity 
              style={[styles.actionButton, { backgroundColor: '#64748b', marginTop: 10 }]} 
              onPress={handleResetForm}
            >
              <Text style={styles.actionButtonText}>🔄 Register New Visitor</Text>
            </TouchableOpacity>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          {currentUnit?.unit_id ? (
            <VisitorHistory unitId={currentUnit.unit_id} />
          ) : (
            <Text style={{ textAlign: 'center', marginTop: 50, color: '#64748b' }}>
              {currentUnit === null && !unitLoading ? "Unit loading failed (Check Supabase RLS)" : "Loading..."}
            </Text>
          )}
        </View>
      </View>
    </ScrollView>

      {/* Calendar Picker Modal */}
      <Modal
        visible={isCalendarVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCalendarVisible(false)}
      >
        <View style={styles.calendarModalOverlay}>
          <View style={styles.calendarModalView}>
            <Text style={styles.calendarModalTitle}>
              Select {calendarTarget === 'START' ? 'Start Date' : 'End Date'}
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
                const isSelected = cellDate === (calendarTarget === 'START' ? startDate : endDate);
                
                const isCellDisabled = (() => {
                  if (calendarTarget === 'END') {
                    const start = new Date(startDate);
                    const maxEnd = new Date(startDate);
                    maxEnd.setDate(maxEnd.getDate() + 30);
                    const cell = new Date(cellDate);
                    return cell < start || cell > maxEnd;
                  }
                  return false;
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

            {/* Footer Buttons */}
            <View style={{ marginTop: 20 }}>
              {calendarTarget === 'END' && (
                <TouchableOpacity
                  style={[styles.calendarFooterButton, { backgroundColor: themeColor || '#0038a8', marginBottom: 10 }]}
                  onPress={handleSetNoExpiration}
                >
                  <Text style={[styles.calendarFooterButtonText, { color: '#fff' }]}>
                    No Expiration Date
                  </Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity
                style={[styles.calendarFooterButton, { backgroundColor: '#f1f5f9' }]}
                onPress={() => setIsCalendarVisible(false)}
              >
                <Text style={[styles.calendarFooterButtonText, { color: '#475569' }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
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
  navTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  mainTabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  mainTab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', flexDirection: 'row', justifyContent: 'center' },
  mainTabLabel: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  badge: { backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 15 },
  screenSub: { fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 18, fontWeight: '500' },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 6 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 4, marginBottom: 14 },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabText: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  activeTabText: { color: '#fff', fontWeight: '700' },
  formContainer: { backgroundColor: '#fff', borderRadius: 24, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16, marginTop: 6 },
  formHeading: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
  inputLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', marginBottom: 6, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.3 },
  textInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#0f172a' },
  rowInputs: { flexDirection: 'row', justifyContent: 'space-between' },
  qrCard: { backgroundColor: '#fff', borderRadius: 24, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 },
  cardCondoName: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  cardPassType: { fontSize: 11, fontWeight: '700', color: '#94a3b8', marginTop: 4, letterSpacing: 0.5 },
  qrWrapper: { padding: 14, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f1f5f9', marginTop: 14, marginBottom: 14 },
  statusBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: '800' },
  actionButton: { paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginBottom: 16 },
  actionButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  guideBox: { backgroundColor: '#f8fafc', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  guideTitle: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8 },
  guideText: { fontSize: 12, color: '#64748b', lineHeight: 18, marginBottom: 6 },

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
  calendarFooterButton: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  calendarFooterButtonText: { fontSize: 14, fontWeight: '700' }
});