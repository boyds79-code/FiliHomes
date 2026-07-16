import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 유닛 정보 인터페이스 정의
interface AssignedUnit {
  unit_id: string;
  condo_id: string;
  unit_number: string;
  condo_name: string;
  role: string;
  block_phase_no?: string;
  has_badge?: boolean;
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
          units (unit_number, building_no),
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
          block_phase_no: item.units?.building_no || '',
          has_badge: false
        }));

        // Fetch unpaid billings for each unit to determine unread badge status
        try {
          const unitIds = formattedUnits.map(u => u.unit_id);
          const { data: billsData } = await supabase
            .from('billings')
            .select('id, unit_id, status')
            .in('unit_id', unitIds)
            .in('status', ['ISSUED', 'OVERDUE', 'UNPAID', 'PENDING']);

          if (billsData) {
            for (const u of formattedUnits) {
              const unitBills = billsData.filter(b => b.unit_id === u.unit_id);
              let hasUnread = false;
              for (const b of unitBills) {
                const isRead = await AsyncStorage.getItem(`billing_read_bill_${b.id}`);
                if (isRead !== 'true') {
                  hasUnread = true;
                  break;
                }
              }
              u.has_badge = hasUnread;
            }
          }
        } catch (badgeErr) {
          console.error("Failed to calculate unit badges:", badgeErr);
        }

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
  const switchUnit = async (unitId: string) => {
    const target = myUnits.find((u: AssignedUnit) => u.unit_id === unitId);
    if (target) {
      setCurrentUnit(target);
      
      // 🚨 Supabase DB의 profiles 테이블 내 unit_id와 condo_id를 즉시 동기화 업데이트하여 푸시/뱃지 연동 해결
      if (activeSession?.user) {
        try {
          const { error } = await supabase
            .from('profiles')
            .update({
              unit_id: target.unit_id,
              condo_id: target.condo_id
            })
            .eq('id', activeSession.user.id);
          
          if (error) {
            console.error("Failed to update profile unit mapping on switch:", error);
          } else {
            console.log(`✅ DB Profile synced successfully to unit ${target.unit_number} of condo ${target.condo_name}`);
          }
        } catch (err) {
          console.error("DB Profile switch sync error:", err);
        }
      }
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