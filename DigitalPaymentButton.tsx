import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser'; // 인앱 브라우저 라이브러리
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext';

interface DigitalPaymentButtonProps {
  billingId: string;
  amount: number;
}

export function DigitalPaymentButton({ billingId, amount }: DigitalPaymentButtonProps) {
  const { themeColor } = useCondoConfig();
  const [loading, setLoading] = useState(false);

  const handleDigitalPayment = async () => {
    try {
      setLoading(true);
      
      // 우리가 방금 배포한 Supabase Edge Function을 호출하여 보안 결제 링크 요청
      const { data, error } = await supabase.functions.invoke('payment-gateway', {
        body: { billing_id: billingId }
      });

      if (error || !data?.success) {
        throw new Error(data?.error || "Failed to generate dynamic invoice link.");
      }

      // Xendit/PayMongo가 리턴해 준 전용 수납 URL을 인앱 브라우저 팝업으로 오픈
      // 사용자는 여기서 안전하게 자신의 GCash나 Maya 계정으로 실시간 결제를 마감합니다.
      await WebBrowser.openBrowserAsync(data.payment_url);
      
    } catch (err: any) {
      Alert.alert("Payment Initialization Failed", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity 
      style={{ backgroundColor: '#2e7d32', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 }}
      onPress={handleDigitalPayment}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
          ⚡ Pay via GCash / Maya (₱{amount})
        </Text>
      )}
    </TouchableOpacity>
  );
}