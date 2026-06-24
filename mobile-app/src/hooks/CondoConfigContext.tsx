import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface CondoFeatures {
  gym: boolean;
  spa: boolean;
  pool: boolean;
  community_chat: boolean;
}

interface CondoConfigContextType {
  themeColor: string;
  features: CondoFeatures;
  condoName: string;
  unitNumber: string;
  unitId: string | null;
  condoId: string | null;
  configLoading: boolean;
  refreshConfig: () => Promise<void>;
  visitorParkingEnabled: boolean;
  amenityBookingEnabled: boolean;
  visitorParkingBillingEnabled: boolean;
  amenityBillingEnabled: boolean;
  isCommunityEnabled: boolean;
  isBazaarEnabled: boolean;
}

const CondoConfigContext = createContext<CondoConfigContextType | undefined>(undefined);

export function CondoConfigProvider({ children, session }: { children: React.ReactNode, session: any }) {
  const [themeColor, setThemeColor] = useState('#0038a8');
  const [condoName, setCondoName] = useState('PhiliCondo');
  const [unitNumber, setUnitNumber] = useState('');
  const [unitId, setUnitId] = useState<string | null>(null);
  const [condoId, setCondoId] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [features, setFeatures] = useState<CondoFeatures>({
    gym: true, spa: true, pool: true, community_chat: true,
  });
  const [visitorParkingEnabled, setVisitorParkingEnabled] = useState<boolean>(true);
  const [amenityBookingEnabled, setAmenityBookingEnabled] = useState<boolean>(true);
  const [visitorParkingBillingEnabled, setVisitorParkingBillingEnabled] = useState<boolean>(true);
  const [amenityBillingEnabled, setAmenityBillingEnabled] = useState<boolean>(true);
  const [isCommunityEnabled, setIsCommunityEnabled] = useState<boolean>(true);
  const [isBazaarEnabled, setIsBazaarEnabled] = useState<boolean>(true);

  // 안전하게 기본값을 설정하는 함수
  const useFallbackData = () => {
    setThemeColor('#0038a8');
    setCondoName('Phili-One Condominium');
    setUnitNumber('1206');
    setUnitId(null); // 에러/매칭 실패 시 가짜 데이터가 고정되는 현상 방지
    setCondoId(null);
    setFeatures({ gym: true, spa: true, pool: true, community_chat: true });
    setVisitorParkingEnabled(true);
    setAmenityBookingEnabled(true);
    setVisitorParkingBillingEnabled(true);
    setAmenityBillingEnabled(true);
    setIsCommunityEnabled(true);
    setIsBazaarEnabled(true);
  };

  const loadCondoConfiguration = async () => {
    // 세션이 완전히 준비될 때까지 기다림
    const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !currentSession?.user) {
      console.log("DEBUG - 세션 유저 없음, 여기서 에러 방지 완료.");
      if (sessionError) {
        await supabase.auth.signOut().catch(() => {});
      }
      useFallbackData();
      setConfigLoading(false);
      return;
    }

    try {
      setConfigLoading(true);
      
      // 현재 세션 사용자의 프로필만 단일 조회하도록 수정 (성능 및 보안 향상)
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, unit_id, condo_id, email')
        .eq('id', currentSession.user.id)
        .single();

      if (error || !profile) {
        console.log("DEBUG - 데이터 아예 없음:", error);
        useFallbackData(); 
        setConfigLoading(false);
        return;
      }

      if (profile?.unit_id) {
        setUnitId(profile.unit_id);
        console.log("DEBUG - 매칭 성공! unitId:", profile.unit_id);
      } else {
        setUnitId(null); // 강제 할당 방지
      }

      let activeCondoId = profile?.condo_id || null;

      // 🎯 [방어 기어] 만약 profiles에 condo_id가 누락되어 있고 unit_id가 있다면 user_units에서 condo_id를 조회해옵니다.
      if (!activeCondoId && profile?.unit_id) {
        const { data: userUnit, error: uuError } = await supabase
          .from('user_units')
          .select('condo_id')
          .eq('user_id', currentSession.user.id)
          .eq('unit_id', profile.unit_id)
          .maybeSingle();
        
        if (!uuError && userUnit?.condo_id) {
          activeCondoId = userUnit.condo_id;
          console.log("DEBUG - user_units에서 condoId 조회 성공:", activeCondoId);
        }
      }

      if (activeCondoId) {
        setCondoId(activeCondoId);
        const { data: settings } = await supabase
          .from('condo_settings')
          .select('visitor_parking_enabled, amenity_booking_enabled, visitor_parking_policy, amenity_billing_enabled, is_community_enabled, is_bazaar_enabled')
          .eq('condo_id', activeCondoId)
          .maybeSingle();

        if (settings) {
          setVisitorParkingEnabled(settings.visitor_parking_enabled !== false);
          setAmenityBookingEnabled(settings.amenity_booking_enabled !== false);
          setVisitorParkingBillingEnabled(settings.visitor_parking_policy === 'BILLING_ENABLED');
          setAmenityBillingEnabled(settings.amenity_billing_enabled !== false);
          setIsCommunityEnabled(settings.is_community_enabled !== false);
          setIsBazaarEnabled(settings.is_bazaar_enabled !== false);
        } else {
          setVisitorParkingEnabled(true);
          setAmenityBookingEnabled(true);
          setVisitorParkingBillingEnabled(true);
          setAmenityBillingEnabled(true);
          setIsCommunityEnabled(true);
          setIsBazaarEnabled(true);
        }
      } else {
        setCondoId(null);
        setVisitorParkingEnabled(true);
        setAmenityBookingEnabled(true);
        setVisitorParkingBillingEnabled(true);
        setAmenityBillingEnabled(true);
        setIsCommunityEnabled(true);
        setIsBazaarEnabled(true);
      }
      
      setUnitNumber('1206'); // 나중에 DB에서 가져오게 확장 가능
      setCondoName('Phili-One Condominium');
      setThemeColor('#0038a8');
    } catch (err) {
      console.error("Config load error:", err);
      // 강제 fallback 호출로 인해 잘못된 ID가 고정되는 현상 방지
      setUnitId(null); 
      setCondoId(null);
    } finally {
      setConfigLoading(false);
    }
  };
  
  useEffect(() => {
    // session이 undefined인 상태에서는 절대 로직을 타지 않게 합니다.
    if (session !== undefined) {
      loadCondoConfiguration();
    }
  }, [session]);

  // 🎯 디버깅: unitId 변경 추적
  useEffect(() => {
    console.log("DEBUG - unitId 상태 변경됨:", unitId);
  }, [unitId]);

  return (
    <CondoConfigContext.Provider value={{ 
      themeColor, features, condoName, unitNumber, unitId, condoId,
      configLoading, refreshConfig: loadCondoConfiguration,
      visitorParkingEnabled, amenityBookingEnabled,
      visitorParkingBillingEnabled, amenityBillingEnabled,
      isCommunityEnabled, isBazaarEnabled
    }}>
      {children}
    </CondoConfigContext.Provider>
  );
}

export function useCondoConfig() {
  const context = useContext(CondoConfigContext);
  if (!context) throw new Error("useCondoConfig must be used within a CondoConfigProvider");
  return context;
}