import { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Alert, BackHandler, Platform, TouchableOpacity } from 'react-native'; 
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { supabase } from './src/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Session } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';

// Screens Registry
import AuthScreen from './src/screens/AuthScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import HomeScreen from './src/screens/HomeScreen';
import BillingScreen from './src/screens/BillingScreen';
import NoticeList from './src/screens/NoticeList'; 
import VisitorManageScreen from './src/screens/VisitorManageScreen'; 
import MaintenanceScreen from './src/screens/MaintenanceScreen';
import MyRepairHistory from './src/screens/MyRepairHistory'; 
import JobOrderDetailScreen from './src/screens/JobOrderDetailScreen';
import AmenityScreen from './src/screens/AmenityScreen'; 
import IntercomChatScreen from './src/screens/IntercomChatScreen'; 
import ParcelDelivery from './src/screens/ParcelDelivery'; 
import VehicleManage from './src/screens/VehicleManage'; 
import PermissionScreen from './src/screens/PermissionScreen'; 
import FiliStaffSecretDoor from './src/screens/FiliStaffSecretDoor';
import FiliStaffAdminMain from './src/screens/FiliStaffAdminMain';
import FiliStaffGuardMain from './src/screens/FiliStaffGuardMain';
import MaintenanceTechApp from './src/screens/MaintenanceTechApp';
import AmenityStaffApp from './src/screens/AmenityStaffApp';

import CommunityScreen from './src/screens/CommunityScreen';
import CommunityDetailScreen from './src/screens/CommunityDetailScreen';
import BazaarScreen from './src/screens/BazaarScreen';
import BazaarDetail from './src/screens/BazaarDetail'; 
import BazaarChatScreen from './src/screens/BazaarChatScreen';
import DirectChatScreen from './src/screens/DirectChatScreen';
import DirectChatListScreen from './src/screens/DirectChatListScreen';
import MyPageScreen from './src/screens/MyPageScreen';

import { CondoConfigProvider, useCondoConfig } from './src/hooks/CondoConfigContext';
import { UnitProvider } from './src/contexts/UnitContext';
import { BadgeProvider, useBadge } from './src/contexts/BadgeContext';
import { LiveGateIntercom } from './src/components/LiveGateIntercom';

// 앱 시작 시 호출
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    try {
      const data = notification.request.content.data || {};
      const title = notification.request.content.title || '';
      const body = notification.request.content.body || '';

      const isNotice = data.type === 'NEW_NOTICE';

      const isCommunity = 
        !isNotice && (
          data.type === 'COMMUNITY' || 
          data.type === 'COMMUNITY_POST' || 
          title.toLowerCase().includes('community') || 
          body.toLowerCase().includes('community')
        );

      const isBazaar = 
        !isNotice && (
          data.type === 'BAZAAR' || 
          data.type === 'BAZAAR_ITEM' || 
          title.toLowerCase().includes('bazaar') || 
          body.toLowerCase().includes('bazaar')
        );

      if (isCommunity) {
        const isMuted = await AsyncStorage.getItem('mute_community_notifications');
        if (isMuted === 'true') {
          return {
            shouldShowAlert: false,
            shouldShowBanner: false,
            shouldShowList: false,
            shouldPlaySound: false,
            shouldSetBadge: true,
          };
        }
      }

      if (isBazaar) {
        const isMuted = await AsyncStorage.getItem('mute_bazaar_notifications');
        if (isMuted === 'true') {
          return {
            shouldShowAlert: false,
            shouldShowBanner: false,
            shouldShowList: false,
            shouldPlaySound: false,
            shouldSetBadge: true,
          };
        }
      }
    } catch (error) {
      console.error("Error in handleNotification custom logic:", error);
    }

    return {
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    };
  },
});

// 앱 시작 시 토큰 저장 함수
async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F71',
      showBadge: true, // 🎯 Android 앱 아이콘 뱃지 노출 허용 추가
    });
  }

  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  if (status !== 'granted') {
    Alert.alert('Permission needed', 'Failed to get push token for push notification!');
    return;
  }
  
  try {
    const token = (await Notifications.getExpoPushTokenAsync({
      projectId: 'f5a14c1a-8d8e-4f6b-bc17-29b697b3bdb2' // 🎯 app.json projectId input
    })).data;
    
    console.log("✅ Push token created:", token);
    return token; // 🎯 Return token only, do not save here
    
  } catch (error) {
    console.warn("Push token registration warning (expected on simulators):", error);
    return null;
  }
}

const Stack = createStackNavigator<any>(); 
const Tab = createBottomTabNavigator<any>();

function AndroidBackGuard() {
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        Alert.alert("Exit App", "Are you sure you want to exit the app?", [
          { text: "Cancel", style: "cancel" },
          { text: "Exit", onPress: () => BackHandler.exitApp() }
        ]);
        return true; 
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove(); 
    }, [])
  );
  return null;
}

