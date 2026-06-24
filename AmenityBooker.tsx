import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { useUnit } from '../hooks/UnitContext';
import { useCondoConfig } from '../hooks/CondoConfigContext';

export function AmenityBooker({ amenityName }: { amenityName: string }) {
  const { currentUnit } = useUnit();
  const { themeColor } = useCondoConfig();
  const [bookingSlot, setBookingSlot] = useState('09:00 - 11:00');
  const [submitting, setSubmitting] = useState(false);

  const handleBooking = async () => {
    if (!currentUnit) return;

    try {
      setSubmitting(true);
      const targetDate = new Date().toISOString().split('T')[0]; // 오늘 날짜 예약 예시

      // [동시성 및 정원 제어 로직] 
      // 해당 시간대에 이미 확정된 예약 건수(Count)를 조회하여 정원 초과 여부를 실시간 검증합니다.
      const { count, error: countError } = await supabase
        .from('amenity_bookings')
        .select('*', { count: 'exact', head: true })
        .eq('condo_id', currentUnit.condo_id)
        .eq('amenity_name', amenityName)
        .eq('booking_date', targetDate)
        .eq('time_slot', bookingSlot)
        .eq('status', 'CONFIRMED');

      if (countError) throw countError;

      // 예시로 최대 정원을 10명으로 제한하는 규칙 설정
      const maxCapacity = 10;
      if (count && count >= maxCapacity) {
        Alert.alert("Reservation Full", "Sorry, this time slot has reached its maximum capacity. Please select another slot.");
        setSubmitting(false);
        return;
      }

      // 정원이 남아있다면 예약 마스터 테이블에 인서트 확정
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        console.log("DEBUG - 세션 유저 없음, 여기서 에러 방지 완료.");
        throw new Error("User not found");
      }

      const { error: insertError } = await supabase
        .from('amenity_bookings')
        .insert([{
          condo_id: currentUnit.condo_id,
          unit_id: currentUnit.unit_id,
          user_id: userId,
          amenity_name: amenityName,
          booking_date: targetDate,
          time_slot: bookingSlot,
          status: 'CONFIRMED'
        }]);

      if (insertError) throw insertError;

      Alert.alert("Success 🎉", `Your reservation for the ${amenityName} has been confirmed!`);
    } catch (err: any) {
      Alert.alert("Booking Failed", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{amenityName} Reservation</Text>
      <Text style={styles.subTitle}>Today's Target Date: {new Date().toLocaleDateString()}</Text>
      
      <View style={styles.slotRow}>
        <TouchableOpacity style={[styles.slotButton, bookingSlot === '09:00 - 11:00' && { borderColor: themeColor, backgroundColor: '#f0f4f8' }]} onPress={() => setBookingSlot('09:00 - 11:00')}>
          <Text style={[styles.slotText, bookingSlot === '09:00 - 11:00' && { color: themeColor, fontWeight: 'bold' }]}>Morning (09-11)</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.slotButton, bookingSlot === '14:00 - 16:00' && { borderColor: themeColor, backgroundColor: '#f0f4f8' }]} onPress={() => setBookingSlot('14:00 - 16:00')}>
          <Text style={[styles.slotText, bookingSlot === '14:00 - 16:00' && { color: themeColor, fontWeight: 'bold' }]}>Afternoon (14-16)</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.bookButton, { backgroundColor: themeColor }]} onPress={handleBooking} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.bookButtonText}>Confirm Secure Slot</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 20, backgroundColor: '#fff', borderRadius: 12, margin: 15, elevation: 2, borderWidth: 1, borderColor: '#eef2f5' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  subTitle: { fontSize: 13, color: '#777', marginTop: 4, marginBottom: 15 },
  slotRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  slotButton: { flex: 0.48, padding: 12, borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 8, alignItems: 'center' },
  slotText: { fontSize: 13, color: '#666' },
  bookButton: { padding: 14, borderRadius: 8, alignItems: 'center' },
  bookButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 15 }
});