import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Platform, StatusBar, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Dimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ChatRoom {
  chatId: string;
  targetUserId: string;
  targetUnitNumber: string;
  targetName: string;
  lastMessage?: string;
  time?: string;
}

export default function DirectChatListScreen({ navigation }: any) {
  const { themeColor } = useCondoConfig();
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<ChatRoom[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'support' | 'direct'>('support');
  const scrollViewRef = useRef<ScrollView>(null);

  const handleTabPress = (tabName: 'support' | 'direct') => {
    setActiveTab(tabName);
    const idx = tabName === 'support' ? 0 : 1;
    scrollViewRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: true });
  };

  useEffect(() => {
    fetchActiveChats();
  }, []);

  const fetchActiveChats = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      
      if (!userId) {
        setLoading(false);
        loadSandboxChats();
        return;
      }
      setCurrentUserId(userId);

      // 1. Fetch direct chat rooms where user is participant
      const { data: chatData, error: chatErr } = await supabase
        .from('direct_chats')
        .select('*')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`);

      if (chatErr) throw chatErr;

      if (!chatData || chatData.length === 0) {
        setLoading(false);
        loadSandboxChats();
        return;
      }

      // 2. Extract partner user IDs
      const partnerIds = chatData.map(c => c.user1_id === userId ? c.user2_id : c.user1_id);

      // 3. Fetch profiles of those partners
      const { data: profileData, error: profErr } = await supabase
        .from('profiles')
        .select('id, full_name, unit_number')
        .in('id', partnerIds);

      if (profErr) throw profErr;

      // 4. Map them together
      const mappedChats: ChatRoom[] = chatData.map(c => {
        const partnerId = c.user1_id === userId ? c.user2_id : c.user1_id;
        const partnerProfile = profileData?.find(p => p.id === partnerId);
        
        return {
          chatId: c.id,
          targetUserId: partnerId,
          targetUnitNumber: partnerProfile?.unit_number || 'Unknown Unit',
          targetName: partnerProfile?.full_name || 'Resident Member',
          lastMessage: 'Tap to view conversation',
          time: new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        };
      });

      setChats(mappedChats);
    } catch (e) {
      console.log("Error loading direct chats, falling back to sandbox:", e);
      loadSandboxChats();
    } finally {
      setLoading(false);
    }
  };

  const loadSandboxChats = () => {
    // Premium fallback sandbox rooms
    setChats([
      {
        chatId: 'demo-dm-1402',
        targetUserId: 'demo-user-a',
        targetUnitNumber: '1402',
        targetName: 'Chris Kim',
        lastMessage: 'I saw your post on the community board.',
        time: 'Today'
      },
      {
        chatId: 'demo-dm-0809',
        targetUserId: 'demo-user-b',
        targetUnitNumber: '0809',
        targetName: 'Sarah Jenkins',
        lastMessage: 'Is the parking space still available?',
        time: 'Yesterday'
      }
    ]);
  };

  const renderChatItem = ({ item }: { item: ChatRoom }) => {
    return (
      <TouchableOpacity
        style={styles.chatCard}
        onPress={() => navigation.navigate('DirectChat', { chatId: item.chatId, targetUnitNumber: item.targetUnitNumber })}
        activeOpacity={0.7}
      >
        <View style={styles.chatAvatar}>
          <Text style={styles.avatarText}>{item.targetUnitNumber}</Text>
        </View>
        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.partnerName}>{item.targetName}</Text>
            <Text style={styles.chatTime}>{item.time}</Text>
          </View>
          <Text style={styles.lastMessage} numberOfLines={1}>{item.lastMessage}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: themeColor || '#0038a8' }]}>❮ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Segmented Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'support' && [styles.tabButtonActive, { borderBottomColor: themeColor || '#0d9488' }]]}
          onPress={() => handleTabPress('support')}
        >
          <Text style={[styles.tabText, activeTab === 'support' && styles.tabTextActive]}>Support Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'direct' && [styles.tabButtonActive, { borderBottomColor: themeColor || '#0d9488' }]]}
          onPress={() => handleTabPress('direct')}
        >
          <Text style={[styles.tabText, activeTab === 'direct' && styles.tabTextActive]}>1:1 Chat</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          const tabs: ('support' | 'direct')[] = ['support', 'direct'];
          if (tabs[index]) {
            setActiveTab(tabs[index]);
          }
        }}
        style={{ flex: 1 }}
      >
        <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
          <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={{ marginTop: 8 }}>
            {/* Card A: Security Guard Gate Channel */}
            <TouchableOpacity
              style={[styles.deptCard, { borderColor: themeColor || '#0d9488' }]}
              onPress={() => navigation.navigate('IntercomChat', { channel: 'SECURITY' })}
              activeOpacity={0.7}
            >
              <View style={styles.cardIconRow}>
                <Text style={{ fontSize: 24 }}>🚗</Text>
                <Text style={[styles.cardBadge, { backgroundColor: '#064e3b', color: '#4ade80' }]}>FAST TEXT</Text>
              </View>
              <Text style={styles.cardTitle}>Gate & Security House</Text>
              <Text style={styles.cardDesc}>For quick guard actions, visitor arrival verification, courier logs, immediate gate barriers, and express entry control passes.</Text>
            </TouchableOpacity>

            {/* Card B: PMO Office Ticket Channel */}
            <TouchableOpacity
              style={[styles.deptCard, { borderColor: '#475569' }]}
              onPress={() => navigation.navigate('IntercomChat', { channel: 'PMO_ADMIN' })}
              activeOpacity={0.7}
            >
              <View style={styles.cardIconRow}>
                <Text style={{ fontSize: 24 }}>🏢</Text>
                <Text style={[styles.cardBadge, { backgroundColor: '#1e3a8a', color: '#60a5fa' }]}>PMO TICKET</Text>
              </View>
              <Text style={styles.cardTitle}>PMO Administration & Repair</Text>
              <Text style={styles.cardDesc}>For structural unit leaks, building rules disputes, monthly billing statements, parking decals allocations, and administrative engineering assistance.</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      <View style={{ width: SCREEN_WIDTH, flex: 1 }}>
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={{ marginTop: 8 }}>
            {loading ? (
              <ActivityIndicator size="small" color={themeColor || '#0d9488'} style={{ marginTop: 20 }} />
            ) : chats.length === 0 ? (
              <View style={styles.emptyView}>
                <Text style={{ fontSize: 32, opacity: 0.6 }}>💬</Text>
                <Text style={styles.emptyText}>No active resident conversations yet.</Text>
              </View>
            ) : (
              chats.map((item) => (
                <TouchableOpacity
                  key={item.chatId}
                  style={styles.chatCard}
                  onPress={() => navigation.navigate('DirectChat', { chatId: item.chatId, targetUnitNumber: item.targetUnitNumber })}
                  activeOpacity={0.7}
                >
                  <View style={styles.chatAvatar}>
                    <Text style={styles.avatarText}>{item.targetUnitNumber}</Text>
                  </View>
                  <View style={styles.chatInfo}>
                    <View style={styles.chatHeader}>
                      <Text style={styles.partnerName}>{item.targetName}</Text>
                      <Text style={styles.chatTime}>{item.time}</Text>
                    </View>
                    <Text style={styles.lastMessage} numberOfLines={1}>{item.lastMessage}</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomWidth: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
  },
  tabTextActive: {
    color: '#1e293b',
    fontWeight: '700',
  },
  deptCard: { 
    backgroundColor: '#fff', 
    borderRadius: 16, 
    padding: 18, 
    borderWidth: 2, 
    marginBottom: 14, 
    shadowColor: '#000', 
    shadowOpacity: 0.05, 
    shadowRadius: 8, 
    elevation: 2 
  },
  cardIconRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  cardBadge: { 
    fontSize: 10, 
    fontWeight: '900', 
    paddingHorizontal: 8, 
    paddingVertical: 4, 
    borderRadius: 6 
  },
  cardTitle: { 
    color: '#0f172a', 
    fontSize: 15, 
    fontWeight: '800', 
    marginTop: 10 
  },
  cardDesc: { 
    color: '#64748b', 
    fontSize: 12, 
    marginTop: 6, 
    lineHeight: 18, 
    fontWeight: '500' 
  },
  sectionHeaderTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 4
  },
  supportCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.01,
    shadowRadius: 4
  },
  supportAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  supportInfo: {
    flex: 1
  },
  supportName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b'
  },
  supportDesc: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  supportChevron: {
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: 'bold',
    marginLeft: 8
  },

  safeArea: { flex: 1, backgroundColor: '#f8fafc', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 10 },
  header: {
    height: 56,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
      android: { elevation: 2 }
    })
  },
  backBtn: { width: 60, paddingVertical: 8 },
  backText: { fontSize: 14, fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  container: { flex: 1, padding: 16 },
  chatCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.01,
    shadowRadius: 4
  },
  chatAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14
  },
  avatarText: { fontSize: 11, fontWeight: '800', color: '#475569' },
  chatInfo: { flex: 1 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  partnerName: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  chatTime: { fontSize: 11, color: '#94a3b8' },
  lastMessage: { fontSize: 13, color: '#64748b' },
  emptyView: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 14, color: '#64748b', marginTop: 12 }
});
