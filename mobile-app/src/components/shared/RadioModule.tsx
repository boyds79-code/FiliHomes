import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Modal, SafeAreaView, Alert, Platform, ActivityIndicator, KeyboardAvoidingView, Keyboard, Dimensions } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function RadioModule({ assignedBuilding = 'Tower A', guardName = 'Staff', processedItems = [], themeMode = 'LIGHT', showResidents = true, channel = 'SECURITY' }: any) {
  // Radio Chat Controls
  const [radioSubTab, setRadioSubTab] = useState<'PMO' | 'RESIDENTS'>('PMO');
  const [pmoMessage, setPmoMessage] = useState('');
  const [isUnitChatOpen, setIsUnitChatOpen] = useState(false);
  const [activeChatUnit, setActiveChatUnit] = useState<string>('');
  const [unitMessage, setUnitMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [containerWidth, setContainerWidth] = useState(Dimensions.get('window').width);

  // PMO Logs
  const [pmoLogs, setPmoLogs] = useState<any[]>([]);
  const [pmoChatId, setPmoChatId] = useState<number | null>(null);

  // DB-backed Intercom Rooms & Messages
  const [residentChatRooms, setResidentChatRooms] = useState<any[]>([]);
  const [unitMessages, setUnitMessages] = useState<any>({});
  const [chatUnitMap, setChatUnitMap] = useState<Record<string, number>>({});

  const [localProcessed, setLocalProcessed] = useState<string[]>(processedItems);
  const modalScrollViewRef = useRef<ScrollView>(null);
  const pmoScrollViewRef = useRef<ScrollView>(null);
  const swipeScrollViewRef = useRef<ScrollView>(null);

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const isUnitChatOpenRef = useRef(isUnitChatOpen);
  const activeChatUnitRef = useRef(activeChatUnit);
  const radioSubTabRef = useRef(radioSubTab);

  useEffect(() => {
    isUnitChatOpenRef.current = isUnitChatOpen;
  }, [isUnitChatOpen]);

  useEffect(() => {
    activeChatUnitRef.current = activeChatUnit;
  }, [activeChatUnit]);

  useEffect(() => {
    radioSubTabRef.current = radioSubTab;
  }, [radioSubTab]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const getPmoChatPadding = () => {
    if (Platform.OS !== 'ios' || keyboardHeight === 0) return 0;
    return Math.max(0, keyboardHeight - 110);
  };

  const getModalChatPadding = () => {
    if (Platform.OS !== 'ios' || keyboardHeight === 0) return 0;
    return Math.max(0, keyboardHeight - 74);
  };

  useEffect(() => {
    const keyboardShowListener = Keyboard.addListener('keyboardDidShow', () => {
      if (isUnitChatOpen) {
        modalScrollViewRef.current?.scrollToEnd({ animated: false });
      }
      pmoScrollViewRef.current?.scrollToEnd({ animated: false });
    });

    return () => {
      keyboardShowListener.remove();
    };
  }, [isUnitChatOpen]);

  useEffect(() => {
    fetchResidentChats();
    fetchPmoChats();

    // ⚡ Subscribe to real-time chats and messages changes to instantly sync guard and resident chats
    const chatRoomChannel = supabase
      .channel(`guard-intercom-chats-sync-${channel}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intercom_chats' }, () => {
        fetchResidentChats();
        fetchPmoChats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intercom_messages' }, () => {
        fetchResidentChats();
        fetchPmoChats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(chatRoomChannel);
    };
  }, [assignedBuilding, channel]);

  useEffect(() => {
    if (radioSubTab === 'PMO' && pmoChatId) {
      supabase
        .from('intercom_chats')
        .update({ read_by_guards: [guardName] })
        .eq('id', pmoChatId)
        .then(() => {
          fetchPmoChats();
        });
    }
  }, [radioSubTab, pmoChatId, guardName]);

  const fetchResidentChats = async () => {
    try {
      // 1. Get logged in guard's condo_id
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;
      if (!userId) return;

      const { data: myProfile } = await supabase
        .from('profiles')
        .select('condo_id')
        .eq('id', userId)
        .maybeSingle();

      const condoId = myProfile?.condo_id || 'c1111111-1111-1111-1111-111111111111';

      // 1b. Fetch PMO Managers to exclude them from resident list
      const { data: pmoStaff } = await supabase
        .from('staff_profiles')
        .select('id')
        .eq('role', 'PMO_MANAGER');

      const { data: userUnitsList } = await supabase
        .from('user_units')
        .select('user_id');

      const residentIds = userUnitsList ? userUnitsList.map(u => u.user_id) : [];
      let pmoIds: string[] = [];
      if (pmoStaff) {
        pmoIds = pmoStaff.map(p => p.id).filter(id => !residentIds.includes(id));
      }
      if (pmoIds.length === 0) {
        pmoIds = ['66dcdab9-091a-440f-a871-fe2133c1813e'];
      }

      // 2. Fetch all user units and units to build a mapping of user_id -> unit_number
      const { data: userUnits } = await supabase
        .from('user_units')
        .select(`
          user_id,
          units!inner (
            unit_number,
            building_no
          )
        `)
        .eq('condo_id', condoId);

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name');

      const profileMap: Record<string, { name: string; unit: string }> = {};
      if (userUnits && profiles) {
        profiles.forEach(p => {
          const uu = userUnits.find((u: any) => u.user_id === p.id);
          if (uu && uu.units) {
            profileMap[p.id] = {
              name: p.full_name || 'Resident',
              unit: (uu.units as any).unit_number || 'N/A'
            };
          }
        });
      }

      // 3. Fetch active intercom chats
      const { data: chats } = await supabase
        .from('intercom_chats')
        .select('*')
        .eq('target_building', assignedBuilding)
        .eq('channel', channel)
        .order('created_at', { ascending: false });

      if (!chats || chats.length === 0) {
        setResidentChatRooms([]);
        setUnitMessages({});
        return;
      }

      // Filter out PMO chats from the resident list
      const residentChats = chats.filter(c => !pmoIds.includes(c.user_id));

      // 4. Fetch all intercom messages for these chats
      const chatIds = residentChats.map(c => c.id);
      if (chatIds.length === 0) {
        setResidentChatRooms([]);
        setUnitMessages({});
        return;
      }

      const { data: messages } = await supabase
        .from('intercom_messages')
        .select('*')
        .in('chat_id', chatIds)
        .order('created_at', { ascending: true });

      // Group messages by unit number and map chats
      const groupedMsgs: Record<string, any[]> = {};
      const unitIdMap: Record<string, number> = {};

      const cleanName = (opName: string | null) => {
        let name = opName || guardName;
        if (name === 'Me (Guard)' || name === 'Staff') {
          if (channel === 'SECURITY') name = 'Guard Juan';
          else if (channel === 'MAINTENANCE') name = 'Tech Juan';
          else name = 'Staff Juan';
        }
        name = name.replace(/Duty Guard/gi, 'Guard');
        name = name.replace(/Guard Guard/gi, 'Guard');
        return name;
      };

      const rooms = residentChats.map(c => {
        const residentInfo = profileMap[c.user_id] || { name: 'Resident', unit: 'N/A' };
        const roomMessages = messages?.filter(m => m.chat_id === c.id) || [];
        const lastMsgObj = roomMessages[roomMessages.length - 1];

        groupedMsgs[residentInfo.unit] = roomMessages.map(m => ({
          id: m.id.toString(),
          sender: m.sender_type === 'RESIDENT' ? `Unit ${residentInfo.unit}` : cleanName(m.operator_name),
          msg: m.is_deleted ? '🗑️ This message was deleted' : m.message,
          time: new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          operator_name: m.operator_name,
          read_at: m.read_at,
          is_deleted: m.is_deleted,
          sender_type: m.sender_type
        }));

        unitIdMap[residentInfo.unit] = c.id;

        return {
          id: c.id.toString(),
          unit: residentInfo.unit,
          residentName: `Unit ${residentInfo.unit}`,
          building: c.target_building || assignedBuilding,
          lastMsg: lastMsgObj ? lastMsgObj.message : 'Chat initiated.',
          time: lastMsgObj 
            ? new Date(lastMsgObj.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            : new Date(c.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          unread: !c.read_by_guards || c.read_by_guards.length === 0 || !c.read_by_guards.includes(guardName),
          currentHandler: c.read_by_guards?.length > 0 ? c.read_by_guards[0] : 'None',
          lastAnsweredBy: roomMessages.filter(m => m.sender_type === 'GUARD' || m.sender_type === 'PMO_GUARD').pop()?.operator_name || 'None'
        };
      });

      setResidentChatRooms(rooms);
      setUnitMessages(groupedMsgs);
      setChatUnitMap(unitIdMap);

      // Auto-read active chat messages if the modal is currently open
      if (isUnitChatOpenRef.current && activeChatUnitRef.current) {
        const activeChatId = unitIdMap[activeChatUnitRef.current];
        if (activeChatId) {
          const hasUnread = messages?.some(m => m.chat_id === activeChatId && m.sender_type === 'RESIDENT' && !m.read_at);
          if (hasUnread) {
            supabase
              .from('intercom_messages')
              .update({ read_at: new Date().toISOString() })
              .eq('chat_id', activeChatId)
              .eq('sender_type', 'RESIDENT')
              .is('read_at', null)
              .then(() => fetchResidentChats());
          }
        }
      }

    } catch (err) {
      console.error("Error loading guard resident chats:", err);
    }
  };

  const fetchPmoChats = async () => {
    try {
      // 1. Fetch PMO Managers
      const { data: pmoStaff } = await supabase
        .from('staff_profiles')
        .select('id, full_name')
        .eq('role', 'PMO_MANAGER');

      // Filter out PMO Managers who are also residents in the condo
      const { data: userUnitsList } = await supabase
        .from('user_units')
        .select('user_id');

      const residentIds = userUnitsList ? userUnitsList.map(u => u.user_id) : [];
      let pmoIds: string[] = [];
      if (pmoStaff) {
        pmoIds = pmoStaff.map(p => p.id).filter(id => !residentIds.includes(id));
      }

      // Fallback to the default PMO Manager ID if all are filtered out or none found
      if (pmoIds.length === 0) {
        pmoIds = ['66dcdab9-091a-440f-a871-fe2133c1813e'];
      }

      // 2. Fetch or create chat room for the default PMO Manager ID
      const canonicalPmoId = '66dcdab9-091a-440f-a871-fe2133c1813e';
      let { data: chatRoom } = await supabase
        .from('intercom_chats')
        .select('id')
        .eq('user_id', canonicalPmoId)
        .eq('channel', channel)
        .maybeSingle();

      if (!chatRoom) {
        const { data: newRoom } = await supabase
          .from('intercom_chats')
          .insert([{ 
            user_id: canonicalPmoId,
            target_building: assignedBuilding,
            channel: channel
          }])
          .select('id')
          .single();
        chatRoom = newRoom;
      }

      if (!chatRoom) return;
      setPmoChatId(chatRoom.id);

      // 3. Fetch messages
      const { data: messages } = await supabase
        .from('intercom_messages')
        .select('*')
        .eq('chat_id', chatRoom.id)
        .order('created_at', { ascending: true });

      const cleanName = (opName: string | null) => {
        let name = opName || guardName;
        if (name === 'Me (Guard)' || name === 'Staff') {
          if (channel === 'SECURITY') name = 'Guard Juan';
          else if (channel === 'MAINTENANCE') name = 'Tech Juan';
          else name = 'Staff Juan';
        }
        name = name.replace(/Duty Guard/gi, 'Guard');
        name = name.replace(/Guard Guard/gi, 'Guard');
        return name;
      };

      if (messages) {
        const mapped = messages.map(m => ({
          id: m.id.toString(),
          sender: m.sender_type === 'RESIDENT' ? 'PMO Office' : cleanName(m.operator_name),
          msg: m.is_deleted ? '🗑️ This message was deleted' : m.message,
          time: new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          read_at: m.read_at,
          is_deleted: m.is_deleted,
          sender_type: m.sender_type
        }));
        setPmoLogs(mapped);

        // Auto-read PMO office messages if PMO tab is currently active
        if (radioSubTabRef.current === 'PMO') {
          const hasUnread = messages.some(m => m.sender_type === 'RESIDENT' && !m.read_at);
          if (hasUnread) {
            supabase
              .from('intercom_messages')
              .update({ read_at: new Date().toISOString() })
              .eq('chat_id', chatRoom.id)
              .eq('sender_type', 'RESIDENT')
              .is('read_at', null)
              .then(() => fetchPmoChats());
          }
        }
      }
    } catch (err) {
      console.error("Error loading PMO chats:", err);
    }
  };

  const totalUnreadCount = residentChatRooms.filter(room => room.unread).length;

  const handleTriggerSosBroadcast = () => {
    Alert.alert("🚨 SOS BROADCAST ACTIVE", "Siren activated loop grid. GPS trace broadcasting.", [{ text: "DISMISS", style: "cancel" }]);
  };

  const handleSendPmoSignal = async () => {
    if (!pmoMessage.trim() || !pmoChatId) return;
    try {
      const { error } = await supabase
        .from('intercom_messages')
        .insert([{
          chat_id: pmoChatId,
          sender_type: 'GUARD',
          message: pmoMessage.trim(),
          operator_name: guardName
        }]);

      if (error) throw error;
      
      setPmoMessage('');
      fetchPmoChats();
    } catch (e) {
      console.error("Error sending message to PMO:", e);
      Alert.alert("Error", "Failed to send message to PMO.");
    }
  };

  const handleSendUnitMessage = async () => {
    if (!unitMessage.trim() || !activeChatUnit) return;
    const chatId = chatUnitMap[activeChatUnit];
    if (!chatId) return;

    try {
      const { error } = await supabase
        .from('intercom_messages')
        .insert([{
          chat_id: chatId,
          sender_type: 'GUARD',
          message: unitMessage.trim(),
          operator_name: guardName
        }]);

      if (error) throw error;
      
      setUnitMessage('');
      fetchResidentChats();
    } catch (e) {
      console.error("Error sending reply:", e);
      Alert.alert("Error", "Failed to send message to resident.");
    }
  };

  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string; type?: 'PMO' | 'UNIT' } | null>(null);
  const [editText, setEditText] = useState('');

  const handleMessageLongPress = (msgId: string, currentText: string, type: 'PMO' | 'UNIT') => {
    Alert.alert(
      "Message Options",
      "Choose an action for this unread message.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "✏️ Edit Message", 
          onPress: () => {
            setEditingMessage({ id: msgId, text: currentText, type });
            setEditText(currentText);
          }
        },
        { 
          text: "🗑️ Delete Message", 
          style: "destructive",
          onPress: () => handleDeleteGuardMessage(msgId, type)
        }
      ]
    );
  };

  const handleEditGuardMessage = async () => {
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
        Alert.alert("Cannot Edit", "This message has already been read by the recipient.");
      }

      setEditingMessage(null);
      if (editingMessage.type === 'PMO') {
        fetchPmoChats();
      } else {
        fetchResidentChats();
      }
    } catch (e) {
      console.error("Error editing message:", e);
      Alert.alert("Error", "Failed to edit message.");
    }
  };

  const handleDeleteGuardMessage = async (msgId: string, type: 'PMO' | 'UNIT') => {
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
                Alert.alert("Cannot Delete", "This message has already been read by the resident.");
              }
              
              if (type === 'PMO') {
                fetchPmoChats();
              } else {
                fetchResidentChats();
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

  const handleOpenUnitChatWindow = async (unit: string) => {
    setActiveChatUnit(unit);
    setIsUnitChatOpen(true);
    
    // Mark room as read / assign guard
    const chatId = chatUnitMap[unit];
    if (chatId) {
      await supabase
        .from('intercom_chats')
        .update({ read_by_guards: [guardName] })
        .eq('id', chatId);

      // Mark resident messages as read
      await supabase
        .from('intercom_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('chat_id', chatId)
        .eq('sender_type', 'RESIDENT')
        .is('read_at', null);

      fetchResidentChats();
    }
  };

  const handleMarkAsDone = async (roomId: string) => {
    if (!confirm('Mark this conversation as completed?')) return;
    try {
      const { error } = await supabase
        .from('intercom_chats')
        .delete()
        .eq('id', roomId);
      if (error) throw error;
      fetchResidentChats();
    } catch (err) {
      console.error(err);
      setLocalProcessed(prev => [...prev, roomId]);
    }
  };

  const isDark = themeMode === 'DARK';
  const themeColors = {
    background: isDark ? '#0f172a' : '#f8fafc',
    cardBg: isDark ? '#1e293b' : '#ffffff',
    cardBorder: isDark ? '#334155' : '#cbd5e1',
    text: isDark ? '#ffffff' : '#0f172a',
    subtext: isDark ? '#cbd5e1' : '#334155',
    mutedText: isDark ? '#94a3b8' : '#64748b',
    inputBg: isDark ? '#0f172a' : '#f1f5f9',
    inputText: isDark ? '#ffffff' : '#0f172a',
    inputBorder: isDark ? '#334155' : '#cbd5e1',
    tabBg: isDark ? '#0f172a' : '#ffffff',
    tabBorder: isDark ? '#1e293b' : '#cbd5e1',
    activeTabBg: isDark ? '#1e3a8a' : '#0038a8',
    activeTabBorder: isDark ? '#334155' : '#0038a8',
    divider: isDark ? '#1e293b' : '#e2e8f0',
    chatBubbleSelf: isDark ? '#1e3a8a' : '#0038a8',
    chatBubbleOther: isDark ? '#334155' : '#e2e8f0',
    chatTextSelf: '#ffffff',
    chatTextOther: isDark ? '#ffffff' : '#0f172a',
  };



  return (
    <View 
      style={[styles.container, { backgroundColor: themeColors.background }]}
      onLayout={(e) => {
        const { width } = e.nativeEvent.layout;
        if (width > 0) {
          setContainerWidth(width);
        }
      }}
    >

      {showResidents && (
        <View style={[styles.radioToggleContainer, { backgroundColor: themeColors.background, borderColor: themeColors.tabBorder }]}>
          <TouchableOpacity 
            style={[styles.radioTabBtn, radioSubTab === 'PMO' && { backgroundColor: themeColors.activeTabBg, borderWidth: 1, borderColor: themeColors.activeTabBorder }]} 
            onPress={() => {
              setRadioSubTab('PMO');
              swipeScrollViewRef.current?.scrollTo({ x: 0, animated: true });
            }}
          >
            <Text style={[styles.radioTabBtnText, { color: radioSubTab === 'PMO' ? '#fff' : themeColors.mutedText }]}>🏢 PMO ORDERS</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.radioTabBtn, radioSubTab === 'RESIDENTS' && { backgroundColor: themeColors.activeTabBg, borderWidth: 1, borderColor: themeColors.activeTabBorder }, { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }]} 
            onPress={() => {
              setRadioSubTab('RESIDENTS');
              swipeScrollViewRef.current?.scrollTo({ x: containerWidth, animated: true });
            }}
          >
            <Text style={[styles.radioTabBtnText, { color: radioSubTab === 'RESIDENTS' ? '#fff' : themeColors.mutedText }]}>👤 RESIDENTS</Text>
            {totalUnreadCount > 0 && <View style={styles.inlineBadge}><Text style={styles.inlineBadgeText}>{totalUnreadCount}</Text></View>}
          </TouchableOpacity>
        </View>
      )}

      {showResidents ? (
        <ScrollView
          ref={swipeScrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(event) => {
            const offsetX = event.nativeEvent.contentOffset.x;
            const page = Math.round(offsetX / containerWidth);
            if (page === 0) {
              setRadioSubTab('PMO');
            } else {
              setRadioSubTab('RESIDENTS');
            }
          }}
          style={{ flex: 1 }}
        >
          {/* Page 1: PMO Orders */}
          <View style={{ width: containerWidth, flex: 1 }}>
            <View style={{ flex: 1, paddingBottom: getPmoChatPadding() }}>
              <Text style={[styles.sectionTitle, { color: themeColors.mutedText, marginBottom: 8 }]}>Command Post Directives</Text>
              <ScrollView
                ref={pmoScrollViewRef}
                style={{ flex: 1, marginBottom: 12 }}
                contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingBottom: 8 }}
                onContentSizeChange={() => pmoScrollViewRef.current?.scrollToEnd({ animated: true })}
                onLayout={() => pmoScrollViewRef.current?.scrollToEnd({ animated: false })}
              >
                {pmoLogs.map((log) => {
                  const isMe = log.sender_type !== 'RESIDENT';
                  return (
                    <View key={log.id} style={{ marginVertical: 6, alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                      <Text style={{ color: themeColors.mutedText, fontSize: 10, fontWeight: '700', marginBottom: 2, alignSelf: isMe ? 'flex-end' : 'flex-start' }}>
                        {log.sender}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', alignSelf: isMe ? 'flex-end' : 'flex-start' }}>
                        {isMe && (
                          <View style={{ marginRight: 6, alignItems: 'flex-end' }}>
                            {!log.read_at && !log.is_deleted && <Text style={{ fontSize: 11, color: '#f59e0b', fontWeight: '900', marginBottom: 2 }}>1</Text>}
                            <Text style={{ fontSize: 9, color: themeColors.mutedText }}>{log.time}</Text>
                          </View>
                        )}
                        <TouchableOpacity
                          activeOpacity={isMe && !log.read_at && !log.is_deleted ? 0.7 : 1}
                          onLongPress={() => {
                            if (isMe && !log.read_at && !log.is_deleted) {
                              handleMessageLongPress(log.id, log.msg, 'PMO');
                            }
                          }}
                          style={{
                            backgroundColor: isMe ? themeColors.chatBubbleSelf : themeColors.chatBubbleOther,
                            padding: 10,
                            borderRadius: 10,
                          }}
                        >
                          <Text style={{
                            color: isMe ? themeColors.chatTextSelf : themeColors.chatTextOther,
                            fontSize: 13,
                            fontWeight: '600'
                          }}>{log.msg}</Text>
                        </TouchableOpacity>
                        {!isMe && (
                          <View style={{ marginLeft: 6, alignItems: 'flex-start' }}>
                            <Text style={{ fontSize: 9, color: themeColors.mutedText }}>{log.time}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Platform.OS === 'ios' ? 10 : 0 }}>
                <TextInput
                  style={[styles.hugeInput, { backgroundColor: themeColors.inputBg, color: themeColors.inputText, borderColor: themeColors.inputBorder, flex: 0.78, fontSize: 14 }]}
                  placeholder="Reply to PMO office..."
                  placeholderTextColor={themeColors.mutedText}
                  value={pmoMessage}
                  onChangeText={setPmoMessage}
                />
                <TouchableOpacity style={{ flex: 0.2, backgroundColor: '#38bdf8', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }} onPress={handleSendPmoSignal}>
                  <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 11 }}>SEND</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Page 2: Residents */}
          <View style={{ width: containerWidth, flex: 1 }}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
              <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>Intercom Channels</Text>
              {residentChatRooms.length === 0 ? (
                <View style={{ padding: 30, alignItems: 'center' }}>
                  <Text style={{ color: themeColors.mutedText, fontSize: 13, fontWeight: '700' }}>No active resident intercom channels.</Text>
                </View>
              ) : (
                residentChatRooms
                  .filter(room => !localProcessed.includes(room.id))
                  .map((room) => (
                    <TouchableOpacity
                      key={room.id}
                      style={[
                        styles.unitRoomCard,
                        { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder },
                        room.unread && { borderColor: '#f97316', backgroundColor: isDark ? '#1e293b' : '#fff3e0' }
                      ]}
                      onPress={() => handleOpenUnitChatWindow(room.unit)}
                    >
                      <View style={styles.unitCardMainSection}>
                        <View style={[styles.unitAvatarCircle, { backgroundColor: themeColors.inputBg, borderColor: themeColors.inputBorder }]}><Text style={{ color: themeColors.text, fontWeight: '900', fontSize: 13 }}>{room.unit}</Text></View>
                        <View style={styles.unitCardTextWrapper}>
                          <Text style={{ color: themeColors.text, fontSize: 14, fontWeight: '800' }}>Unit {room.unit} • {room.building}</Text>
                          <Text style={{ color: room.unread ? '#f97316' : themeColors.mutedText, fontSize: 12, marginTop: 3, fontWeight: room.unread ? '700' : '500' }} numberOfLines={1}>{room.lastMsg}</Text>
                          <View style={styles.collaborationBadgeContainer}>
                            <Text style={styles.collaborationMiniBadge}>👀 Reading: {room.currentHandler}</Text>
                            {room.lastAnsweredBy !== 'None' && <Text style={[styles.collaborationMiniBadge, { backgroundColor: '#1e3a8a', color: '#60a5fa' }]}>✍️ {room.lastAnsweredBy}</Text>}
                          </View>
                        </View>
                      </View>
                      <View style={styles.unitCardRightSection}>
                        <Text style={{ color: themeColors.mutedText, fontSize: 10, fontWeight: '700' }}>{room.time}</Text>
                        {room.unread && <View style={styles.unreadIndicatorBadge} />}
                        <TouchableOpacity onPress={() => handleMarkAsDone(room.id)} style={{ marginTop: 8, padding: 6, backgroundColor: '#334155', borderRadius: 6 }}>
                          <Text style={{ color: '#22c55e', fontSize: 9, fontWeight: '900' }}>✓ DONE</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  ))
              )}
            </ScrollView>
          </View>
        </ScrollView>
      ) : (
        <View style={{ flex: 1, paddingBottom: getPmoChatPadding() }}>
          <Text style={[styles.sectionTitle, { color: themeColors.mutedText, marginBottom: 8 }]}>Command Post Directives</Text>
          <ScrollView
            ref={pmoScrollViewRef}
            style={{ flex: 1, marginBottom: 12 }}
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingBottom: 8 }}
            onContentSizeChange={() => pmoScrollViewRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => pmoScrollViewRef.current?.scrollToEnd({ animated: false })}
          >
            {pmoLogs.map((log) => {
              const isMe = log.sender_type !== 'RESIDENT';
              return (
                <View key={log.id} style={{ marginVertical: 6, alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                  <Text style={{ color: themeColors.mutedText, fontSize: 10, fontWeight: '700', marginBottom: 2, alignSelf: isMe ? 'flex-end' : 'flex-start' }}>
                    {log.sender}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', alignSelf: isMe ? 'flex-end' : 'flex-start' }}>
                    {isMe && (
                      <View style={{ marginRight: 6, alignItems: 'flex-end' }}>
                        {!log.read_at && !log.is_deleted && <Text style={{ fontSize: 11, color: '#f59e0b', fontWeight: '900', marginBottom: 2 }}>1</Text>}
                        <Text style={{ fontSize: 9, color: themeColors.mutedText }}>{log.time}</Text>
                      </View>
                    )}
                    <Text style={{
                      color: isMe ? themeColors.chatTextSelf : themeColors.chatTextOther,
                      backgroundColor: isMe ? themeColors.chatBubbleSelf : themeColors.chatBubbleOther,
                      padding: 10,
                      borderRadius: 10,
                      fontSize: 13,
                      fontWeight: '600'
                    }}>{log.msg}</Text>
                    {!isMe && (
                      <View style={{ marginLeft: 6, alignItems: 'flex-start' }}>
                        <Text style={{ fontSize: 9, color: themeColors.mutedText }}>{log.time}</Text>
                      </View>
                    )}
                  </View>
                  {isMe && !log.read_at && !log.is_deleted && (
                    <TouchableOpacity onPress={() => handleDeleteGuardMessage(log.id, 'PMO')} style={{ alignSelf: 'flex-end', marginTop: 2 }}>
                      <Text style={{ fontSize: 10, color: '#ef4444', fontWeight: 'bold' }}>🗑️ Delete</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Platform.OS === 'ios' ? 10 : 0 }}>
            <TextInput
              style={[styles.hugeInput, { backgroundColor: themeColors.inputBg, color: themeColors.inputText, borderColor: themeColors.inputBorder, flex: 0.78, fontSize: 14 }]}
              placeholder="Reply to PMO office..."
              placeholderTextColor={themeColors.mutedText}
              value={pmoMessage}
              onChangeText={setPmoMessage}
            />
            <TouchableOpacity style={{ flex: 0.2, backgroundColor: '#38bdf8', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }} onPress={handleSendPmoSignal}>
              <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 11 }}>SEND</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Intercom Line Modal */}
      <Modal animationType="slide" transparent={false} visible={isUnitChatOpen} onRequestClose={() => setIsUnitChatOpen(false)}>
        <SafeAreaView style={[styles.modalSafeArea, { backgroundColor: themeColors.background, paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 10 : 0 }]}>
          <View style={{ flex: 1, paddingBottom: getModalChatPadding() }}>
            <View style={[styles.modalChatHeader, { borderBottomColor: themeColors.divider }]}>
              <TouchableOpacity style={[styles.modalCloseBtn, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]} onPress={() => setIsUnitChatOpen(false)}><Text style={{ color: themeColors.text, fontWeight: '800', fontSize: 13 }}>← Close</Text></TouchableOpacity>
              <Text style={{ color: themeColors.text, fontSize: 14, fontWeight: '900' }}>🛡️ Unit {activeChatUnit} Line</Text>
              <View style={{ width: 80 }} />
            </View>
          <ScrollView 
            ref={modalScrollViewRef}
            style={{ flex: 1, marginVertical: 16 }}
            onContentSizeChange={() => modalScrollViewRef.current?.scrollToEnd({ animated: false })}
            onLayout={() => modalScrollViewRef.current?.scrollToEnd({ animated: false })}
          >
            {activeChatUnit && unitMessages[activeChatUnit]?.map((m: any) => {
              const isMe = m.sender_type !== 'RESIDENT';
              return (
                <View key={m.id} style={{ marginVertical: 6, alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '85%', paddingHorizontal: 12 }}>
                  <Text style={{ color: themeColors.mutedText, fontSize: 10, fontWeight: '700', marginBottom: 2, alignSelf: isMe ? 'flex-end' : 'flex-start' }}>
                    {m.sender}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', alignSelf: isMe ? 'flex-end' : 'flex-start' }}>
                    {isMe && (
                      <View style={{ marginRight: 6, alignItems: 'flex-end' }}>
                        {!m.read_at && !m.is_deleted && <Text style={{ fontSize: 11, color: '#f59e0b', fontWeight: '900', marginBottom: 2 }}>1</Text>}
                        <Text style={{ fontSize: 9, color: themeColors.mutedText }}>{m.time}</Text>
                      </View>
                    )}
                    <TouchableOpacity
                      activeOpacity={isMe && !m.read_at && !m.is_deleted ? 0.7 : 1}
                      onLongPress={() => {
                        if (isMe && !m.read_at && !m.is_deleted) {
                          handleMessageLongPress(m.id, m.msg, 'UNIT');
                        }
                      }}
                      style={{
                        backgroundColor: isMe ? themeColors.chatBubbleSelf : themeColors.chatBubbleOther,
                        padding: 10,
                        borderRadius: 10,
                      }}
                    >
                      <Text style={{ 
                        color: isMe ? themeColors.chatTextSelf : themeColors.chatTextOther, 
                        fontSize: 13, 
                        fontWeight: '600'
                      }}>{m.msg}</Text>
                    </TouchableOpacity>
                    {!isMe && (
                      <View style={{ marginLeft: 6, alignItems: 'flex-start' }}>
                        <Text style={{ fontSize: 9, color: themeColors.mutedText }}>{m.time}</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Platform.OS === 'ios' ? 20 : 5 }}>
            <TextInput 
              style={[styles.hugeInput, { backgroundColor: themeColors.inputBg, color: themeColors.inputText, borderColor: themeColors.inputBorder, flex: 0.78, fontSize: 14 }]} 
              placeholder="Reply..." 
              placeholderTextColor={themeColors.mutedText} 
              value={unitMessage} 
              onChangeText={setUnitMessage} 
            />
            <TouchableOpacity style={{ flex: 0.2, backgroundColor: '#38bdf8', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }} onPress={handleSendUnitMessage}><Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 11 }}>SEND</Text></TouchableOpacity>
          </View>
          </View>
        </SafeAreaView>
      </Modal>

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
                style={{ flex: 0.48, paddingVertical: 12, borderRadius: 8, backgroundColor: '#0038a8', alignItems: 'center' }} 
                onPress={handleEditGuardMessage}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  modalSafeArea: { flex: 1 },
  sosGiganticButton: { backgroundColor: '#7f1d1d', borderWidth: 2, borderColor: '#ef4444', padding: 14, borderRadius: 14, alignItems: 'center', marginBottom: 16 },
  sosButtonText: { color: '#fca5a5', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  radioToggleContainer: { flexDirection: 'row', justifyContent: 'space-between', padding: 4, borderRadius: 14, marginBottom: 16, borderWidth: 1 },
  radioTabBtn: { flex: 0.49, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  activeRadioTabBtn: {},
  radioTabBtnText: { fontSize: 12, fontWeight: '800' },
  activeRadioTabBtnText: { color: '#fff' },
  sectionTitle: { fontSize: 11, fontWeight: '800', marginTop: 10, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 15 },
  hugeInput: { borderRadius: 12, padding: 14, fontSize: 15, fontWeight: '700', borderWidth: 1 },
  unitRoomCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 10 },
  unitCardMainSection: { flexDirection: 'row', alignItems: 'flex-start', flex: 0.82 },
  unitCardTextWrapper: { marginLeft: 12, flex: 1 }, 
  unitAvatarCircle: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1, marginTop: 2 },
  unitCardRightSection: { alignItems: 'flex-end' },
  collaborationBadgeContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  collaborationMiniBadge: { fontSize: 10, color: '#22c55e', backgroundColor: '#052e16', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, overflow: 'hidden', fontWeight: '700', marginRight: 4, marginTop: 4 },
  inlineBadge: { backgroundColor: '#ce1126', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginLeft: 6 },
  inlineBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  unreadIndicatorBadge: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ce1126', marginTop: 6 },
  modalChatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, paddingBottom: 16 },
  modalCloseBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalCardWindow: { width: '85%', backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 }
});