function BottomTabNavigator() {
  const { themeColor, isCommunityEnabled, isBazaarEnabled } = useCondoConfig();
  const { totalHomeBadgeCount, unreadSupportCount } = useBadge();
  
  return (
    <>
      {Platform.OS === 'android' && <AndroidBackGuard />}
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: themeColor || '#0038a8',
          tabBarInactiveTintColor: '#94a3b8',
          tabBarStyle: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 6, paddingBottom: Platform.OS === 'ios' ? 24 : 10, height: Platform.OS === 'ios' ? 84 : 64 },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' }
        }}
      >
        <Tab.Screen 
          name="HomeTab" 
          component={HomeScreen as React.ComponentType<any>} 
          options={{ 
            tabBarLabel: 'Home', 
            tabBarIcon: ({ color, size, focused }) => (
              <View style={{ width: size, height: size }}>
                <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
                {totalHomeBadgeCount > 0 && (
                  <View style={{
                    position: 'absolute',
                    right: -10,
                    top: -3,
                    backgroundColor: '#ce1126',
                    borderRadius: 8,
                    minWidth: 16,
                    height: 16,
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: '#fff',
                    paddingHorizontal: 3
                  }}>
                    <Text style={{ color: '#fff', fontSize: 8, fontWeight: '900', textAlign: 'center' }}>
                      {totalHomeBadgeCount}
                    </Text>
                  </View>
                )}
              </View>
            )
          }} 
        />
        <Tab.Screen 
          name="MessagesTab" 
          component={DirectChatListScreen as React.ComponentType<any>} 
          options={{ 
            tabBarLabel: 'Messages', 
            tabBarIcon: ({ color, size, focused }) => (
              <View style={{ width: size, height: size }}>
                <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={size} color={color} />
                {unreadSupportCount > 0 && (
                  <View style={{
                    position: 'absolute',
                    right: -10,
                    top: -3,
                    backgroundColor: '#ce1126',
                    borderRadius: 8,
                    minWidth: 16,
                    height: 16,
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: '#fff',
                    paddingHorizontal: 3
                  }}>
                    <Text style={{ color: '#fff', fontSize: 8, fontWeight: '900', textAlign: 'center' }}>
                      {unreadSupportCount}
                    </Text>
                  </View>
                )}
              </View>
            )
          }} 
        />
        <Tab.Screen 
          name="MyPageTab" 
          component={MyPageScreen as React.ComponentType<any>} 
          options={{ 
            tabBarLabel: 'My Page', 
            tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} /> 
          }} 
        />
      </Tab.Navigator>
    </>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<'GUARD' | 'PMO_MANAGER' | 'TECHNICIAN' | 'AMENITY_STAFF' | 'RESIDENT' | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [hasConsented, setHasConsented] = useState<boolean>(false);

  // Biometric Unlock trigger
  const handleBiometricUnlock = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          'Biometrics Unavailable',
          'FaceID/TouchID is not available or registered on this device.'
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify your biometric data to unlock FiliHomes',
        fallbackLabel: 'Enter Passcode',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setIsAppLocked(false);
      } else {
        Alert.alert(
          'Unlock Failed',
          'Authentication failed. Please try again.',
          [{ text: 'Try Again', onPress: () => handleBiometricUnlock() }]
        );
      }
    } catch (error) {
      console.error("Biometric unlock error:", error);
      Alert.alert('Error', 'Failed to authenticate.');
    }
  };

  useEffect(() => {
    if (isAppLocked) {
      handleBiometricUnlock();
    }
  }, [isAppLocked]);

  useEffect(() => {
    // 🎯 알림 수신 시 호출되는 리스너
    const notificationSubscription = Notifications.addNotificationReceivedListener(notification => {
      console.log("🔔 알림 수신됨:", notification);
    });

    // 1. 인증 상태 변화 감지 (UI 스레드에서 즉시 반응)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      console.log("🚀 Auth Event:", _event, currentSession ? "Logged In" : "Logged Out");
      setSession(currentSession ?? null);
      if (!currentSession) {
        setUserRole(null);
        setLoading(false); // 세션이 없으면 로딩 화면 즉시 해제
      }
    });

    // 앱 시작 시 한 번 강제 리프레시 세션 확인
    const checkInitialSession = async () => {
      console.log("🔄 세션 및 잠금 체크 시작...");
      try {
        const lockEnabled = await AsyncStorage.getItem('face_id_lock_enabled');
        if (lockEnabled === 'true') {
          setIsAppLocked(true);
        }

        const consented = await AsyncStorage.getItem('has_consented_permissions');
        if (consented === 'true') {
          setHasConsented(true);
        }

        const { data: { session: initSession } } = await supabase.auth.getSession();
        if (initSession) {
          setSession(initSession);
        } else {
          setLoading(false);
        }
      } catch (e) {
        console.error("세션 초기화 실패", e);
        setLoading(false);
      }
    };
    checkInitialSession();

    return () => {
      subscription.unsubscribe();
      notificationSubscription.remove();
    };
  }, []);

  // 2. 세션이 설정되거나 갱신되었을 때 프로필 데이터 로드
  useEffect(() => {
    const fetchUserRoleAndInit = async () => {
      if (!session || !session.user) {
        setUserRole(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        console.log("🔍 Fetching user profile for ID:", session.user.id);
        
        // 1. Check staff_profiles first (staff role has precedence)
        const { data: staff, error: staffError } = await supabase
          .from('staff_profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        if (staffError) {
          console.error("Staff profile fetch error:", staffError);
        }

        let loggedInUserId = session.user.id;
        let finalRole: 'RESIDENT' | 'GUARD' | 'TECHNICIAN' | 'PMO_MANAGER' | 'AMENITY_STAFF' = 'RESIDENT';
        let foundProfile = false;

        if (staff && staff.is_active) {
          console.log("✅ 스태프 프로필 로드 성공:", staff);
          const staffRole = (staff.role || '').toUpperCase().trim();
          if (staffRole === 'GUARD') {
            finalRole = 'GUARD';
          } else if (staffRole === 'PMO_MANAGER') {
            finalRole = 'PMO_MANAGER';
          } else if (staffRole === 'TECHNICIAN' || staffRole === 'TECH') {
            finalRole = 'TECHNICIAN';
          } else if (staffRole === 'AMENITY_STAFF' || staffRole === 'AMENITY') {
            finalRole = 'AMENITY_STAFF';
          }
          setUserRole(finalRole);
          foundProfile = true;
        } else {
          // 2. Check public profiles for residents
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();

          if (profileError) {
            console.error("Profile fetch error:", profileError);
          }

          if (profile) {
            console.log("✅ 유저 프로필 로드 성공:", profile);
            const lowerRole = (profile.role || '').toLowerCase();
            if (lowerRole === 'resident') {
              finalRole = 'RESIDENT';
            } else if (lowerRole === 'guard') {
              finalRole = 'GUARD';
            } else if (lowerRole === 'technician') {
              finalRole = 'TECHNICIAN';
            } else if (lowerRole === 'pmo_manager' || lowerRole === 'pmo' || lowerRole === 'manager') {
              finalRole = 'PMO_MANAGER';
            } else if (lowerRole === 'amenity_staff' || lowerRole === 'amenity') {
              finalRole = 'AMENITY_STAFF';
            }
            setUserRole(finalRole);
            foundProfile = true;
          } else {
            console.log("프로필 로드 실패, 세션 강제 종료");
            await supabase.auth.signOut().catch(() => {});
            setSession(null);
            setUserRole(null);
          }
        }

        // 💾 Register push token for any active user (staff or resident) in the background without blocking the UI
        if (foundProfile) {
          registerForPushNotificationsAsync()
            .then(async (token) => {
              if (token) {
                const { data: prof } = await supabase
                  .from('profiles')
                  .select('expo_push_token')
                  .eq('id', loggedInUserId)
                  .maybeSingle();

                if (prof && token !== prof.expo_push_token) {
                  await supabase
                    .from('profiles')
                    .update({ expo_push_token: token })
                    .eq('id', loggedInUserId);
                  console.log("💾 토큰 DB 저장 완료!");
                }
              }
            })
            .catch((tokenErr) => {
              console.error("❌ 토큰 등록 중 에러:", tokenErr);
            });
        }
      } catch (err) {
        console.error("세션 초기화 데이터 로드 실패", err);
        setUserRole(null);
      } finally {
        setLoading(false); // 최종 로딩 완료 해제
      }
    };

    fetchUserRoleAndInit();
  }, [session]);

  // [중요] 세션 확인이 끝날 때까지 화면을 절대 렌더링하지 않음
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0056b3" />
      </View>
    );
  }

  // Biometric lock screen overlay
  if (session && session.user && isAppLocked) {
    return (
      <View style={appLockStyles.container}>
        <View style={appLockStyles.content}>
          <Text style={appLockStyles.lockIcon}>🔒</Text>
          <Text style={appLockStyles.title}>FiliHomes Secure</Text>
          <Text style={appLockStyles.subtitle}>This application is secured with Face ID / Biometrics.</Text>
          <TouchableOpacity 
            style={appLockStyles.unlockButton} 
            onPress={handleBiometricUnlock} 
            activeOpacity={0.8}
          >
            <Text style={appLockStyles.unlockButtonText}>Unlock App</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <CondoConfigProvider session={session}>
      <UnitProvider session={session}>
        <BadgeProvider userId={session?.user?.id}>
          <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {session && session.user ? (
              <> 
                {/* 🎯 Role-based navigation stack routing (PMO_MANAGER disabled on mobile per requests) */}
                {userRole === 'GUARD' ? (
                  <Stack.Screen name="FiliStaffGuardMain" component={FiliStaffGuardMain as React.ComponentType<any>} options={{ gestureEnabled: false }} />
                ) : userRole === 'TECHNICIAN' ? (
                  <Stack.Screen name="MaintenanceTechApp" component={MaintenanceTechApp as React.ComponentType<any>} options={{ gestureEnabled: false }} />
                ) : userRole === 'AMENITY_STAFF' ? (
                  <Stack.Screen name="AmenityStaffApp" component={AmenityStaffApp as React.ComponentType<any>} options={{ gestureEnabled: false }} />
                ) : (
                  <>
                    {hasConsented ? (
                      <>
                        <Stack.Screen name="MainTabs" component={BottomTabNavigator} />
                        <Stack.Screen name="PermissionScreen" component={PermissionScreen as React.ComponentType<any>} options={{ gestureEnabled: false }} />
                      </>
                    ) : (
                      <>
                        <Stack.Screen name="PermissionScreen" component={PermissionScreen as React.ComponentType<any>} options={{ gestureEnabled: false }} />
                        <Stack.Screen name="MainTabs" component={BottomTabNavigator} />
                      </>
                    )}
                  </>
                )}

                <Stack.Screen name="BillingScreen" component={BillingScreen as React.ComponentType<any>} />
                <Stack.Screen name="NoticeList" component={NoticeList as React.ComponentType<any>} />
                <Stack.Screen name="VisitorManage" component={VisitorManageScreen as React.ComponentType<any>} />
                <Stack.Screen name="Maintenance" component={MaintenanceScreen as React.ComponentType<any>} />
                <Stack.Screen name="MyRepairHistory" component={MyRepairHistory as React.ComponentType<any>} />
                <Stack.Screen name="JobOrderDetail" component={JobOrderDetailScreen as React.ComponentType<any>} />
                <Stack.Screen name="Amenity" component={AmenityScreen as React.ComponentType<any>} />
                <Stack.Screen name="IntercomChat" component={IntercomChatScreen as React.ComponentType<any>} />
                <Stack.Screen name="ParcelDelivery" component={ParcelDelivery as React.ComponentType<any>} />
                <Stack.Screen name="VehicleManage" component={VehicleManage as React.ComponentType<any>} />
                <Stack.Screen name="BazaarDetail" component={BazaarDetail as React.ComponentType<any>} />
                <Stack.Screen name="BazaarChat" component={BazaarChatScreen as React.ComponentType<any>} />
                <Stack.Screen name="DirectChat" component={DirectChatScreen as React.ComponentType<any>} />
                <Stack.Screen name="DirectChatList" component={DirectChatListScreen as React.ComponentType<any>} />
                <Stack.Screen name="CommunityDetail" component={CommunityDetailScreen as React.ComponentType<any>} />
                <Stack.Screen name="Community" component={CommunityScreen as React.ComponentType<any>} />
                <Stack.Screen name="Bazaar" component={BazaarScreen as React.ComponentType<any>} />

                {/* Backup stack mapping keys so router can replace them safely */}
                {userRole !== 'GUARD' && <Stack.Screen name="FiliStaffGuardMain" component={FiliStaffGuardMain as React.ComponentType<any>} options={{ gestureEnabled: false }} />}
                {userRole !== 'PMO_MANAGER' && <Stack.Screen name="FiliStaffAdminMain" component={FiliStaffAdminMain as React.ComponentType<any>} />}
                {userRole !== 'TECHNICIAN' && <Stack.Screen name="MaintenanceTechApp" component={MaintenanceTechApp as React.ComponentType<any>} options={{ gestureEnabled: false }} />}
                {userRole !== 'AMENITY_STAFF' && <Stack.Screen name="AmenityStaffApp" component={AmenityStaffApp as React.ComponentType<any>} options={{ gestureEnabled: false }} />}
              </> 
            ) : (
              <>
                <Stack.Screen name="AuthScreen" component={AuthScreen as React.ComponentType<any>} />
                <Stack.Screen name="SignUpScreen" component={SignUpScreen as React.ComponentType<any>} />
                <Stack.Screen name="FiliStaffSecretDoor" component={FiliStaffSecretDoor as React.ComponentType<any>} options={{ gestureEnabled: false }} />
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
        {userRole === 'RESIDENT' && <LiveGateIntercom />}
        </BadgeProvider>
      </UnitProvider>
    </CondoConfigProvider>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
});

const appLockStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  lockIcon: {
    fontSize: 64,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 36,
    lineHeight: 20,
  },
  unlockButton: {
    backgroundColor: '#0038a8',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#0038a8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  unlockButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});