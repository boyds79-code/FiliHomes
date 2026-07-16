import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, InputAccessoryView, Keyboard, Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { useUnit } from '../contexts/UnitContext';

export function GuardScanner() {
  const { currentUnit } = useUnit();
  const [inputPassCode, setInputPassCode] = useState('');
  const [targetUnitNumber, setTargetUnitNumber] = useState('');
  const [visitorName, setVisitorName] = useState('');
  const [scanningStatus, setScanningStatus] = useState<'idle' | 'success' | 'failed'>('idle');

  const [calling, setCalling] = useState(false);

  // [기능 1] 게스트가 보여준 QR 코드 고속 검증 로직 및 도착 알림 트리거 연동
  const verifyPassCode = async (code: string) => {
    if (scanningStatus === 'success') return;

    const trimmedCode = code.trim();
    console.log("🔍 스캔 시작, 입력값:", trimmedCode); // 🎯 로그 추가

    try {
      let pass: any = null;

      const { data: directPass, error } = await supabase
        .from('visitor_passes')
        .select('*')
        .eq('qr_code_value', trimmedCode)
        .maybeSingle();

      if (error) {
        console.error("❌ 쿼리 에러:", error);
        Alert.alert("Error", error.message);
        return;
      }

      pass = directPass;

      // Fallback: If not found but starts with 'FILIHOMES-VMS|', parse the token components
      if (!pass && trimmedCode.startsWith('FILIHOMES-VMS|')) {
        const parts = trimmedCode.split('|');
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
          
          pass = fallbackData;
        }
      }

      if (!pass) {
        console.warn("⚠️ 데이터 없음. DB에 해당 QR 값이 있는지 확인하세요. 값:", trimmedCode);
        Alert.alert("❌ ACCESS DENIED", `QR code not found in DB: ${trimmedCode}`);
        return;
      }

      console.log("✅ 데이터 조회 성공:", pass); // 🎯 찾은 데이터 상세 로그

      if (pass.status === 'USED' || pass.status === 'ENTERED') {
        Alert.alert("⚠️ ALREADY USED", "This pass has already been used.");
        return;
      }

      if (pass.status === 'PENDING') {
        Alert.alert("⚠️ PENDING APPROVAL", "This pass is awaiting resident/admin approval.");
        return;
      }

      if (pass.status !== 'APPROVED') {
        Alert.alert("❌ ACCESS DENIED", `This pass is not active (Status: ${pass.status}).`);
        return;
      }

      const { error: updateError } = await supabase
        .from('visitor_passes')
        .update({ 
          status: 'USED', 
          entry_time: new Date().toISOString() 
        })
        .eq('id', pass.id);

      if (updateError) {
        console.error("❌ 업데이트 에러:", updateError);
        throw updateError;
      }

      setScanningStatus('success');
      Alert.alert("🟢 ACCESS GRANTED", `Visitor: ${pass.visitor_name}`);
      
      setTimeout(() => setScanningStatus('idle'), 2000);
      
    } catch (err: any) {
      console.error("DEBUG - Scan Error:", err);
      setScanningStatus('failed');
      Alert.alert("System Error", "Check console for details.");
    }
  };

  // [기능 2] QR 없는 무단 방문객 도달 시 Supabase Realtime 브로드캐스트 전송 (인터폰 대체)
  const sendLiveAccessRequest = async () => {
    if (calling) return;
    if (!targetUnitNumber.trim() || !visitorName.trim()) {
      Alert.alert("Error", "Please enter both Visitor Name and Target House/Lot Number.");
      return;
    }

    if (!currentUnit) {
      Alert.alert("Error", "No village/subdivision assigned to your guard profile.");
      return;
    }

    // 해당 호수의 고유 unit_id 검색 (Guard의 관할 condo_id 내에서만)
    const { data: unitData, error } = await supabase
      .from('units')
      .select('id')
      .eq('condo_id', currentUnit.condo_id)
      .eq('unit_number', targetUnitNumber.trim())
      .maybeSingle();

    if (error || !unitData) {
      Alert.alert("Error", "This house/lot number does not exist in your village/subdivision.");
      return;
    }

    setCalling(true);

    // Supabase Realtime Channel을 통해 해당 유닛방으로 실시간 출입 팝업 신호 송신
    const channel = supabase.channel(`unit_gate_${unitData.id}`);

    let timeoutId: NodeJS.Timeout;

    // Listen for resident response
    channel.on('broadcast', { event: 'gate_response' }, (payload: any) => {
      clearTimeout(timeoutId);
      const approved = payload.payload.approved;
      Alert.alert(
        approved ? "Entry Approved ✅" : "Entry Denied ❌",
        approved 
          ? `Unit ${targetUnitNumber} has authorized entry for ${visitorName}.`
          : `Unit ${targetUnitNumber} has denied entry for ${visitorName}.`
      );
      setVisitorName('');
      setTargetUnitNumber('');
      setCalling(false);
      supabase.removeChannel(channel);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.send({
          type: 'broadcast',
          event: 'gate_request',
          payload: { 
            visitor_name: visitorName.trim(), 
            request_id: Math.random().toString(36).substring(7) 
          }
        });
        
        // Setup 30 seconds timeout
        timeoutId = setTimeout(() => {
          Alert.alert("Intercom Timeout ⏳", `Unit ${targetUnitNumber} did not respond in time.`);
          setCalling(false);
          supabase.removeChannel(channel);
        }, 30000);
      }
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🛡️ GuardHouse Gate Controller</Text>
      
      {/* QR 스캔 대용 입력창 (실제 구현 시 expo-camera의 onBarCodeScanned와 매핑됩니다) */}
      <View style={styles.section}>
        <Text style={styles.label}>Scan or Type QR Pass Code</Text>
        <TextInput style={styles.input} value={inputPassCode} onChangeText={setInputPassCode} placeholder="e.g., UNIT1-ABCDE123"/>
        <TouchableOpacity style={styles.verifyButton} onPress={() => verifyPassCode(inputPassCode)}>
          <Text style={styles.btnText}>Verify QR Pass</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      {/* QR 미소지 방문객용 수동 실시간 인터폰 시스템 */}
      <View style={styles.section}>
        <Text style={styles.label}>No QR? Direct Intercom Request</Text>
        <TextInput 
          style={styles.input} 
          value={targetUnitNumber} 
          onChangeText={setTargetUnitNumber} 
          placeholder="Target House/Lot Number (e.g., 1004)" 
          keyboardType="numeric" 
          editable={!calling}
          inputAccessoryViewID="guardScannerUnitAccessory"
        />
        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID="guardScannerUnitAccessory">
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
        <TextInput style={styles.input} value={visitorName} onChangeText={setVisitorName} placeholder="Visitor / Driver Full Name" editable={!calling}/>
        <TouchableOpacity 
          style={[styles.verifyButton, { backgroundColor: calling ? '#64748b' : '#e65100' }]} 
          onPress={sendLiveAccessRequest}
          disabled={calling}
        >
          <Text style={styles.btnText}>{calling ? 'Calling (Awaiting Response)...' : 'Send Live App Intercom'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 25, backgroundColor: '#f4f6f9' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, color: '#1a237e', textAlign: 'center' },
  section: { backgroundColor: '#fff', padding: 20, borderRadius: 12, elevation: 2 },
  label: { fontSize: 14, fontWeight: 'bold', marginBottom: 8, color: '#333' },
  input: { borderWidth: 1, borderColor: '#cfd8dc', padding: 12, borderRadius: 8, marginBottom: 12, backgroundColor: '#fafafa' },
  verifyButton: { backgroundColor: '#1a237e', padding: 14, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  divider: { height: 20 },
});