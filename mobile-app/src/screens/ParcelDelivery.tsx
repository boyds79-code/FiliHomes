import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, Alert, SafeAreaView, Platform, StatusBar, Modal } from 'react-native';
// @ts-ignore
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext'; 
import { useBadge } from '../contexts/BadgeContext';

export default function ParcelDeliveryScreen({ navigation }: any) {
  const { themeColor, unitNumber } = useCondoConfig();
  const { refreshBadges } = useBadge();

  const [loading, setLoading] = useState(true);
  const [actionProgress, setActionProgress] = useState(false);
  const [parcels, setParcels] = useState<any[]>([]);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [selectedQrToken, setSelectedQrToken] = useState('');
  const localActionRef = useRef<string | null>(null);

  // 🎯 useEffect 무한 렌더링 방지를 위한 useCallback 래핑
  const fetchMyParcels = useCallback(async () => {
  if (!unitNumber) return;
  try {
    setLoading(true);
    const unitStr = String(unitNumber).trim();
    
    // [수정] status 필터링을 제거하고 모든 데이터를 가져와서 앱 내부에서 구분합니다.
    const { data, error } = await supabase
      .from('parcels')
      .select('*')
      .eq('unit_no', unitStr)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // 가져온 데이터를 상태에 저장 (상태가 COLLECTED/RELEASED인 것도 함께 불러옴)
    setParcels(data || []);
  } catch (err) {
    console.error("Fetch Error:", err);
    setParcels([]);
  } finally {
    setLoading(false);
  }
}, [unitNumber]);

  useEffect(() => {
    fetchMyParcels();
    const unitStr = String(unitNumber).trim(); 

    // ⚡ Realtime 구독: 명시적으로 INSERT/UPDATE 분리 및 로직 단순화
    const parcelChannel = supabase
      .channel('realtime:parcels')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'parcels',
        filter: `unit_no=eq.${unitStr}` // 내 유닛 데이터만 확실히 구독
      }, (payload) => {
        console.log("Realtime event received:", payload.eventType);
        // 이벤트 종류와 관계없이 변경 시 무조건 리스트 재호출
        fetchMyParcels();

        // 수령 완료 알림
        if (payload.eventType === 'UPDATE' && payload.new.status === 'COLLECTED') {
          if (localActionRef.current === payload.new.id) {
            // 로컬 액션이므로 알림 중복 노출 스킵 및 Ref 초기화
            localActionRef.current = null;
          } else {
            Alert.alert("Parcel Collected ✅", "Your parcel has been successfully picked up!");
          }
        }
        // 신규 입고 알림
        if (payload.eventType === 'INSERT') {
          Alert.alert("📦 New Parcel Arrived!", "You have a new package waiting at the lobby.");
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(parcelChannel);
    };
  }, [fetchMyParcels, unitNumber]);

  const handleConfirmCollection = async (parcelId: string) => {
    try {
      setActionProgress(true);
      localActionRef.current = parcelId; // 로컬 액션 마킹
      const { error } = await supabase
        .from('parcels')
        .update({ status: 'COLLECTED', is_overdue: false, collected_at: new Date().toISOString() })
        .eq('id', parcelId);

      if (error) throw error;

      Alert.alert('Success ✅', 'Parcel marked as successfully collected from the building desk.');
      fetchMyParcels(); 
      refreshBadges();
    } catch (err: any) {
      console.log(err);
      Alert.alert('Error', 'Failed to update parcel status on server.');
    } finally {
      setActionProgress(false);
    }
  };

  const handleShowQr = (token: string) => {
    // 🎯 가드 앱에서 묶음 처리를 할 수 있도록 통합 QR JSON 포맷으로 생성
    setSelectedQrToken(JSON.stringify({ code: token || `PASS-GROUP` }));
    setQrModalVisible(true);
  };

  const renderParcelItem = ({ item }: { item: any }) => {
    const isArrived = item.status === 'ARRIVED';
    
    if (!isArrived) return null;

    return (
      <View style={[styles.parcelCard, item.is_overdue && styles.overdueCard]}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.parcelImage} />
        ) : (
          <View style={styles.noImageView}>
            <Text style={{ fontSize: 30 }}>📦</Text>
            <Text style={styles.noImageText}>No Image Attached By Guard</Text>
          </View>
        )}

        <View style={styles.detailsContainer}>
          <View style={styles.badgeRow}>
            <Text style={styles.carrierText}>
              🚚 {item.carrier_name || 'Courier Service'}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: item.is_overdue ? '#fee2e2' : (isArrived ? '#fff7ed' : '#f0fdf4') }]}>
              <Text style={[styles.statusText, { color: item.is_overdue ? '#dc2626' : (isArrived ? '#ea580c' : '#16a34a') }]}>
                {item.is_overdue ? '⚠️ OVERDUE' : (isArrived ? 'Awaiting Pickup' : 'Collected')}
              </Text>
            </View>
          </View>

          {item.tracking_number && (
            <Text style={styles.trackingText}>Ref/Track: {item.tracking_number}</Text>
          )}
          
          <Text style={styles.dateText}>
            Logged at: {new Date(item.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </Text>

          {/* ⚠️ 장기 방치 택배일 경우 시각적 푸시 배너 인젝션 */}
          {item.is_overdue && isArrived && (
            <View style={styles.warningLockerBanner}>
              <Text style={styles.warningLockerText}>
                This package has been at the desk for over 24 hours. Please claim it promptly to avoid holding constraints.
              </Text>
            </View>
          )}

          {/* 🎯 택배 수령을 위한 인증용 QR 코드 즉시 노출 */}
          {isArrived && (
            <View style={{ alignItems: 'center', marginVertical: 15, padding: 15, backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 10 }}>
                Please show to the guard (Group Code: {item.secure_pass_code})
              </Text>
              <QRCode 
                value={JSON.stringify({ code: item.secure_pass_code })} 
                size={120} 
              />
            </View>
          )}

          {isArrived ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity
                style={[styles.collectBtn, { flex: 1, backgroundColor: item.is_overdue ? '#dc2626' : (themeColor || '#0038a8') }]}
                onPress={() => handleConfirmCollection(item.id)}
                disabled={actionProgress}
              >
                {actionProgress ? <ActivityIndicator color="#fff" /> : <Text style={styles.collectBtnText}>Mark as Collected</Text>}
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.collectBtn, { flex: 1, backgroundColor: '#0f172a' }]}
                onPress={() => handleShowQr(item.secure_pass_code)}
              >
                <Text style={styles.collectBtnText}>📱 Show QR Pass</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.collectedTimeText}>
              Picked up on: {new Date(item.collected_at || item.created_at).toLocaleDateString('en-US')}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const pendingParcels = parcels.filter(p => p.status === 'ARRIVED');
  const pendingCount = pendingParcels.length;

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
        <Text style={styles.navTitle}>Parcel Locker</Text>
        <View style={{ width: 60 }} /> 
      </View>

      <View style={styles.container}>
        <View style={styles.summaryHeader}>
          <Text style={styles.summarySub}>Track and confirm deliveries dropped off at the guard house or receptionist desk.</Text>
          
          <View style={[styles.counterBox, { borderLeftColor: themeColor || '#0038a8' }]}>
            <Text style={styles.counterLabel}>Parcels Waiting for You</Text>
            <Text style={[styles.counterNumber, { color: themeColor || '#0038a8' }]}>{pendingCount}</Text>
          </View>
        </View>

        {pendingParcels.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>Your locker is empty. No package logs found for this unit.</Text>
          </View>
        ) : (
          <FlatList
            data={pendingParcels}
            keyExtractor={(item) => item.id}
            renderItem={renderParcelItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 120 }}
          />
        )}
      </View>

      {/* QR Pass Modal */}
