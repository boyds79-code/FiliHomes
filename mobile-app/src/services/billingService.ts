import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

// 캐시 키 정의
const BILLING_CACHE_KEY = '@philicondo_billing_cache_';

export interface BillingRecord {
  id: string;
  billing_month: string;
  association_dues: number;
  water_bill: number;
  penalty: number;
  total_amount: number;
  status: string;
}

export const billingService = {
  /**
   * 특정 유닛의 청구서 목록을 오프라인 우선 방식으로 조회합니다.
   */
  getBillings: async (unitId: string | null, isOffline: boolean): Promise<BillingRecord[]> => {
    if (!unitId) return [];

    const cacheKey = `${BILLING_CACHE_KEY}${unitId}`;

    // A. 오프라인 상태이거나 네트워크 연결이 불가능한 경우 로컬 캐시 반환
    if (isOffline) {
      const cachedData = await AsyncStorage.getItem(cacheKey);
      if (cachedData) {
        console.log('📡 [Offline Mode] Loaded historical billing data from local cache.');
        return JSON.parse(cachedData);
      }
      return []; // 캐시된 데이터도 없다면 빈 배열 반환
    }

    // B. 온라인 상태일 경우 Supabase 실시간 원격 DB 조회
    try {
      // 🎯 실제 DB 테이블 구조와 1:1로 매핑
      const { data, error } = await supabase
        .from('billings')
        .select(`
          id, 
          billing_month, 
          condo_dues, 
          electricity, 
          water, 
          status
        `)
        .eq('unit_id', unitId)
        .order('billing_month', { ascending: false });

      if (error) throw error;

      if (data) {
        // 🎯 타입 정의와 실제 데이터 필드명 맞추기
        const formattedData: BillingRecord[] = data.map((item: any) => ({
          id: item.id.toString(),
          billing_month: item.billing_month,
          association_dues: item.condo_dues || 0, // DB 컬럼: condo_dues
          water_bill: item.water || 0,            // DB 컬럼: water (금액)
          penalty: 0,
          total_amount: (Number(item.condo_dues) || 0) + (Number(item.water) || 0) + (Number(item.electricity) || 0),
          status: item.status,
        }));
        
        await AsyncStorage.setItem(cacheKey, JSON.stringify(formattedData));
        return formattedData;
      }
      
      return [];
    } catch (catchError) {
      console.warn('⚠️ Server fetch failed:', catchError);
      return [];
    }
  }
};