import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../src/lib/supabaseClient';

interface IntercomCall {
  id: string;
  gate_name: string;
  unit_no: string;
  visitor_purpose: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'ESCALATED';
  created_at: string;
}

interface IntercomChat {
  id: number;
  user_id: string;
  created_at: string;
  target_building: string;
  channel: 'PMO_ADMIN';
  unreadCount: number;
  lastMessage: IntercomMessage | null;
}

interface IntercomMessage {
  id: number;
  chat_id: number;
  sender_type: string;
  message: string;
  created_at: string;
  operator_name: string | null;
  read_at: string | null;
  is_deleted: boolean;
}

interface ProfileInfo {
  name: string;
  unit: string;
  building: string;
  email: string;
}

export default function RealtimeIntercomMatrix({ condoId }: { condoId: string }) {
  const [activeTab, setActiveTab] = useState<'gate' | 'chat'>('gate');
  const [calls, setCalls] = useState<IntercomCall[]>([]);
  
  // Chat state
  const [chats, setChats] = useState<IntercomChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<IntercomMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [profilesMap, setProfilesMap] = useState<Record<string, ProfileInfo>>({});
  
  // Editing state
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');

  const activeChatIdRef = useRef<number | null>(null);
  const profilesMapRef = useRef<Record<string, ProfileInfo>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync refs with states to keep useEffect dependency constant size
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
    if (activeChatId) {
      fetchActiveChatMessages(activeChatId);
      markAsRead(activeChatId);
    }
  }, [activeChatId]);

  useEffect(() => {
    profilesMapRef.current = profilesMap;
  }, [profilesMap]);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auth and real-time setup
  useEffect(() => {
    const authenticateAndLoad = async () => {
      // 1. Authenticate using staff credentials so RLS policies allow reading chats/messages
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log("Logging in admin client to Supabase auth for RLS access...");
        await supabase.auth.signInWithPassword({
          email: 'solea.admin@filicondo.com',
          password: 'password123'
        });
      }
      
      // 2. Load initial data
      fetchLiveCalls();
      await fetchProfilesAndUnitsMap();
      fetchChats();
    };

    authenticateAndLoad();

    // ⚡ Realtime subscriptions (dependency array is constant size [])
    const gateChannel = supabase
      .channel('live-gate-intercom')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intercom_calls' }, () => {
        fetchLiveCalls();
      })
      .subscribe();

    const chatsChannel = supabase
      .channel('intercom-chats-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intercom_chats' }, () => {
        fetchChats();
      })
      .subscribe();

    const messagesChannel = supabase
      .channel('intercom-messages-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intercom_messages' }, (payload) => {
        fetchChats(); // refresh last message snippets and unread badges
        
        const newMsg = payload.new as any;
        const oldMsg = payload.old as any;
        const msgChatId = newMsg?.chat_id || oldMsg?.chat_id;
        
        if (msgChatId === activeChatIdRef.current) {
          fetchActiveChatMessages(msgChatId);
          if (newMsg && newMsg.sender_type === 'RESIDENT' && !newMsg.read_at) {
            markAsRead(msgChatId);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(gateChannel);
      supabase.removeChannel(chatsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, []);

  const fetchLiveCalls = async () => {
    const { data } = await supabase
      .from('intercom_calls')
      .select('*')
      .in('status', ['PENDING', 'ESCALATED'])
      .order('created_at', { ascending: false });
    if (data) setCalls(data);
  };

  const fetchProfilesAndUnitsMap = async () => {
    try {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, email');
      const { data: userUnits } = await supabase.from('user_units').select(`
        user_id,
        units (
          unit_number,
          building_no
        )
      `);
      
      const map: Record<string, ProfileInfo> = {};
      
      // Default fallback for canonical PMO manager ID
      map['00000000-0000-0000-0000-000000000002'] = {
        name: 'PMO Office',
        unit: 'HQ',
        building: 'HQ',
        email: 'pmo@filicondo.com'
      };
      map['66dcdab9-091a-440f-a871-fe2133c1813e'] = {
        name: 'PMO Office',
        unit: 'HQ',
        building: 'HQ',
        email: 'pmo@filicondo.com'
      };

      if (profiles) {
        profiles.forEach(p => {
          const uu = userUnits?.find((u: any) => u.user_id === p.id);
          const unitData = uu?.units as any;
          map[p.id] = {
            name: p.full_name || 'Resident',
            unit: unitData?.unit_number || 'N/A',
            building: unitData?.building_no || 'N/A',
            email: p.email || ''
          };
        });
      }
      setProfilesMap(map);
    } catch (err) {
      console.error("Error creating profiles mapping:", err);
    }
  };

  const fetchChats = async () => {
    // Only query chats where channel = 'PMO_ADMIN' (Resident-to-PMO)
    const { data: chatData, error: chatErr } = await supabase
      .from('intercom_chats')
      .select('*')
      .eq('channel', 'PMO_ADMIN')
      .order('created_at', { ascending: false });

    if (chatErr) {
      console.error("Error fetching chats:", chatErr);
      return;
    }

    const chatsWithMetadata = await Promise.all((chatData || []).map(async (chat) => {
      // Get last message snippet
      const { data: msgs } = await supabase
        .from('intercom_messages')
        .select('*')
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: false })
        .limit(1);

      const lastMsg = msgs && msgs[0] ? msgs[0] : null;

      // Get count of unread resident messages
      const { count } = await supabase
        .from('intercom_messages')
        .select('*', { count: 'exact', head: true })
        .eq('chat_id', chat.id)
        .eq('sender_type', 'RESIDENT')
        .is('read_at', null);

      return {
        ...chat,
        lastMessage: lastMsg,
        unreadCount: count || 0
      } as IntercomChat;
    }));

    setChats(chatsWithMetadata);
  };

  const fetchActiveChatMessages = async (chatId: number) => {
    const { data, error } = await supabase
      .from('intercom_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
    
    if (!error && data) {
      setMessages(data);
    }
  };

  const markAsRead = async (chatId: number) => {
    await supabase
      .from('intercom_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('chat_id', chatId)
      .eq('sender_type', 'RESIDENT')
      .is('read_at', null);
  };

  const handleRemoteOverride = async (id: string, decision: 'APPROVED' | 'DENIED') => {
    const { error } = await supabase
      .from('intercom_calls')
      .update({ status: decision, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (!error) alert(`Remote override successful: ${decision}`);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChatId) return;

    const textToSend = newMessage.trim();
    setNewMessage('');

    const { error } = await supabase
      .from('intercom_messages')
      .insert({
        chat_id: activeChatId,
        sender_type: 'PMO',
        message: textToSend,
        operator_name: 'PMO Office',
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message: " + error.message);
    } else {
      fetchActiveChatMessages(activeChatId);

      // Dispatch push notification to resident
      const currentChat = chats.find(c => c.id === activeChatId);
      const residentUserId = currentChat?.user_id;
      if (residentUserId) {
        await supabase
          .from('notifications')
          .insert({
            user_id: residentUserId,
            title: 'PMO Office Reply 💬',
            message: textToSend,
            type: 'RESIDENT',
            created_at: new Date().toISOString()
          });
      }
    }
  };

  const handleStartEdit = (msg: IntercomMessage) => {
    setEditingMessageId(msg.id);
    setEditText(msg.message);
  };

  const handleSaveEdit = async (id: number) => {
    if (!editText.trim()) return;

    // Enforce editing only unread messages
    const { error } = await supabase
      .from('intercom_messages')
      .update({ message: editText.trim() })
      .eq('id', id)
      .is('read_at', null);

    if (error) {
      alert("Failed to edit message. (Only unread messages can be edited)");
    } else {
      setEditingMessageId(null);
      if (activeChatId) fetchActiveChatMessages(activeChatId);
    }
  };

  const handleDeleteMessage = async (id: number) => {
    if (!confirm("Are you sure you want to delete this message?")) return;

    // Enforce deleting only unread messages
    const { error } = await supabase
      .from('intercom_messages')
      .update({ is_deleted: true, message: 'This message was deleted by PMO.' })
      .eq('id', id)
      .is('read_at', null);

    if (error) {
      alert("Failed to delete message. (Only unread messages can be deleted)");
    } else {
      if (activeChatId) fetchActiveChatMessages(activeChatId);
    }
  };

  const getChatTitle = (chat: IntercomChat) => {
    const prof = profilesMapRef.current[chat.user_id];
    if (prof) {
      return `Unit ${prof.unit} (${prof.name})`;
    }
    return `Unit ${chat.target_building || 'Unknown'} (Resident)`;
  };

  const hasEscalatedCall = calls.some(c => c.status === 'ESCALATED');

  // Filter chats based on query
  const filteredChats = chats.filter(chat => {
    const title = getChatTitle(chat).toLowerCase();
    const prof = profilesMapRef.current[chat.user_id];
    const matchSearch = title.includes(searchQuery.toLowerCase()) || 
      (prof && prof.email.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchSearch;
  });

  const totalChatUnreads = chats.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <div className="w-full">
      {/* Tab Selectors */}
      <div className="flex gap-4 mb-6 border-b border-slate-100 pb-4">
        <button
          onClick={() => setActiveTab('gate')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'gate'
              ? 'bg-[#0038a8] text-white shadow-md'
              : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
          }`}
        >
          Gate Entry Control Matrix
          {calls.length > 0 && (
            <span className="bg-[#ce1126] text-white text-xs font-black px-2 py-0.5 rounded-full">
              {calls.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'chat'
              ? 'bg-[#0038a8] text-white shadow-md'
              : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
          }`}
        >
          Resident Support Messenger
          {totalChatUnreads > 0 && (
            <span className="bg-[#ce1126] text-white text-xs font-black px-2 py-0.5 rounded-full animate-pulse">
              {totalChatUnreads}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Gatehouse Entry Control */}
      {activeTab === 'gate' && (
        <div className={`p-6 rounded-2xl border transition-all duration-500 ${hasEscalatedCall ? 'bg-rose-50 border-rose-300 animate-pulse' : 'bg-white border-slate-200'}`}>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                Gatehouse Intercom Control Matrix
                {hasEscalatedCall && <span className="text-xs bg-[#ce1126] text-white font-black px-2 py-1 rounded animate-bounce">CRITICAL OVERRIDE REQUIRED</span>}
              </h3>
              <p className="text-xs text-slate-500">Real-time surveillance of guard-to-resident communication thresholds.</p>
            </div>
            <div className="flex gap-2">
              <span className="text-xs bg-slate-100 px-3 py-1.5 rounded-full font-bold text-slate-600">Active Streams: {calls.length}</span>
            </div>
          </div>

          {calls.length === 0 ? (
            <div className="border border-dashed p-12 text-center rounded-xl text-slate-400 bg-slate-50/50">
              All entry points clear. Guards are processing traffic smoothly.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {calls.map(call => (
                <div 
                  key={call.id} 
                  className={`p-5 rounded-xl border transition-all ${
                    call.status === 'ESCALATED' 
                      ? 'bg-white border-rose-400 shadow-lg shadow-rose-100 ring-2 ring-rose-500 ring-opacity-50' 
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className={`text-xs font-black px-2 py-0.5 rounded uppercase ${call.status === 'ESCALATED' ? 'bg-[#ce1126] text-white' : 'bg-amber-100 text-amber-800'}`}>
                        {call.status === 'ESCALATED' ? 'ESCALATED TO PMO' : 'GUARD PENDING'}
                      </span>
                      <h4 className="text-xl font-black text-slate-800 mt-2">Unit {call.unit_no}</h4>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">{call.gate_name}</span>
                  </div>

                  <div className="bg-white/80 border p-3 rounded-lg mb-4">
                    <TextLabel label="Purpose" value={call.visitor_purpose} />
                    <TextLabel label="Call Initiated" value={new Date(call.created_at).toLocaleTimeString()} />
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleRemoteOverride(call.id, 'APPROVED')}
                      className="flex-1 bg-emerald-600 text-white font-bold py-2 rounded-lg text-xs hover:bg-emerald-700 transition"
                    >
                      Bypass & Approve
                    </button>
                    <button 
                      onClick={() => handleRemoteOverride(call.id, 'DENIED')}
                      className="flex-1 bg-slate-200 text-slate-700 font-bold py-2 rounded-lg text-xs hover:bg-slate-300 transition"
                    >
                      Deny Entry
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: PMO Support Messenger */}
      {activeTab === 'chat' && (
        <div className="flex bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm h-[650px]">
          {/* Sidebar - Chats List */}
          <div className="w-1/3 border-r border-slate-100 flex flex-col h-full bg-slate-50/50">
            {/* Sidebar Header Filters */}
            <div className="p-4 border-b border-slate-100 bg-white flex flex-col gap-3">
              <input
                type="text"
                placeholder="Search by unit or resident..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#0038a8] transition"
              />
            </div>

            {/* Sidebar Scroll List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredChats.length === 0 ? (
                <div className="text-center text-xs text-slate-400 py-12">
                  No active channels found.
                </div>
              ) : (
                filteredChats.map(chat => {
                  const title = getChatTitle(chat);
                  const isSelected = activeChatId === chat.id;

                  return (
                    <button
                      key={chat.id}
                      onClick={() => setActiveChatId(chat.id)}
                      className={`w-full text-left p-3 rounded-xl transition flex items-start justify-between gap-3 ${
                        isSelected 
                          ? 'bg-blue-50/70 border-l-4 border-[#0038a8]' 
                          : 'hover:bg-slate-100/50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className="font-bold text-slate-800 text-sm truncate">{title}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 border border-teal-200`}>
                            Resident
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 truncate">
                          {chat.lastMessage 
                            ? (chat.lastMessage.is_deleted ? 'Message deleted' : chat.lastMessage.message) 
                            : 'No messages yet...'}
                        </p>
                      </div>
                      
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="text-[10px] text-slate-400 font-mono">
                          {chat.lastMessage 
                            ? new Date(chat.lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                            : ''}
                        </span>
                        {chat.unreadCount > 0 && (
                          <span className="bg-[#ce1126] text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                            {chat.unreadCount}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Chat Pane */}
          <div className="w-2/3 flex flex-col h-full bg-slate-50/20">
            {activeChatId === null ? (
              // Empty State
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
                <h4 className="text-base font-bold text-slate-700">Resident Support Center</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-xs text-center">
                  Select a resident conversation from the list to start messaging.
                </p>
              </div>
            ) : (
              // Active Conversation
              <>
                {/* Chat Pane Header */}
                {(() => {
                  const activeChat = chats.find(c => c.id === activeChatId);
                  const prof = activeChat ? profilesMap[activeChat.user_id] : null;
                  return (
                    <div className="p-4 border-b border-slate-100 bg-white flex items-center justify-between shadow-sm">
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">
                          {activeChat ? getChatTitle(activeChat) : 'Resident Chat'}
                        </h4>
                        <p className="text-[10px] text-slate-400">
                          {prof ? `Email: ${prof.email} | Building: ${prof.building}` : 'FiliCondo Resident Gateway'}
                        </p>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full bg-teal-100 text-teal-800 border border-teal-200`}>
                        Resident
                      </span>
                    </div>
                  );
                })()}

                {/* Messages Scroll Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
                  {messages.map((msg) => {
                    const isResident = msg.sender_type === 'RESIDENT';
                    const isSentByMe = !isResident;
                    
                    // Format timestamp
                    const timeStr = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    
                    // Format display name
                    const senderName = isResident 
                      ? (profilesMap[chats.find(c => c.id === activeChatId)?.user_id || '']?.name || 'Resident') 
                      : (msg.operator_name || 'PMO Office');

                    const isEditableOrDeletable = isSentByMe && !msg.read_at && !msg.is_deleted;

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isSentByMe ? 'items-end' : 'items-start'}`}
                      >
                        {/* Sender Label */}
                        <span className="text-[10px] font-bold text-slate-400 mb-1 px-1.5">
                          {senderName}
                        </span>

                        {/* Message Bubble Wrapper */}
                        <div className="flex items-center gap-2 group max-w-[80%]">
                          {/* Left-side action buttons for sent messages */}
                          {isSentByMe && isEditableOrDeletable && (
                            <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                              <button
                                onClick={() => handleStartEdit(msg)}
                                title="Edit message"
                                className="px-1.5 py-0.5 hover:bg-slate-100 rounded text-[10px] font-bold text-slate-500"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteMessage(msg.id)}
                                title="Delete message"
                                className="px-1.5 py-0.5 hover:bg-rose-50 rounded text-[10px] font-bold text-rose-500"
                              >
                                Delete
                              </button>
                            </div>
                          )}

                          {/* Message Content Bubble */}
                          <div
                            className={`p-3 rounded-2xl shadow-sm text-xs ${
                              isSentByMe
                                ? 'bg-[#0038a8] text-white rounded-tr-none'
                                : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
                            }`}
                          >
                            {msg.is_deleted ? (
                              <span className="italic opacity-70">Message deleted</span>
                            ) : editingMessageId === msg.id ? (
                              // Inline Edit Input
                              <div className="flex flex-col gap-2 min-w-[200px]">
                                <input
                                  type="text"
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  className="w-full text-slate-800 p-1.5 rounded border border-slate-200 outline-none"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveEdit(msg.id);
                                    else if (e.key === 'Escape') setEditingMessageId(null);
                                  }}
                                />
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    onClick={() => setEditingMessageId(null)}
                                    className="text-[10px] bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded font-bold"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleSaveEdit(msg.id)}
                                    className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 rounded font-bold"
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <span>{msg.message}</span>
                            )}
                            
                            {/* Timestamp & read receipt */}
                            <div className="flex items-center justify-end gap-1 mt-1 opacity-70 text-[9px]">
                              <span>{timeStr}</span>
                              {msg.read_at && isSentByMe && <span>✓✓</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Send Bar */}
                <form
                  onSubmit={handleSendMessage}
                  className="p-3 border-t border-slate-100 bg-white flex gap-2 items-center"
                >
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                    placeholder="Type a reply to this resident..."
                    className="flex-1 text-xs px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-[#0038a8] transition"
                  />
                  <button
                    type="submit"
                    className="bg-[#0038a8] hover:bg-blue-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition shadow-md"
                  >
                    Send Reply
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TextLabel({ label, value }: { label: string, value: string }) {
  return (
    <div className="flex justify-between text-xs py-0.5">
      <span className="text-slate-400 font-medium">{label}</span>
      <span className="text-slate-700 font-bold">{value}</span>
    </div>
  );
}