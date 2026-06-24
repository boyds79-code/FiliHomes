import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, SafeAreaView, KeyboardAvoidingView, Platform, StatusBar } from 'react-native';
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext';

export default function FiliStaffSecretDoor({ navigation }: any) {
  const { themeColor } = useCondoConfig();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleStaffLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Required ⚠️", "Please enter both staff email and secure passcode.");
      return;
    }
    
    try {
      setLoading(true);
      
      // ① Supabase Auth 인프라 서버 타격 1차 세션 검증
      const { data, error } = await supabase.auth.signInWithPassword({ 
        email: email.trim(), 
        password: password 
      });
      
      if (error) throw error;
      if (!data.user) return;

      // ② 🔒 [2중 보안 원장 대조] staff_profiles 테이블을 즉시 스캔하여 신분(Role) 식별
      const { data: staff, error: staffError } = await supabase
        .from('staff_profiles')
        .select('role, is_active')
        .eq('id', data.user.id)
        .maybeSingle();

      if (staffError || !staff) {
        // 계정은 맞지만 임직원 권한 명단에 없는 일반 입주민 악의적 탈취 시도 차단
        await supabase.auth.signOut();
        Alert.alert("Access Denied ❌", "This account is not authorized as internal condominium staff.");
        return;
      }

      if (!staff.is_active) {
        await supabase.auth.signOut();
        Alert.alert("Suspended 🚫", "This staff profile has been deactivated by PMO administration.");
        return;
      }

      // ③ 검증 최종 통과 시 각자의 전용 모바일 콕핏 화면으로 정방향 워프 시킵니다.
      const normalizedRole = (staff.role || '').toUpperCase().trim();
      
      if (normalizedRole === 'PMO_MANAGER') {
        Alert.alert("Welcome, Manager 🎉", `Authorization Level: PMO Management`);
      } else if (normalizedRole === 'GUARD') {
        Alert.alert("Duty Started 💂", `Access Level: Gate/Lobby Guard House`);
      } else if (normalizedRole === 'TECHNICIAN' || normalizedRole === 'TECH') {
        Alert.alert("Tech Mode Active 🛠️", `Access Level: Field Technician`);
      } else if (normalizedRole === 'AMENITY_STAFF' || normalizedRole === 'AMENITY' || normalizedRole === 'AMENITY STAFF') {
        Alert.alert("Amenity Duty Started 🏊", `Access Level: Amenity Center Desk`);
      } else {
        await supabase.auth.signOut();
        Alert.alert("Error", `Unknown staff deployment role: "${staff.role}"`);
      }

    } catch (err: any) {
      console.log(err);
      Alert.alert("Authentication Failed", err.message || "Invalid internal staff credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
        
        <View style={styles.centerAlign}>
          <Text style={styles.mainTitle}>FiliCondo Staff Portal</Text>
          <Text style={styles.subText}>Condominium Operations & Gate Security Terminal</Text>
        </View>

        {/* 🎯 [수정] 2차 탭 가드를 철거하고, 진입 즉시 입력 폼이 가드들을 환영하도록 오픈 배치 */}
        <View style={styles.secretForm}>
          <Text style={styles.portalBadge}>⚠️ OPERATOR PORTAL SYSTEM ACTIVE</Text>
          
          <TextInput 
            style={styles.input} 
            placeholder="Staff Identity Email" 
            placeholderTextColor="#64748b" 
            value={email} 
            onChangeText={setEmail} 
            autoCapitalize="none" 
            keyboardType="email-address"
          />
          
          <TextInput 
            style={styles.input} 
            placeholder="Security Passcode" 
            placeholderTextColor="#64748b" 
            secureTextEntry 
              value={password} 
              onChangeText={setPassword} 
            />
            
            <TouchableOpacity style={[styles.loginBtn, { backgroundColor: themeColor || '#f97316' }]} onPress={handleStaffLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginBtnText}>Verify Security Token ➔</Text>}
            </TouchableOpacity>

            {/* 🚪 입주민 로그인 화면으로 다시 돌아갈 수 있는 뒤로가기 가이드 스위치 */}
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.replace('AuthScreen')}>
              <Text style={styles.backBtnText}>← Back to Resident Login</Text>
            </TouchableOpacity>
          </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  centerAlign: { alignItems: 'center', marginBottom: 30 },
  mainTitle: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  subText: { color: '#475569', fontSize: 13, marginTop: 8, textAlign: 'center' },
  secretForm: { backgroundColor: '#1e293b', padding: 24, borderRadius: 24, borderWidth: 1, borderColor: '#334155', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10 },
  portalBadge: { color: '#ef4444', fontSize: 11, fontWeight: '800', textAlign: 'center', marginBottom: 20, letterSpacing: 1 },
  input: { backgroundColor: '#0f172a', borderRadius: 12, padding: 16, color: '#fff', marginBottom: 14, borderWidth: 1, borderColor: '#334155', fontSize: 15, fontWeight: '600' },
  loginBtn: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 6 },
  loginBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  backBtn: { marginTop: 16, padding: 10, alignItems: 'center' },
  backBtnText: { color: '#64748b', fontSize: 13, fontWeight: '600' }
});