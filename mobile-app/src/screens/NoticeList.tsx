import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, SafeAreaView, Platform, StatusBar, Dimensions, Modal, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext';
import { useUnit } from '../contexts/UnitContext';
import { useBadge } from '../contexts/BadgeContext';

const { width, height } = Dimensions.get('window');

interface Notice {
  id: string;
  title: string;
  content: string;
  category: 'EMERGENCY' | 'GENERAL' | 'FACILITIES' | 'EVENT';
  is_pinned: boolean;
  created_at: string;
}

export default function NoticeList({ navigation }: any) {
  const { themeColor, condoId } = useCondoConfig();
  const { currentUnit } = useUnit();
  const { refreshBadges } = useBadge();
  const targetCondoId = currentUnit?.condo_id || condoId || 'c1111111-1111-1111-1111-111111111111';
  
  const [loading, setLoading] = useState(true);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);

  const categoryTabs = [
    { label: '📦 All', value: 'ALL' },
    { label: '🚨 Emergency', value: 'EMERGENCY' },
    { label: '📢 General', value: 'GENERAL' },
    { label: '🏊 Facilities', value: 'FACILITIES' },
  ];

  useEffect(() => {
    fetchCondoNotices();
  }, [targetCondoId]);

  const fetchCondoNotices = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('notices')
        .select('*')
        .eq('condo_id', targetCondoId)
        .order('is_pinned', { ascending: false }) 
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const parsed: Notice[] = data.map((n: any) => ({
          id: n.id.toString(),
          title: n.title,
          content: n.content,
          category: n.category as any,
          is_pinned: n.is_pinned,
          created_at: n.created_at
        }));
        setNotices(parsed);
      } else {
        useFallbackData(); 
      }

      // Mark notices as read by updating the last_read_notice_time timestamp
      try {
        await AsyncStorage.setItem('last_read_notice_time', new Date().toISOString());
        refreshBadges();
      } catch (storeErr) {
        console.error("Error setting last_read_notice_time:", storeErr);
      }
    } catch (err) {
      console.log(err);
      useFallbackData();
    } finally {
      setLoading(false);
    }
  };

  const useFallbackData = () => {
    const mockNotices: Notice[] = [
      { id: 'n1', title: 'Scheduled Water Interruption: May 31', content: 'Please be advised that water supply will be temporarily suspended on May 31, from 1:00 PM to 5:00 PM for main water tank cleaning and maintenance. Please store enough water beforehand.', category: 'EMERGENCY', is_pinned: true, created_at: '2026-05-29T10:00:00Z' },
      { id: 'n2', title: 'Swimming Pool Weekly Chemical Treatment', content: 'The main swimming pool will be closed every Monday from 6:00 AM to 1:00 PM for standard chemical shock treatment and safety sanitation compliance. Thank you for your cooperation.', category: 'FACILITIES', is_pinned: false, created_at: '2026-05-28T09:00:00Z' },
      { id: 'n3', title: 'Annual Fire Drill Participation Guide', content: 'Our condo compound annual fire evacuation drill is scheduled for next Saturday at 10:00 AM. All towers and residents are highly encouraged to participate.', category: 'GENERAL', is_pinned: false, created_at: '2026-05-27T08:00:00Z' },
      { id: 'n4', title: 'Urgent Elevator #2 Maintenance Halt', content: 'Tower A Elevator #2 is currently undergoing an urgent cable check and safety sensor adjustment. Please utilize Elevator #1 and #3 in the meantime.', category: 'EMERGENCY', is_pinned: true, created_at: '2026-05-29T11:00:00Z' },
    ];
    setNotices(mockNotices);
  };

  const handleOpenDetail = (notice: Notice) => {
    setSelectedNotice(notice);
    setDetailModalVisible(true);
  };

  // 🎯 [핵심 보정 지점] 어떠한 내비게이터 이름 등록 상황에서도 유연하게 탈출하는 방어형 다중 라우터 점프 기어
  const handleInquireViaIntercom = () => {
    if (!selectedNotice) return;

    setDetailModalVisible(false);
    
    const cleanAutoMessage = `📢 [Notice Inquiry]\nRe: "${selectedNotice.title}"\n\nHi PMO, I have a question regarding this announcement.`;
    const payload = { prefilledMessage: cleanAutoMessage, noticeId: selectedNotice.id };

    // 내비게이션 상태 원장을 역추적하여 등록된 화면 명칭 목록을 안전하게 파싱합니다.
    try {
      const state = navigation.getState();
      const routeNames = state ? state.routeNames : [];

      if (routeNames.includes('IntercomChat')) {
        navigation.navigate('IntercomChat', payload);
      } else if (routeNames.includes('Intercom')) {
        navigation.navigate('Intercom', payload);
      } else if (routeNames.includes('Chat')) {
        navigation.navigate('Chat', payload);
      } else {
        // 모든 매칭이 실패할 경우, 강제 강공 돌파용 최후의 대안 가드 가동
        navigation.navigate('IntercomChatScreen', payload);
      }
    } catch (e) {
      // 내비게이터 구조가 전역 스택으로 완전히 쪼개져 있는 경우를 대비한 2단계 연속 타격 기어
      navigation.navigate('IntercomChat', payload);
    }
  };

  const filteredNotices = notices.filter(n => {
    if (selectedCategory === 'ALL') return true;
    return n.category === selectedCategory;
  });

  const getCategoryMeta = (cat: string, isPinned: boolean) => {
    if (isPinned) return { icon: '📌', label: 'PINNED', color: '#dc2626', bg: '#fef2f2' };
    switch (cat) {
      case 'EMERGENCY': return { icon: '🚨', label: 'EMERGENCY', color: '#ef4444', bg: '#fef2f2' };
      case 'FACILITIES': return { icon: '🏊', label: 'FACILITIES', color: '#0038a8', bg: '#f0f9ff' };
      default: return { icon: '📢', label: 'GENERAL', color: '#475569', bg: '#f1f5f9' };
    }
  };

  const renderNoticeItem = ({ item }: { item: Notice }) => {
    const meta = getCategoryMeta(item.category, item.is_pinned);

    return (
      <View style={[styles.noticeCard, item.is_pinned && styles.pinnedCardBorder]}>
        <TouchableOpacity style={styles.cardTouchHeader} onPress={() => handleOpenDetail(item)} activeOpacity={0.7}>
          <View style={styles.cardHeaderInline}>
            <View style={[styles.categoryBadge, { backgroundColor: meta.bg }]}>
              <Text style={[styles.categoryBadgeText, { color: meta.color }]}>
                {meta.icon} {meta.label}
              </Text>
            </View>
            <Text style={styles.dateStampText}>
              {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </Text>
          </View>

          <View style={styles.titleRowInlineLayout}>
            <Text style={[styles.noticeTitle, item.is_pinned && styles.pinnedTitleColor]} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.arrowIconNext}>❯</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeAreaContainer}>
      <View style={styles.navHeaderBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.6}>
          <Text style={[styles.backIcon, { color: themeColor || '#0038a8' }]}>❮</Text>
          <Text style={styles.backText}>Home</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Notice Board</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.topTitleSection}>
        <Text style={styles.mainTitleHeader}>Community Announcements</Text>
      </View>

      <View style={styles.filterContainer}>
        {categoryTabs.map(tab => (
          <TouchableOpacity 
            key={tab.value}
            style={[styles.filterTabButton, selectedCategory === tab.value && styles.activeTabButton]}
            onPress={() => setSelectedCategory(tab.value)}
          >
            <Text style={[styles.filterTabText, selectedCategory === tab.value && { color: themeColor || '#0038a8', fontWeight: '700' }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.listWrapper}>
        {loading ? (
          <ActivityIndicator size="large" color={themeColor || '#0038a8'} style={{ marginTop: 40 }} />
        ) : filteredNotices.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={{ fontSize: 44 }}>🍃</Text>
            <Text style={styles.emptyText}>No bulletins found under this category.</Text>
          </View>
        ) : (
          <FlatList data={filteredNotices} keyExtractor={(item) => item.id} renderItem={renderNoticeItem} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} />
        )}
      </View>

      {selectedNotice && (
        <Modal animationType="slide" transparent={true} visible={detailModalVisible} onRequestClose={() => setDetailModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.detailWindowCard}>
              <View style={styles.modalHeaderCloseRow}>
                <View style={[styles.categoryBadge, { backgroundColor: getCategoryMeta(selectedNotice.category, selectedNotice.is_pinned).bg }]}>
                  <Text style={[styles.categoryBadgeText, { color: getCategoryMeta(selectedNotice.category, selectedNotice.is_pinned).color }]}>
                    {getCategoryMeta(selectedNotice.category, selectedNotice.is_pinned).icon} {getCategoryMeta(selectedNotice.category, selectedNotice.is_pinned).label}
                  </Text>
                </View>
                <TouchableOpacity style={styles.closeTextBtn} onPress={() => setDetailModalVisible(false)}>
                  <Text style={styles.closeBtnText}>Close ✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScrollBody} showsVerticalScrollIndicator={false}>
                <Text style={styles.modalDetailTitle}>{selectedNotice.title}</Text>
                <Text style={styles.modalDateSub}>Issued Date: {new Date(selectedNotice.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
                <View style={styles.detailDividerLine} />
                <Text style={styles.modalDetailContentText}>{selectedNotice.content}</Text>
                <View style={{ height: 40 }} />
              </ScrollView>

              <TouchableOpacity style={[styles.intercomLinkBtn, { backgroundColor: themeColor || '#0038a8' }]} onPress={handleInquireViaIntercom}>
                <Text style={styles.intercomLinkBtnText}>💬 Inquire via Intercom</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeAreaContainer: { flex: 1, backgroundColor: '#fafbfd', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  navHeaderBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#fff' },
  backButton: { flexDirection: 'row', alignItems: 'center', width: 60 },
  backIcon: { fontSize: 16, fontWeight: 'bold' },
  backText: { fontSize: 14, color: '#64748b', marginLeft: 4, fontWeight: '500' },
  navTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  topTitleSection: { paddingHorizontal: 20, marginTop: 20, marginBottom: 4 },
  mainTitleHeader: { fontSize: 24, fontWeight: '800', color: '#0f172a', letterSpacing: -0.6 },
  filterContainer: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#f1f5f9', marginHorizontal: 20, borderRadius: 12, padding: 4, marginBottom: 16, marginTop: 14 },
  filterTabButton: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10 },
  activeTabButton: { backgroundColor: '#fff', shadowColor: '#0f172a', shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
  filterTabText: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  listWrapper: { flex: 1, paddingHorizontal: 20 },
  emptyBox: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 13, color: '#94a3b8', marginTop: 12, fontWeight: '600' },
  noticeCard: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.01, shadowRadius: 4 },
  pinnedCardBorder: { borderColor: '#fca5a5', borderWidth: 1.5, backgroundColor: '#fffcfc' },
  cardTouchHeader: { width: '100%' },
  cardHeaderInline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  categoryBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  dateStampText: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  titleRowInlineLayout: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  noticeTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a', lineHeight: 20, flex: 0.92 },
  pinnedTitleColor: { color: '#dc2626' },
  arrowIconNext: { fontSize: 12, color: '#cbd5e1', fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end', alignItems: 'center' },
  detailWindowCard: { width: '100%', height: height * 0.82, backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: Platform.OS === 'ios' ? 38 : 24 },
  modalHeaderCloseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  closeTextBtn: { paddingVertical: 4, paddingHorizontal: 10 },
  closeBtnText: { color: '#64748b', fontSize: 14, fontWeight: '700' },
  modalScrollBody: { flex: 1 },
  modalDetailTitle: { fontSize: 22, fontWeight: '900', color: '#0f172a', lineHeight: 28 },
  modalDateSub: { fontSize: 12, color: '#94a3b8', fontWeight: '600', marginTop: 6 },
  detailDividerLine: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 16 },
  modalDetailContentText: { fontSize: 15, color: '#334155', lineHeight: 24, fontWeight: '400' },
  intercomLinkBtn: { width: '100%', paddingVertical: 16, borderRadius: 16, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  intercomLinkBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' }
});