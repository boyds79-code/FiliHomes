import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Vibration } from 'react-native';
import { supabase } from './lib/supabase';
import { useUnit } from '../hooks/UnitContext';

export function LiveGateIntercom() {
  const { currentUnit } = useUnit();
  const [modalVisible, setModalVisible] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!currentUnit) return;

    // 1. 해당 유닛 고유 채널 웹소켓 실시간 바인딩 시작
    const channel = supabase.channel(`unit_gate_${currentUnit.unit_id}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'gate_request' }, (payload: any) => {
        // 가드하우스로부터 전송된 방문객 신호 감지 시 푸시 레이어 구동
        setVisitorName(payload.payload.visitor_name);
        setModalVisible(true);
        Vibration.vibrate([500, 500, 500]); // 진동 알림으로 주의 환기
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [currentUnit]);

  const handleResponse = async (approved: boolean) => {
    if (!currentUnit || !channelRef.current) return;

    // 가드하우스 태블릿이 수신 대기 중인 채널로 입주민의 최종 의사 결정 리턴
    await channelRef.current.send({
      type: 'broadcast',
      event: 'gate_response',
      payload: { approved: approved }
    });
    setModalVisible(false);
  };

  return (
    <Modal visible={modalVisible} transparent={true} animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.alertBox}>
          <Text style={styles.alertTitle}>🚨 GuardHouse Intercom Request</Text>
          <Text style={styles.alertMessage}>A visitor is at the main gate requesting access to your unit.</Text>
          
          <View style={styles.visitorCard}>
            <Text style={styles.visitorLabel}>Visitor Name</Text>
            <Text style={styles.visitorValue}>{visitorName}</Text>
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btn, styles.declineBtn]} onPress={() => handleResponse(false)}><Text style={styles.btnText}>Deny Entry</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.approveBtn]} onPress={() => handleResponse(true)}><Text style={styles.btnText}>Approve & Open</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  alertBox: { width: '85%', backgroundColor: '#fff', borderRadius: 16, padding: 22, alignItems: 'center' },
  alertTitle: { fontSize: 18, fontWeight: 'bold', color: '#c62828', marginBottom: 10 },
  alertMessage: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 15 },
  visitorCard: { width: '100%', backgroundColor: '#f5f5f5', padding: 15, borderRadius: 10, marginBottom: 20, alignItems: 'center' },
  visitorLabel: { fontSize: 11, color: '#777', fontWeight: '600', textTransform: 'uppercase' },
  visitorValue: { fontSize: 18, fontWeight: 'bold', color: '#333', marginTop: 4 },
  btnRow: { flexDirection: 'row', width: '100%', justifyContent: 'space-between' },
  btn: { flex: 0.47, padding: 14, borderRadius: 10, alignItems: 'center' },
  declineBtn: { backgroundColor: '#ef5350' },
  approveBtn: { backgroundColor: '#2e7d32' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 }
});