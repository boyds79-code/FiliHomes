import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Session } from '@supabase/supabase-js';

// 유닛 정보 인터페이스 정의
interface AssignedUnit {
  unit_id: string;
  condo_id: string;
  unit_number: string;
  condo_name: string;
  role: string;
}

interface UnitContextType {
  myUnits: AssignedUnit[];
  currentUnit: AssignedUnit | null;
  unitLoading: boolean;
  switchUnit: (unitId: string) => void;
}

const UnitContext = createContext<UnitContextType | undefined>(undefined);

export function UnitProvider({ session, children }: { session?: Session | null; children: React.ReactNode }) {
  const { session: authSession } = useAuth();
  const activeSession = session !== undefined ? session : authSession;
  
  const [myUnits, setMyUnits] = useState<AssignedUnit[]>([]);
  const [currentUnit, setCurrentUnit] = useState<AssignedUnit | null>(null);
  const [unitLoading, setUnitLoading] = useState(true);

  useEffect(() => {
    fetchUserAssignedUnits();
  }, [activeSession]);

  const fetchUserAssignedUnits = async () => {
    if (!activeSession?.user) {
      setMyUnits([]);
      setCurrentUnit(null);
      setUnitLoading(false);
      return;
    }

    try {
      setUnitLoading(true);
      // Phase 1에서 구현한 user_units 브릿지 테이블을 활용하여 유저의 모든 권한 유닛 조회
      const { data, error } = await supabase
        .from('user_units')
        .select(`
          unit_id,
          condo_id,
          role,
          units (unit_number),
          condos (name)
        `)
        .eq('user_id', activeSession.user.id)
        .eq('status', 'active');

      if (error) throw error;

      if (data && data.length > 0) {
        const formattedUnits: AssignedUnit[] = data.map((item: any) => ({
          unit_id: item.unit_id,
          condo_id: item.condo_id,
          role: item.role,
          unit_number: item.units?.unit_number || '',
          condo_name: item.condos?.name || '',
        }));

        setMyUnits(formattedUnits);
        // 기본값으로 첫 번째 유닛을 활성화 (단, 1206이 목록에 있는 경우 1206을 기본 활성화)
        const defaultUnit = formattedUnits.find(u => u.unit_number === '1206') || formattedUnits[0];
        setCurrentUnit(defaultUnit);
      }
    } catch (err) {
      console.error("Failed to load multi-units list:", err);
    } finally {
      setUnitLoading(false);
    }
  };

  // 사용자가 리스트에서 다른 유닛을 선택했을 때 앱 전역 상태를 교체하는 함수
  const switchUnit = (unitId: string) => {
    const target = myUnits.find((u: AssignedUnit) => u.unit_id === unitId);
    if (target) {
      setCurrentUnit(target);
      // TIP: 차후 Unit 04의 CondoConfig(테마색상/기능토글) 및 빌링 내역도 
      // 이 currentUnit 변경을 감지하여 자동으로 리프레시되도록 연결합니다.
    }
  };

  return (
    <UnitContext.Provider value={{ myUnits, currentUnit, unitLoading, switchUnit }}>
      {children}
    </UnitContext.Provider>
  );
}

export function useUnit() {
  const context = useContext(UnitContext);
  if (!context) throw new Error("useUnit must be used within a UnitProvider");
  return context;
}