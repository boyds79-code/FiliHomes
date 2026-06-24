import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Linking, Alert } from 'react-native';
import { useUnit } from '../hooks/UnitContext';
import { useCondoConfig } from '../hooks/CondoConfigContext';

export function EcosystemWidget() {
  const { currentUnit } = useUnit();
  const { themeColor } = useCondoConfig();

  if (!currentUnit) return null;

  // 외부 서비스 앱 구동 또는 웹 예약 페이지로 데이터 브릿지 연동하는 함수
  const navigateToExternalService = async (serviceType: 'HEYDRIVER' | 'PHILISPA') => {
    // 유저 파라미터 묶음 (어느 콘도 몇 호에서 유입된 건지 트래킹 및 타겟팅 포인트)
    const condoNameEncoded = encodeURIComponent(currentUnit.condo_name);
    const unitNumEncoded = encodeURIComponent(currentUnit.unit_number);
    
    // 1. HeyDriver 렌터카 서비스 연동 스키마 조합
    const heydriverUrl = `heydriver://reserve?promo=CONDO20&ref_condo=${condoNameEncoded}&ref_unit=${unitNumEncoded}`;
    const heydriverWebFallback = `https://heydriver.com/book?promo=CONDO20&condo=${condoNameEncoded}`;

    // 2. PhiliSpa 출장 마사지 서비스 연동 스키마 조합
    const philispaUrl = `philispa://book?type=premium&ref_condo=${condoNameEncoded}&ref_unit=${unitNumEncoded}`;
    const philispaWebFallback = `https://philispa.com/reserve?condo=${condoNameEncoded}&unit=${unitNumEncoded}`;

    const targetUrl = serviceType === 'HEYDRIVER' ? heydriverUrl : philispaUrl;
    const fallbackUrl = serviceType === 'HEYDRIVER' ? heydriverWebFallback : philispaWebFallback;

    try {
      // 기기에 해당 앱이 설치되어 있는지 체크 후 딥링크 오픈
      const isSupported = await Linking.canOpenURL(targetUrl);
      if (isSupported) {
        await Linking.openURL(targetUrl);
      } else {
        // 앱이 없을 경우 모바일 브라우저 웹 예약 폼으로 안전하게 리다이렉트 (Fallback)
        await Linking.openURL(fallbackUrl);
      }
    } catch (err) {
      Alert.alert("Connection Error", "Cannot open the requested service right now.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Exclusive Resident Services 🎁</Text>
      <Text style={styles.sectionSub}>Special benefits directly connected to your unit.</Text>

      <View style={styles.row}>
        {/* HeyDriver 제휴 카드 */}
        <TouchableOpacity 
          style={styles.card} 
          onPress={() => navigateToExternalService('HEYDRIVER')}
        >
          <View style={[styles.iconBadge, { backgroundColor: themeColor }]}>
            <Text style={styles.iconText}>🚗</Text>
          </View>
          <Text style={styles.cardTitle}>HeyDriver</Text>
          <Text style={styles.cardDesc}>Car Rental & Airport Pick-up (20% OFF)</Text>
        </TouchableOpacity>

        {/* PhiliSpa 제휴 카드 */}
        <TouchableOpacity 
          style={styles.card} 
          onPress={() => navigateToExternalService('PHILISPA')}
        >
          <View style={[styles.iconBadge, { backgroundColor: '#4a148c' }]}>
            <Text style={styles.iconText}>💆</Text>
          </View>
          <Text style={styles.cardTitle}>PhiliSpa</Text>
          <Text style={styles.cardDesc}>Premium In-Unit Massage Service</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#f8f9fa', borderRadius: 16, margin: 15 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#222' },
  sectionSub: { fontSize: 12, color: '#777', marginTop: 2, marginBottom: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  card: { flex: 0.48, backgroundColor: '#fff', padding: 15, borderRadius: 12, elevation: 1, borderWidth: 1, borderColor: '#eef2f5' },
  iconBadge: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  iconText: { fontSize: 20 },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  cardDesc: { fontSize: 11, color: '#666', marginTop: 4, lineHeight: 14 }
});