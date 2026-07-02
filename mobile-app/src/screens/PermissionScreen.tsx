import React, { useState } from 'react';
// 🎯 [교정] 누락되었던 ActivityIndicator를 import 가드링에 완벽하게 안착!
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar, Alert, Dimensions, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCondoConfig } from '../hooks/CondoConfigContext';

const { width } = Dimensions.get('window');

export default function PermissionScreen({ navigation }: any) {
  const { themeColor } = useCondoConfig();
  const [requesting, setRequesting] = useState(false);

  const handleGrantAllPermissions = async () => {
    try {
      setRequesting(true);

      // 1. 📍 위치 정보 권한 요청
      await Location.requestForegroundPermissionsAsync();
      
      // 2. 📸 카메라 및 미디어 라이브러리 권한 요청
      await ImagePicker.requestCameraPermissionsAsync();
      await ImagePicker.requestMediaLibraryPermissionsAsync();

      // 3. 🔔 알림 푸시 권한 요청
      const { status: pushStatus } = await Notifications.requestPermissionsAsync();
      if (pushStatus !== 'granted') {
        const retry = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Enable Notifications 🔔',
            'Notifications are essential to receive real-time updates about billings, parcel deliveries, urgent condo announcements, and intercom chats from guards. Do you want to allow notifications?',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Allow', onPress: () => resolve(true) }
            ]
          );
        });

        if (retry) {
          const { status: secondStatus } = await Notifications.requestPermissionsAsync();
          if (secondStatus !== 'granted') {
            Alert.alert('Notification Help', 'Please allow notifications in your phone settings to receive real-time parcel and billing updates.');
          }
        }
      }

      // 4. 🔒 생체인증 FaceID 하드웨어 사전 검증 및 노킹
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (hasHardware) {
        await LocalAuthentication.isEnrolledAsync();
      }

      // Save consent state to AsyncStorage so this screen only shows once
      await AsyncStorage.setItem('has_consented_permissions', 'true');

      Alert.alert(
        'Setup Complete 🎉',
        'FiliCondo has customized your secure hardware setup for Fili-One Condominium.',
        [
          { 
            text: 'Let\'s Start', 
            onPress: () => {
              navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
            } 
          }
        ]
      );
    } catch (error) {
      console.log(error);
      Alert.alert('Configuration Error', 'Failed to link system hardware protocols.');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeAreaContainer}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.contentContainer}>
        <View style={styles.welcomeHeaderGroup}>
          <Text style={styles.appLogoText}>🇵🇭 FiliCondo</Text>
          <Text style={styles.mainTitle}>Access Permissions</Text>
          <Text style={styles.subTitle}>To provide seamless luxury condo operations and real-time gate security, please allow the following device controls.</Text>
        </View>

        <View style={styles.permissionWrapperCard}>
          
          <View style={styles.permissionItemRow}>
            <View style={[styles.iconIconCircle, { backgroundColor: '#f0f9ff' }]}>
              <Text style={styles.iconEmoji}>📍</Text>
            </View>
            <View style={styles.textMetaColumn}>
              <Text style={styles.permissionLabelText}>Location Services (Required)</Text>
              <Text style={styles.permissionDescText}>Used to verify your resident residency radius, visitor real-time driving status, and community security perimeter.</Text>
            </View>
          </View>

          <View style={styles.permissionItemRow}>
            <View style={[styles.iconIconCircle, { backgroundColor: '#fdf2f8' }]}>
              <Text style={styles.iconEmoji}>📸</Text>
            </View>
            <View style={styles.textMetaColumn}>
              <Text style={styles.permissionLabelText}>Camera & Storage (Required)</Text>
              <Text style={styles.permissionDescText}>Needed for attaching photo evidence of job order maintenance repairs and uploading monthly banking payment receipts to the PMO ledger.</Text>
            </View>
          </View>

          <View style={styles.permissionItemRow}>
            <View style={[styles.iconIconCircle, { backgroundColor: '#f0fdf4' }]}>
              <Text style={styles.iconEmoji}>🔒</Text>
            </View>
            <View style={styles.textMetaColumn}>
              <Text style={styles.permissionLabelText}>Biometric FaceID Lock (Optional)</Text>
              <Text style={styles.permissionDescText}>Enables ultra-fast encrypted security vault access for locking personal billing information and entry gate control tokens.</Text>
            </View>
          </View>

          <View style={styles.permissionItemRow}>
            <View style={[styles.iconIconCircle, { backgroundColor: '#fff7ed' }]}>
              <Text style={styles.iconEmoji}>🔔</Text>
            </View>
            <View style={styles.textMetaColumn}>
              <Text style={styles.permissionLabelText}>Push Notification Bulletins (Optional)</Text>
              <Text style={styles.permissionDescText}>Receive instant urgent alerts regarding scheduled water interruptions, elevator repairs, power outages, and gate intercom guard chat requests.</Text>
            </View>
          </View>

        </View>

        <TouchableOpacity 
          style={[styles.actionSubmitBtn, { backgroundColor: themeColor || '#0038a8' }]}
          onPress={handleGrantAllPermissions}
          disabled={requesting}
        >
          {requesting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.actionSubmitBtnText}>Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeAreaContainer: { flex: 1, backgroundColor: '#fafbfd' },
  contentContainer: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between', paddingVertical: 20 },
  welcomeHeaderGroup: { marginTop: Platform.OS === 'ios' ? 24 : 10, alignItems: 'center' },
  appLogoText: { fontSize: 16, fontWeight: '800', color: '#64748b', letterSpacing: 0.5, marginBottom: 8 },
  mainTitle: { fontSize: 24, fontWeight: '900', color: '#0f172a', letterSpacing: -0.5 },
  subTitle: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 8, lineHeight: 19, paddingHorizontal: 10, fontWeight: '500' },
  permissionWrapperCard: { backgroundColor: '#fff', borderRadius: 24, padding: 18, borderWidth: 1, borderColor: '#e2e8f0', marginVertical: 20, shadowColor: '#000', shadowOpacity: 0.01, shadowRadius: 8 },
  permissionItemRow: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 12 },
  iconIconCircle: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  iconEmoji: { fontSize: 18 },
  textMetaColumn: { flex: 1 },
  permissionLabelText: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  permissionDescText: { fontSize: 11, color: '#64748b', marginTop: 3, lineHeight: 15, fontWeight: '400' },
  actionSubmitBtn: { width: '100%', paddingVertical: 16, borderRadius: 16, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1, marginBottom: Platform.OS === 'ios' ? 10 : 0 },
  actionSubmitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' }
});