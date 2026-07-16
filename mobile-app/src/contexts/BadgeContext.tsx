import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useCondoConfig } from '../hooks/CondoConfigContext';
import { useUnit } from './UnitContext';

interface BadgeContextType {
  unreadNoticeCount: number;
  unpaidBillsCount: number;
  holdingParcelsCount: number;
  pendingVisitorsCount: number;
  unreadSupportCount: number;
  activeJobOrdersCount: number;
  totalHomeBadgeCount: number;
  totalAppBadgeCount: number;
  refreshBadges: () => Promise<void>;
}

const BadgeContext = createContext<BadgeContextType | undefined>(undefined);

export const BadgeProvider: React.FC<{ children: React.ReactNode; userId: string | undefined }> = ({ children, userId }) => {
  const { condoId, unitId, unitNumber } = useCondoConfig();
  const { currentUnit } = useUnit();
  
  const [unreadNoticeCount, setUnreadNoticeCount] = useState(0);
  const [unpaidBillsCount, setUnpaidBillsCount] = useState(0);
  const [holdingParcelsCount, setHoldingParcelsCount] = useState(0);
  const [pendingVisitorsCount, setPendingVisitorsCount] = useState(0);
  const [unreadSupportCount, setUnreadSupportCount] = useState(0);
  const [activeJobOrdersCount, setActiveJobOrdersCount] = useState(0);

  const activeUnitId = currentUnit?.unit_id || unitId;
  const activeUnitNumber = currentUnit?.unit_number || unitNumber;
  const activeCondoId = currentUnit?.condo_id || condoId;

  const refreshBadges = useCallback(async () => {
    if (!userId) {
      console.log("[BadgeContext] No user session to fetch badges for.");
      return;
    }

    let notices = 0;
    let bills = 0;
    let parcels = 0;
    let visitors = 0;
    let support = 0;
    let jobs = 0;

    // 1. Unread Notices
    try {
      const targetCondoId = activeCondoId || 'c1111111-1111-1111-1111-111111111111';
      const lastReadStr = await AsyncStorage.getItem('last_read_notice_time');
      const lastReadTime = lastReadStr ? new Date(lastReadStr).getTime() : 0;

      const { data: noticeData, error: noticeErr } = await supabase
        .from('notices')
        .select('created_at')
        .eq('condo_id', targetCondoId);

      if (noticeErr) {
        console.error('[BadgeContext] Notices fetch error:', noticeErr);
      } else if (noticeData) {
        notices = noticeData.filter((n: any) => new Date(n.created_at).getTime() > lastReadTime).length;
        console.log(`[BadgeContext] Notices count: ${notices} (Total: ${noticeData.length}, lastRead: ${lastReadTime})`);
      }
    } catch (e) {
      console.error('[BadgeContext] Error fetching unread notices count:', e);
    }

    // 2. Unpaid Billings
    try {
      if (activeUnitId) {
        const { data: bData, error: billsError } = await supabase
          .from('billings')
          .select('billing_month, status')
          .eq('unit_id', activeUnitId);

        if (billsError) {
          console.error('[BadgeContext] Billings fetch error:', billsError);
        } else if (bData) {
          const unpaidList = bData.filter((b: any) => ['ISSUED', 'OVERDUE', 'UNPAID', 'PENDING'].includes(b.status));
          const unreadUnpaid = [];
          for (const bill of unpaidList) {
            const isRead = await AsyncStorage.getItem(`billing_read_bill_${bill.id}`);
            if (isRead !== 'true') {
              unreadUnpaid.push(bill);
            }
          }
          bills = unreadUnpaid.length;
          console.log(`[BadgeContext] Billings count: ${bills} (Unpaid: ${unpaidList.length})`);
        }
      } else {
        console.log('[BadgeContext] Skip Billings fetch (no activeUnitId)');
      }
    } catch (e) {
      console.error('[BadgeContext] Error fetching billings count:', e);
    }

    // 3. Holding Parcels
    try {
      if (activeUnitNumber) {
        const { count, error: parcelsError } = await supabase
          .from('parcels')
          .select('*', { count: 'exact', head: true })
          .eq('unit_no', String(activeUnitNumber).trim())
          .eq('status', 'HOLDING');
        if (parcelsError) {
          console.error('[BadgeContext] Parcels fetch error:', parcelsError);
        } else {
          parcels = count || 0;
          console.log(`[BadgeContext] Parcels count: ${parcels}`);
        }
      } else {
        console.log('[BadgeContext] Skip Parcels fetch (no activeUnitNumber)');
      }
    } catch (e) {
      console.error('[BadgeContext] Error fetching parcels count:', e);
    }

    // 4. Pending Visitors
    try {
      if (activeUnitId) {
        const { count, error: visitorsError } = await supabase
          .from('visitor_passes')
          .select('*', { count: 'exact', head: true })
          .eq('unit_id', activeUnitId)
          .eq('status', 'PENDING');
        if (visitorsError) {
          console.error('[BadgeContext] Visitors fetch error:', visitorsError);
        } else {
          visitors = count || 0;
          console.log(`[BadgeContext] Visitors count: ${visitors}`);
        }
      } else {
        console.log('[BadgeContext] Skip Visitors fetch (no activeUnitId)');
      }
    } catch (e) {
      console.error('[BadgeContext] Error fetching visitors count:', e);
    }

    // 5. Unread Support Intercom Message (Resident App)
    try {
      if (userId) {
        // First get intercom chats for the resident unit
        const { data: chats, error: chatErr } = await supabase
          .from('intercom_chats')
          .select('id')
          .eq('user_id', userId);

        if (chatErr) {
          console.error('[BadgeContext] Intercom chats fetch error:', chatErr);
        } else if (chats && chats.length > 0) {
          const chatIds = chats.map(c => c.id);
          const { data: unreadMsgs, error: msgsErr } = await supabase
            .from('intercom_messages')
            .select('id')
            .in('chat_id', chatIds)
            .neq('sender_type', 'RESIDENT')
            .is('read_at', null);

          if (msgsErr) {
            console.error('[BadgeContext] Intercom messages fetch error:', msgsErr);
          } else if (unreadMsgs) {
            support = unreadMsgs.length;
            console.log(`[BadgeContext] Support message count: ${support}`);
          }
        } else {
          console.log('[BadgeContext] No Intercom chats found for unit');
        }
      }
    } catch (e) {
      console.error('[BadgeContext] Error fetching support unread count:', e);
    }

    // 6. Active Job Orders
    try {
      if (activeUnitId) {
        const { count, error: jobsError } = await supabase
          .from('job_orders')
          .select('*', { count: 'exact', head: true })
          .eq('unit_id', activeUnitId)
          .in('status', [
            'PENDING', 'REQUESTED', 'ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS',
            'CHECKED_BY_TECH', 'VISIT_PROPOSED', 'VISIT_CONFIRMED',
            'TIME_NEGOTIATING', 'VISITING', 'ESTIMATE_SUBMITTED'
          ]);
        
        if (jobsError) {
          console.error('[BadgeContext] Job orders fetch error:', jobsError);
        } else {
          jobs = count || 0;
          console.log(`[BadgeContext] Active Job Orders count: ${jobs}`);
        }
      } else {
        console.log('[BadgeContext] Skip Job orders fetch (no activeUnitId)');
      }
    } catch (e) {
      console.error('[BadgeContext] Error fetching job orders count:', e);
    }

    setUnreadNoticeCount(notices);
    setUnpaidBillsCount(bills);
    setHoldingParcelsCount(parcels);
    setPendingVisitorsCount(visitors);
    setUnreadSupportCount(support);
    setActiveJobOrdersCount(jobs);

    // Update OS Badge Count
    const totalHome = notices + bills + parcels + visitors + jobs;
    const totalApp = totalHome + support;
    try {
      await Notifications.setBadgeCountAsync(totalApp);
      console.log(`[BadgeContext] Updated OS Badge count: ${totalApp} (Home: ${totalHome}, Support Chat: ${support})`);
    } catch (err) {
      console.log('[BadgeContext] Error setting OS Badge count:', err);
    }
  }, [activeCondoId, activeUnitId, activeUnitNumber, userId]);

  const refreshBadgesRef = useRef(refreshBadges);
  useEffect(() => {
    refreshBadgesRef.current = refreshBadges;
  }, [refreshBadges]);

  // 1. 유저 세션 및 콘도/유닛 정보가 변경될 때마다 뱃지를 다시 패치
  useEffect(() => {
    if (userId) {
      console.log(`[BadgeContext] Info changed, refreshing badges. Condo: ${activeCondoId}, Unit: ${activeUnitId}`);
      refreshBadges();
    }
  }, [userId, activeCondoId, activeUnitId, activeUnitNumber]);

  // 2. 데이터베이스 실시간 변경 사항 감지 채널 및 푸시 알림 리스너 등록
  useEffect(() => {
    if (!userId) {
      setUnreadNoticeCount(0);
      setUnpaidBillsCount(0);
      setHoldingParcelsCount(0);
      setPendingVisitorsCount(0);
      setUnreadSupportCount(0);
      Notifications.setBadgeCountAsync(0).catch(() => {});
      return;
    }

    // Foreground 알림 수신 시 뱃지 즉시 갱신
    const notificationSubscription = Notifications.addNotificationReceivedListener(notification => {
      console.log("[BadgeContext] Notification received in foreground, refreshing badges:", notification);
      refreshBadgesRef.current();
    });
    
    // Setup Realtime subscriptions to update badges on database changes
    const channelName = `realtime-badge-sync-${userId}`;
    const changeChannel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notices' }, () => { 
        console.log("[BadgeContext] Notice change detected via Realtime");
        refreshBadgesRef.current(); 
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'billings' }, () => { 
        console.log("[BadgeContext] Billings change detected via Realtime");
        refreshBadgesRef.current(); 
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parcels' }, () => { 
        console.log("[BadgeContext] Parcels change detected via Realtime");
        refreshBadgesRef.current(); 
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitor_passes' }, () => { 
        console.log("[BadgeContext] Visitor passes change detected via Realtime");
        refreshBadgesRef.current(); 
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_orders' }, () => { 
        console.log("[BadgeContext] Job orders change detected via Realtime");
        refreshBadgesRef.current(); 
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intercom_messages' }, () => { 
        console.log("[BadgeContext] Intercom messages change detected via Realtime");
        refreshBadgesRef.current(); 
      })
      .subscribe();

    return () => {
      notificationSubscription.remove();
      supabase.removeChannel(changeChannel);
    };
  }, [userId]);

  const totalHomeBadgeCount = unreadNoticeCount + unpaidBillsCount + holdingParcelsCount + pendingVisitorsCount + activeJobOrdersCount;
  const totalAppBadgeCount = totalHomeBadgeCount + unreadSupportCount;

  return (
    <BadgeContext.Provider value={{
      unreadNoticeCount,
      unpaidBillsCount,
      holdingParcelsCount,
      pendingVisitorsCount,
      unreadSupportCount,
      activeJobOrdersCount,
      totalHomeBadgeCount,
      totalAppBadgeCount,
      refreshBadges
    }}>
      {children}
    </BadgeContext.Provider>
  );
};

export const useBadge = () => {
  const context = useContext(BadgeContext);
  if (context === undefined) {
    throw new Error('useBadge must be used within a BadgeProvider');
  }
  return context;
};
