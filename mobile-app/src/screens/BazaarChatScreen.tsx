import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Platform, StatusBar, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Modal, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext';

type ItemStatus = 'AVAILABLE' | 'RESERVED' | 'SOLD';

interface Message {
  id: string;
  sender_id: string;
  text: string;
  time: string;
}

export default function BazaarChatScreen({ route, navigation }: any) {
  const { themeColor } = useCondoConfig();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const { item, chatId } = route.params || {};
  
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [partnerId, setPartnerId] = useState<string>('');
  const [itemStatus, setItemStatus] = useState<ItemStatus>(item?.status || 'AVAILABLE');
  const [chatMessage, setChatMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [disclaimerShown, setDisclaimerShown] = useState(false);

  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [moreOptionsVisible, setMoreOptionsVisible] = useState(false); 
  
  const [selectedScore, setSelectedScore] = useState(5);
  const [selectedReviewKeyword, setSelectedReviewKeyword] = useState('Friendly and polite 👍');

  useEffect(() => {
    initializeChatSession();
  }, [chatId]);

  const initializeChatSession = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        console.log("DEBUG - No session user found.");
        return;
      }
      setCurrentUserId(userId);

      if (!chatId || chatId === 'demo-room') {
        setMessages([
          { id: '1', sender_id: 'partner', text: `Hello! Is the ${item?.title} still available? I want to buy it.`, time: "11:30 AM" },
          { id: '2', sender_id: userId, text: "Yes, it's available! What time can we meet at the lobby?", time: "11:32 AM" },
        ]);
        setLoading(false);
        return;
      }

      // Fetch partnerId from bazaar_chats
      const { data: chatData } = await supabase
        .from('bazaar_chats')
        .select('buyer_id, seller_id')
        .eq('id', chatId)
        .single();
      
      if (chatData) {
        const partnerUuid = userId === chatData.seller_id ? chatData.buyer_id : chatData.seller_id;
        setPartnerId(partnerUuid);
      }

      const { data: pastLogs, error: fetchErr } = await supabase
        .from('bazaar_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (!fetchErr && pastLogs) {
        setMessages(pastLogs.map((m: any) => ({
          id: m.id.toString(),
          sender_id: m.sender_id,
          text: m.message,
          time: new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        })));
      }

      const realtimeChannel = supabase
        .channel(`bazaar-room-${chatId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'bazaar_messages',
          filter: `chat_id=eq.${chatId}`
        }, (payload) => {
          const newRow = payload.new;
          const incomingMsg: Message = {
            id: newRow.id.toString(),
            sender_id: newRow.sender_id,
            text: newRow.message,
            time: new Date(newRow.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
          };
          setMessages(prev => {
            if (prev.some(m => m.id === incomingMsg.id)) return prev;
            return [...prev, incomingMsg];
          });
          setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
        })
        .subscribe();

      setLoading(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: false }), 200);

      return () => {
        supabase.removeChannel(realtimeChannel);
      };

    } catch (err) {
      console.log(err);
      setLoading(false);
    }
  };

  const handleChatInputFocus = () => {
    if (!disclaimerShown) {
      Alert.alert(
        "Legal Notice",
        "Messages are the sole responsibility of the author. Postings violating Philippine Cybercrime (RA 10175) or Data Privacy (RA 10173) laws are subject to legal liability. The platform and PMO bear no responsibility.",
        [{ text: "I Agree", onPress: () => setDisclaimerShown(true) }]
      );
    }
  };

  const handleSendMessage = async () => {
    if (!chatMessage.trim()) return;
    const msgText = chatMessage.trim();
    setChatMessage('');

    if (!chatId || chatId === 'demo-room') {
      setMessages(prev => [...prev, { id: Date.now().toString(), sender_id: currentUserId, text: msgText, time: "11:35 AM" }]);
      return;
    }

    await supabase
      .from('bazaar_messages')
      .insert([{
        chat_id: chatId,
        sender_id: currentUserId,
        message: msgText
      }]);
      
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleStatusChange = async (status: ItemStatus) => {
    setItemStatus(status);
    if (item && chatId && chatId !== 'demo-room') {
      await supabase
        .from('bazaar_items')
        .update({ status: status })
        .eq('id', item.id);
    }

    if (status === 'SOLD') {
      Alert.alert(
        "Confirm Deal Completion 🎉",
        `Has your trade been successfully completed?`,
        [
          { text: "No", style: "cancel", onPress: () => handleStatusChange('AVAILABLE') },
          { text: "Yes, Completed! 👍", onPress: () => setRatingModalVisible(true) }
        ]
      );
    }
  };

  const submitBazaarReport = async () => {
    try {
      let reportedUserId = item?.user_id || null;
      const isDemo = !reportedUserId || (typeof reportedUserId === 'string' && reportedUserId.startsWith('demo')) || (chatId && typeof chatId === 'string' && chatId.startsWith('demo'));
      const activeReporterId = currentUserId || '4078096f-b34a-4119-8075-63874fdd99d1';

      if (isDemo) {
        reportedUserId = activeReporterId;
      }

      const { error } = await supabase
        .from('user_reports')
        .insert([{
          reporter_id: activeReporterId,
          reported_id: reportedUserId,
          reason_category: 'Harassment',
          description: `${isDemo ? '[Demo Bazaar Chat] Target Unit: 1204 - ' : ''}Bazaar chat room report (Room ID: ${chatId || ''}) for product: "${item?.title || ''}"`,
          status: 'PENDING'
        }]);
      if (error) throw error;
      Alert.alert("Success", "Report submitted. Thank you.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to submit report.");
    }
  };

  const handleMenuAction = (actionType: 'BLOCK' | 'REPORT' | 'DELETE') => {
    setMoreOptionsVisible(false); 
    setTimeout(() => {
      if (actionType === 'BLOCK') {
        Alert.alert("🚫 Block Resident", `Are you sure you want to block this resident?`, [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Block", 
            style: "destructive", 
            onPress: async () => {
              try {
                let targetId = partnerId;
                if (!targetId) {
                  if (chatId && chatId !== 'demo-room') {
                    const { data: chatData } = await supabase
                      .from('bazaar_chats')
                      .select('buyer_id, seller_id')
                      .eq('id', chatId)
                      .single();
                    if (chatData) {
                      targetId = currentUserId === chatData.seller_id ? chatData.buyer_id : chatData.seller_id;
                    }
                  } else {
                    targetId = item?.seller_id;
                  }
                }
                
                if (targetId && !targetId.startsWith('demo')) {
                  const { error } = await supabase
                    .from('community_blocks')
                    .insert([{ blocked_user_id: targetId }]);
                  if (error) throw error;
                }
                Alert.alert("Success", "User blocked. Leaving chat.");
                navigation.goBack();
              } catch (e: any) {
                Alert.alert("Error", e.message || "Failed to block user.");
              }
            }
          }
        ]);
      } else if (actionType === 'REPORT') {
        Alert.alert("⚠️ Report Conversation", "Report this user to PMO administration?", [
          { text: "Cancel", style: "cancel" },
          { text: "Report", style: "destructive", onPress: () => submitBazaarReport() }
        ]);
      } else if (actionType === 'DELETE') {
        Alert.alert("🗑️ Delete Chatroom", "Leave this chatroom?", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete & Leave", style: "destructive", onPress: () => navigation.goBack() }
        ]);
      }
    }, 400);
  };

  const handleSubmitRating = async () => {
    try {
      setRatingModalVisible(false);
      let targetProfileId = partnerId;
      if (!targetProfileId) {
        if (currentUserId === item?.seller_id) {
          const { data: chatData } = await supabase
            .from('bazaar_chats')
            .select('buyer_id')
            .eq('id', chatId)
            .single();
          if (chatData) {
            targetProfileId = chatData.buyer_id;
          }
        } else {
          targetProfileId = item?.seller_id;
        }
      }

      if (!targetProfileId || targetProfileId.startsWith('demo')) {
        Alert.alert("Demo Mode", "Ratings are not saved for demo records.");
        return;
      }

      const { data: targetProfile, error: profileErr } = await supabase
        .from('bazaar_profiles')
        .select('manner_score')
        .eq('id', targetProfileId)
        .single();

      if (profileErr || !targetProfile) {
        throw new Error("Failed to load resident profile to rate.");
      }

      const currentScore = Number(targetProfile.manner_score) || 5.0;
      const newScore = Math.min(5.0, Math.max(1.0, currentScore * 0.9 + selectedScore * 0.1));
      
      const { error: updateErr } = await supabase
        .from('bazaar_profiles')
        .update({ manner_score: parseFloat(newScore.toFixed(2)) })
        .eq('id', targetProfileId);

      if (updateErr) throw updateErr;

      Alert.alert("Rating Saved!", "Credit score synced.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to submit rating.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.chatHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={[styles.backIcon, { color: themeColor || '#0038a8' }]}>❮</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🤝 Resident Marketplace Chat</Text>
        <TouchableOpacity style={styles.moreMenuBtn} onPress={() => setMoreOptionsVisible(true)}>
          <Text style={styles.moreMenuIconText}>⋮</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.itemStatusBarContainer}>
        <View style={styles.itemBriefInfo}>
          <Text style={styles.itemBriefTitle} numberOfLines={1}>{item?.title || 'Bazaar Product'}</Text>
          <Text style={styles.itemBriefPrice}>₱{item?.price?.toLocaleString() || '0'}</Text>
        </View>
        {currentUserId === item?.seller_id ? (
          <View style={styles.statusBtnRow}>
            <TouchableOpacity style={[styles.statusToggleBtn, itemStatus === 'AVAILABLE' && { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' }]} onPress={() => handleStatusChange('AVAILABLE')}>
              <Text style={[styles.statusToggleText, itemStatus === 'AVAILABLE' && { color: '#0f172a', fontWeight: '700' }]}>Sale</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.statusToggleBtn, itemStatus === 'RESERVED' && { backgroundColor: '#ffedd5', borderColor: '#fed7aa' }]} onPress={() => handleStatusChange('RESERVED')}>
              <Text style={[styles.statusToggleText, itemStatus === 'RESERVED' && { color: '#ea580c', fontWeight: '700' }]}>Res</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.statusToggleBtn, itemStatus === 'SOLD' && { backgroundColor: '#fee2e2', borderColor: '#fca5a5' }]} onPress={() => handleStatusChange('SOLD')}>
              <Text style={[styles.statusToggleText, itemStatus === 'SOLD' && { color: '#dc2626', fontWeight: '700' }]}>Sold</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={[styles.statusToggleBtn, { 
              backgroundColor: itemStatus === 'SOLD' ? '#fee2e2' : itemStatus === 'RESERVED' ? '#ffedd5' : '#f1f5f9',
              borderColor: itemStatus === 'SOLD' ? '#fca5a5' : itemStatus === 'RESERVED' ? '#fed7aa' : '#cbd5e1',
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 6,
              marginRight: 8
            }]}>
              <Text style={{ 
                fontSize: 11, 
                fontWeight: '700',
                color: itemStatus === 'SOLD' ? '#dc2626' : itemStatus === 'RESERVED' ? '#ea580c' : '#0f172a' 
              }}>{itemStatus}</Text>
            </View>
            {itemStatus === 'SOLD' && (
              <TouchableOpacity style={{ backgroundColor: '#0038a8', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }} onPress={() => setRatingModalVisible(true)}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>⭐ Rate Seller</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="small" color={themeColor || '#0038a8'} /></View>
      ) : (
        <ScrollView 
          ref={scrollViewRef} 
          style={styles.chatMessageScroll} 
          contentContainerStyle={{ padding: 16 }}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((msg) => {
            const isMe = msg.sender_id === currentUserId;
            return (
              <View key={msg.id} style={[styles.msgWrapper, isMe ? styles.msgRight : styles.msgLeft]}>
                <View style={[styles.msgBubble, isMe ? { backgroundColor: themeColor || '#0038a8' } : styles.msgBubblePartner]}>
                  <Text style={[styles.msgText, isMe ? { color: '#fff' } : { color: '#1e293b' }]}>{msg.text}</Text>
                </View>
                <Text style={styles.msgTime}>{msg.time}</Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}>
        <View style={styles.inputContainerBar}>
          <TextInput style={styles.chatTextInput} placeholder="Send a secure message to resident..." placeholderTextColor="#94a3b8" value={chatMessage} onChangeText={setChatMessage} onFocus={handleChatInputFocus} onSubmitEditing={handleSendMessage} />
          <TouchableOpacity style={[styles.sendBtn, { backgroundColor: themeColor || '#0038a8' }]} onPress={handleSendMessage}>
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal animationType="slide" transparent={true} visible={moreOptionsVisible} onRequestClose={() => setMoreOptionsVisible(false)}>
        <View style={styles.actionSheetOverlay}>
          <View style={styles.actionSheetWindow}>
            <TouchableOpacity style={styles.actionSheetRow} onPress={() => handleMenuAction('BLOCK')}>
              <Text style={styles.actionSheetDestructiveText}>🚫 Block This Resident</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionSheetRow, { borderTopWidth: 1, borderTopColor: '#f1f5f9' }]} onPress={() => handleMenuAction('REPORT')}>
              <Text style={styles.actionSheetDestructiveText}>⚠️ Report Conversation</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionSheetRow, { borderTopWidth: 1, borderTopColor: '#f1f5f9' }]} onPress={() => handleMenuAction('DELETE')}>
              <Text style={styles.actionSheetDeleteText}>🗑️ Delete Chatroom & Leave</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionSheetCloseBtn, { backgroundColor: themeColor || '#0038a8' }]} onPress={() => setMoreOptionsVisible(false)}>
              <Text style={styles.actionSheetCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent={true} visible={ratingModalVisible} onRequestClose={() => setRatingModalVisible(false)}>
        <View style={styles.ratingOverlay}>
          <View style={styles.ratingCardWindow}>
            <Text style={styles.ratingEmoji}>🤝 Trade Finished</Text>
            <Text style={styles.ratingTitle}>Rate your trade experience</Text>
            <View style={starRowContainerStyle.starRowContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setSelectedScore(star)}>
                  <Text style={[styles.starTextIcon, star <= selectedScore ? { color: '#eab308' } : { color: '#cbd5e1' }]}>★</Text>
                </TouchableOpacity>
              ))}
            </View>
            {['Friendly and polite 👍', 'On time for meetup ⏰', 'Product condition is great 🧺'].map((keyword) => {
              const isKwSelected = selectedReviewKeyword === keyword;
              return (
                <TouchableOpacity key={keyword} style={[styles.keywordChipRow, isKwSelected && { borderColor: themeColor || '#0038a8', backgroundColor: '#f0f9ff' }]} onPress={() => setSelectedReviewKeyword(keyword)}>
                  <Text style={[styles.keywordChipText, isKwSelected && { color: themeColor || '#0038a8', fontWeight: '700' }]}>{keyword}</Text>
                </TouchableOpacity>
              );
            })}
            <View style={[styles.modalBtnRow, { marginTop: 15 }]}>
              <TouchableOpacity style={styles.ratingCancelBtn} onPress={() => setRatingModalVisible(false)}><Text style={styles.ratingCancelBtnText}>Skip</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.ratingSubmitBtn, { backgroundColor: themeColor || '#0038a8' }]} onPress={handleSubmitRating}><Text style={styles.ratingSubmitBtnText}>Submit</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const starRowContainerStyle = StyleSheet.create({
  starRowContainer: { flexDirection: 'row', justifyContent: 'center', marginVertical: 8 }
});

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fafbfd' },
  safeArea: { flex: 1, backgroundColor: '#fafbfd', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  chatHeader: { height: 56, backgroundColor: '#fff', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  backBtn: { padding: 4 },
  backIcon: { fontSize: 18, fontWeight: 'bold' },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  moreMenuBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  moreMenuIconText: { fontSize: 20, fontWeight: '700', color: '#475569' },
  itemStatusBarContainer: { backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemBriefInfo: { flex: 0.52 },
  itemBriefTitle: { fontSize: 13, fontWeight: '700', color: '#334155' },
  itemBriefPrice: { fontSize: 13, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  statusBtnRow: { flexDirection: 'row', flex: 0.46, justifyContent: 'space-between' },
  statusToggleBtn: { paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, backgroundColor: '#fff' },
  statusToggleText: { fontSize: 10, color: '#64748b', fontWeight: '500' },
  chatMessageScroll: { flex: 1 },
  msgWrapper: { marginBottom: 14, maxWidth: '75%' },
  msgLeft: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  msgRight: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  msgBubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  msgBubblePartner: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  msgText: { fontSize: 13, lineHeight: 18 },
  msgTime: { fontSize: 9, color: '#94a3b8', marginTop: 4, paddingHorizontal: 4 },
  inputContainerBar: { height: 60, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 10 : 0 },
  chatTextInput: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, fontSize: 13, color: '#0f172a', marginRight: 12 },
  sendBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  sendBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  actionSheetOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end', alignItems: 'center' },
  actionSheetWindow: { width: '100%', backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 20 },
  actionSheetRow: { width: '100%', paddingVertical: 16, alignItems: 'center' },
  actionSheetDestructiveText: { fontSize: 14, fontWeight: '600', color: '#334155' },
  actionSheetDeleteText: { fontSize: 14, fontWeight: '700', color: '#ef4444' },
  actionSheetCloseBtn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 15 },
  actionSheetCloseText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  ratingOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  ratingCardWindow: { width: '100%', backgroundColor: '#fff', borderRadius: 24, padding: 20, alignItems: 'center' },
  ratingEmoji: { fontSize: 22, marginBottom: 6 },
  ratingTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  starTextIcon: { fontSize: 32, marginHorizontal: 3 },
  keywordChipRow: { width: '100%', padding: 10, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, marginBottom: 6, backgroundColor: '#f8fafc' },
  keywordChipText: { fontSize: 12, color: '#475569', textAlign: 'center' },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  ratingCancelBtn: { flex: 0.3, paddingVertical: 11, alignItems: 'center', backgroundColor: '#f1f5f9', borderRadius: 10 },
  ratingCancelBtnText: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  ratingSubmitBtn: { flex: 0.66, paddingVertical: 11, alignItems: 'center', borderRadius: 10 },
  ratingSubmitBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' }
});