<Modal animationType="fade" transparent={true} visible={qrModalVisible} onRequestClose={() => setQrModalVisible(false)}>
  <View style={styles.modalOverlay}>
    <View style={styles.qrCard}>
      <Text style={styles.qrTitle}>Secure Pickup Pass</Text>
      <Text style={styles.qrSub}>Show this QR code to the lobby guard</Text>
      
      <View style={styles.qrWrapper}>
        <QRCode value={selectedQrToken} size={160} color="#0f172a" backgroundColor="#fff" />
      </View>
      
      <Text style={styles.qrTokenText}>{selectedQrToken}</Text>

      {/* ⚠️ 보안 경고 메시지 추가 */}
      <Text style={styles.securityWarning}>
        ⚠️ SECURITY ALERT: This QR code allows package collection. 
        Only share with trusted individuals.
      </Text>

      <TouchableOpacity 
        style={[styles.closeBtn, { backgroundColor: themeColor || '#0038a8', marginTop: 20 }]} 
        onPress={() => setQrModalVisible(false)}
      >
        <Text style={styles.closeBtnText}>Close</Text>
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
  container: { flex: 1, backgroundColor: '#fafbfd', paddingHorizontal: 20, paddingTop: 15 },
  summaryHeader: { marginBottom: 16 },
  summarySub: { fontSize: 13, color: '#64748b', lineHeight: 18 },
  counterBox: { backgroundColor: '#fff', borderLeftWidth: 4, padding: 16, borderRadius: 12, marginTop: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#0f172a', shadowOpacity: 0.01, shadowRadius: 4 },
  counterLabel: { fontSize: 14, fontWeight: '600', color: '#334155' },
  counterNumber: { fontSize: 24, fontWeight: 'bold' },
  emptyBox: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 50, marginBottom: 10 },
  emptyText: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 20 },
  parcelCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16, overflow: 'hidden', shadowColor: '#0f172a', shadowOpacity: 0.02, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  overdueCard: { borderColor: '#fca5a5', backgroundColor: '#fff5f5' }, // Overdue 전용 외곽선 고도화
  parcelImage: { width: '100%', height: 180, resizeMode: 'cover' },
  noImageView: { width: '100%', height: 130, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  noImageText: { fontSize: 11, color: '#94a3b8', marginTop: 6, fontWeight: '500' },
  detailsContainer: { padding: 16 },
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  carrierText: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: 'bold' },
  trackingText: { fontSize: 12, color: '#475569', fontWeight: '500', marginBottom: 2 },
  dateText: { fontSize: 11, color: '#94a3b8', marginBottom: 12 },
  warningLockerBanner: { backgroundColor: '#fee2e2', borderRadius: 8, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#fca5a5' },
  warningLockerText: { color: '#b91c1c', fontSize: 11, lineHeight: 16, fontWeight: '600' },
  collectBtn: { width: '100%', padding: 13, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  collectBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  collectedTimeText: { fontSize: 12, color: '#64748b', fontStyle: 'italic', textAlign: 'right', marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  qrCard: { width: '100%', backgroundColor: '#fff', borderRadius: 24, padding: 24, alignItems: 'center' },
  qrTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  qrSub: { fontSize: 13, color: '#64748b', marginTop: 4, marginBottom: 20 },
  qrWrapper: { padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 },
  qrTokenText: { fontSize: 16, fontWeight: '900', color: '#0038a8', letterSpacing: 1, marginBottom: 24 },
  closeBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  closeBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  securityWarning: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 15,
    paddingHorizontal: 20,
    lineHeight: 16
  }
});