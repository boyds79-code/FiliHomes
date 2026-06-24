import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar, ScrollView, TextInput, KeyboardAvoidingView, ActivityIndicator, Alert, Keyboard, Modal } from 'react-native';
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext';
import { useUnit } from '../contexts/UnitContext';

interface Message {
  id: string;
  sender: 'RESIDENT' | 'PMO_GUARD';
  text: string;
  timestamp: string;
  read_at?: string | null;
  is_deleted?: boolean;
  sender_type?: string;
  operator_name?: string | null;
}

export default function IntercomChatScreen({ route, navigation }: any) {
  const { themeColor } = useCondoConfig();
  const { currentUnit } = useUnit();
  const [inputText, setInputText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  // Helper to format guard display names
  const getGuardDisplayName = (opName: string | null) => {
    if (!opName || opName === 'Me (Guard)' || opName === 'Staff') {
      return selectedChannel === 'SECURITY' ? 'Guard Juan' : (selectedChannel === 'PMO_ADMIN' ? 'PMO Staff' : 'Staff Juan');
    }
    let name = opName;
    name = name.replace(/Duty Guard/gi, 'Guard');
    name = name.replace(/Guard Guard/gi, 'Guard');
    
    const lower = name.toLowerCase();
    if (lower.startsWith('guard') || lower.startsWith('staff') || lower.startsWith('tech') || lower.startsWith('pmo')) {
      return name;
    }
    const prefix = selectedChannel === 'SECURITY' ? 'Guard' : (selectedChannel === 'MAINTENANCE' ? 'Tech' : (selectedChannel === 'PMO_ADMIN' ? 'PMO' : 'Staff'));
    return `${prefix} ${name}`;
  };

  // 🎨 [Structure Reform] ROUTING_GATE: Department selection main, CHAT_ROOM: Chat room entry state
  const [currentView, setCurrentView] = useState<'ROUTING_GATE' | 'CHAT_ROOM'>('ROUTING_GATE');
  const [selectedChannel, setSelectedChannel] = useState<'SECURITY' | 'MAINTENANCE' | 'AMENITY' | 'PMO_ADMIN'>('SECURITY');

  const [loading, setLoading] = useState(true);
  const [currentChatId, setCurrentChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  
  // ⚙️ PMO Operating Hours State
  const [pmoHours, setPmoHours] = useState<{ start: string; end: string }>({ start: '09:00', end: '18:00' });
  const [isPmoClosed, setIsPmoClosed] = useState<boolean>(false);

  const quickMacros = [
    "📦 Parcel check request",
    "💧 Water delivery permission",
    "🚨 Emergency engineering help",
    "🍕 Food rider access approval"
  ];

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      scrollViewRef.current?.scrollToEnd({ animated: false });
    });
    return () => {
      showSubscription.remove();
    };
  }, []);

  useEffect(() => {
    fetchIntercomPolicy();
    const { channel } = route.params || {};
    if (channel === 'SECURITY' || channel === 'MAINTENANCE' || channel === 'AMENITY' || channel === 'PMO_ADMIN') {
      setSelectedChannel(channel);
      setCurrentView('CHAT_ROOM');
    }
  }, [route.params]);

  const fetchIntercomPolicy = async () => {
    try {
      const CONDO_ID = 'c1111111-1111-1111-1111-111111111111'; // Explicit ID for demo/testing
      const { data } = await supabase
        .from('condo_settings')
        .select('pmo_hours_start, pmo_hours_end')
        .eq('condo_id', CONDO_ID)
        .maybeSingle();

      if (data) {
        const start = data.pmo_hours_start || '09:00';
        const end = data.pmo_hours_end || '18:00';
        setPmoHours({ start, end });

        // Calculate if PMO is currently closed
        const now = new Date();
        const currentStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        if (currentStr < start || currentStr > end) {
          setIsPmoClosed(true);
        }
      }
    } catch (err) {
      console.error("Error loading intercom config:", err);
    }
  };

  useEffect(() => {
    let activeChannel: any = null;

    const setupStream = async () => {
      if (currentView === 'CHAT_ROOM') {
        activeChannel = await initializeIntercomStream();
      }
    };

    setupStream();

    return () => {
      if (activeChannel) {
        supabase.removeChannel(activeChannel);
      }
    };
  }, [currentView, selectedChannel]);

  const fetchMessagesForChat = async (chatId: number) => {
    try {
      const { data: pastMessages, error: msgError } = await supabase
        .from('intercom_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (!msgError && pastMessages) {
        setMessages(pastMessages.map((m: any) => ({
          id: m.id.toString(),
          sender: m.sender_type === 'RESIDENT' ? 'RESIDENT' : 'PMO_GUARD',
          text: m.is_deleted ? '🗑️ This message was deleted' : m.message,
          timestamp: new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          read_at: m.read_at,
          is_deleted: m.is_deleted,
          sender_type: m.sender_type,
          operator_name: m.operator_name
        })));

        // Mark Guard messages as read if the resident is viewing them
        const unreadFromGuard = pastMessages.some((m: any) => m.sender_type !== 'RESIDENT' && !m.read_at);
        if (unreadFromGuard) {
          await supabase
            .from('intercom_messages')
            .update({ read_at: new Date().toISOString() })
            .eq('chat_id', chatId)
            .neq('sender_type', 'RESIDENT')
            .is('read_at', null);

          // Fetch again to update state
          const { data: updatedMessages } = await supabase
            .from('intercom_messages')
            .select('*')
            .eq('chat_id', chatId)
            .order('created_at', { ascending: true });

          if (updatedMessages) {
            setMessages(updatedMessages.map((m: any) => ({
              id: m.id.toString(),
              sender: m.sender_type === 'RESIDENT' ? 'RESIDENT' : 'PMO_GUARD',
              text: m.is_deleted ? '🗑️ This message was deleted' : m.message,
              timestamp: new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              read_at: m.read_at,
              is_deleted: m.is_deleted,
              sender_type: m.sender_type,
              operator_name: m.operator_name
            })));
          }
        }
      }
    } catch (e) {
      console.error("Error fetching messages:", e);
    }
  };

  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string } | null>(null);
  const [editText, setEditText] = useState('');

  const handleMessageLongPress = (msgId: string, currentText: string) => {
    Alert.alert(
      "Message Options",
      "Choose an action for this unread message.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "✏️ Edit Message", 
          onPress: () => {
            setEditingMessage({ id: msgId, text: currentText });
            setEditText(currentText);
          }
        },
        { 
          text: "🗑️ Delete Message", 
          style: "destructive",
          onPress: () => handleDeleteResidentMessage(msgId)
        }
      ]
    );
  };

  const handleEditResidentMessage = async () => {
    if (!editingMessage || !editText.trim()) return;
    try {
      const { data, error } = await supabase
        .from('intercom_messages')
        .update({ message: editText.trim() })
        .eq('id', editingMessage.id)
        .is('read_at', null)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        Alert.alert("Cannot Edit", "This message has already been read by the staff.");
      }

      setEditingMessage(null);
      if (currentChatId) {
        fetchMessagesForChat(currentChatId);
      }
    } catch (e) {
      console.error("Error editing message:", e);
      Alert.alert("Error", "Failed to edit message.");
    }
  };

  const handleDeleteResidentMessage = async (msgId: string) => {
    Alert.alert(
      "Delete Message",
      "Are you sure you want to delete this message? A placeholder indicating deletion will remain.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const { data, error } = await supabase
                .from('intercom_messages')
                .update({ is_deleted: true, message: '🗑️ This message was deleted' })
                .eq('id', msgId)
                .is('read_at', null)
                .select();
              
              if (error) throw error;

              if (!data || data.length === 0) {
                Alert.alert("Cannot Delete", "This message has already been read by the staff.");
              }

              if (currentChatId) {
                fetchMessagesForChat(currentChatId);
              }
            } catch (e) {
              console.error("Error deleting message:", e);
              Alert.alert("Error", "Failed to delete message.");
            }
          }
        }
      ]
    );
  };

  const initializeIntercomStream = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        console.log("DEBUG - No session user, successfully prevented error.");
        return;
      }

      // Fetch unit's building_no to set as target_building
      let targetBuilding = null;
      if (currentUnit?.unit_id) {
        const { data: uData } = await supabase
          .from('units')
          .select('building_no')
          .eq('id', currentUnit.unit_id)
          .maybeSingle();
        targetBuilding = uData?.building_no || null;
      }

      // Fetch user role from staff_profiles to see if they are a PMO manager
      const { data: staffProfile } = await supabase
        .from('staff_profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      const isPmo = staffProfile?.role === 'PMO_MANAGER';
      const chatUserId = isPmo ? '66dcdab9-091a-440f-a871-fe2133c1813e' : userId;

      // 1. Query the private chat room matching chatUserId
      let { data: chatRoom, error: roomError } = await supabase
        .from('intercom_chats')
        .select('id, target_building')
        .eq('user_id', chatUserId)
        .eq('channel', selectedChannel)
        .maybeSingle();

      // 2. Create a new chat channel if the room doesn't exist
      if (!chatRoom) {
        const { data: newRoom, error: createError } = await supabase
          .from('intercom_chats')
          .insert([{ 
            user_id: chatUserId,
            target_building: targetBuilding,
            channel: selectedChannel
          }])
          .select('id, target_building')
          .single();
        chatRoom = newRoom;
      } else if (!chatRoom.target_building && targetBuilding) {
        await supabase
          .from('intercom_chats')
          .update({ target_building: targetBuilding })
          .eq('id', chatRoom.id);
      }

      if (!chatRoom) {
        useFallbackLogs();
        setLoading(false);
        return;
      }

      setCurrentChatId(chatRoom.id);

      // 3. Scan and load historical message logs
      await fetchMessagesForChat(chatRoom.id);

      // 4. Real-time new message listener
      const intercomSubscription = supabase
        .channel(`intercom-room-${chatRoom.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'intercom_messages',
          filter: `chat_id=eq.${chatRoom.id}`
        }, (payload) => {
          fetchMessagesForChat(chatRoom.id);
          setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
        })
        .subscribe();

      setLoading(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: false }), 200);

      return intercomSubscription;

    } catch (err) {
      console.log(err);
      useFallbackLogs();
      setLoading(false);
    }
  };

  const useFallbackLogs = () => {
    setMessages([
      { id: 'fb1', sender: 'PMO_GUARD', text: 'Good day! This terminal line is open. Assistance unit ready.', timestamp: '8:30 PM' }
    ]);
  };

  const handlePublishIntercomMessage = async (textToSend: string) => {
    if (!textToSend.trim() || !currentChatId) return;

    // Optimistically add the message to the state to ensure it shows up immediately
    const tempId = `temp-${Date.now()}`;
    const localMsg: Message = {
      id: tempId,
      sender: 'RESIDENT',
      text: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };
    
    setMessages(prev => [...prev, localMsg]);
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const { data, error } = await supabase
        .from('intercom_messages')
        .insert([{
          chat_id: currentChatId,
          sender_type: 'RESIDENT',
          message: textToSend.trim()
        }])
        .select('id')
        .single();

      if (error) throw error;

      // Update the temp message ID with the actual database ID to prevent duplicates if real-time fires
      if (data) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: data.id.toString() } : m));
      }

      // Update intercom_chats to reset read_by_guards so it shows as unread to guards
      await supabase
        .from('intercom_chats')
        .update({ read_by_guards: [] })
        .eq('id', currentChatId);

    } catch (e) {
      console.error("Error publishing message:", e);
    }
  };

  const handleSendMessage = (textToSend: string) => {
    if (!textToSend.trim()) return;
    const cleanText = textToSend.trim();
    setInputText('');
    if (!currentChatId) return;
    handlePublishIntercomMessage(cleanText);
  };

  const handleSelectDepartment = (dept: 'SECURITY' | 'MAINTENANCE' | 'AMENITY') => {
    setSelectedChannel(dept);
    setCurrentView('CHAT_ROOM');
  };

  return (
    <SafeAreaView style={styles.safeAreaContainer}>
      {/* Master Unified Header */}
      <View style={styles.navHeader}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => {
            if (route.params?.channel || currentView !== 'CHAT_ROOM') {
              navigation.goBack();
            } else {
              setCurrentView('ROUTING_GATE');
            }
          }}
          activeOpacity={0.6}
        >
          <Text style={[styles.backIcon, { color: themeColor || '#0038a8' }]}>❮</Text>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <View style={styles.titleWrapper}>
          <Text style={styles.navTitle}>Condominium Intercom</Text>
          <Text style={styles.navStatus}>
            {currentView === 'CHAT_ROOM' 
              ? `● Connected: ${
                  selectedChannel === 'SECURITY' 
                    ? 'Gate Guard' 
                    : selectedChannel === 'MAINTENANCE' 
                    ? 'Maintenance Tech' 
                    : selectedChannel === 'AMENITY'
                    ? 'Amenity Staff'
                    : 'PMO Administration'
                }` 
              : '● Gate System Hub Online'}
          </Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      {/* ==================== [Section 1] ROUTING_GATE (Department Hub Gateway) ==================== */}
      {currentView === 'ROUTING_GATE' && (
        <ScrollView contentContainerStyle={styles.gateWrapper} showsVerticalScrollIndicator={false}>
          <Text style={styles.gateMainTitle}>Select Intercom Destination</Text>
          <Text style={styles.gateSubTitle}>Choose the correct operating node to fast-track response dispatch parameters.</Text>

          {/* Card A: Security Guard Gate Channel */}
          <TouchableOpacity style={[styles.deptCard, { borderColor: themeColor || '#0038a8' }]} onPress={() => handleSelectDepartment('SECURITY')}>
            <View style={styles.cardIconRow}>
              <Text style={{ fontSize: 24 }}>🚗</Text>
              <Text style={[styles.cardBadge, { backgroundColor: '#064e3b', color: '#4ade80' }]}>FAST TEXT</Text>
            </View>
            <Text style={styles.cardTitle}>Gate & Security House</Text>
            <Text style={styles.cardDesc}>For quick guard actions, visitor arrival verification, courier logs, immediate gate barriers, and express entry control passes.</Text>
          </TouchableOpacity>

          {/* Card B: Maintenance Tech Channel */}
          <TouchableOpacity 
            style={[styles.deptCard, { borderColor: themeColor || '#0038a8' }]} 
            onPress={() => handleSelectDepartment('MAINTENANCE')}
          >
            <View style={styles.cardIconRow}>
              <Text style={{ fontSize: 24 }}>🛠️</Text>
              <Text style={[styles.cardBadge, { backgroundColor: '#1e3a8a', color: '#60a5fa' }]}>TECH TEAM</Text>
            </View>
            <Text style={styles.cardTitle}>Maintenance & Repairs</Text>
            <Text style={styles.cardDesc}>For structural unit leaks, building repairs, engineering assistance, and scheduling maintenance visits.</Text>
          </TouchableOpacity>

          {/* Card C: Amenity Staff Channel */}
          <TouchableOpacity 
            style={[styles.deptCard, { borderColor: themeColor || '#0038a8' }]} 
            onPress={() => handleSelectDepartment('AMENITY')}
          >
            <View style={styles.cardIconRow}>
              <Text style={{ fontSize: 24 }}>🏊</Text>
              <Text style={[styles.cardBadge, { backgroundColor: '#0f766e', color: '#2dd4bf' }]}>AMENITY STAFF</Text>
            </View>
            <Text style={styles.cardTitle}>Amenity Center Staff</Text>
            <Text style={styles.cardDesc}>For facility bookings, amenity access verification, gym capacity checks, and activity queries.</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ==================== [Section 2] CHAT_ROOM (Security socket chat room) ==================== */}
      {currentView === 'CHAT_ROOM' && (
        <KeyboardAvoidingView 
          behavior="padding" 
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
        >
          {loading ? (
            <View style={styles.centeredLoader}>
              <ActivityIndicator size="small" color={themeColor || '#0038a8'} />
              <Text style={styles.loaderText}>Establishing duplex radio uplink...</Text>
            </View>
          ) : (
            <ScrollView 
              ref={scrollViewRef}
              style={styles.chatContainer}
              contentContainerStyle={{ paddingVertical: 16 }}
              onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
              onLayout={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
            >
              {messages.map((msg) => {
                const isMe = msg.sender === 'RESIDENT';
                return (
                  <View key={msg.id} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', marginVertical: 6, maxWidth: '85%' }}>
                    {!isMe && (
                      <Text style={{ color: '#64748b', fontSize: 10, fontWeight: '700', marginBottom: 2, marginLeft: 30 }}>
                        {getGuardDisplayName(msg.operator_name ?? null)}
                      </Text>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                      {!isMe && <Text style={[styles.avatar, { alignSelf: 'center', marginBottom: 0 }]}>{selectedChannel === 'PMO_ADMIN' ? '🏢' : '💂'}</Text>}
                      
                      {isMe && (
                        <View style={{ marginRight: 6, alignItems: 'flex-end' }}>
                          {!msg.read_at && !msg.is_deleted && (
                            <Text style={{ fontSize: 11, color: '#f59e0b', fontWeight: '900', marginBottom: 2 }}>1</Text>
                          )}
                          <Text style={{ fontSize: 9, color: '#94a3b8' }}>{msg.timestamp}</Text>
                        </View>
                      )}

                      <TouchableOpacity
                        activeOpacity={isMe && !msg.read_at && !msg.is_deleted ? 0.7 : 1}
                        onLongPress={() => {
                          if (isMe && !msg.read_at && !msg.is_deleted) {
                            handleMessageLongPress(msg.id, msg.text);
                          }
                        }}
                        style={[styles.bubble, isMe ? [styles.myBubble, { backgroundColor: themeColor || '#0038a8' }] : styles.guardBubble]}
                      >
                        <Text style={[styles.bubbleText, isMe ? styles.myText : styles.guardText]}>{msg.text}</Text>
                      </TouchableOpacity>

                      {!isMe && (
                        <View style={{ marginLeft: 6, alignItems: 'flex-start' }}>
                          <Text style={{ fontSize: 9, color: '#94a3b8' }}>{msg.timestamp}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.macroContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
              {quickMacros.map((macro, index) => (
                <TouchableOpacity key={index} style={styles.macroChip} onPress={() => handleSendMessage(macro.substring(2))}>
                  <Text style={styles.macroChipText}>{macro}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.inputToolbar}>
            <TextInput
              style={styles.textInput}
              placeholder={`Message to ${
                selectedChannel === 'SECURITY' 
                  ? 'Gate Guard' 
                  : selectedChannel === 'MAINTENANCE' 
                  ? 'Maintenance Tech' 
                  : selectedChannel === 'AMENITY'
                  ? 'Amenity Staff'
                  : 'PMO Administration'
              }...`}
              placeholderTextColor="#94a3b8"
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={() => handleSendMessage(inputText)}
            />
            <TouchableOpacity style={[styles.sendButton, { backgroundColor: themeColor || '#0038a8' }]} onPress={() => handleSendMessage(inputText)}>
              <Text style={styles.sendButtonText}>➔</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Edit Message Modal */}
      <Modal animationType="fade" transparent={true} visible={editingMessage !== null} onRequestClose={() => setEditingMessage(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardWindow}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#0f172a' }}>✏️ Edit Message</Text>
            <TextInput
              style={{
                backgroundColor: '#f1f5f9',
                borderColor: '#cbd5e1',
                borderWidth: 1,
                borderRadius: 10,
                padding: 12,
                fontSize: 14,
                color: '#0f172a',
                minHeight: 80,
                textAlignVertical: 'top',
                marginBottom: 15
              }}
              multiline
              value={editText}
              onChangeText={setEditText}
              placeholder="Edit your message..."
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <TouchableOpacity 
                style={{ flex: 0.48, paddingVertical: 12, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center' }} 
                onPress={() => setEditingMessage(null)}
              >
                <Text style={{ color: '#475569', fontWeight: 'bold' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 0.48, paddingVertical: 12, borderRadius: 8, backgroundColor: themeColor || '#0038a8', alignItems: 'center' }} 
                onPress={handleEditResidentMessage}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeAreaContainer: { flex: 1, backgroundColor: '#f8fafc', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 10 },
  navHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#fff' },
  backButton: { flexDirection: 'row', alignItems: 'center', width: 60 },
  backIcon: { fontSize: 16, fontWeight: 'bold' },
  backText: { fontSize: 14, color: '#64748b', marginLeft: 4, fontWeight: '500' },
  titleWrapper: { alignItems: 'center' },
  navTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  navStatus: { fontSize: 10, fontWeight: '600', color: '#16a34a', marginTop: 2 },
  gateWrapper: { padding: 24, flexGrow: 1, justifyContent: 'center' },
  gateMainTitle: { color: '#0f172a', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  gateSubTitle: { color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 8, marginBottom: 24, lineHeight: 18, fontWeight: '500' },
  deptCard: { backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 2, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardIconRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardBadge: { fontSize: 10, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  cardTitle: { color: '#0f172a', fontSize: 15, fontWeight: '800', marginTop: 10 },
  cardDesc: { color: '#64748b', fontSize: 12, marginTop: 6, lineHeight: 18, fontWeight: '500' },
  chatContainer: { flex: 1, paddingHorizontal: 20 },
  centeredLoader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loaderText: { fontSize: 12, color: '#94a3b8', marginTop: 10, fontWeight: '500' },
  messageRow: { flexDirection: 'row', marginBottom: 14, maxWidth: '80%' },
  myRow: { alignSelf: 'flex-end' },
  guardRow: { alignSelf: 'flex-start' },
  avatar: { fontSize: 22, marginRight: 8, alignSelf: 'flex-end', marginBottom: 4 },
  bubble: { borderRadius: 18, paddingHorizontal: 18, paddingVertical: 10, position: 'relative' },
  myBubble: { borderBottomRightRadius: 2 },
  guardBubble: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderBottomLeftRadius: 2 },
  bubbleText: { fontSize: 14, lineHeight: 19 },
  myText: { color: '#fff' },
  guardText: { color: '#1e293b' },
  timeText: { fontSize: 9, marginTop: 4, textAlign: 'right' },
  myTime: { color: 'rgba(255,255,255,0.7)' },
  guardTime: { color: '#94a3b8' },
  macroContainer: { paddingVertical: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  macroChip: { backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, marginRight: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  macroChipText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  inputToolbar: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#fff', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  textInput: { flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10, fontSize: 14, color: '#0f172a', marginRight: 10 },
  sendButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  sendButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCardWindow: { width: '85%', backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 }
});