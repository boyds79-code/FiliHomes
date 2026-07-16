import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, Share } from 'react-native';
import { supabase } from '../lib/supabase';
import { useUnit } from '../contexts/UnitContext';
import { useCondoConfig } from '../hooks/CondoConfigContext';

export function GuestPassGenerator() {
  const { currentUnit } = useUnit();
  const { themeColor } = useCondoConfig();
  const [guestName, setGuestName] = useState('');
  const [startDate, setStartDate] = useState('2026-05-20'); // 기본값 포맷 (YYYY-MM-DD)
  const [endDate, setEndDate] = useState('2026-05-23');

  const generateGuestPass = async () => {
    if (!currentUnit || !guestName.trim()) {
      Alert.alert("Error", "Please enter the guest's name.");
      return;
    }

    try {
      // 1. 보안용 고유 암호화 패스 코드(Pass Code) 생성
      const passCode = `${currentUnit.unit_id.slice(0, 5)}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

      // 2. Supabase DB에 기간 한정 게스트 로그 적재
      // (참고: 차후 스케줄러가 이 valid_until을 확인하여 권한을 만료시킵니다.)
      const { data, error } = await supabase
        .from('guest_passes') // 차후 이 테이블을 가드앱이 스캔합니다.
        .insert([{
          unit_id: currentUnit.unit_id,
          condo_id: currentUnit.condo_id,
          guest_name: guestName.trim(),
          valid_from: `${startDate}T14:00:00Z`,  // 필리핀 일반 체크인 시간 14:00 적용
          valid_until: `${endDate}T11:00:00Z`, // 필리핀 일반 체크아웃 시간 11:00 적용
          pass_code: passCode,
          status: 'Active'
        }])
        .select()
        .single();

      if (error) throw error;

      // 3. 게스트가 앱 설치 없이 브라우저로 볼 수 있는 PWA 웹 딥링크 조합
      // TODO: 실제 배포할 PWA 웹 도메인 주소로 교체해야 합니다.
      const pwaWebUrl = `https://filihomes.hey-driver.com/view/${data.pass_code}`;

      // 4. 네이티브 공유 API 호출 (WhatsApp, 카카오톡 등 전송)
      await Share.share({
        message: `[${currentUnit.condo_name}] Gate Pass for ${guestName}\n\nValidity: ${startDate} ~ ${endDate}\nClick the link to show your QR Code to the security guards:\n${pwaWebUrl}`,
      });

      setGuestName('');
    } catch (error: any) {
      Alert.alert("Pass Generation Failed", error.message);
    }
  };

  return (
    <View style={{ padding: 20, backgroundColor: '#fff', borderRadius: 12, margin: 20, elevation: 2 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 15 }}>Create Temporary Guest Pass</Text>
      
      <TextInput
        style={{ borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8, marginBottom: 15 }}
        placeholder="Guest Full Name (e.g., John Doe)"
        value={guestName}
        onChangeText={setGuestName}
      />

      <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Check-in Date (YYYY-MM-DD)</Text>
      <TextInput
        style={{ borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 8, marginBottom: 15 }}
        value={startDate}
        onChangeText={setStartDate}
      />

      <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Check-out Date (YYYY-MM-DD)</Text>
      <TextInput
        style={{ borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 8, marginBottom: 15 }}
        value={endDate}
        onChangeText={setEndDate}
      />

      <TouchableOpacity 
        style={{ backgroundColor: themeColor, padding: 15, borderRadius: 8, alignItems: 'center' }}
        onPress={generateGuestPass}
      >
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Generate & Share Pass Link</Text>
      </TouchableOpacity>
    </View>
  );
}