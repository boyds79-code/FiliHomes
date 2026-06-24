import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useUnit } from '../hooks/UnitContext';

export function AppGuardInterceptor({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const { currentUnit } = useUnit();
  const [unitStatus, setUnitStatus] = useState<'active' | 'inactive' | 'suspended' | 'loading'>('loading');

  useEffect(() => {
    if (!session || !currentUnit) {
      setUnitStatus('active');
      return;
    }
    checkCurrentUnitAuthorization();
  }, [currentUnit, session]);

  const checkCurrentUnitAuthorization = async () => {
    const userId = session?.user?.id;
    if (!userId || !currentUnit?.unit_id) {
        console.log("DEBUG - 세션 유저 없음, 여기서 에러 방지 완료.");
        setUnitStatus('active');
        return;
    }
    try {
      // 현재 스위칭되어 있는 유닛의 최신 활성화 상태를 서버에서 직접 체크
      const { data, error } = await supabase
        .from('user_units')
        .select('status')
        .eq('user_id', userId)
        .eq('unit_id', currentUnit.unit_id)
        .single();

      if (!error && data) {
        setUnitStatus(data.status as any);
      } else {
        setUnitStatus('active');
      }
    } catch (err) {
      setUnitStatus('active');
    }
  };

  // 1. 계약이 완전히 만료되어 퇴거 처리된 임차인 차단 UI
  if (unitStatus === 'inactive') {
    return (
      <View style={styles.blockContainer}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.blockTitle}>Lease Term Expired</Text>
        <Text style={styles.blockMessage}>
          Your access to this unit's mobile services has been automatically deactivated because your lease period has ended. Please contact the PMO (Property Management Office) if this is an error.
        </Text>
      </View>
    );
  }

  // 2. 관리비/RTO 할부금 장기 체납으로 기능이 잠긴 연체자 차단 UI (영업 필살기)
  if (unitStatus === 'suspended') {
    return (
      <View style={[styles.blockContainer, { backgroundColor: '#fff5f5' }]}>
        <Text style={styles.lockIcon}>⚠️</Text>
        <Text style={[styles.blockTitle, { color: '#c62828' }]}>Account Suspended</Text>
        <Text style={styles.blockMessage}>
          Access to amenities and gate passes has been restricted due to unsettled long-overdue dues exceeding 90 days. Please settle your account balance at the Admin Office to lift the suspension.
        </Text>
        <TouchableOpacity style={styles.refreshButton} onPress={checkCurrentUnitAuthorization}>
          <Text style={styles.refreshText}>Check Restored Status</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // 3. 정상 계정인 경우 하위 메인 앱 화면(HomeScreen 등) 그대로 통과
  return <>{children}</>;
}

const styles = StyleSheet.create({
  blockContainer: { flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', padding: 30 },
  lockIcon: { fontSize: 60, marginBottom: 20 },
  blockTitle: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  blockMessage: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 22 },
  refreshButton: { marginTop: 25, backgroundColor: '#c62828', paddingVertical: 12, paddingHorizontal: 25, borderRadius: 8 },
  refreshText: { color: '#fff', fontWeight: 'bold' }
});