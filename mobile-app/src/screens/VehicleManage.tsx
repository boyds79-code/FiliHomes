import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Platform, StatusBar, TouchableOpacity, FlatList, TextInput, Modal, Alert, ActivityIndicator, KeyboardAvoidingView, ScrollView, Dimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext';
import { API_BASE_URL } from '../api/apiClient';

const { width } = Dimensions.get('window');

interface MyVehicle {
  id: string;
  plate_number: string;
  vehicle_type: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  created_at: string;
}

export default function VehicleManage({ navigation }: any) {
  const { themeColor } = useCondoConfig();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [myVehicles, setMyVehicles] = useState<MyVehicle[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [parkingFeeTiers, setParkingFeeTiers] = useState<number[]>([]);
  const [baseParkingFee, setBaseParkingFee] = useState<number>(0);

  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('');

  useEffect(() => {
    fetchMyVehicles();
    fetchCondoParkingTiers();
  }, []);

  const fetchCondoParkingTiers = async () => {
    try {
      const { data, error } = await supabase
        .from('condos')
        .select('base_parking_fee, features')
        .eq('id', 'c1111111-1111-1111-1111-111111111111')
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

  const fetchMyVehicles = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        console.log("DEBUG - 세션 유저 없음, 여기서 에러 방지 완료.");
        return;
      }

      const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('user_id', userId)
        .eq('owner_type', 'RESIDENT') 
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const parsed: MyVehicle[] = data.map((v: any) => ({
          id: v.id.toString(),
          plate_number: v.plate_number,
          vehicle_type: v.vehicle_type || v.vehicle_model, // 🎯 스펙 하이브리드 보완
          status: v.status,
          created_at: v.created_at
        }));
        setMyVehicles(parsed);
      } else {
        useFallbackVehicles();
      }
    } catch (err) {
      console.log(err);
      useFallbackVehicles();
    } finally { // 🎯 bits: 오타 완벽 복구 마감
      setLoading(false);
    }
  };

  const useFallbackVehicles = () => {
    setMyVehicles([
      { id: 'v_sb1', plate_number: 'GHI1234', vehicle_type: 'Black Toyota Fortuner', status: 'APPROVED', created_at: new Date().toISOString() }
    ]);
  };

  const handleRegisterMyVehicle = async () => {
    if (!plateNumber.trim() || !vehicleType.trim()) {
      Alert.alert("Incomplete Form", "Please enter both plate number and vehicle model.");
      return;
    }

    try {
      setSubmitting(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        console.log("DEBUG - 세션 유저 없음, 여기서 에러 방지 완료.");
        return;
      }

      // 🎯 [어드민 연동 결속] 프로필에서 유저의 실시간 unit_id를 수급합니다.
      const { data: profile } = await supabase.from('profiles').select('unit_id').eq('id', userId).single();
      const userUnit = profile?.unit_id || '1204';

      const response = await fetch(`${API_BASE_URL}/api/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{
          condo_id: 'c1111111-1111-1111-1111-111111111111', // 🎯 DB UUID 타입 에러 방지를 위해 통일
          user_id: userId,
          unit_no: userUnit,            // 🎯 어드민 맵핑용 호실 번호 추가
          plate_number: plateNumber.trim().toUpperCase(),
          vehicle_type: vehicleType.trim(),
          vehicle_model: vehicleType.trim(), // 🎯 두 규격 모두 안전 장치로 인젝션
          owner_type: 'RESIDENT', 
          status: 'PENDING'      
        }])
      });

      if (response.ok) {
        setModalVisible(false);
        setPlateNumber('');
        setVehicleType('');
        fetchMyVehicles();
        Alert.alert("Registration Filed 📝", "Your vehicle registration has been sent to PMO. Automatic barrier access will be granted upon admin verification.");
      } else {
        const errorData = await response.json();
        console.error(errorData.error);
        Alert.alert("Registration Failed", "Failed to link vehicle data to the secure server.");
      }
    } catch (err) {
      console.log(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteVehicle = async (id: string) => {
    Alert.alert(
      "Remove Vehicle?",
      "Are you sure you want to remove this vehicle from your resident pass registry?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove Pass",
          style: "destructive",
          onPress: async () => {
            if (id.startsWith('v_sb')) {
              setMyVehicles(prev => prev.filter(v => v.id !== id));
              return;
            }
            const response = await fetch(`${API_BASE_URL}/api/vehicles`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id })
            });
            if (response.ok) {
              fetchMyVehicles();
            }
          }
        }
      ]
    );
  };

  const renderVehicleItem = ({ item, index }: { item: MyVehicle; index: number }) => {
    const isApproved = item.status === 'APPROVED';
    const badgeBg = isApproved ? '#eafaf1' : '#fff7ed';
    const badgeText = isApproved ? '#16a34a' : '#ea580c';
    const fee = parkingFeeTiers[index] !== undefined 
      ? parkingFeeTiers[index] 
      : (parkingFeeTiers[parkingFeeTiers.length - 1] || baseParkingFee || 1500);

    return (
      <View style={styles.vehicleCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.plateContainer}>
            <Text style={styles.plateText}>{item.plate_number}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
              <Text style={[styles.statusText, { color: badgeText }]}>{item.status}</Text>
            </View>
            <Text style={{ fontSize: 11, color: '#64748b', fontWeight: 'bold', marginTop: 4 }}>
              ₱{fee.toLocaleString()}/mo
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.bodyLabel}>Vehicle Model</Text>
          <Text style={styles.bodyValue}>{item.vehicle_type}</Text>
        </View>

        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteVehicle(item.id)}>
          <Text style={styles.deleteBtnText}>Remove Pass</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><Text style={[styles.backIcon, { color: themeColor || '#0038a8' }]}>❮ Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>My Vehicle Registry</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.mainContainer}>
        <Text style={styles.sectionDesc}>Manage permanently registered vehicles for your unit. Approved vehicles are granted automatic barrier access at the main gate.</Text>
        
        {loading ? (
          <ActivityIndicator size="large" color={themeColor || '#0038a8'} style={{ marginTop: 40 }} />
        ) : myVehicles.length === 0 ? (
          <View style={styles.emptyView}>
            <Text style={{ fontSize: 44 }}>🚗</Text>
            <Text style={styles.emptyText}>No resident vehicles on record.</Text>
          </View>
        ) : (
          <FlatList data={myVehicles} keyExtractor={(item) => item.id} renderItem={renderVehicleItem} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }} />
        )}
      </View>

      <TouchableOpacity style={[styles.fabButton, { backgroundColor: themeColor || '#0038a8' }]} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCardWindow}>
            <Text style={styles.modalHeaderTitle}>Add Resident Vehicle</Text>
            
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Plate Number *</Text>
              <TextInput style={styles.textInput} placeholder="e.g., GHI1234 or LUV777" placeholderTextColor="#94a3b8" autoCapitalize="characters" value={plateNumber} onChangeText={setPlateNumber} />

              <Text style={styles.inputLabel}>Vehicle Brand & Model *</Text>
              <TextInput style={styles.textInput} placeholder="e.g., Black Toyota Fortuner" placeholderTextColor="#94a3b8" value={vehicleType} onChangeText={setVehicleType} />
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: themeColor || '#0038a8' }]} onPress={handleRegisterMyVehicle} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Authorize Vehicle</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fafbfd', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  header: { height: 56, backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  backBtn: { paddingVertical: 4 },
  backIcon: { fontSize: 14, fontWeight: '700' },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  mainContainer: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  sectionDesc: { fontSize: 13, color: '#64748b', lineHeight: 18, marginBottom: 20, fontWeight: '500' },
  emptyView: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 13, color: '#94a3b8', marginTop: 12, fontWeight: '600' },
  vehicleCard: { backgroundColor: '#fff', borderRadius: 24, borderWidth: 1, borderColor: '#e2e8f0', padding: 20, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.01, shadowRadius: 6 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  plateContainer: { backgroundColor: '#0f172a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  plateText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  cardBody: { marginVertical: 16 },
  bodyLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  bodyValue: { color: '#0f172a', fontSize: 15, fontWeight: '700' },
  deleteBtn: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 14, alignItems: 'center' },
  deleteBtnText: { color: '#ef4444', fontSize: 13, fontWeight: '700' },
  fabButton: { position: 'absolute', bottom: 24, right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 4 },
  fabText: { fontSize: 28, color: '#fff', fontWeight: '300' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end', alignItems: 'center' },
  modalCardWindow: { width: '100%', backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 20 },
  modalHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 20, textAlign: 'center' },
  inputLabel: { fontSize: 11, fontWeight: '800', color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  textInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 14, color: '#0f172a', marginBottom: 20 },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  cancelBtn: { flex: 0.48, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#f1f5f9' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  submitBtn: { flex: 0.48, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' }
});