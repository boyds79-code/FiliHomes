import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, SafeAreaView, Platform, StatusBar, TextInput, Modal, Image, InputAccessoryView, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext';
import { useUnit } from '../contexts/UnitContext';
import { API_BASE_URL } from '../api/apiClient';
import QRCode from 'react-native-qrcode-svg';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
interface UserProfile {
  name: string;
  email: string;
  unit_number: string;
  condo_name: string;
}

interface Vehicle {
  id: string;
  plate_number: string;
  model_name: string;
}

export default function MyPageScreen({ navigation }: any) {
  const { themeColor, condoName } = useCondoConfig();
  const { currentUnit } = useUnit();
  
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [parkingFeeTiers, setParkingFeeTiers] = useState<number[]>([]);
  const [baseParkingFee, setBaseParkingFee] = useState<number>(0);
  
  // Settings & Toggles
  const [isFaceIdEnabled, setIsFaceIdEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  // Tenant states
  const [tenantModalVisible, setTenantModalVisible] = useState(false);
  const [currentTenant, setCurrentTenant] = useState<any>(null);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantEmail, setNewTenantEmail] = useState('');
  const [newTenantPhone, setNewTenantPhone] = useState('');
  const [leaseStartDate, setLeaseStartDate] = useState('');
  const [leaseEndDate, setLeaseEndDate] = useState('');
  const [newTenantIsPayer, setNewTenantIsPayer] = useState(true);
  const [newTenantRole, setNewTenantRole] = useState<'tenant' | 'short_term_renter'>('tenant');
  const [tenantLoading, setTenantLoading] = useState(false);
  const [submittingTenant, setSubmittingTenant] = useState(false);
  const [payStatusChecked, setPayStatusChecked] = useState(false);
  const [selectedContractImage, setSelectedContractImage] = useState<string | null>(null);
  const [contractImageBase64, setContractImageBase64] = useState<string>('');
  const [uploadingContract, setUploadingContract] = useState(false);

  // Coupon states
  const [couponBoxVisible, setCouponBoxVisible] = useState(false);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [selectedCoupon, setSelectedCoupon] = useState<any>(null);
  const [qrModalVisible, setQrModalVisible] = useState(false);

  // Modals Visibility
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [deleteAccountModalVisible, setDeleteAccountModalVisible] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Password Change States
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    fetchResidentProfileData();
    fetchTenantInfo();
    loadPreferences();
    if (currentUnit?.condo_id) {
      fetchCondoParkingTiers(currentUnit.condo_id);
    }
  }, [currentUnit]);

  const fetchCondoParkingTiers = async (condoId: string) => {
    try {
      const { data, error } = await supabase
        .from('condos')
        .select('base_parking_fee, features')
        .eq('id', condoId)
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

  const loadPreferences = async () => {
    try {
      const lockEnabled = await AsyncStorage.getItem('face_id_lock_enabled');
      setIsFaceIdEnabled(lockEnabled === 'true');

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        const storedPref = await AsyncStorage.getItem(`notifications_enabled_${session.user.id}`);
        setNotificationsEnabled(storedPref !== 'false');
      }
    } catch (e) {
      console.log("Error loading preferences:", e);
    }
  };

  const getDisplayRole = (role?: string) => {
    if (!role) return 'Resident';
    const lowerRole = role.toLowerCase();
    if (lowerRole === 'owner') return 'Home Owner';
    if (lowerRole === 'co_owner') return 'Co-Owner';
    if (lowerRole === 'property_manager') return 'Property Manager';
    if (lowerRole === 'tenant') return 'Tenant';
    if (lowerRole === 'short_term_renter' || lowerRole === 'renter' || lowerRole === 'transient' || lowerRole === 'temporary_renter') return 'Short-term Renter';
    return role.charAt(0).toUpperCase() + role.slice(1);
  };

  const fetchTenantInfo = async () => {
    if (!currentUnit || !['owner', 'co_owner', 'property_manager'].includes(currentUnit.role)) {
      setCurrentTenant(null);
      return;
    }
    try {
      setTenantLoading(true);
      const { data, error } = await supabase
        .from('user_units')
        .select(`
          id,
          role,
          status,
          lease_start_date,
          lease_end_date,
          is_payer,
          profiles:user_id (id, email, phone, full_name)
        `)
        .eq('unit_id', currentUnit.unit_id)
        .in('role', ['tenant', 'short_term_renter'])
        .eq('status', 'active')
        .maybeSingle();

      if (!error && data) {
        setCurrentTenant(data);
      } else {
        setCurrentTenant(null);
      }
    } catch (err) {
      console.log("Error fetching tenant info:", err);
      setCurrentTenant(null);
    } finally {
      setTenantLoading(false);
    }
  };

  const fetchCoupons = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      const response = await fetch(`${API_BASE_URL}/api/coupons?userId=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setCoupons(data || []);
      }
    } catch (err) {
      console.log("Error fetching coupons:", err);
    }
  };

  const handleRemoveTenant = async () => {
    if (!currentTenant) return;
    const isShortTerm = currentTenant.role === 'short_term_renter';
    Alert.alert(
      isShortTerm ? 'Remove Short-term Renter' : 'Remove Tenant',
      isShortTerm 
        ? 'Are you sure you want to remove this renter?' 
        : 'Are you sure you want to remove this tenant? The billing responsibility will fall back to the owner.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setSubmittingTenant(true);
              const { error } = await supabase
                .from('user_units')
                .update({ status: 'inactive', is_payer: false })
                .eq('id', currentTenant.id);

              if (error) throw error;
              Alert.alert('Success', isShortTerm ? 'Renter removed successfully.' : 'Tenant removed. Vacancy fallback billing activated for owner.');
              fetchTenantInfo();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setSubmittingTenant(false);
            }
          }
        }
      ]
    );
  };

  const pickContractImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permission Required", "Photo library access is required to upload a lease agreement/contract image.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets[0]) {
      setSelectedContractImage(result.assets[0].uri);
      setContractImageBase64(result.assets[0].base64 || '');
    }
  };

  const handleRegisterTenant = async () => {
    if (!currentUnit) return;
    if (!newTenantName.trim() || !newTenantEmail.trim()) {
      Alert.alert('Missing Fields', 'Please enter at least occupant name and email.');
      return;
    }
    if (!payStatusChecked) {
      Alert.alert('Pay Status Check Required', 'Please confirm that unit payments are fully settled (Pay Status) before submitting.');
      return;
    }
    if (!contractImageBase64) {
      Alert.alert('Contract Image Required', 'Please attach a copy or photo of the lease agreement / contract.');
      return;
    }

    try {
      setSubmittingTenant(true);
      setUploadingContract(true);

      // 1. Upload contract photo to Supabase storage receipts bucket
      const cleanBase64 = contractImageBase64.includes('base64,') ? contractImageBase64.split('base64,')[1] : contractImageBase64;
      const fileName = `contracts/${newTenantEmail.trim()}_${Date.now()}.jpg`;

      const { error: storageError } = await supabase.storage
        .from('receipts')
        .upload(fileName, decode(cleanBase64), { contentType: 'image/jpeg', upsert: true });

      if (storageError) throw storageError;

      const publicUrl = supabase.storage.from('receipts').getPublicUrl(fileName).data.publicUrl;

      // 2. Submit payload with document info
      const payload = {
        email: newTenantEmail.trim(),
        fullName: newTenantName.trim(),
        phone: newTenantPhone.trim() || null,
        unitId: currentUnit.unit_id,
        condoId: currentUnit.condo_id,
        unitRole: newTenantRole,
        leaseStartDate: leaseStartDate.trim() || null,
        leaseEndDate: leaseEndDate.trim() || null,
        isPayer: newTenantIsPayer,
        status: 'pending',
        documentName: `${newTenantName.trim()}_contract.jpg`,
        documentUrl: publicUrl
      };

      const response = await fetch(`${API_BASE_URL}/api/admin/occupants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to register occupant');
      }

      Alert.alert('Success', `New ${newTenantRole === 'short_term_renter' ? 'short-term renter' : 'tenant'} turnover request submitted and is pending admin approval!`);
      setNewTenantName('');
      setNewTenantEmail('');
      setNewTenantPhone('');
      setLeaseStartDate('');
      setLeaseEndDate('');
      setNewTenantIsPayer(true);
      setNewTenantRole('tenant');
      setPayStatusChecked(false);
      setSelectedContractImage(null);
      setContractImageBase64('');
      setTenantModalVisible(false);
      fetchTenantInfo();
    } catch (err: any) {
      Alert.alert('Registration Error', err.message);
    } finally {
      setSubmittingTenant(false);
      setUploadingContract(false);
    }
  };

  const fetchResidentProfileData = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        console.log("DEBUG - No session user found.");
        return;
      }

      const { data: pData, error: pError } = await supabase
        .from('profiles')
        .select('full_name, unit_number, condo_name')
        .eq('id', userId)
        .single();

      if (!pError && pData) {
        setProfile({
          name: pData.full_name || 'Resident Member',
          email: session.user.email || '',
          unit_number: pData.unit_number || '1204',
          condo_name: pData.condo_name || 'Fili-One Condominium'
        });
      } else {
        setProfile({
          name: 'Chris',
          email: session.user.email || 'developer@filicondo.com',
          unit_number: '1204',
          condo_name: condoName || 'Fili-One Condominium'
        });
      }

      const { data: vData, error: vError } = await supabase
        .from('vehicles')
        .select('*')
        .eq('user_id', userId);

      if (!vError && vData) {
        setVehicles(vData.map((v: any) => ({
          id: v.id.toString(),
          plate_number: v.plate_number,
          model_name: v.model_name || 'Registered Vehicle'
        })));
      } else {
        useVehicleFallback();
      }

    } catch (err) {
      console.log(err);
      useVehicleFallback();
    } finally {
      setLoading(false);
    }
  };

  const useVehicleFallback = () => {
    setVehicles([
      { id: 'v1', plate_number: 'GAU3528', model_name: 'Registered Vehicle' }
    ]);
  };

  const handleToggleNotifications = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      if (!notificationsEnabled) {
        const { status } = await Notifications.getPermissionsAsync();
        let finalStatus = status;
        if (status !== 'granted') {
          const { status: askStatus } = await Notifications.requestPermissionsAsync();
          finalStatus = askStatus;
        }

        if (finalStatus !== 'granted') {
          Alert.alert('Permission Denied', 'Please enable notifications in your phone Settings.');
          return;
        }

        let token = '';
        try {
          const tokenData = await Notifications.getExpoPushTokenAsync();
          token = tokenData.data;
        } catch (e) {
          console.log("Could not retrieve push token:", e);
        }

        if (token) {
          await supabase
            .from('profiles')
            .update({ expo_push_token: token })
            .eq('id', userId);
        }

        setNotificationsEnabled(true);
        await AsyncStorage.setItem(`notifications_enabled_${userId}`, 'true');
        Alert.alert('Notifications Enabled', 'You will now receive real-time push updates.');
      } else {
        await supabase
          .from('profiles')
          .update({ expo_push_token: null })
          .eq('id', userId);

        setNotificationsEnabled(false);
        await AsyncStorage.setItem(`notifications_enabled_${userId}`, 'false');
        Alert.alert('Notifications Disabled', 'Push notifications have been turned off.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to toggle notification settings.');
    }
  };

  const handleToggleFaceId = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          'Biometrics Unavailable',
          'FaceID or TouchID is not registered/available on this device. Please check your settings.'
        );
        return;
      }

      if (isFaceIdEnabled) {
        setIsFaceIdEnabled(false);
        await AsyncStorage.removeItem('face_id_lock_enabled');
        Alert.alert('FaceID Disabled', 'Biometric lock has been deactivated.');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify your biometric data to secure FiliCondo',
        fallbackLabel: 'Enter Passcode',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsFaceIdEnabled(true);
        await AsyncStorage.setItem('face_id_lock_enabled', 'true');
        Alert.alert('FaceID Enabled 🎉', 'Biometric Lock is now active. Your app is securely locked on launch.');
      } else {
        Alert.alert('Authentication Failed', 'FaceID did not match.');
      }
    } catch (error) {
      console.log(error);
      Alert.alert('System Error', 'Failed to initialize biometric hardware module.');
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteAccountModalVisible(false);
    try {
      setDeletingAccount(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        throw new Error("No authenticated session found.");
      }

      const response = await fetch(`${API_BASE_URL}/api/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete account.');
      }

      await AsyncStorage.removeItem('face_id_lock_enabled');
      if (userId) {
        await AsyncStorage.removeItem(`notifications_enabled_${userId}`);
      }

      await supabase.auth.signOut();
      Alert.alert('Account Deleted', 'Your profile and personal data have been completely deleted/anonymized.');
      navigation.reset({ index: 0, routes: [{ name: 'AuthScreen' }] });
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to delete account.');
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to sign out of FiliCondo?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
          await supabase.auth.signOut();
          navigation.reset({ index: 0, routes: [{ name: 'AuthScreen' }] });
        }
      }
    ]);
  };

  const handleChangePassword = async () => {
    if (!newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert('Notice', 'Please fill in all fields.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }

    try {
      setUpdatingPassword(true);
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      Alert.alert('Success 🎉', 'Your password has been changed successfully.');
      setPasswordModalVisible(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update password.');
    } finally {
      setUpdatingPassword(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={themeColor || '#0038a8'} />
      </View>
    );
  }

  if (deletingAccount) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ef4444" />
        <Text style={{ marginTop: 12, color: '#475569', fontSize: 13, fontWeight: '600' }}>Processing Account Deletion...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeAreaContainer}>
      <View style={styles.navHeaderBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.6}>
          <Text style={[styles.backIcon, { color: themeColor || '#0038a8' }]}>❮</Text>
          <Text style={styles.backText}>Home</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>My Page</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={styles.roleBadgeContainer}>
            <Text style={[styles.roleBadgeText, { color: themeColor || '#0038a8' }]}>{getDisplayRole(currentUnit?.role)}</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={{ marginLeft: 12 }}>
            <Ionicons name="log-out-outline" size={24} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.mainScrollBox} showsVerticalScrollIndicator={false}>
        
        <View style={styles.profileHeroCard}>
          <View style={[styles.avatarCircle, { backgroundColor: themeColor || '#0038a8' }]}>
            <Text style={styles.avatarLetter}>{profile?.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.profileNameText}>{profile?.name}</Text>
          <Text style={styles.profileEmailText}>{profile?.email}</Text>

          <View style={styles.unitInfoRowLabel}>
            <Text style={styles.unitMetaBadge}>🏢 {currentUnit?.condo_name || profile?.condo_name}</Text>
            <Text style={styles.unitNumberBadge}>Unit {currentUnit?.unit_number || profile?.unit_number}</Text>
          </View>
        </View>

        {currentUnit && ['owner', 'co_owner', 'property_manager'].includes(currentUnit.role) && (
          <>
            <Text style={styles.sectionHeadingLabel}>📋 Tenant Management</Text>
            <View style={styles.cardContainerWrapper}>
              <View style={styles.settingRowItem}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#1e293b' }}>
                    {currentTenant ? `Active Tenant: ${currentTenant.profiles?.full_name || 'Tenant'}` : 'No Active Tenant (Vacant)'}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    {currentTenant 
                      ? `Billing Responsibility: ${currentTenant.is_payer ? 'Tenant' : 'Owner'}` 
                      : 'Billing Responsibility: Owner (Vacancy Fallback)'}
                  </Text>
                </View>
                <TouchableOpacity 
                  style={[styles.smallBtn, { backgroundColor: themeColor || '#0038a8' }]}
                  onPress={() => {
                    fetchTenantInfo();
                    setPayStatusChecked(false);
                    setTenantModalVisible(true);
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Manage</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        <Text style={styles.sectionHeadingLabel}>🚗 Registered Vehicles (LPR Clearance)</Text>
        <View style={styles.cardContainerWrapper}>
          {vehicles.length === 0 ? (
            <Text style={styles.emptyCarText}>No vehicles registered for gate barrier access.</Text>
          ) : (
            vehicles.map((car, index) => {
              const fee = parkingFeeTiers[index] !== undefined 
                ? parkingFeeTiers[index] 
                : (parkingFeeTiers[parkingFeeTiers.length - 1] || baseParkingFee || 1500);
              return (
                <View key={car.id} style={styles.vehicleRowItem}>
                  <View style={styles.carMetaLeftColumn}>
                    <Text style={styles.carIconSymbol}>🚘</Text>
                    <View>
                      <Text style={styles.carPlateText}>{car.plate_number}</Text>
                      <Text style={styles.carModelSub}>{car.model_name}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={styles.activeStatusPill}>
                      <Text style={styles.activeStatusPillText}>● Active Pass</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: '#64748b', fontWeight: 'bold', marginTop: 4 }}>
                      ₱{fee.toLocaleString()}/mo
                    </Text>
                  </View>
                </View>
              );
            })
          )}
          
          <TouchableOpacity 
            style={styles.addCarLinkBtn} 
            onPress={() => {
              if (currentUnit?.role === 'short_term_renter') {
                Alert.alert("Access Denied", "Short-term renters are not permitted to register permanent vehicles. Please request a Visitor Pass or contact the owner.");
                return;
              }
              navigation.navigate('VehicleManage');
            }}
          >
            <Text style={[styles.addCarLinkBtnText, { color: themeColor || '#0038a8' }]}>+ Manage Vehicle Plate Numbers</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionHeadingLabel}>🎁 Coupons</Text>
        <View style={styles.cardContainerWrapper}>
          <TouchableOpacity 
            style={styles.settingRowItem} 
            onPress={() => {
              fetchCoupons();
              setCouponBoxVisible(true);
            }} 
            activeOpacity={0.7}
          >
            <Text style={styles.settingItemLabel}>• My Coupons</Text>
            <Text style={styles.settingToggleArrow}>❯</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionHeadingLabel}>⚙️ Application Settings</Text>
        <View style={styles.cardContainerWrapper}>
          <TouchableOpacity style={styles.settingRowItem} onPress={handleToggleNotifications} activeOpacity={0.7}>
            <Text style={styles.settingItemLabel}>• Push Notification Settings</Text>
            <Text style={[styles.settingStatusText, notificationsEnabled ? { color: themeColor || '#0038a8', fontWeight: 'bold' } : { color: '#94a3b8' }]}>
              {notificationsEnabled ? 'Enabled ✓' : 'Disabled'}
            </Text>
          </TouchableOpacity>
          <View style={styles.settingRowDivider} />
          
          <TouchableOpacity style={styles.settingRowItem} onPress={handleToggleFaceId} activeOpacity={0.7}>
            <Text style={styles.settingItemLabel}>• Biometric FaceID Lock</Text>
            <Text style={[styles.settingStatusText, isFaceIdEnabled ? { color: themeColor || '#0038a8', fontWeight: 'bold' } : { color: '#94a3b8' }]}>
              {isFaceIdEnabled ? 'Enabled ✓' : 'Disabled'}
            </Text>
          </TouchableOpacity>
          
          <View style={styles.settingRowDivider} />
          <TouchableOpacity style={styles.settingRowItem} onPress={() => setPasswordModalVisible(true)} activeOpacity={0.7}>
            <Text style={styles.settingItemLabel}>• Change Password</Text>
            <Text style={styles.settingToggleArrow}>❯</Text>
          </TouchableOpacity>
          
          <View style={styles.settingRowDivider} />
          <TouchableOpacity style={styles.settingRowItem} onPress={() => setTermsModalVisible(true)} activeOpacity={0.7}>
            <Text style={styles.settingItemLabel}>• Terms of Service & PMO Bylaws</Text>
            <Text style={styles.settingToggleArrow}>❯</Text>
          </TouchableOpacity>
          <View style={styles.settingRowDivider} />
          <TouchableOpacity style={styles.settingRowItem} onPress={() => setPrivacyModalVisible(true)} activeOpacity={0.7}>
            <Text style={styles.settingItemLabel}>• Privacy Policy</Text>
            <Text style={styles.settingToggleArrow}>❯</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionHeadingLabel}>⚠️ Account Actions</Text>
        <View style={styles.cardContainerWrapper}>
          <TouchableOpacity style={styles.settingRowItem} onPress={() => setDeleteAccountModalVisible(true)} activeOpacity={0.7}>
            <Text style={[styles.settingItemLabel, { color: '#ef4444' }]}>• Close & Delete Account</Text>
            <Text style={styles.settingToggleArrow}>❯</Text>
          </TouchableOpacity>
        </View>



        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Tenant Management Modal */}
      <Modal visible={tenantModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardWindow}>
            <Text style={styles.modalHeaderTitle}>Tenant Management Control</Text>
            
            <ScrollView style={{ width: '100%', maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              {tenantLoading ? (
                <ActivityIndicator size="small" color={themeColor || '#0038a8'} style={{ marginVertical: 20 }} />
              ) : currentTenant ? (
                <View style={styles.tenantInfoCard}>
                  <Text style={styles.infoTitle}>
                    Current Active {currentTenant.role === 'short_term_renter' ? 'Short-term Renter' : 'Tenant'}
                  </Text>
                  <Text style={styles.infoText}>• Name: {currentTenant.profiles?.full_name}</Text>
                  <Text style={styles.infoText}>• Email: {currentTenant.profiles?.email}</Text>
                  <Text style={styles.infoText}>• Phone: {currentTenant.profiles?.phone || 'N/A'}</Text>
                  <Text style={styles.infoText}>
                    • Lease: {currentTenant.lease_start_date || 'N/A'} ~ {currentTenant.lease_end_date || 'N/A'}
                  </Text>
                  <Text style={styles.infoText}>• Designated Payer: {currentTenant.is_payer ? 'Yes' : 'No'}</Text>
                  
                  <TouchableOpacity 
                    style={styles.removeTenantBtn}
                    onPress={handleRemoveTenant}
                    disabled={submittingTenant}
                  >
                    {submittingTenant ? <ActivityIndicator color="#fff" /> : <Text style={styles.removeBtnText}>Remove {currentTenant.role === 'short_term_renter' ? 'Renter' : 'Tenant'}</Text>}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.tenantInfoCard}>
                  <Text style={styles.infoTitle}>Status: Vacant Unit</Text>
                  <Text style={styles.infoSubText}>No active occupant. Bills are assigned to the owner (Vacancy Fallback).</Text>
                </View>
              )}

              <Text style={styles.formTitle}>Occupant Role</Text>
              <View style={styles.roleSelectionRow}>
                <TouchableOpacity 
                  style={[
                    styles.roleSelectBtn, 
                    newTenantRole === 'tenant' ? { backgroundColor: themeColor || '#0038a8', borderColor: themeColor || '#0038a8' } : null
                  ]}
                  onPress={() => {
                    setNewTenantRole('tenant');
                    setNewTenantIsPayer(true);
                  }}
                >
                  <Text style={[styles.roleSelectBtnText, newTenantRole === 'tenant' ? { color: '#fff' } : null]}>Long-term Tenant</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[
                    styles.roleSelectBtn, 
                    newTenantRole === 'short_term_renter' ? { backgroundColor: themeColor || '#0038a8', borderColor: themeColor || '#0038a8' } : null
                  ]}
                  onPress={() => {
                    setNewTenantRole('short_term_renter');
                    setNewTenantIsPayer(false);
                  }}
                >
                  <Text style={[styles.roleSelectBtnText, newTenantRole === 'short_term_renter' ? { color: '#fff' } : null]}>Short-term Renter</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.formTitle}>Register New Occupant</Text>
              
              <TextInput 
                style={styles.formInput} 
                placeholder="Full Name" 
                value={newTenantName} 
                onChangeText={setNewTenantName}
              />
              <TextInput 
                style={styles.formInput} 
                placeholder="Email Address" 
                value={newTenantEmail} 
                onChangeText={setNewTenantEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextInput 
                style={styles.formInput} 
                placeholder="Phone Number (e.g., +63912...)" 
                value={newTenantPhone} 
                onChangeText={setNewTenantPhone}
                keyboardType="phone-pad"
                inputAccessoryViewID="tenantPhoneAccessory"
              />
              {Platform.OS === 'ios' && (
                <InputAccessoryView nativeID="tenantPhoneAccessory">
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
              <TextInput 
                style={styles.formInput} 
                placeholder="Lease Start Date (YYYY-MM-DD)" 
                value={leaseStartDate} 
                onChangeText={setLeaseStartDate}
              />
              <TextInput 
                style={styles.formInput} 
                placeholder="Lease End Date (YYYY-MM-DD)" 
                value={leaseEndDate} 
                onChangeText={setLeaseEndDate}
              />

              <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569', marginTop: 10, marginBottom: 5 }}>Lease Agreement / Contract Photo *</Text>
              {selectedContractImage ? (
                <View style={{ position: 'relative', width: '100%', height: 150, borderRadius: 8, overflow: 'hidden', marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
                  <Image source={{ uri: selectedContractImage }} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
                  <TouchableOpacity 
                    style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 15, width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => {
                      setSelectedContractImage(null);
                      setContractImageBase64('');
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity 
                  style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1', borderRadius: 8, padding: 12, alignItems: 'center', marginBottom: 12, backgroundColor: '#f8fafc' }}
                  onPress={pickContractImage}
                  disabled={uploadingContract}
                >
                  <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '600' }}>📎 Attach Contract Photo (Required)</Text>
                </TouchableOpacity>
              )}
              
              {newTenantRole === 'tenant' && (
                <TouchableOpacity 
                  style={styles.toggleRow} 
                  onPress={() => setNewTenantIsPayer(!newTenantIsPayer)}
                >
                  <Text style={styles.toggleText}>Designate Tenant as Billing Payer</Text>
                  <Text style={[styles.toggleCheckbox, { color: themeColor || '#0038a8' }]}>
                    {newTenantIsPayer ? '☑' : '☐'}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                style={styles.toggleRow} 
                onPress={() => setPayStatusChecked(!payStatusChecked)}
              >
                <Text style={styles.toggleText}>Confirm unit payments are fully settled (Pay Status) *</Text>
                <Text style={[styles.toggleCheckbox, { color: themeColor || '#0038a8' }]}>
                  {payStatusChecked ? '☑' : '☐'}
                </Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity 
                style={styles.modalCancelBtn} 
                onPress={() => setTenantModalVisible(false)}
              >
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[
                  styles.modalSubmitBtn, 
                  { backgroundColor: themeColor || '#0038a8' },
                  (!payStatusChecked || submittingTenant) ? { opacity: 0.5 } : null
                ]} 
                onPress={handleRegisterTenant}
                disabled={!payStatusChecked || submittingTenant}
              >
                {submittingTenant ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Terms of Service Modal */}
      <Modal visible={termsModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCardWindow, { width: '90%', maxHeight: '80%' }]}>
            <Text style={styles.modalHeaderTitle}>Terms & PMO Bylaws</Text>
            <ScrollView style={{ width: '100%', paddingHorizontal: 4, flexShrink: 1 }} showsVerticalScrollIndicator={true}>
              <Text style={styles.legalHeading}>1. Purpose & Access Authorization</Text>
              <Text style={styles.legalText}>
                FiliCondo is an exclusive platform for verified residents, tenants, and PMO staff of this condominium. Access is authorized solely for legitimate occupants holding a valid lease or ownership mapping.
              </Text>
              <Text style={styles.legalHeading}>2. Compliance with Philippine Laws</Text>
              <Text style={styles.legalText}>
                You agree to comply with the Cybercrime Prevention Act of 2012 (Republic Act No. 10175) and other applicable local laws. Any fraudulent postings, distribution of malicious material, harassment, or unauthorized access attempts are strictly prohibited and will be reported to law enforcement.
              </Text>
              <Text style={styles.legalHeading}>3. Marketplace (Bazaar) Disclaimers</Text>
              <Text style={styles.legalText}>
                The Resident Bazaar serves purely as a listing board. All meetups, trades, and payments are conducted at the sole risk of the participants. The PMO does not assume liability for transaction disputes, quality issues, or personal safety. We strongly advise meeting in the lobby or public areas.
              </Text>
              <Text style={styles.legalHeading}>4. Account Termination & Bylaws</Text>
              <Text style={styles.legalText}>
                Failure to comply with condo house rules, PMO bylaws, or local legislation may result in the immediate suspension or permanent deletion of your account.
              </Text>
            </ScrollView>
            <TouchableOpacity 
              style={[styles.modalSubmitBtn, { backgroundColor: themeColor || '#0038a8', width: '100%', marginTop: 20, paddingVertical: 12, marginLeft: 0 }]} 
              onPress={() => setTermsModalVisible(false)}
            >
              <Text style={styles.submitBtnText}>I Understand & Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Privacy Policy Modal */}
      <Modal visible={privacyModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCardWindow, { width: '90%', maxHeight: '80%' }]}>
            <Text style={styles.modalHeaderTitle}>Privacy Policy</Text>
            <ScrollView style={{ width: '100%', paddingHorizontal: 4, flexShrink: 1 }} showsVerticalScrollIndicator={true}>
              <Text style={styles.legalHeading}>1. Compliance with RA 10173 (DPA)</Text>
              <Text style={styles.legalText}>
                In accordance with the Data Privacy Act of 2012 (DPA) of the Philippines, we are committed to safeguarding your personal data. We collect only necessary details to verify your occupancy and secure gate and billing access.
              </Text>
              <Text style={styles.legalHeading}>2. Data Minimization & Security</Text>
              <Text style={styles.legalText}>
                To protect your physical security inside the condo and prevent unsolicited door-to-door visits:
                {"\n"}• Your exact unit number is masked in the public feed (e.g. Unit 12**).
                {"\n"}• Bazaar trades are conducted via user aliases (nicknames) rather than unit numbers.
                {"\n"}• The PMO will never disclose your room information to other residents.
              </Text>
              <Text style={styles.legalHeading}>3. Shared Data</Text>
              <Text style={styles.legalText}>
                Your data is stored securely on Supabase cloud servers. We do not sell, distribute, or share personal data with external third parties unless ordered by court order or local security investigations.
              </Text>
              <Text style={styles.legalHeading}>4. Data Retention Policy</Text>
              <Text style={styles.legalText}>
                Upon account deletion, all personal identifiers (name, email, phone, avatar, vehicle license plate, bazaar profile) are permanently erased or anonymized. Billing details, maintenance history, and visitor records are archived for 5 years to comply with Philippine Bureau of Internal Revenue (BIR) audits.
              </Text>
            </ScrollView>
            <TouchableOpacity 
              style={[styles.modalSubmitBtn, { backgroundColor: themeColor || '#0038a8', width: '100%', marginTop: 20, paddingVertical: 12, marginLeft: 0 }]} 
              onPress={() => setPrivacyModalVisible(false)}
            >
              <Text style={styles.submitBtnText}>I Understand & Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal visible={deleteAccountModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCardWindow, { width: '85%' }]}>
            <Text style={[styles.modalHeaderTitle, { color: '#ef4444' }]}>⚠️ Delete Account</Text>
            <ScrollView style={{ width: '100%', maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.legalText, { fontWeight: '700', color: '#1e293b', marginBottom: 8 }]}>
                This action is permanent and cannot be undone.
              </Text>
              <Text style={styles.legalText}>
                Pursuant to the Philippine Data Privacy Act (RA 10173), deleting your account will immediately erase or anonymize your personal identifiers (name, email, phone number, vehicle plate numbers, and bazaar alias profile).
              </Text>
              <Text style={[styles.legalText, { marginTop: 8, fontStyle: 'italic' }]}>
                Note: In compliance with Bureau of Internal Revenue (BIR) regulations and local condominium corporate bylaws, historical transaction records (such as unpaid billings, maintenance requests, and amenity bookings) must be archived for a minimum retention period of 5 years.
              </Text>
            </ScrollView>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity 
                style={styles.modalCancelBtn} 
                onPress={() => setDeleteAccountModalVisible(false)}
              >
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalSubmitBtn, { backgroundColor: '#ef4444' }]} 
                onPress={handleDeleteAccount}
              >
                <Text style={styles.submitBtnText}>Delete My Data</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Welcome Coupon Box Modal */}
      <Modal visible={couponBoxVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCardWindow, { width: '90%', maxHeight: '80%' }]}>
            <Text style={styles.modalHeaderTitle}>🎁 My Coupons</Text>
            
            <ScrollView style={{ width: '100%', marginBottom: 16, flexShrink: 1 }} showsVerticalScrollIndicator={true}>
              {coupons.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, marginVertical: 40, fontStyle: 'italic' }}>
                  No coupons available.
                </Text>
              ) : (
                coupons.map((c) => {
                  const isActive = c.status === 'active';
                  return (
                    <View 
                      key={c.id} 
                      style={{ 
                        backgroundColor: '#f8fafc', 
                        borderRadius: 16, 
                        borderWidth: 1, 
                        borderColor: '#e2e8f0', 
                        padding: 16, 
                        marginVertical: 6,
                        opacity: isActive ? 1 : 0.6,
                        width: '100%'
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#1e293b', flex: 1 }}>
                          {c.advertiser_name}
                        </Text>
                        <View style={{ 
                          backgroundColor: isActive ? '#f0fdf4' : '#f1f5f9', 
                          paddingHorizontal: 8, 
                          paddingVertical: 3, 
                          borderRadius: 6 
                        }}>
                          <Text style={{ 
                            fontSize: 9, 
                            fontWeight: '800', 
                            color: isActive ? '#16a34a' : '#64748b' 
                          }}>
                            {isActive ? 'ACTIVE' : 'REDEEMED'}
                          </Text>
                        </View>
                      </View>
                      
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 6 }}>
                        {c.title}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 15 }}>
                        {c.description}
                      </Text>
                      
                      {isActive ? (
                        <TouchableOpacity 
                          style={{ 
                            backgroundColor: themeColor || '#0038a8', 
                            paddingVertical: 10, 
                            borderRadius: 10, 
                            alignItems: 'center', 
                            marginTop: 12 
                          }}
                          onPress={() => {
                            setSelectedCoupon(c);
                            setQrModalVisible(true);
                          }}
                        >
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
                            📱 Use Coupon (Show QR)
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={{ 
                          backgroundColor: '#e2e8f0', 
                          paddingVertical: 10, 
                          borderRadius: 10, 
                          alignItems: 'center', 
                          marginTop: 12 
                        }}>
                          <Text style={{ color: '#64748b', fontSize: 12, fontWeight: 'bold' }}>
                            ✓ Redeemed at Merchant
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
            
            <TouchableOpacity 
              style={{ width: '100%', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', backgroundColor: '#f8fafc' }} 
              onPress={() => setCouponBoxVisible(false)}
            >
              <Text style={{ fontWeight: 'bold', color: '#475569', fontSize: 14 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* QR Code Viewer Modal */}
      <Modal visible={qrModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCardWindow, { alignItems: 'center', padding: 24, width: '90%' }]}>
            <Text style={styles.modalHeaderTitle}>{selectedCoupon?.advertiser_name}</Text>
            <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 20, lineHeight: 17 }}>
              {selectedCoupon?.title}
            </Text>
            
            <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}>
              {selectedCoupon && (
                <QRCode value={selectedCoupon.code} size={180} />
              )}
            </View>
            
            <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 14, fontWeight: 'bold', color: '#334155', marginTop: 16, letterSpacing: 1 }}>
              {selectedCoupon?.code}
            </Text>
            
            <Text style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 8, paddingHorizontal: 10 }}>
              Present this QR code to the partner merchant. They will scan it to apply your welcome benefit.
            </Text>
            
            <TouchableOpacity 
              style={{ width: '100%', marginTop: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', backgroundColor: '#f8fafc' }} 
              onPress={() => {
                setQrModalVisible(false);
                fetchCoupons(); // Refresh in background
              }}
            >
              <Text style={{ fontWeight: 'bold', color: '#475569', fontSize: 14 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={passwordModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardWindow}>
            <Text style={styles.modalHeaderTitle}>Change Password</Text>
            <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 16 }}>
              Enter a new secure password.
            </Text>

            <TextInput
              style={styles.formInput}
              placeholder="New Password (min 6 chars)"
              secureTextEntry={true}
              onChangeText={setNewPassword}
              value={newPassword}
              autoCapitalize="none"
            />
            
            <TextInput
              style={styles.formInput}
              placeholder="Confirm New Password"
              secureTextEntry={true}
              onChangeText={setConfirmPassword}
              value={confirmPassword}
              autoCapitalize="none"
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity 
                style={styles.modalCancelBtn} 
                onPress={() => {
                  setPasswordModalVisible(false);
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                <Text style={{ fontWeight: 'bold', color: '#475569', fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalSubmitBtn, { backgroundColor: themeColor || '#0038a8' }]} 
                onPress={handleChangePassword}
                disabled={updatingPassword}
              >
                {updatingPassword ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Update Password</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  roleBadgeContainer: {
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#b3e0ff',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  legalHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1e293b',
    marginTop: 12,
    marginBottom: 4,
  },
  legalText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
    textAlign: 'left',
  },
  // New Styles
  smallBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'center', alignItems: 'center' },
  modalCardWindow: { width: '85%', backgroundColor: '#fff', borderRadius: 24, padding: 20, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, elevation: 5 },
  modalHeaderTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 16 },
  tenantInfoCard: { width: '100%', backgroundColor: '#f8fafc', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16 },
  infoTitle: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8 },
  infoText: { fontSize: 12, color: '#475569', marginTop: 4 },
  infoSubText: { fontSize: 12, color: '#64748b', fontStyle: 'italic', marginTop: 4 },
  removeTenantBtn: { width: '100%', paddingVertical: 10, borderRadius: 8, backgroundColor: '#ef4444', alignItems: 'center', marginTop: 12 },
  removeBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  formTitle: { fontSize: 13, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10, marginBottom: 10 },
  formInput: { width: '100%', padding: 12, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, marginBottom: 10, fontSize: 13, backgroundColor: '#f8fafc' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, width: '100%', marginBottom: 16 },
  roleSelectionRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 16 },
  roleSelectBtn: { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, alignItems: 'center', marginHorizontal: 4 },
  roleSelectBtnText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  toggleText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  toggleCheckbox: { fontSize: 18 },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 12 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', marginRight: 8 },
  modalSubmitBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginLeft: 8 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  safeAreaContainer: { flex: 1, backgroundColor: '#fafbfd', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 10 },
  navHeaderBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#fff' },
  backButton: { flexDirection: 'row', alignItems: 'center', width: 60 },
  backIcon: { fontSize: 16, fontWeight: 'bold' },
  backText: { fontSize: 14, color: '#64748b', marginLeft: 4, fontWeight: '500' },
  navTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fafbfd' },
  mainScrollBox: { flex: 1, paddingHorizontal: 20 },
  profileHeroCard: { backgroundColor: '#fff', borderRadius: 24, padding: 24, alignItems: 'center', marginTop: 20, marginBottom: 20, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOpacity: 0.01, shadowRadius: 6 },
  avatarCircle: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarLetter: { color: '#fff', fontSize: 28, fontWeight: '800' },
  profileNameText: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  profileEmailText: { fontSize: 13, color: '#64748b', marginTop: 2 },
  unitInfoRowLabel: { flexDirection: 'row', marginTop: 14, alignItems: 'center' },
  unitMetaBadge: { backgroundColor: '#f1f5f9', color: '#334155', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, fontSize: 12, fontWeight: '600', marginRight: 8 },
  unitNumberBadge: { backgroundColor: '#f0f9ff', color: '#0369a1', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, fontSize: 12, fontWeight: '700' },
  sectionHeadingLabel: { fontSize: 12, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, paddingLeft: 4 },
  cardContainerWrapper: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 16, paddingVertical: 4, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.01, shadowRadius: 4 },
  vehicleRowItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  carMetaLeftColumn: { flexDirection: 'row', alignItems: 'center' },
  carIconSymbol: { fontSize: 22, marginRight: 12 },
  carPlateText: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  carModelSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
  activeStatusPill: { backgroundColor: '#f0fdf4', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  activeStatusPillText: { color: '#16a34a', fontSize: 10, fontWeight: '700' },
  emptyCarText: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', paddingVertical: 16 },
  addCarLinkBtn: { paddingVertical: 14, alignItems: 'center', width: '100%' },
  addCarLinkBtnText: { fontSize: 13, fontWeight: '700' },
  settingRowItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  settingItemLabel: { fontSize: 13, color: '#334155', fontWeight: '500' },
  settingToggleArrow: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  settingStatusText: { fontSize: 12, fontWeight: '500' },
  settingRowDivider: { height: 1, backgroundColor: '#f1f5f9' },
  logoutActionButton: { width: '100%', paddingVertical: 15, borderRadius: 14, backgroundColor: '#fee2e2', alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#fca5a5' },
  logoutActionButtonText: { color: '#dc2626', fontWeight: '700', fontSize: 14 }
});