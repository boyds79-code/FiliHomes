import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../src/lib/supabaseClient';

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

export default function StaffRadioMatrix({ condoId, department }: { condoId: string; department: 'SECURITY' | 'MAINTENANCE' | 'AMENITY' }) {
  const [chatId, setChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<IntercomMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  
  // Editing state
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  const chatIdRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync ref with state
  useEffect(() => {
    chatIdRef.current = chatId;
    if (chatId) {
      fetchMessages(chatId);
      markAsRead(chatId);
    }
  }, [chatId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load chat room and setup subscription
  useEffect(() => {
    const initRadio = async () => {
      // 1. Authenticate if needed for RLS
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log("Authenticating Supabase client for Staff Radio...");
        await supabase.auth.signInWithPassword({
          email: 'solea.admin@filihomes.com',
          password: 'password123'
        });
      }

      // 2. Fetch or create chat room for PMO canonical ID in this department channel
      const canonicalPmoId = '66dcdab9-091a-440f-a871-fe2133c1813e';
      let { data: chatRoom } = await supabase
        .from('intercom_chats')
        .select('id')
        .eq('user_id', canonicalPmoId)
        .eq('channel', department)
        .maybeSingle();

      if (!chatRoom) {
        const { data: newRoom } = await supabase
          .from('intercom_chats')
          .insert([{ 
            user_id: canonicalPmoId,
            target_building: 'Tower A',
            channel: department
          }])
          .select('id')
          .single();
        chatRoom = newRoom;
      }

      if (chatRoom) {
        setChatId(chatRoom.id);
      }
    };

    initRadio();

    // Realtime message listener
    const channel = supabase
      .channel(`staff-radio-${department}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intercom_messages' }, (payload) => {
        const newMsg = payload.new as any;
        const oldMsg = payload.old as any;
        const msgChatId = newMsg?.chat_id || oldMsg?.chat_id;

        if (msgChatId === chatIdRef.current) {
          fetchMessages(msgChatId);
          if (newMsg && newMsg.sender_type !== 'RESIDENT' && !newMsg.read_at) {
            markAsRead(msgChatId);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [department]);

  const fetchMessages = async (activeChatId: number) => {
    const { data } = await supabase
      .from('intercom_messages')
      .select('*')
      .eq('chat_id', activeChatId)
      .order('created_at', { ascending: true });
    
    if (data) setMessages(data);
  };

  const markAsRead = async (activeChatId: number) => {
    await supabase
      .from('intercom_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('chat_id', activeChatId)
      .neq('sender_type', 'RESIDENT')
      .is('read_at', null);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatId) return;

    const textToSend = newMessage.trim();
    setNewMessage('');

    // PMO acts as owner/resident in staff-to-pmo chat rooms
    const { error } = await supabase
      .from('intercom_messages')
      .insert({
        chat_id: chatId,
        sender_type: 'RESIDENT',
        message: textToSend,
        operator_name: 'PMO Office',
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error("Error sending radio signal:", error);
      alert("Transmission failed: " + error.message);
    } else {
      fetchMessages(chatId);

      // Dispatch push notification to all staffs in this department
      const staffRole = department === 'SECURITY' ? 'GUARD' : department === 'MAINTENANCE' ? 'TECHNICIAN' : 'AMENITY_STAFF';
      const { data: staffs } = await supabase
        .from('staff_profiles')
        .select('id')
        .eq('role', staffRole);

      if (staffs && staffs.length > 0) {
        const notificationInserts = staffs.map(staff => ({
          user_id: staff.id,
          title: `PMO Radio Dispatch 📻`,
          message: textToSend,
          type: 'STAFF',
          created_at: new Date().toISOString()
        }));

        await supabase
          .from('notifications')
          .insert(notificationInserts);
      }
    }
  };

  const handleStartEdit = (msg: IntercomMessage) => {
    setEditingMessageId(msg.id);
    setEditText(msg.message);
  };

  const handleSaveEdit = async (id: number) => {
    if (!editText.trim()) return;

    const { error } = await supabase
      .from('intercom_messages')
      .update({ message: editText.trim() })
      .eq('id', id)
      .is('read_at', null);

    if (error) {
      alert("Failed to edit transmission. (Only unread transmissions can be edited)");
    } else {
      setEditingMessageId(null);
      if (chatId) fetchMessages(chatId);
    }
  };

  const handleDeleteMessage = async (id: number) => {
    if (!confirm("Are you sure you want to delete this transmission?")) return;

    const { error } = await supabase
      .from('intercom_messages')
      .update({ is_deleted: true, message: 'This message was deleted by PMO.' })
      .eq('id', id)
      .is('read_at', null);

    if (error) {
      alert("Failed to delete transmission. (Only unread transmissions can be deleted)");
    } else {
      if (chatId) fetchMessages(chatId);
    }
  };

  const getHeaderDetails = () => {
    switch (department) {
      case 'SECURITY':
        return {
          title: 'Security Guard HQ Radio',
          sub: 'Internal Walkie-Talkie Link with Gatehouse & Lobby Guards',
          color: 'border-blue-200 bg-blue-50 text-blue-800'
        };
      case 'MAINTENANCE':
        return {
          title: 'Maintenance Tech HQ Radio',
          sub: 'Internal Engineering Dispatch Link with Maintenance Techs',
          color: 'border-amber-200 bg-amber-50 text-amber-800'
        };
      case 'AMENITY':
        return {
          title: 'Amenity Staff HQ Radio',
          sub: 'Internal Service Link with Pool & Gym Amenity Attendants',
          color: 'border-purple-200 bg-purple-50 text-purple-800'
        };
    }
  };

  const info = getHeaderDetails();

  return (
    <div className="flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm h-[650px] max-w-5xl mx-auto">
      {/* Radio Header */}
      <div className={`p-4 border-b flex items-center justify-between shadow-sm bg-white`}>
        <div>
          <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            {info.title}
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </h4>
          <p className="text-[10px] text-slate-500">{info.sub}</p>
        </div>
        <span className={`text-[10px] uppercase font-black px-2.5 py-1 rounded-full ${info.color}`}>
          Active Radio
        </span>
      </div>

      {/* Messages View Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/20">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <p className="text-xs">No radio transmissions yet. Open transmission channels clear.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isSentByMe = msg.sender_type === 'RESIDENT'; // PMO is the owner/resident in this channel
            const timeStr = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const senderName = isSentByMe ? 'PMO Office' : (msg.operator_name || 'Staff');
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

                {/* Bubble Container */}
                <div className="flex items-center gap-2 group max-w-[85%]">
                  {/* Action buttons */}
                  {isSentByMe && isEditableOrDeletable && (
                    <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                      <button
                        onClick={() => handleStartEdit(msg)}
                        title="Edit Transmission"
                        className="px-1.5 py-0.5 hover:bg-slate-100 rounded text-[10px] font-bold text-slate-500"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        title="Delete Transmission"
                        className="px-1.5 py-0.5 hover:bg-rose-50 rounded text-[10px] font-bold text-rose-500"
                      >
                        Delete
                      </button>
                    </div>
                  )}

                  {/* Bubble Content */}
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
                      // Inline edit
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

                    <div className="flex items-center justify-end gap-1 mt-1 opacity-70 text-[9px]">
                      <span>{timeStr}</span>
                      {msg.read_at && isSentByMe && <span>✓✓</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input transmission bar */}
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
          placeholder={`Transmit message to ${department === 'SECURITY' ? 'Security Guards' : department === 'MAINTENANCE' ? 'Maintenance Techs' : 'Amenity Staff'}...`}
          className="flex-1 text-xs px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:border-[#0038a8] transition"
        />
        <button
          type="submit"
          className="bg-[#0038a8] hover:bg-blue-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition shadow-md"
        >
          Transmit
        </button>
      </form>
    </div>
  );
}
