"use client";

import React, { useState, useEffect } from 'react';
import { 
  getAds, 
  getCondos, 
  getAdPayments, 
  recordAdPayment, 
  AdCampaign, 
  AdPayment 
} from '../src/lib/platformService';

interface AdvertiserManagerProps {
  advertiserName: string;
}

interface Message {
  id: string;
  sender: 'RESIDENT' | 'ADVERTISER';
  senderName: string;
  text: string;
  timestamp: string;
}

interface ChatRoom {
  id: string;
  residentName: string;
  residentUnit: string;
  lastMessage: string;
  messages: Message[];
  status: 'ACTIVE' | 'BLOCKED' | 'REPORTED';
}

export default function AdvertiserManager({ advertiserName }: AdvertiserManagerProps) {
  const [activeSubTab, setActiveSubTab] = useState<'preview' | 'messages' | 'billing' | 'coupons'>('preview');
  
  // Data states
  const [ads, setAds] = useState<AdCampaign[]>([]);
  const [condos, setCondos] = useState<{ id: string; name: string }[]>([]);
  const [adPayments, setAdPayments] = useState<AdPayment[]>([]);
  
  // Coupon states
  const [couponCode, setCouponCode] = useState('');
  const [redeemedCoupons, setRedeemedCoupons] = useState<any[]>([]);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  
  // Tab 1: Preview States
  const [selectedCondoId, setSelectedCondoId] = useState('');
  
  // Tab 2: Messages States (Inquiry Chat Hub)
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // Tab 3: Billing States
  const [payAmount, setPayAmount] = useState<number>(15000);
  const [payMethod, setPayMethod] = useState('Bank Transfer');
  const [payRefNo, setPayRefNo] = useState('');
  const [payReceiptUrl, setPayReceiptUrl] = useState('');
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [uploadedReceiptName, setUploadedReceiptName] = useState('');
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Initialize data
  const loadAdvertiserData = async () => {
    try {
      const allAds = await getAds();
      // Filter campaigns belonging to this advertiser (simulated match via title prefix or keyword)
      const myAds = allAds.filter(ad => 
        ad.title.toLowerCase().includes(advertiserName.toLowerCase().split(' ')[0]) || 
        ad.target_type === 'GLOBAL'
      );
      setAds(myAds);

      const allCondos = await getCondos();
      setCondos(allCondos);
      if (allCondos.length > 0) {
        setSelectedCondoId(allCondos[0].id);
      }

      const allPays = await getAdPayments();
      const myPays = allPays.filter(p => p.advertiser_name === advertiserName);
      setAdPayments(myPays);

      fetchRedeemedHistory();
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadAdvertiserData();
    
    // Seed initial mock chat rooms for advertiser direct inquiries
    setChatRooms([
      {
        id: 'chat-r1',
        residentName: 'Carlos Villa',
        residentUnit: 'Solea Residences, Bldg A Unit 302',
        lastMessage: 'Is the 50% discount applicable for existing fiber subscribers too?',
        status: 'ACTIVE',
        messages: [
          {
            id: 'm1',
            sender: 'RESIDENT',
            senderName: 'Carlos Villa',
            text: 'Hello, I saw your fiber internet promo banner on the condo app home screen.',
            timestamp: new Date(Date.now() - 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          },
          {
            id: 'm2',
            sender: 'RESIDENT',
            senderName: 'Carlos Villa',
            text: 'Is the 50% discount applicable for existing fiber subscribers too?',
            timestamp: new Date(Date.now() - 3400000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]
      },
      {
        id: 'chat-r2',
        residentName: 'Giselle Teng',
        residentUnit: 'Phili Tower, Floor 14 Unit A',
        lastMessage: 'I would like to apply for the promo contract, please send me the forms.',
        status: 'ACTIVE',
        messages: [
          {
            id: 'm3',
            sender: 'RESIDENT',
            senderName: 'Giselle Teng',
            text: 'I would like to apply for the promo contract, please send me the forms.',
            timestamp: new Date(Date.now() - 7200000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]
      }
    ]);
  }, [advertiserName]);

  // Actions
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedRoomId) return;

    setChatRooms(prev => prev.map(room => {
      if (room.id === selectedRoomId) {
        const newMsg: Message = {
          id: Math.random().toString(36).substring(2, 11),
          sender: 'ADVERTISER',
          senderName: advertiserName,
          text: replyText.trim(),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        return {
          ...room,
          lastMessage: newMsg.text,
          messages: [...room.messages, newMsg]
        };
      }
      return room;
    }));
    setReplyText('');
  };

  const handleRoomAction = (roomId: string, action: 'REPORTED' | 'BLOCKED') => {
    setChatRooms(prev => prev.map(room => 
      room.id === roomId ? { ...room, status: action } : room
    ));
    alert(`Chat thread has been ${action === 'BLOCKED' ? 'blocked' : 'reported'}.`);
  };

  const handleMockReceiptUpload = async () => {
    setUploadingReceipt(true);
    await new Promise(r => setTimeout(r, 1200));
    setUploadingReceipt(false);
    setUploadedReceiptName('advertiser_payment_receipt.png');
    setPayReceiptUrl('https://example.com/receipts/advertiser_transfer_proof.png');
  };

  const handleSubmitAdPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (payAmount <= 0 || !payReceiptUrl || !payRefNo.trim()) {
      alert("Please fill in billing details and upload the receipt.");
      return;
    }

    setSubmittingPayment(true);
    try {
      await recordAdPayment({
        advertiser_name: advertiserName,
        campaign_id: ads[0]?.id || null,
        amount: payAmount,
        payment_method: payMethod,
        receipt_url: payReceiptUrl,
        reference_no: payRefNo.trim(),
        status: 'PENDING',
        payment_date: new Date().toISOString()
      });

      setPayRefNo('');
      setUploadedReceiptName('');
      setPayReceiptUrl('');
      
      const allPays = await getAdPayments();
      const myPays = allPays.filter(p => p.advertiser_name === advertiserName);
      setAdPayments(myPays);
      
      alert("Payment proof uploaded successfully. Pending verification from HQ operators.");
    } catch (err) {
      console.error(err);
      alert("Failed to submit payment details.");
    } finally {
      setSubmittingPayment(false);
    }
  };

  const fetchRedeemedHistory = async () => {
    try {
      const res = await fetch(`/api/coupons?advertiserName=${encodeURIComponent(advertiserName)}`);
      if (res.ok) {
        const data = await res.json();
        setRedeemedCoupons(data || []);
      }
    } catch (err) {
      console.error("Error fetching redeemed history:", err);
    }
  };

  const redeemCouponCode = async (codeToRedeem: string) => {
    setRedeemLoading(true);
    setRedeemMsg(null);
    try {
      const response = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: codeToRedeem.trim(),
          advertiserName
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to redeem coupon');
      }

      setRedeemMsg({
        type: 'success',
        text: `Success! ${result.coupon?.title || 'Coupon'} has been successfully redeemed.`
      });
      setCouponCode('');
      fetchRedeemedHistory();
    } catch (err: any) {
      setRedeemMsg({
        type: 'error',
        text: err.message || 'Verification failed. Make sure it matches your business name.'
      });
    } finally {
      setRedeemLoading(false);
    }
  };

  const handleManualRedeem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;
    redeemCouponCode(couponCode);
  };

  const startScanner = async () => {
    try {
      const { Html5QrcodeScanner } = await import('html5-qrcode');
      setCameraActive(true);
      setRedeemMsg(null);
      
      setTimeout(() => {
        const scanner = new Html5QrcodeScanner(
          "qr-reader", 
          { fps: 10, qrbox: { width: 250, height: 250 } }, 
          /* verbose= */ false
        );
        
        scanner.render(
          async (decodedText) => {
            scanner.clear();
            setCameraActive(false);
            setCouponCode(decodedText);
            await redeemCouponCode(decodedText);
          }, 
          (error) => {
            // Scan errors are verbose, ignore them
          }
        );
        (window as any).html5QrcodeScanner = scanner;
      }, 500);
    } catch (err) {
      console.error("Html5Qrcode loading error:", err);
      alert("Failed to access camera: " + err);
    }
  };

  const stopScanner = () => {
    const scanner = (window as any).html5QrcodeScanner;
    if (scanner) {
      try {
        scanner.clear();
      } catch (e) {
        console.error(e);
      }
    }
    setCameraActive(false);
  };

  const selectedRoom = chatRooms.find(r => r.id === selectedRoomId);
  const selectedCondo = condos.find(c => c.id === selectedCondoId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in text-slate-800">
      
      {/* Top Profile Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl border border-slate-800">
        <div>
          <span className="bg-gradient-to-r from-blue-500 to-indigo-600 text-[10px] uppercase font-black px-2.5 py-1 rounded-full tracking-wider shadow">
            Advertiser Partner Console
          </span>
          <h2 className="text-3xl font-black mt-2 tracking-tight">📣 {advertiserName}</h2>
          <p className="text-sm text-slate-400 mt-1 max-w-xl font-medium">
            Manage your deployed ad campaigns, reply directly to residents' product inquiries, and submit invoice payments.
          </p>
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700/50 self-start md:self-center">
          <span className="block text-[9px] uppercase font-bold text-slate-400">Total Ad Footprint</span>
          <span className="text-xl font-black text-white">{condos.length} Condo Properties</span>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 gap-2 shrink-0 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveSubTab('preview')}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all shrink-0 ${
            activeSubTab === 'preview' 
              ? 'border-blue-700 text-blue-700' 
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          📱 Live Condo Ad Previews
        </button>
        <button
          onClick={() => setActiveSubTab('messages')}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all shrink-0 ${
            activeSubTab === 'messages' 
              ? 'border-blue-700 text-blue-700' 
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          💬 Direct Resident Inquiries ({chatRooms.filter(r => r.status === 'ACTIVE').length})
        </button>
        <button
          onClick={() => setActiveSubTab('billing')}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all shrink-0 ${
            activeSubTab === 'billing' 
              ? 'border-blue-700 text-blue-700' 
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          💳 Billing Profile & Payment
        </button>
        <button
          onClick={() => setActiveSubTab('coupons')}
          className={`px-5 py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all shrink-0 ${
            activeSubTab === 'coupons' 
              ? 'border-blue-700 text-blue-700' 
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          🎟️ Redeem Welcome Coupons
        </button>
      </div>

      {/* TAB 1: CONDO AD PREVIEW PREVIEW */}
      {activeSubTab === 'preview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
          
          {/* Controls column */}
          <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <h3 className="font-bold text-slate-800 text-base mb-1">🏢 Target Condo Switcher</h3>
              <p className="text-xs text-slate-400 font-semibold mb-4">Select a condo property to view how your campaign banner renders on the resident app.</p>
              
              <div className="space-y-2">
                {condos.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCondoId(c.id)}
                    className={`w-full text-left p-3.5 rounded-xl border text-xs font-bold transition flex items-center justify-between ${
                      selectedCondoId === c.id
                        ? 'border-blue-600 bg-blue-50/50 text-blue-700'
                        : 'border-slate-150 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span>🏢 {c.name}</span>
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-black border">ACTIVE</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5 space-y-3">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider text-slate-400">Campaign Stats</h4>
              <div className="bg-slate-50 border rounded-xl p-4 space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Active Banner:</span>
                  <span className="font-bold text-slate-800 truncate max-w-[150px]">{ads[0]?.title || 'Fiber Promo Campaign'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Daily Impressions:</span>
                  <span className="font-bold text-slate-800">1,240 views / day</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Click-Through Rate (CTR):</span>
                  <span className="font-black text-blue-700">4.8%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Device Mock Preview Column */}
          <div className="lg:col-span-2 flex justify-center">
            <div className="w-[360px] h-[720px] bg-slate-950 rounded-[40px] p-3 shadow-2xl border-4 border-slate-900 relative overflow-hidden shrink-0 flex flex-col">
              
              {/* Phone Speaker & Camera Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 h-5 w-32 bg-slate-950 rounded-b-2xl z-20 flex justify-center items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-800"></span>
                <span className="h-1 w-12 rounded bg-slate-800"></span>
              </div>

              {/* Screen Content Wrapper */}
              <div className="flex-1 bg-slate-50 rounded-[30px] overflow-hidden flex flex-col text-slate-800 select-none text-xs">
                
                {/* Header status bar */}
                <div className="h-8 bg-slate-900 text-white/90 px-6 flex justify-between items-center text-[10px] shrink-0 font-bold tracking-tight">
                  <span>9:41 AM</span>
                  <div className="flex items-center gap-1">
                    <span>📶</span>
                    <span>🔋</span>
                  </div>
                </div>

                {/* Simulated App Header */}
                <div className="h-14 bg-white border-b px-4 flex items-center justify-between shrink-0 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🏙️</span>
                    <div>
                      <h4 className="font-black text-[10px] text-slate-900 leading-none">FiliCondo Resident</h4>
                      <span className="text-[9px] text-slate-400 font-bold">{selectedCondo ? selectedCondo.name : 'Resident Home'}</span>
                    </div>
                  </div>
                  <span className="text-base cursor-pointer">🔔</span>
                </div>

                {/* Simulated Resident App Feed */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Quick features Grid */}
                  <div className="grid grid-cols-4 gap-2">
                    {['Visitor Pass', 'Billing', 'Job Order', 'Intercom'].map((feat, idx) => (
                      <div key={idx} className="bg-white border rounded-xl p-2.5 text-center shadow-sm flex flex-col items-center justify-center gap-1">
                        <span className="text-base">{idx === 0 ? '🎫' : idx === 1 ? '💵' : idx === 2 ? '👨‍🔧' : '📞'}</span>
                        <span className="text-[8px] font-bold text-slate-650 tracking-tight block">{feat}</span>
                      </div>
                    ))}
                  </div>

                  {/* ACTIVE ADVERTISER BANNER (The Core preview request) */}
                  <div className="bg-slate-900 rounded-xl overflow-hidden shadow-md border border-slate-850 flex flex-col relative group">
                    <div className="h-28 bg-slate-800 relative flex items-center justify-center overflow-hidden">
                      {ads[0]?.image_url ? (
                        <img 
                          src={ads[0].image_url} 
                          alt="Banner preview" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center p-4">
                          <span className="block text-2xl">📣</span>
                          <span className="text-[9px] text-slate-400 font-black uppercase mt-1">Mock Banner Image</span>
                        </div>
                      )}
                      
                      <div className="absolute top-2 right-2 bg-black/40 backdrop-blur-sm rounded px-1.5 py-0.5 text-[8px] text-white font-semibold">
                        Ad Campaign
                      </div>
                    </div>
                    <div className="p-3 bg-white flex justify-between items-center border-t">
                      <div>
                        <h5 className="font-black text-slate-800 text-[10px] leading-tight">{ads[0]?.title || 'Promo Offer'}</h5>
                        <p className="text-[8px] text-slate-400 font-bold mt-0.5">Click link to learn more</p>
                      </div>
                      
                      {/* Direct Inquiry Action Trigger Button */}
                      <button 
                        onClick={() => alert(`Direct Inquiry simulation:\n\nResident Carlos Villa initiates chat query with advertiser ${advertiserName} about the promo campaign.`)}
                        className="bg-blue-600 text-white text-[9px] font-black px-2.5 py-1.5 rounded-lg shadow-sm"
                      >
                        📩 Direct Inquiry
                      </button>
                    </div>
                  </div>

                  {/* Other Mock Feed Content */}
                  <div className="bg-white border rounded-xl p-4 shadow-xs space-y-2">
                    <h5 className="font-bold text-[10px] text-slate-800 uppercase tracking-wider text-slate-400">🛡️ Guard Sentry notice</h5>
                    <p className="text-[9px] text-slate-500 font-semibold leading-relaxed">
                      Lobby elevator maintenance scheduled tomorrow between 1:00 PM and 3:00 PM. Please plan accordingly.
                    </p>
                  </div>
                </div>

              </div>

            </div>
          </div>

        </div>
      )}

      {/* TAB 2: DIRECT INQUIRIES CHAT HUB */}
      {activeSubTab === 'messages' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden h-[600px] flex animate-fade-in">
          
          {/* Chat threads list */}
          <div className="w-80 border-r border-slate-100 flex flex-col shrink-0">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-sm">📥 Direct Messages</h3>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Inquiries from condo banner click-throughs</p>
            </div>
            
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {chatRooms.map(room => (
                <button
                  key={room.id}
                  onClick={() => setSelectedRoomId(room.id)}
                  className={`w-full text-left p-4 transition flex flex-col gap-1.5 ${
                    selectedRoomId === room.id ? 'bg-blue-50/40' : 'hover:bg-slate-50/40'
                  }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="font-bold text-xs text-slate-800">{room.residentName}</span>
                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                      room.status === 'ACTIVE' 
                        ? 'bg-emerald-100 text-emerald-800' 
                        : room.status === 'BLOCKED' 
                          ? 'bg-red-100 text-red-800' 
                          : 'bg-amber-100 text-amber-800'
                    }`}>
                      {room.status}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 font-semibold block truncate leading-none">{room.residentUnit}</span>
                  <p className="text-[10px] text-slate-500 font-medium truncate w-full mt-0.5">{room.lastMessage}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Active Chat room */}
          <div className="flex-1 flex flex-col bg-slate-50">
            {selectedRoom ? (
              <>
                {/* Chat Room Header */}
                <div className="h-16 bg-white border-b border-slate-100 px-6 flex justify-between items-center shrink-0 shadow-sm">
                  <div>
                    <h4 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                      <span>{selectedRoom.residentName}</span>
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    </h4>
                    <span className="text-[10px] text-slate-400 font-medium">{selectedRoom.residentUnit}</span>
                  </div>

                  <div className="flex gap-2">
                    {selectedRoom.status === 'ACTIVE' && (
                      <>
                        <button
                          onClick={() => handleRoomAction(selectedRoom.id, 'REPORTED')}
                          className="bg-amber-50 hover:bg-amber-100 border border-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg transition"
                        >
                          ⚠️ Report Abuse
                        </button>
                        <button
                          onClick={() => handleRoomAction(selectedRoom.id, 'BLOCKED')}
                          className="bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg transition"
                        >
                          ✕ Block User
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Messages Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {selectedRoom.messages.map((msg) => {
                    const isMe = msg.sender === 'ADVERTISER';
                    return (
                      <div 
                        key={msg.id} 
                        className={`flex flex-col max-w-[70%] ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                      >
                        <span className="text-[9px] text-slate-400 font-bold mb-1">{msg.senderName}</span>
                        <div className={`p-3.5 rounded-2xl text-xs font-semibold leading-relaxed shadow-sm ${
                          isMe 
                            ? 'bg-blue-600 text-white rounded-tr-none' 
                            : 'bg-white text-slate-850 rounded-tl-none border border-slate-100'
                        }`}>
                          {msg.text}
                        </div>
                        <span className="text-[8px] text-slate-400 font-medium mt-1">{msg.timestamp}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Message input */}
                {selectedRoom.status === 'ACTIVE' ? (
                  <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-100 bg-white flex gap-3 shrink-0">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={`Reply as ${advertiserName}...`}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition"
                      required
                    />
                    <button
                      type="submit"
                      className="bg-blue-700 hover:bg-blue-800 text-white px-5 rounded-xl text-xs font-bold uppercase tracking-wider transition"
                    >
                      Reply
                    </button>
                  </form>
                ) : (
                  <div className="p-4 border-t border-slate-100 bg-red-50/50 text-center text-xs font-bold text-red-750 shrink-0 select-none">
                    🔒 This conversation is restricted. Status: {selectedRoom.status}
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                <span className="text-3xl mb-2">💬</span>
                <p className="text-xs font-bold">Select an inquiry thread from the sidebar to chat with residents.</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* TAB 3: BILLING PROFILE & RECEIPT SUBMIT */}
      {activeSubTab === 'billing' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in">
          
          {/* Payment upload side */}
          <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm self-start">
            <h3 className="font-bold text-slate-800 text-lg pb-2 border-b border-slate-100 mb-4">
              💳 Upload Ad Invoice Payment
            </h3>
            
            <form onSubmit={handleSubmitAdPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Amount to Pay (PHP)
                </label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition font-bold"
                  required
                  min="1"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Payment Gateway
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none transition font-medium"
                >
                  <option value="G-Cash">GCash Transfer</option>
                  <option value="Bank Transfer">BDO Bank Transfer</option>
                  <option value="Cheque">Corporate Cheque</option>
                </select>
              </div>

              <div className="bg-blue-50 border border-blue-150 rounded-xl p-3.5 space-y-2 text-[10px] text-slate-700 leading-relaxed font-semibold">
                {payMethod === 'G-Cash' ? (
                  <>
                    📱 <strong>GCash Wallet Transfer Account:</strong><br />
                    GCash Account Number: <strong>0917-123-4567</strong><br />
                    Recipient Name: <strong>FiliCondo Billing Tech Inc.</strong>
                  </>
                ) : (
                  <>
                    🏦 <strong>BDO Settlement Account:</strong><br />
                    Bank: <strong>Banco de Oro (BDO)</strong><br />
                    Account Number: <strong>0012-8888-9999</strong><br />
                    Account Name: <strong>FiliCondo Technologies Inc.</strong>
                  </>
                )}
              </div>

              {/* Mock Dropzone Uploader */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 flex justify-between">
                  <span>Upload Payment Slip / Screenshot</span>
                </label>
                <div 
                  onClick={handleMockReceiptUpload}
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition flex flex-col items-center justify-center gap-1 ${
                    uploadingReceipt 
                      ? 'border-blue-500 bg-blue-50/50' 
                      : uploadedReceiptName 
                        ? 'border-emerald-500 bg-emerald-50/20' 
                        : 'border-slate-300 hover:border-blue-500 hover:bg-slate-100/50'
                  }`}
                >
                  {uploadingReceipt ? (
                    <span className="text-[10px] text-blue-700 font-bold animate-pulse">Uploading file...</span>
                  ) : uploadedReceiptName ? (
                    <>
                      <span className="text-xs font-bold text-emerald-800">✓ {uploadedReceiptName}</span>
                      <span className="text-[9px] text-slate-400">Click to change slip</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xs font-bold text-slate-600">Click to upload transaction slip</span>
                      <span className="text-[9px] text-slate-400">Supports PNG, JPG up to 5MB</span>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Transaction Reference No
                </label>
                <input
                  type="text"
                  value={payRefNo}
                  onChange={(e) => setPayRefNo(e.target.value)}
                  placeholder="Enter the 10-15 digit BDO/GCash Reference"
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none transition font-mono font-bold"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submittingPayment || !payReceiptUrl}
                className={`w-full bg-blue-700 text-white py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                  submittingPayment || !payReceiptUrl ? 'opacity-65 cursor-not-allowed' : 'hover:bg-blue-800'
                }`}
              >
                {submittingPayment ? 'Submitting...' : 'Upload Receipt Proof'}
              </button>
            </form>
          </div>

          {/* Payment ledger history */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm min-h-[400px]">
            <h3 className="font-bold text-slate-800 text-lg pb-2 border-b border-slate-100 mb-4">
              📊 Invoice Settlement Records
            </h3>

            {adPayments.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <p className="text-sm font-semibold">No invoices recorded for this profile.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-4">Receipt</th>
                      <th className="py-3 px-4">Method</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {adPayments.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {p.receipt_url ? (
                            <a href={p.receipt_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-bold">
                              📄 View Slip (Ref: {p.reference_no})
                            </a>
                          ) : (
                            <span className="text-slate-450 font-medium">Logged Offline</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-semibold">{p.payment_method}</td>
                        <td className="py-3 px-4 font-black text-slate-900">₱{p.amount.toLocaleString()}</td>
                        <td className="py-3 px-3 text-slate-400 font-semibold">{new Date(p.payment_date).toLocaleDateString()}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            p.status === 'APPROVED' || p.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800' 
                              : p.status === 'REJECTED' 
                                ? 'bg-red-100 text-red-800' 
                                : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

      {/* TAB 4: REDEEM WELCOME COUPONS */}
      {activeSubTab === 'coupons' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fade-in animate-duration-200">
          
          {/* Coupon scan / manual input side */}
          <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm self-start">
            <h3 className="font-bold text-slate-800 text-lg pb-2 border-b border-slate-100 mb-4">
              🎟️ Scan or Enter Coupon
            </h3>
            
            {cameraActive ? (
              <div className="space-y-4">
                <div id="qr-reader" className="w-full overflow-hidden rounded-xl border border-slate-200 bg-black"></div>
                <button
                  type="button"
                  onClick={stopScanner}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold p-2.5 rounded-xl transition text-xs font-black uppercase tracking-wider"
                >
                  ✕ Stop Camera
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={startScanner}
                className="w-full border-2 border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-100/50 text-blue-700 font-bold p-8 rounded-xl transition flex flex-col items-center justify-center gap-2"
              >
                <span className="text-3xl">📷</span>
                <span className="text-xs uppercase font-black tracking-wider">Start Camera Scanner</span>
                <span className="text-[10px] text-slate-400 font-semibold normal-case">Scan resident welcome coupon QR Code</span>
              </button>
            )}

            <div className="relative flex py-5 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-4 text-slate-400 text-[10px] font-black uppercase tracking-widest">or Enter Code Manually</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>
            
            <form onSubmit={handleManualRedeem} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Coupon Code
                </label>
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="e.g. WEL-GLB-A1B2C3D4"
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none transition font-mono font-bold"
                  required
                />
              </div>
              
              {redeemMsg && (
                <div className={`p-3 rounded-lg text-xs font-bold ${
                  redeemMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {redeemMsg.text}
                </div>
              )}
              
              <button
                type="submit"
                disabled={redeemLoading || !couponCode.trim()}
                className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold p-3 rounded-xl transition text-xs font-black uppercase tracking-wider disabled:opacity-50"
              >
                {redeemLoading ? 'Processing...' : 'Redeem Coupon'}
              </button>
            </form>
          </div>

          {/* Redeemed coupon ledger */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm min-h-[400px]">
            <h3 className="font-bold text-slate-800 text-lg pb-2 border-b border-slate-100 mb-4">
              📊 Redeemed Coupons History
            </h3>

            {redeemedCoupons.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <p className="text-sm font-semibold">No coupons redeemed yet by {advertiserName}.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] font-black text-slate-450 uppercase tracking-wider">
                      <th className="py-3 px-4">Coupon Offer</th>
                      <th className="py-3 px-4">Coupon Code</th>
                      <th className="py-3 px-4">Redeemed By</th>
                      <th className="py-3 px-4 text-right">Redeemed Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                    {redeemedCoupons.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50/50">
                        <td className="py-4 px-4 font-bold text-slate-800">
                          {c.title}
                          <span className="block text-[9px] font-semibold text-slate-400 mt-0.5">{c.description}</span>
                        </td>
                        <td className="py-4 px-4 text-slate-600 font-mono font-bold">{c.code}</td>
                        <td className="py-4 px-4 text-slate-900 font-bold">👤 {c.profiles?.full_name || 'Resident'}</td>
                        <td className="py-4 px-3 text-slate-400 text-right">
                          {c.redeemed_at ? new Date(c.redeemed_at).toLocaleString() : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
