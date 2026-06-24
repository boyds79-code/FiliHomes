import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Platform, StatusBar, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext';

interface Message {
  id: string;
  sender_id: string;
  text: string;
  time: string;
}

export default function DirectChatScreen({ route, navigation }: any) {
  const { themeColor } = useCondoConfig();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const { chatId, targetUnitNumber, postId, postTitle } = route.params || {};
  
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [chatMessage, setChatMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [disclaimerShown, setDisclaimerShown] = useState(false);

  useEffect(() => {
    initializeChatSession();
  }, [chatId]);

  const initializeChatSession = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        console.log("DEBUG - 세션 유저 없음");
        setLoading(false);
        return;
      }
      setCurrentUserId(userId);

      if (!chatId || chatId.startsWith('demo-dm')) {
        const demoMessages = [
          { id: '1', sender_id: 'partner', text: `Hello resident of Unit ${targetUnitNumber}! I saw your post on the community board.`, time: "09:00 AM" },
          { id: '2', sender_id: userId, text: "Hi! How can I help you?", time: "09:02 AM" },
        ];
        if (postTitle && postId) {
          demoMessages.push({
            id: 'demo-inquiry',
            sender_id: userId,
            text: `Inquiry regarding post: "${postTitle}" (post:${postId})`,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
          });
        }
        setMessages(demoMessages);
        setTargetUserId('demo-partner');
        setLoading(false);
        return;
      }

      // If we have postId and postTitle, auto-insert the inquiry message if it's not already the latest message
      if (chatId && !chatId.startsWith('demo-dm') && postId && postTitle) {
        const inquiryText = `Inquiry regarding post: "${postTitle}" (post:${postId})`;
        try {
          const { data: lastMsg } = await supabase
            .from('direct_messages')
            .select('text')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!lastMsg || lastMsg.text !== inquiryText) {
            await supabase
              .from('direct_messages')
              .insert([{
                chat_id: chatId,
                sender_id: userId,
                text: inquiryText
              }]);
          }
        } catch (err) {
          console.log("Auto-insert inquiry message error:", err);
        }
      }

      // Fetch historical messages
      const { data: pastLogs, error: fetchErr } = await supabase
        .from('direct_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (!fetchErr && pastLogs) {
        setMessages(pastLogs.map((m: any) => ({
          id: m.id.toString(),
          sender_id: m.sender_id,
          text: m.text,
          time: new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        })));
      }

      // Fetch chat room info to check who the other user is
      const { data: roomInfo } = await supabase
        .from('direct_chats')
        .select('*')
        .eq('id', chatId)
        .maybeSingle();

      if (roomInfo) {
        setTargetUserId(roomInfo.user1_id === userId ? roomInfo.user2_id : roomInfo.user1_id);
      }

      // Subscribe to real-time updates
      const realtimeChannel = supabase
        .channel(`direct-room-${chatId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `chat_id=eq.${chatId}`
        }, (payload) => {
          const newRow = payload.new;
          const incomingMsg: Message = {
            id: newRow.id.toString(),
            sender_id: newRow.sender_id,
            text: newRow.text,
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

  const handleReportChat = () => {
    Alert.alert(
      "Report Chat",
      "Why are you reporting this conversation?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Spam", onPress: () => submitReport("Spam") },
        { text: "Harassment", onPress: () => submitReport("Harassment") },
        { text: "Inappropriate", onPress: () => submitReport("Inappropriate") }
      ]
    );
  };

  const submitReport = async (reason: string) => {
    try {
      let reportedUserId = targetUserId || null;
      const isDemo = !reportedUserId || (typeof reportedUserId === 'string' && reportedUserId.startsWith('demo')) || (chatId && typeof chatId === 'string' && chatId.startsWith('demo-dm'));
      const activeReporterId = currentUserId || '4078096f-b34a-4119-8075-63874fdd99d1';

      if (isDemo) {
        reportedUserId = activeReporterId;
      }

      const { error } = await supabase
        .from('user_reports')
        .insert([{
          reporter_id: activeReporterId,
          reported_id: reportedUserId,
          reason_category: reason,
          description: `${isDemo ? `[Demo Chat] Target Unit: ${targetUnitNumber || 'Unknown'} - ` : ''}Chat room report (Room ID: ${chatId || ''})`,
          status: 'PENDING'
        }]);
      if (error) throw error;
      Alert.alert("Success", "Report submitted. PMO will review this conversation. Thank you.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to submit report.");
    }
  };

  const handleBlockChat = () => {
    Alert.alert(
      "Block User",
      `Are you sure you want to block messages from Unit ${targetUnitNumber}? You will no longer receive their messages.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              if (targetUserId && !targetUserId.startsWith('demo')) {
                const { error } = await supabase
                  .from('community_blocks')
                  .insert([{ blocked_user_id: targetUserId }]);
                if (error) throw error;
              }
              Alert.alert("Success", "User blocked. Leaving chat.");
              navigation.goBack();
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to block user.");
            }
          }
        }
      ]
    );
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

    if (!chatId || chatId.startsWith('demo-dm')) {
      setMessages(prev => [...prev, { id: Date.now().toString(), sender_id: currentUserId, text: msgText, time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }]);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
      return;
    }

    try {
      const { error } = await supabase
        .from('direct_messages')
        .insert([{
          chat_id: chatId,
          sender_id: currentUserId,
          text: msgText
        }]);
      
      if (error) throw error;
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to send message.");
    }
  };

  const renderMessageText = (text: any, isMine: boolean) => {
    if (typeof text !== 'string') {
      return <Text style={[styles.msgText, isMine ? styles.textMine : styles.textPartner]}>{String(text || '')}</Text>;
    }
    const match = text.match(/Inquiry regarding post: "(.+?)" \(post:(.+?)\)/);
    if (match) {
      const title = match[1];
      const id = match[2];
      return (
        <View style={{ paddingVertical: 2 }}>
          <Text style={[styles.msgText, isMine ? styles.textMine : styles.textPartner, { fontSize: 13, opacity: 0.9 }]}>
            Inquiry regarding post:
          </Text>
          <TouchableOpacity 
            style={[
              styles.chatPostLink, 
              { backgroundColor: isMine ? 'rgba(255, 255, 255, 0.15)' : '#f1f5f9', marginTop: 6 }
            ]}
            activeOpacity={0.7}
            onPress={() => {
              navigation.navigate('CommunityDetail', { 
                post: { 
                  id, 
                  title,
                  category: 'Notice',
                  content: 'Loading post details...',
                  created_at: new Date().toISOString()
                } 
              });
            }}
          >
            <Text style={[styles.chatPostLinkText, isMine ? { color: '#fff' } : { color: themeColor || '#0038a8' }]}>
              📌 {title} ❯
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    return <Text style={[styles.msgText, isMine ? styles.textMine : styles.textPartner]}>{text}</Text>;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>❮ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Unit {targetUnitNumber}</Text>
        <View style={styles.headerRightActions}>
          <TouchableOpacity onPress={handleReportChat} style={styles.headerActionBtn} activeOpacity={0.6}>
            <Text style={styles.headerActionIcon}>⚠️</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleBlockChat} style={styles.headerActionBtn} activeOpacity={0.6}>
            <Text style={styles.headerActionIcon}>🚫</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color={themeColor || '#0038a8'} />
          </View>
        ) : (
          <ScrollView
            ref={scrollViewRef}
            style={styles.chatContainer}
            contentContainerStyle={{ paddingVertical: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((item) => {
              const isMine = item.sender_id === currentUserId;
              return (
                <View key={item.id} style={[styles.msgRow, isMine ? styles.msgRight : styles.msgLeft]}>
                  {!isMine && (
                    <View style={styles.avatarWrap}>
                      <Text style={styles.avatarText}>{targetUnitNumber}</Text>
                    </View>
                  )}
                  <View style={styles.messageContentBlock}>
                    <View style={[styles.bubble, isMine ? { backgroundColor: themeColor || '#0038a8' } : styles.bubblePartner]}>
                      {renderMessageText(item.text, isMine)}
                    </View>
                    <Text style={[styles.msgTime, isMine ? styles.timeRight : styles.timeLeft]}>{item.time}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* Input Box */}
        <View style={styles.inputArea}>
          <TextInput
            placeholder="Type a message..."
            placeholderTextColor="#94a3b8"
            style={styles.textInput}
            value={chatMessage}
            onChangeText={setChatMessage}
            onFocus={handleChatInputFocus}
            multiline
          />
          <TouchableOpacity 
            onPress={handleSendMessage}
            style={[styles.sendBtn, { backgroundColor: themeColor || '#0038a8' }]}
            activeOpacity={0.8}
          >
            <Text style={styles.sendText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
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
  backText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  keyboardView: { flex: 1 },
  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  chatContainer: { flex: 1, paddingHorizontal: 16 },
  msgRow: { flexDirection: 'row', marginBottom: 16, maxWidth: '80%' },
  msgLeft: { alignSelf: 'flex-start' },
  msgRight: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    alignSelf: 'flex-end'
  },
  avatarText: { fontSize: 10, fontWeight: '700', color: '#475569' },
  messageContentBlock: { flexDirection: 'column' },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    borderBottomRightRadius: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 }
  },
  bubblePartner: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    borderBottomLeftRadius: 2,
  },
  msgText: { fontSize: 14, lineHeight: 20 },
  textMine: { color: '#fff' },
  textPartner: { color: '#1e293b' },
  msgTime: { fontSize: 10, color: '#94a3b8', marginTop: 4 },
  timeLeft: { alignSelf: 'flex-start', marginLeft: 4 },
  timeRight: { alignSelf: 'flex-end', marginRight: 4 },
  inputArea: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center'
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1e293b',
    maxHeight: 100,
    marginRight: 10
  },
  sendBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  sendText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  headerRightActions: { flexDirection: 'row', alignItems: 'center' },
  headerActionBtn: { marginLeft: 16, padding: 4 },
  headerActionIcon: { fontSize: 18 },
  chatPostLink: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
    alignSelf: 'flex-start',
  },
  chatPostLinkText: {
    fontSize: 12,
    fontWeight: '700',
  }
});
