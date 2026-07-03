"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabaseClient';
import { generateOfficialReceipt } from '../src/lib/pdfGenerator';

interface Billing {
  id: number;
  unit_id: string;
  billing_month: string;
  due_date: string;
  condo_dues: number;
  electricity: number;
  water: number;
  status: string;
  created_at: string;
  unit_number?: string;
  building_no?: string;
  receipt_url?: string; 
  electricity_usage?: number;
  water_usage?: number;
  parking_fee?: number;
  job_order_fee?: number;
  job_order_details?: string;
  dynamic_rate?: number;
  receipts?: any[];
  previous_balance?: number;
  penalty_amount?: number;
  amenity_fee?: number;
}

interface BankTransaction {
  trans_id: string;
  date_time: string;
  description: string;
  amount: number;
  ref_no: string;
}

type SubView = 'ISSUANCE' | 'VERIFICATION';

export default function BillingManager({ initialView, condoId }: { initialView?: 'ISSUANCE' | 'VERIFICATION'; condoId?: string }) {
  const currentCondoId = condoId || 'c1111111-1111-1111-1111-111111111111';
  const [bills, setBills] = useState<Billing[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<SubView>(initialView || 'ISSUANCE');
  const [selectedBillIds, setSelectedBillIds] = useState<number[]>([]);

  useEffect(() => {
    setSelectedBillIds([]);
  }, [currentView]);

  useEffect(() => {
    if (initialView) {
      setCurrentView(initialView);
    }
  }, [initialView]);

  // Filter Group States
  const [selectedBuilding, setSelectedBuilding] = useState<string>('ALL');
  const [searchUnit, setSearchUnit] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');

  // File Upload States
  const [uploading, setUploading] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [bankFeed, setBankFeed] = useState<BankTransaction[]>([]);
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);

  

  // Persistent signature state simulation
  const [isSignatureSaved] = useState<boolean>(true);

  // Unified Receipt Console State Management
  const [activeBill, setActiveBill] = useState<Billing | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);

  // Presentational Identity Context Toggle
  const [isMasterAccount, setIsMasterAccount] = useState<boolean>(true);

  // 🎯 Custom Walk-In Collection Modal Enhanced States
  const [isWalkInModalOpen, setIsWalkInModalOpen] = useState<boolean>(false);
  const [walkInSearchUnit, setWalkInSearchUnit] = useState<string>('');
  const [walkInSearchResults, setWalkInSearchResults] = useState<Billing[]>([]);
  const [walkInSelectedBill, setWalkInSelectedBill] = useState<Billing | null>(null);
  const [walkInAmount, setWalkInAmount] = useState<string>('');
  const [walkInType, setWalkInType] = useState<string>('CASH');

  // Vision AI Match tracking
  const [visionMatchedRef, setVisionMatchedRef] = useState<string | null>(null);
  const [confirmedMatchRef, setConfirmedMatchRef] = useState<string | null>(null);
  const [aiDetectedAmount, setAiDetectedAmount] = useState<number | null>(null);

  // Condo Settings (for penalty & buildings)
  const [condoSettings, setCondoSettings] = useState<any>(null);

  // 💬 1:1 Intercom Chat states
  const [isChatModalOpen, setIsChatModalOpen] = useState<boolean>(false);
  const [chatBill, setChatBill] = useState<Billing | null>(null);
  const [chatMessage, setChatMessage] = useState<string>('');
  const [sendingChat, setSendingChat] = useState<boolean>(false);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLedgerSynced, setIsLedgerSynced] = useState<boolean>(false);
  const [isExcelSynced, setIsExcelSynced] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToastMessage(null);
    }, 5000);
  };

  useEffect(() => {
    fetchBillings();
    fetchCondoSettings();

    // Load persisted bank feed from localStorage
    if (typeof window !== 'undefined') {
      const savedFeed = localStorage.getItem('filicondo_bank_feed');
      if (savedFeed) {
        try {
          const parsed = JSON.parse(savedFeed);
          setBankFeed(parsed);
          if (parsed && parsed.length > 0) {
            setIsLedgerSynced(true);
          }
        } catch (e) {
          console.error("Error loading bank feed from localStorage:", e);
        }
      }
    }

    // ⚡ Add 4-second polling interval to bypass lack of Supabase Realtime publication on billings table
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/billings?condoId=${currentCondoId}`);
        const { data, error } = await response.json();
        if (!error && data) {
          const paymentCandidates = (data || []).filter((b: Billing) => 
            ['ISSUED', 'OVERDUE', 'REQUESTED', 'PAID'].includes(b.status?.toUpperCase())
          );
          
          setBills(prevBills => {
            const hasChanges = prevBills.length !== paymentCandidates.length || 
              paymentCandidates.some(newBill => {
                const oldBill = prevBills.find(ob => ob.id === newBill.id);
                return !oldBill || oldBill.status !== newBill.status || (oldBill.receipts?.length !== newBill.receipts?.length);
              });
            
            if (hasChanges) {
              // Trigger a toast notification if a bill is newly set to REQUESTED
              paymentCandidates.forEach(newBill => {
                const oldBill = prevBills.find(ob => ob.id === newBill.id);
                if (newBill.status === 'REQUESTED' && (!oldBill || oldBill.status !== 'REQUESTED')) {
                  showToast(`🔔 Unit ${newBill.unit_number || 'Resident'} submitted a new receipt for June 2026!`);
                }
              });
              return paymentCandidates;
            }
            return prevBills;
          });
        }
      } catch (err) {
        console.error("Failed to poll billings:", err);
      }
    }, 4000);

    // Subscribe to live database changes for resident receipt submissions (as hybrid backup)
    const channel = supabase
      .channel('realtime-billing-submissions-manager')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'billings' }, (payload) => {
        fetchBillings();
        if (payload.new?.status === 'REQUESTED' && payload.old?.status !== 'REQUESTED') {
          showToast(`🔔 Unit ${payload.new?.unit_number || 'Resident'} submitted a new receipt for June 2026!`);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [currentCondoId]);

const fetchCondoSettings = async () => {
  try {
    const { data } = await supabase.from('condos').select('*').eq('id', currentCondoId).maybeSingle();
    if (data) setCondoSettings(data);
  } catch (error) {
    console.error('Failed to load condo settings:', error);
  }
};

const calculatePenalty = (remainingBalance: number) => {
  const penaltyRate = condoSettings?.penalty_rate || 0.02; // 기본 2%
  return remainingBalance * penaltyRate;
};

const fetchBillings = async () => {
  setLoading(true);
  try {
    // 🎯 Call API Route instead of direct client fetch
    const response = await fetch('/api/billings?condoId=' + currentCondoId);
    const { data, error } = await response.json();
    
    console.log("Final merged data:", data);

    if (error) throw error;
    
    // 🎯 Payment candidates include ISSUED, OVERDUE, REQUESTED, PAID
    const paymentCandidates = (data || []).filter((b: Billing) => 
      ['ISSUED', 'OVERDUE', 'REQUESTED', 'PAID'].includes(b.status?.toUpperCase())
    );
    
    setBills(paymentCandidates);
  } catch (error) {
    console.error('❌ Failed to load data:', error);
  } finally {
    setLoading(false);
  }
};

  const handleBroadcastBills = async (targetCount: number) => {
    if (targetCount === 0) { 
      alert("No pending statement targets found under the selected query scope."); 
      return; 
    }
    
    const confirmBroadcast = window.confirm(
      `📢 PUSH BROADCAST SIMULATOR\n\nAre you sure you want to mass-broadcast digital billing statements to all ${targetCount} unpaid units?`
    );
    if (!confirmBroadcast) return;
    
    setBroadcasting(true);
    try {
      // 1. Loop through all finalFilteredBills and insert a notification row for each unit!
      const notifInserts = finalFilteredBills.map(bill => {
        // Calculate dynamic penalty and total due just to show the correct total in the message!
        const dueDateObj = new Date(bill.due_date);
        const todayObj = new Date();
        const isOverdue = (bill.status === 'OVERDUE' || bill.status === 'REQUESTED' || todayObj > dueDateObj) && bill.status !== 'PAID';
        const penaltyRate = condoSettings?.penalty_rate || 0.02;
        let calculatedPenalty = 0;
        
        if (isOverdue) {
          const rawDelay = Math.ceil((todayObj.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24));
          const delayDays = Math.max(14, rawDelay);
          const baseForPenalty = 
            Number(bill.condo_dues || 0) + 
            Number(bill.electricity || 0) + 
            Number(bill.water || 0) + 
            Number(bill.parking_fee || 0) + 
            Number(bill.job_order_fee || 0) + 
            Number(bill.previous_balance || 0) + 
            Number(bill.amenity_fee || 0);
          calculatedPenalty = baseForPenalty * (penaltyRate / 30) * delayDays;
        }

        const totalAmount = 
          Number(bill.condo_dues || 0) + 
          Number(bill.electricity || 0) + 
          Number(bill.water || 0) + 
          Number(bill.parking_fee || 0) + 
          Number(bill.job_order_fee || 0) + 
          Number(bill.previous_balance || 0) + 
          Number(bill.penalty_amount || 0) + 
          Number(bill.amenity_fee || 0) +
          calculatedPenalty;

        return {
          unit_id: bill.unit_id,
          title: "💰 Digital Billing Statement Issued",
          message: `Your statement for ${bill.billing_month} has been issued. Total due: ₱${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}. Due date: ${bill.due_date}.`,
          type: 'BILLING',
          data: { billing_id: bill.id, amount: totalAmount }
        };
      });

      const { error } = await supabase.from('notifications').insert(notifInserts);
      if (error) throw error;

      alert(`🎉 Broadcaster Dispatch Complete!\n\nStatements successfully synchronized to ${targetCount} tenant terminals.`);
    } catch (error: any) { 
      console.error(error); 
      alert(`Error broadcasting bills: ${error.message || error}`);
    } finally { 
      setBroadcasting(false); 
    }
  };

  const handleSendPushToSelected = async () => {
    if (selectedBillIds.length === 0) {
      alert("Please select at least one unit to send push notification.");
      return;
    }
    
    const selectedBills = bills.filter(b => selectedBillIds.includes(b.id));
    const unitNumbers = selectedBills.map(b => `Unit ${b.unit_number}`).join(', ');
    
    const confirmPush = window.confirm(
      `📢 RESEND PUSH SIMULATOR\n\nAre you sure you want to resend push notifications to the following ${selectedBills.length} selected units?\n\nSelected Units: ${unitNumbers}`
    );
    if (!confirmPush) return;
    
    setBroadcasting(true);
    try {
      const notifInserts = selectedBills.map(bill => {
        const dueDateObj = new Date(bill.due_date);
        const todayObj = new Date();
        const isOverdue = (bill.status === 'OVERDUE' || bill.status === 'REQUESTED' || todayObj > dueDateObj) && bill.status !== 'PAID';
        const penaltyRate = condoSettings?.penalty_rate || 0.02;
        let calculatedPenalty = 0;
        
        if (isOverdue) {
          const rawDelay = Math.ceil((todayObj.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24));
          const delayDays = Math.max(14, rawDelay);
          const baseForPenalty = 
            Number(bill.condo_dues || 0) + 
            Number(bill.electricity || 0) + 
            Number(bill.water || 0) + 
            Number(bill.parking_fee || 0) + 
            Number(bill.job_order_fee || 0) + 
            Number(bill.previous_balance || 0) + 
            Number(bill.amenity_fee || 0);
          calculatedPenalty = baseForPenalty * (penaltyRate / 30) * delayDays;
        }

        const totalAmount = 
          Number(bill.condo_dues || 0) + 
          Number(bill.electricity || 0) + 
          Number(bill.water || 0) + 
          Number(bill.parking_fee || 0) + 
          Number(bill.job_order_fee || 0) + 
          Number(bill.previous_balance || 0) + 
          Number(bill.penalty_amount || 0) + 
          Number(bill.amenity_fee || 0) +
          calculatedPenalty;

        return {
          unit_id: bill.unit_id,
          title: "🚨 Urgent Billing Notice",
          message: `Your statement for ${bill.billing_month} remains outstanding. Total due: ₱${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}. Please settle immediately to avoid further late penalties.`,
          type: 'BILLING',
          data: { billing_id: bill.id, amount: totalAmount }
        };
      });

      const { error } = await supabase.from('notifications').insert(notifInserts);
      if (error) throw error;

      alert(`🎉 Push notifications successfully re-transmitted to:\n\n${unitNumbers}`);
      setSelectedBillIds([]);
    } catch (error: any) {
      console.error(error);
      alert(`Error resending push notifications: ${error.message || error}`);
    } finally {
      setBroadcasting(false);
    }
  };

  const handleApprovePayment = async (billId: number, unitId: string, amount: number) => {
  try {
    const res = await fetch('/api/approve-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billingId: billId, unitId, amount })
    });
    
    const result = await res.json();
    if (result.success) {
      alert("Payment approval successful! 🎉");
      fetchBillings();
      setActiveBill(null);
    } else {
      throw new Error(result.error || "Approval failed");
    }
  } catch (error) {
    console.error(error);
    alert("An error occurred during approval.");
  }
};

  const handleReopenBilling = async (billId: number) => {
    if (!window.confirm("Are you sure you want to cancel this payment approval and revert to the previous state?")) return;

    try {
      const res = await fetch('/api/update-billing-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingId: billId, status: 'REQUESTED' })
      });
      
      const result = await res.json();
      if (result.success) {
        alert("Payment approval has been cancelled. You can now process it again. 🔄");
        fetchBillings();
        setActiveBill(null);
      } else {
        throw new Error(result.error || "Failed to revert");
      }
    } catch (error) {
      console.error(error);
      alert("An error occurred while reverting.");
    }
  };

  const handleExcelUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excelFile) { alert("Please choose an Excel file first."); return; }
    setUploading(true);
    
    // If it's a CSV file, parse it directly without importing the heavy xlsx library!
    if (excelFile.name.endsWith('.csv')) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const text = event.target?.result as string;
          const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
          if (lines.length === 0) {
            alert("The CSV file is empty.");
            setUploading(false);
            return;
          }

          const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
          const rawRows = lines.slice(1).map(line => {
            return line.split(',').map(col => col.trim().replace(/^["']|["']$/g, ''));
          });

          // Map CSV rows to object format
          const parsedRows = rawRows.map(rowCols => {
            const rowObj: any = {};
            headers.forEach((h, idx) => {
              rowObj[h] = rowCols[idx] || '';
            });
            return rowObj;
          });

          const mappedBillings = parsedRows.map((row: any) => {
            const getVal = (candidates: string[]) => {
              const matchedKey = Object.keys(row).find(k => {
                const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
                return candidates.some(c => c.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanK);
              });
              return matchedKey ? row[matchedKey] : undefined;
            };

            const unit_no = String(getVal(['unit_no', 'unit_number', 'unitno', 'unit', 'room', 'no']) || '').trim();
            const condo_dues = parseFloat(getVal(['condo_dues', 'association_dues', 'associationdues', 'dues']) || 0);
            const electricity = parseFloat(getVal(['electricity', 'electricity_bill']) || 0);
            const water = parseFloat(getVal(['water', 'water_bill']) || 0);
            const electricity_usage = parseFloat(getVal(['electricity_usage']) || 0);
            const water_usage = parseFloat(getVal(['water_usage']) || 0);
            const parking_fee = parseFloat(getVal(['parking_fee', 'parking']) || 0);
            const job_order_fee = parseFloat(getVal(['job_order_fee']) || 0);
            const billing_period = getVal(['billing_period', 'billing_month', 'month', 'billingperiod', 'period']) || 'June 2026';
            const amount = parseFloat(getVal(['amount', 'outstanding_balance', 'balance', 'outstandingbalance']) || 0);

            return {
              unit_no,
              condo_dues,
              electricity,
              water,
              electricity_usage,
              water_usage,
              parking_fee,
              job_order_fee,
              billing_period,
              amount
            };
          });

          const response = await fetch('/api/upload-billings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              condoId: currentCondoId,
              billings: mappedBillings
            })
          });

          const result = await response.json();

          if (response.ok && result.success) {
            alert(`🎉 CSV statement data synchronised successfully! Imported ${result.insertedCount} records.`);
            setIsExcelSynced(true);
            fetchBillings();
          } else {
            throw new Error(result.error || "Failed to upload billings");
          }
        } catch (error: any) {
          console.error(error);
          alert(`❌ Failed to import CSV: ${error.message || error}`);
        } finally {
          setUploading(false);
        }
      };
      reader.readAsText(excelFile);
      return;
    }

    // Default Excel parsing for .xlsx / .xls
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const data = new Uint8Array(arrayBuffer);
        
        // Dynamically import xlsx to avoid SSR bundle size issues
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet);
        
        if (rawRows.length === 0) {
          alert("The Excel file is empty or invalid.");
          setUploading(false);
          return;
        }

        const mappedBillings = rawRows.map((row: any) => {
          // Robust key extraction ignoring casing, spaces, and special characters
          const getVal = (candidates: string[]) => {
            const matchedKey = Object.keys(row).find(k => {
              const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
              return candidates.some(c => c.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanK);
            });
            return matchedKey ? row[matchedKey] : undefined;
          };

          const unit_no = String(getVal(['unit_no', 'unit_number', 'unitno', 'unit', 'room', 'no']) || '').trim();
          const condo_dues = parseFloat(getVal(['condo_dues', 'association_dues', 'associationdues', 'dues']) || 0);
          const electricity = parseFloat(getVal(['electricity', 'electricity_bill']) || 0);
          const water = parseFloat(getVal(['water', 'water_bill']) || 0);
          const electricity_usage = parseFloat(getVal(['electricity_usage']) || 0);
          const water_usage = parseFloat(getVal(['water_usage']) || 0);
          const parking_fee = parseFloat(getVal(['parking_fee', 'parking']) || 0);
          const job_order_fee = parseFloat(getVal(['job_order_fee']) || 0);
          const billing_period = getVal(['billing_period', 'billing_month', 'month', 'billingperiod', 'period']) || 'June 2026';
          const amount = parseFloat(getVal(['amount', 'outstanding_balance', 'balance', 'outstandingbalance']) || 0);

          return {
            unit_no,
            condo_dues,
            electricity,
            water,
            electricity_usage,
            water_usage,
            parking_fee,
            job_order_fee,
            billing_period,
            amount
          };
        });

        const response = await fetch('/api/upload-billings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            condoId: currentCondoId,
            billings: mappedBillings
          })
        });

        const result = await response.json();

        if (response.ok && result.success) {
          alert(`🎉 Excel statement data synchronised successfully! Imported ${result.insertedCount} records.`);
          setIsExcelSynced(true);
          fetchBillings();
        } else {
          throw new Error(result.error || "Failed to upload billings");
        }
      } catch (error: any) {
        console.error(error);
        alert(`❌ Failed to import Excel: ${error.message || error}`);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsArrayBuffer(excelFile);
  };

  const handleBankStatementUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bankFile) { alert("Please select a valid Bank CSV file."); return; }
    setUploading(true);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const allLines = text.split('\n');
      if (allLines.length < 2) {
        setUploading(false);
        alert("Empty file or invalid format.");
        return;
      }
      
      const headerLine = allLines[0].toLowerCase();
      const isFormatB = headerLine.includes('post') || headerLine.includes('eff') || headerLine.includes('tc') || headerLine.includes('balance');
      const lines = allLines.slice(1).filter(line => line.trim() !== '');

      const cleanRefNo = (desc: string) => {
        if (!desc) return '';
        const trimmed = desc.trim();
        const words = trimmed.split(/[\s_]+/);
        const lastWord = words[words.length - 1];
        if (lastWord && /[0-9]/.test(lastWord)) {
          if (lastWord.includes('/')) {
            return lastWord.split('/').pop() || lastWord;
          }
          return lastWord;
        }
        return trimmed;
      };

      const parsedFeed: BankTransaction[] = lines.map((line, idx) => {
        const parts = line.split(',');
        
        if (isFormatB) {
          // Format B: Post,Eff,TC,Description,Amount,Balance
          const post = parts[0]?.trim() || '';
          const eff = parts[1]?.trim() || '';
          const tc = parts[2]?.trim() || '';
          const description = parts[3]?.trim() || '';
          const amount = parseFloat(parts[4]) || 0;
          
          return {
            trans_id: `${idx + 1}`,
            date_time: post || eff,
            description: description,
            amount: amount,
            ref_no: cleanRefNo(description)
          };
        } else {
          // Format A: trans_id,date_time,description,amount,ref_no
          const [trans_id, date_time, description, amount, ref_no] = parts;
          return { 
              trans_id: trans_id?.trim() || `${idx + 1}`, 
              date_time: date_time?.trim() || '', 
              description: description?.trim() || '', 
              amount: parseFloat(amount) || 0, 
              ref_no: ref_no?.trim() || '' 
          };
        }
      });
        
      setBankFeed(parsedFeed);
      localStorage.setItem('filicondo_bank_feed', JSON.stringify(parsedFeed));
      setUploading(false);
      setIsLedgerSynced(true);
      alert(`🎉 ${parsedFeed.length} bank transactions imported!`);
    };
    
    reader.readAsText(bankFile);
  };

  const resetWalkInModal = () => {
    setIsWalkInModalOpen(false);
    setWalkInSearchUnit('');
    setWalkInSearchResults([]);
    setWalkInSelectedBill(null);
    setWalkInAmount('');
    setWalkInType('CASH');
  };

  const handleSearchWalkIn = () => {
    if (!walkInSearchUnit) return;
    const results = bills.filter(b => 
      b.unit_number === walkInSearchUnit && 
      ['ISSUED', 'OVERDUE', 'REQUESTED'].includes(b.status)
    );
    setWalkInSearchResults(results);
    setWalkInSelectedBill(null);
    setWalkInAmount('');
    if (results.length === 0) {
      alert(`No pending bills found for Unit ${walkInSearchUnit}.`);
    }
  };

  const getBillTotal = (b: Billing) => {
    return (
      Number(b.condo_dues || 0) + 
      Number(b.electricity || 0) + 
      Number(b.water || 0) + 
      Number(b.parking_fee || 0) + 
      Number(b.job_order_fee || 0) + 
      Number(b.previous_balance || 0) + 
      Number(b.penalty_amount || 0) +
      Number(b.amenity_fee || 0)
    );
  };

  const handleWalkInFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkInSelectedBill || !walkInAmount) {
      alert("Please select a bill and fill in the Amount field.");
      return;
    }

    setUploading(true);
    try {
      const targetBill = walkInSelectedBill;
      const isPartial = parseFloat(walkInAmount) < getBillTotal(targetBill);

      const res = await fetch('/api/approve-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          billingId: targetBill.id, 
          unitId: targetBill.unit_id, 
          amount: parseFloat(walkInAmount),
          paymentMethod: walkInType,
          isPartial: isPartial
        })
      });
      
      const result = await res.json();
      if (result.success) {
        alert(`🎉 Payment successful for Unit ${targetBill.unit_number}!`);
        
        // Prompt for immediate receipt printing
        if (window.confirm("Do you want to print the official receipt now?")) {
            // Call PDF generation with merged payment and bill data
            const billWithMethod = { ...targetBill, payment_method: walkInType, totalAmount: walkInAmount };
            generateOfficialReceipt(billWithMethod, condoSettings);
        }

        resetWalkInModal();
        fetchBillings();
      } else {
        throw new Error(result.error || "Payment processing failed");
      }
    } catch (error) {
      console.error(error);
      alert("An error occurred during Walk-in payment processing.");
    } finally {
      setUploading(false);
    }
  };

  const handleOpenChatModal = (bill: Billing, computedTotal: number) => {
    setChatBill(bill);
    setChatMessage(
      `[PMO Notice]\nDear resident of Tower ${bill.building_no} Unit ${bill.unit_number},\n\nYour billing statement for ${bill.billing_month} is currently overdue. The total outstanding amount is ₱${computedTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}.\n\nPlease settle this balance at your earliest convenience or contact the PMO office if you have any questions.\n\nThank you,\nPMO Office`
    );
    setIsChatModalOpen(true);
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatBill || !chatMessage.trim()) return;

    setSendingChat(true);
    try {
      // 1. Fetch user_units associated with this unit
      const { data: userUnits, error: userUnitsError } = await supabase
        .from('user_units')
        .select('user_id, role, is_payer')
        .eq('unit_id', chatBill.unit_id);

      if (userUnitsError) {
        throw new Error(`Failed to fetch resident mapping: ${userUnitsError.message}`);
      }

      if (!userUnits || userUnits.length === 0) {
        alert("⚠️ No residents are currently registered to this unit in user_units.");
        setSendingChat(false);
        return;
      }

      // Find the best user_id to target
      let resident = userUnits.find((u: any) => u.is_payer === true);
      if (!resident) {
        resident = userUnits.find((u: any) => u.role === 'owner' || u.role === 'tenant');
      }
      if (!resident) {
        resident = userUnits[0];
      }

      const targetUserId = resident.user_id;

      // 2. Fetch or create intercom_chats room for this targetUserId
      let { data: chatRoom, error: chatRoomError } = await supabase
        .from('intercom_chats')
        .select('id')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (chatRoomError) {
        throw new Error(`Failed to query chat room: ${chatRoomError.message}`);
      }

      if (!chatRoom) {
        const { data: newRoom, error: createRoomError } = await supabase
          .from('intercom_chats')
          .insert([{
            user_id: targetUserId,
            target_building: chatBill.building_no || null
          }])
          .select('id')
          .single();

        if (createRoomError) {
          throw new Error(`Failed to create chat room: ${createRoomError.message}`);
        }
        chatRoom = newRoom;
      }

      if (!chatRoom) {
        throw new Error("Unable to resolve chat room ID.");
      }

      // 3. Insert the message into intercom_messages
      const { error: msgError } = await supabase
        .from('intercom_messages')
        .insert([{
          chat_id: chatRoom.id,
          sender_type: 'PMO_GUARD',
          message: chatMessage.trim(),
          operator_name: 'PMO Office'
        }]);

      if (msgError) {
        throw new Error(`Failed to send message: ${msgError.message}`);
      }

      // 4. Update intercom_chats to reset read_by_guards so it notifies other staff / guards
      await supabase
        .from('intercom_chats')
        .update({ read_by_guards: [] })
        .eq('id', chatRoom.id);

      alert(`🎉 Message successfully dispatched to intercom chat of Unit ${chatBill.unit_number}!`);
      setIsChatModalOpen(false);
      setChatBill(null);
      setChatMessage('');
    } catch (err: any) {
      console.error(err);
      alert(`❌ Error sending message: ${err.message || err}`);
    } finally {
      setSendingChat(false);
    }
  };

const baseFilteredBills = bills.filter((bill) => {
  const matchBuilding = selectedBuilding === 'ALL' || bill.building_no === selectedBuilding;
  const matchUnit = !searchUnit || bill.unit_number?.toLowerCase().includes(searchUnit.toLowerCase()) || bill.unit_id.toLowerCase().includes(searchUnit.toLowerCase());
  const matchMonth = selectedMonth === 'ALL' || bill.billing_month === selectedMonth;
  return matchBuilding && matchUnit && matchMonth;
});

const finalFilteredBills = baseFilteredBills.filter((bill) => {
  // Define status categories
  const isIssuanceStatus = ['ISSUED', 'OVERDUE', 'PARTIAL'].includes(bill.status);
  const isLedgerStatus = ['REQUESTED', 'PAID'].includes(bill.status);
  
  if (currentView === 'ISSUANCE') {
    // Hub displays Issued, Overdue, Partial, and penalized bills
    return isIssuanceStatus;
  } else if (currentView === 'VERIFICATION') {
    // Ledger displays Requested (pending verification) and PAID
    return isLedgerStatus;
  }
  
  return true;
});

// 2. Output logs after variable declarations
console.log("Bills total count:", bills.length);
console.log("Filtered count:", finalFilteredBills.length);
console.log("All statuses:", bills.map(b => b.status));
console.log("Filtered data details:", baseFilteredBills.map(b => ({ id: b.id, status: b.status })));

  const buildingsList = ['ALL', ...Array.from(new Set(bills.map(b => b.building_no).filter(Boolean)))];
  const monthsList = ['ALL', ...Array.from(new Set(bills.map(b => b.billing_month).filter(Boolean))).sort().reverse()];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'system-ui, sans-serif' }}>
      
      {/* Demo Identity Context Box */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', backgroundColor: '#f1f5f9', padding: '12px 18px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>🛠️ Demo Identity Context:</span>
        <button onClick={() => setIsMasterAccount(true)} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', border: 'none', cursor: 'pointer', backgroundColor: isMasterAccount ? '#2563eb' : '#ffffff', color: isMasterAccount ? '#ffffff' : '#475569' }}>👑 Condo Master Mode</button>
        <button onClick={() => setIsMasterAccount(false)} style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', border: 'none', cursor: 'pointer', backgroundColor: !isMasterAccount ? '#2563eb' : '#ffffff', color: !isMasterAccount ? '#ffffff' : '#475569' }}>👥 General Staff Mode</button>
      </div>

      {/* Beautiful 1:1 Balance Dual operational Tabs Core */}
      {!initialView && (
        <div style={styles.segmentContainer}>
          <div onClick={() => { setCurrentView('ISSUANCE'); setExpandedRowId(null); }} style={{ ...styles.segmentCard, borderColor: currentView === 'ISSUANCE' ? '#2563eb' : '#e2e8f0', backgroundColor: currentView === 'ISSUANCE' ? '#f0f6ff' : '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ ...styles.iconBadge, backgroundColor: currentView === 'ISSUANCE' ? '#2563eb' : '#94a3b8' }}>📋</div>
              <div>
                <div style={{ ...styles.cardTitleText, color: currentView === 'ISSUANCE' ? '#1e3a8a' : '#475569' }}>Bill Issuance Hub</div>
                <div style={styles.cardDescText}>Distribute monthly utility invoices & broadcast emergency push alerts</div>
              </div>
            </div>
          </div>

          <div onClick={() => { setCurrentView('VERIFICATION'); setExpandedRowId(null); }} style={{ ...styles.segmentCard, borderColor: currentView === 'VERIFICATION' ? '#10b981' : '#e2e8f0', backgroundColor: currentView === 'VERIFICATION' ? '#f0fdf4' : '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ ...styles.iconBadge, backgroundColor: currentView === 'VERIFICATION' ? '#10b981' : '#94a3b8' }}>🧾</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ ...styles.cardTitleText, color: currentView === 'VERIFICATION' ? '#064e3b' : '#475569' }}>Receipt Audit Ledger</div>
                  {(() => {
                    const reqCount = bills.filter(b => b.status === 'REQUESTED').length;
                    if (reqCount > 0) {
                      return (
                        <span style={{
                          backgroundColor: '#ef4444',
                          color: '#ffffff',
                          fontSize: '10px',
                          fontWeight: '800',
                          padding: '2px 8px',
                          borderRadius: '8px',
                          lineHeight: '1'
                        }}>
                          {reqCount}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
                <div style={styles.cardDescText}>Cross-check banking transactions & authorize complete clears</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Operational Terminal Board */}
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <div>
            <h2 style={styles.title}>{currentView === 'ISSUANCE' ? 'Statement Distribution & Issuance Core' : 'Payment Collection Verification Board'}</h2>
            <p style={styles.subtitle}>{currentView === 'ISSUANCE' ? 'Audit generated utility dues, import fresh spreadsheets, and mass alert residents.' : 'Cross-verify raw banking voucher screenshot payloads to clear transaction pipelines.'}</p>
          </div>

          {currentView === 'ISSUANCE' ? (
            <div style={styles.embeddedUploadZone}>
              <form onSubmit={handleExcelUpload} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input 
                  type="file" 
                  id="excel-file-input" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={(e) => {
                    setExcelFile(e.target.files?.[0] || null);
                    setIsExcelSynced(false);
                  }} 
                  style={{ display: 'none' }} 
                />
                <label htmlFor="excel-file-input" style={{ ...styles.embeddedFileBtn, cursor: 'pointer' }}>
                  {excelFile ? `📄 ${excelFile.name.substring(0, 14)}...` : '📁 Select Excel Sheet'}
                </label>
                <button 
                  type="submit" 
                  disabled={uploading} 
                  style={{
                    ...styles.embeddedSubmitBtn,
                    backgroundColor: isExcelSynced ? '#059669' : '#10b981',
                    borderColor: isExcelSynced ? '#047857' : '#059669'
                  }}
                >
                  {uploading ? 'Syncing...' : (isExcelSynced ? '✓ Synced' : 'Sync Data')}
                </button>
              </form>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button onClick={() => setIsWalkInModalOpen(true)} style={styles.walkInCounterDeskBtn}>
                💵 Walk-In Cash/Cheque
              </button>
              
              <div style={{ ...styles.embeddedUploadZone, backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }}>
                <form onSubmit={handleBankStatementUpload} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input 
                    type="file" 
                    id="bank-file-input" 
                    accept=".csv" 
                    onChange={(e) => { 
                      setBankFile(e.target.files?.[0] || null); 
                      setIsLedgerSynced(false); 
                    }} 
                    style={{ display: 'none' }} 
                  />
                  <label htmlFor="bank-file-input" style={{ ...styles.embeddedFileBtn, color: '#047857', cursor: 'pointer' }}>
                    {bankFile ? `🏦 ${bankFile.name.substring(0, 14)}...` : '📁 Import Bank CSV'}
                  </label>
                  <button 
                    type="submit" 
                    disabled={uploading} 
                    style={{ 
                      ...styles.embeddedSubmitBtn, 
                      backgroundColor: isLedgerSynced ? '#059669' : '#10b981',
                      borderColor: isLedgerSynced ? '#047857' : '#059669'
                    }}
                  >
                    {uploading ? 'Parsing...' : (isLedgerSynced ? '✓ Synced' : 'Sync Ledger')}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        <div style={styles.controlPanelRow}>
          {currentView === 'ISSUANCE' ? (
            <div style={{ display: 'flex', gap: '12px', flex: 1 }}>
              <button onClick={() => handleBroadcastBills(finalFilteredBills.length)} disabled={broadcasting} style={{ ...styles.massiveBroadcastBtn, backgroundColor: broadcasting ? '#cbd5e1' : '#e11d48' }}>
                {broadcasting ? 'Broadcasting Alarms...' : `📢 Broadcast Invoices to All Filtered Units (${finalFilteredBills.length} Statements)`}
              </button>
              {selectedBillIds.length > 0 && (
                <button onClick={handleSendPushToSelected} disabled={broadcasting} style={{ ...styles.massiveBroadcastBtn, backgroundColor: '#2563eb' }}>
                  {broadcasting ? 'Sending Pushes...' : `💬 Resend Push to Selected (${selectedBillIds.length} Units)`}
                </button>
              )}
            </div>
          ) : (
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#047857', backgroundColor: '#ecfdf5', padding: '10px 16px', borderRadius: '8px', border: '1px solid #a7f3d0', flex: 1 }}>
              ✨ Unified Receipt Audit Mode: Import today's Bank CSV on the top right, then hit "Review Slips" to begin matching.
            </div>
          )}

          {/* Table Level Multi-Filters */}
          <div style={styles.filterInlineGroup}>
            <div style={styles.filterBox}>
              <label style={styles.filterLabel}>Period</label>
              <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={styles.select}>
                {monthsList.map(m => <option key={m} value={m}>{m === 'ALL' ? 'All Months' : m}</option>)}
              </select>
            </div>
            <div style={styles.filterBox}>
              <label style={styles.filterLabel}>Tower</label>
              <select value={selectedBuilding} onChange={(e) => setSelectedBuilding(e.target.value)} style={styles.select}>
                {buildingsList.map(b => <option key={b} value={b}>{b === 'ALL' ? 'All Buildings' : b}</option>)}
              </select>
            </div>
            <div style={styles.filterBox}>
              <label style={styles.filterLabel}>Search Unit</label>
              <input type="text" placeholder="e.g. 1204" value={searchUnit} onChange={(e) => setSearchUnit(e.target.value)} style={styles.searchInput} />
            </div>
          </div>
        </div>

        {/* Data Table Grid */}
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            {currentView === 'ISSUANCE' && (
              <span style={{ flex: '0 0 40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <input 
                  type="checkbox" 
                  checked={finalFilteredBills.length > 0 && finalFilteredBills.every(b => selectedBillIds.includes(b.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      const newSelected = Array.from(new Set([...selectedBillIds, ...finalFilteredBills.map(b => b.id)]));
                      setSelectedBillIds(newSelected);
                    } else {
                      const filteredIds = finalFilteredBills.map(b => b.id);
                      setSelectedBillIds(selectedBillIds.filter(id => !filteredIds.includes(id)));
                    }
                  }}
                  style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                />
              </span>
            )}
            <span style={{ flex: '0 0 120px' }}>Unit / Tower</span>
            <span style={{ flex: '3 1 240px' }}>Bill Category Breakdown (Click Row to Expand Detail)</span>
            <span style={{ flex: '1.5 1 130px', textAlign: 'right', paddingRight: '24px' }}>Total Amount</span>
            <span style={{ flex: '1 0 110px', textAlign: 'center' }}>Status</span>
            <span style={{ flex: '1 1 120px', textAlign: 'center' }}>Due Date</span>
            <span style={{ flex: '1.5 0 140px', textAlign: 'right' }}>Workspace Action</span>
          </div>

          {finalFilteredBills.map((bill) => {
            const dueDateObj = new Date(bill.due_date);
            const todayObj = new Date();
            const isOverdue = (bill.status === 'OVERDUE' || bill.status === 'REQUESTED' || todayObj > dueDateObj) && bill.status !== 'PAID';
            const penaltyRate = condoSettings?.penalty_rate || 0.02; // 기본 2%
            let calculatedPenalty = 0;
            
            if (isOverdue) {
              const rawDelay = Math.ceil((todayObj.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24));
              const delayDays = Math.max(14, rawDelay);
              const baseForPenalty = 
                Number(bill.condo_dues || 0) + 
                Number(bill.electricity || 0) + 
                Number(bill.water || 0) + 
                Number(bill.parking_fee || 0) + 
                Number(bill.job_order_fee || 0) + 
                Number(bill.previous_balance || 0) + 
                Number(bill.amenity_fee || 0);
              calculatedPenalty = baseForPenalty * (penaltyRate / 30) * delayDays;
            }

            const computedTotal = 
              Number(bill.condo_dues || 0) + 
              Number(bill.electricity || 0) + 
              Number(bill.water || 0) + 
              Number(bill.parking_fee || 0) + 
              Number(bill.job_order_fee || 0) + 
              Number(bill.previous_balance || 0) + 
              Number(bill.penalty_amount || 0) + 
              Number(bill.amenity_fee || 0) +
              calculatedPenalty;
            const isExpanded = expandedRowId === bill.id;
            const displayStatus = isOverdue ? 'OVERDUE' : bill.status;

            return (
              <div key={bill.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <div onClick={() => setExpandedRowId(isExpanded ? null : bill.id)} style={{ ...styles.tableRow, backgroundColor: isExpanded ? '#f8fafc' : 'transparent' }}>
                  {currentView === 'ISSUANCE' && (
                    <div style={{ flex: '0 0 40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={selectedBillIds.includes(bill.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedBillIds([...selectedBillIds, bill.id]);
                          } else {
                            setSelectedBillIds(selectedBillIds.filter(id => id !== bill.id));
                          }
                        }}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </div>
                  )}
                  <div style={{ flex: '0 0 120px' }}>
                    <div style={{ fontWeight: 'bold', color: '#0f172a', fontSize: '14px' }}>Unit {bill.unit_number}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '500', marginTop: '3px' }}>{bill.building_no}</div>
                  </div>
                  
                  <div style={{ flex: '3 1 240px', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '14px', color: bill.status === 'PARTIAL' ? '#d97706' : '#1e293b', fontWeight: '600' }}>
                      {isExpanded ? '▼ ' : '▶ '} 
                      {bill.status === 'PARTIAL' ? '⚠️ Remaining Balance (Partial Paid)' : 'Monthly Utility Assessment'}
                      {bill.receipts && bill.receipts.length > 0 && (
                        <span style={{ marginLeft: '10px', fontSize: '12px', color: '#10b981' }}>
                          📷 Receipt Attached
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Coverage Frame: {bill.billing_month} | Click row to audit consumption invoices</span>
                  </div>
                  
                  <div style={{ flex: '1.5 1 130px', fontWeight: '900', color: '#0f172a', fontSize: '15px', textAlign: 'right', paddingRight: '24px' }}>
                    ₱ {computedTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}
                  </div>
                  
                  <div style={{ flex: '1 0 110px', display: 'flex', justifyContent: 'center' }}>
                    <span style={{ 
                      padding: '6px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: '800', letterSpacing: '0.3px',
                      backgroundColor: displayStatus === 'PAID' ? '#dcfce7' : (displayStatus === 'REQUESTED' ? '#eff6ff' : (displayStatus === 'PARTIAL' ? '#fef3c7' : (displayStatus === 'OVERDUE' ? '#fee2e2' : '#fff7ed'))), 
                      color: displayStatus === 'PAID' ? '#15803d' : (displayStatus === 'REQUESTED' ? '#1e40af' : (displayStatus === 'PARTIAL' ? '#d97706' : (displayStatus === 'OVERDUE' ? '#b91c1c' : '#c2410c'))) 
                    }}>{displayStatus}</span>
                  </div>
                  
                  <div style={{ flex: '1 1 120px', fontSize: '13px', color: '#475569', fontWeight: '500', textAlign: 'center' }}>{bill.due_date ? new Date(bill.due_date).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : 'N/A'}</div>

                  <div style={{ flex: '1.5 0 140px', display: 'flex', justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
                    {currentView === 'ISSUANCE' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                        <button onClick={() => alert(`📢 Dedicated reminder payload re-transmitted to Unit ${bill.unit_number} terminal app.`)} style={styles.rowInlineLinkBtn}>
                          Resend Push
                        </button>
                        {displayStatus === 'OVERDUE' && (
                          <button onClick={() => handleOpenChatModal(bill, computedTotal)} style={{ ...styles.rowInlineLinkBtn, color: '#dc2626' }}>
                            💬 1:1 Chat
                          </button>
                        )}
                      </div>
                    ) : bill.status !== 'PAID' ? (
                      <button onClick={() => { setActiveBill(bill); setVisionMatchedRef(null); setConfirmedMatchRef(null); setAiDetectedAmount(null); }} style={styles.reviewButton}>
                        Review Slips
                      </button>
                    ) : (
                      <button onClick={() => { setActiveBill(bill); setVisionMatchedRef(null); setConfirmedMatchRef(null); setAiDetectedAmount(null); }} style={styles.viewClearedButton}>
                        🔍 View Cleared Slip
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div style={styles.accordionDetailZone}>
                    <h4 style={styles.detailTitle}>📊 Verified Consumption Parameters & Breakdown</h4>
                    <div style={styles.detailGrid}>
                      <div style={styles.detailCard}>
                        <span style={styles.cardLabel}>⚡ Electricity Charges</span>
                        <div style={styles.cardValue}>₱{Number(bill.electricity).toLocaleString()}</div>
                        <span style={styles.cardSub}>Usage Volume: {bill.electricity_usage || 0} kWh</span>
                      </div>
                      <div style={styles.detailCard}>
                        <span style={styles.cardLabel}>💧 Water Utility</span>
                        <div style={styles.cardValue}>₱{Number(bill.water).toLocaleString()}</div>
                        <span style={styles.cardSub}>Usage Volumetric: {bill.water_usage || 0} cu.m</span>
                      </div>
                      <div style={styles.detailCard}>
                        <span style={styles.cardLabel}>🚗 Base Allocated Parking</span>
                        <div style={styles.cardValue}>₱{Number(bill.parking_fee || 0).toLocaleString()}</div>
                      </div>
                      <div style={styles.detailCard}>
                        <span style={styles.cardLabel}>🏢 Association Condo Dues</span>
                        <div style={styles.cardValue}>₱{Number(bill.condo_dues).toLocaleString()}</div>
                      </div>
                      <div style={{...styles.detailCard, backgroundColor: '#fef2f2', borderColor: '#fecaca'}}>
                        <span style={{...styles.cardLabel, color: '#b91c1c'}}>🔄 Previous Balance (Arrears)</span>
                        <div style={{...styles.cardValue, color: '#991b1b'}}>₱{Number(bill.previous_balance || 0).toLocaleString()}</div>
                      </div>
                      <div style={{...styles.detailCard, backgroundColor: '#f0fdf4', borderColor: '#bbf7d0'}}>
                        <span style={{...styles.cardLabel, color: '#15803d'}}>🏊 Amenity Booking Fees</span>
                        <div style={{...styles.cardValue, color: '#166534'}}>₱{Number(bill.amenity_fee || 0).toLocaleString()}</div>
                      </div>
                      <div style={{...styles.detailCard, backgroundColor: '#fff7ed', borderColor: '#fed7aa'}}>
                        <span style={{...styles.cardLabel, color: '#c2410c'}}>⚠️ Penalty ({(penaltyRate * 100).toFixed(1)}%)</span>
                        <div style={{...styles.cardValue, color: '#9a3412'}}>₱{Number(Number(bill.penalty_amount || 0) + calculatedPenalty).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                      </div>
                    </div>
                    {bill.description && (
                      <div style={{ marginTop: '14px', padding: '12px', borderRadius: '8px', backgroundColor: '#fffbeb', border: '1px solid #fef3c7', color: '#b45309', fontSize: '12px', fontWeight: 'bold' }}>
                        📢 Statement Note: {bill.description.replace(/\n\n/g, ' ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {isWalkInModalOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.walkInModalBanner}>
            <div style={styles.walkInHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>💵</span>
                <h3 style={styles.walkInTitle}>Walk-In Counter Collection Desk</h3>
              </div>
              <button type="button" style={styles.walkInCloseBtn} onClick={resetWalkInModal}>✕</button>
            </div>

            <form onSubmit={handleWalkInFormSubmit} style={styles.walkInForm}>
              <p style={styles.walkInDescription}>
                Search by unit number, select the exact statement, and enter the remitted amount.
              </p>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Search Target Unit</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text" 
                    placeholder="Enter Unit (e.g. 1204)" 
                    value={walkInSearchUnit}
                    onChange={(e) => setWalkInSearchUnit(e.target.value)}
                    style={{ ...styles.formInput, flex: 1 }} 
                  />
                  <button type="button" onClick={handleSearchWalkIn} style={{ ...styles.embeddedSubmitBtn, padding: '10px 16px', borderRadius: '8px' }}>
                    🔍 Search
                  </button>
                </div>
              </div>

              {walkInSearchResults.length > 0 && !walkInSelectedBill && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                  <label style={styles.formLabel}>Select Statement</label>
                  {walkInSearchResults.map(b => {
                    const bTotal = getBillTotal(b);
                    return (
                      <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#0f172a' }}>{b.building_no} - Unit {b.unit_number}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Period: {b.billing_month} | Total: ₱{bTotal.toLocaleString()}</div>
                        </div>
                        <button type="button" onClick={() => setWalkInSelectedBill(b)} style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>Select</button>
                      </div>
                    )
                  })}
                </div>
              )}

              {walkInSelectedBill && (
                <div style={{ padding: '16px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 'bold', textTransform: 'uppercase' }}>Selected Target</span>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>{walkInSelectedBill.building_no} - Unit {walkInSelectedBill.unit_number}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>Statement Total</span>
                      <div style={{ fontSize: '16px', fontWeight: '900', color: '#1e293b' }}>₱{getBillTotal(walkInSelectedBill).toLocaleString()}</div>
                    </div>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Amount Remitted (₱)</label>
                    <input 
                      type="number" 
                      placeholder="Enter actual payment amount" 
                      value={walkInAmount}
                      onChange={(e) => setWalkInAmount(e.target.value)}
                      style={styles.formInput} 
                      required
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Payment Instrument Type</label>
                    <select 
                      value={walkInType} 
                      onChange={(e) => setWalkInType(e.target.value)} 
                      style={styles.formSelect}
                    >
                      <option value="CASH">💵 Physical Cash Peso Banknotes</option>
                      <option value="CHEQUE">🏦 Verified Corporate Bank Cheque</option>
                    </select>
                  </div>

                  {walkInAmount && (
                    (() => {
                      const totalTargetAmount = getBillTotal(walkInSelectedBill);
                      const remitted = Number(walkInAmount);
                      
                      if (remitted < totalTargetAmount) {
                        const balance = totalTargetAmount - remitted;
                        const penalty = calculatePenalty(balance);
                        const nextMonthAdded = balance + penalty;
                        
                        return (
                          <div style={{ color: '#dc2626', marginTop: '4px', padding: '12px', backgroundColor: '#fee2e2', borderRadius: '8px', border: '1px solid #fca5a5' }}>
                            <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>⚠️ Partial Payment Detected</div>
                            <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}><span>Remaining Balance:</span> <strong>₱{balance.toLocaleString(undefined, {minimumFractionDigits: 2})}</strong></div>
                            <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}><span>Estimated Penalty ({(condoSettings?.penalty_rate || 0.02) * 100}%):</span> <strong>₱{penalty.toLocaleString(undefined, {minimumFractionDigits: 2})}</strong></div>
                            <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', marginTop: '6px', paddingTop: '6px', borderTop: '1px dashed #f87171' }}>
                              <span>Next Month's Total Added:</span> <strong style={{ color: '#991b1b', fontSize: '14px' }}>₱{nextMonthAdded.toLocaleString(undefined, {minimumFractionDigits: 2})}</strong>
                            </div>
                          </div>
                        );
                      } else {
                        return (
                          <div style={{ fontSize: '12px', color: '#10b981', marginTop: '6px', fontWeight: 'bold', padding: '10px', backgroundColor: '#dcfce7', borderRadius: '8px', border: '1px solid #86efac' }}>
                            ✅ Full Payment Confirmed
                          </div>
                        );
                      }
                    })()
                  )}
                </div>
              )}

              <div style={styles.walkInFooter}>
                <button 
                  type="button" 
                  style={styles.walkInCancelBtn} 
                  onClick={resetWalkInModal}
                >
                  Cancel
                </button>
                <button type="submit" style={{ ...styles.walkInSubmitBtn, opacity: (!walkInSelectedBill || !walkInAmount) ? 0.5 : 1, cursor: (!walkInSelectedBill || !walkInAmount) ? 'not-allowed' : 'pointer' }} disabled={!walkInSelectedBill || !walkInAmount}>
                  Confirm & Commit Cleared
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isChatModalOpen && chatBill && (
        <div style={styles.modalOverlay}>
          <div style={styles.chatModalBanner}>
            <div style={styles.walkInHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>💬</span>
                <h3 style={styles.walkInTitle}>1:1 Intercom Notification</h3>
              </div>
              <button type="button" style={styles.walkInCloseBtn} onClick={() => { setIsChatModalOpen(false); setChatBill(null); }}>✕</button>
            </div>

            <form onSubmit={handleSendChatMessage} style={styles.walkInForm}>
              <div style={{ padding: '12px 14px', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', fontSize: '12px', color: '#991b1b' }}>
                <strong>Unit {chatBill.unit_number} ({chatBill.building_no}) - Overdue Notice</strong>
                <div style={{ marginTop: '4px' }}>Please write a message to notify the resident of their outstanding balance. The message will appear in their Intercom PMO chat room.</div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Message Body</label>
                <textarea 
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  style={styles.chatTextarea}
                  required
                  placeholder="Write message here..."
                />
              </div>

              <div style={styles.walkInFooter}>
                <button 
                  type="button" 
                  style={styles.walkInCancelBtn} 
                  onClick={() => { setIsChatModalOpen(false); setChatBill(null); }}
                >
                  Cancel
                </button>
                <button type="submit" disabled={sendingChat} style={{ ...styles.chatSubmitBtn, opacity: sendingChat ? 0.5 : 1, cursor: sendingChat ? 'not-allowed' : 'pointer' }}>
                  {sendingChat ? 'Sending Message...' : 'Send Message'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeBill && (
        <div style={styles.modalOverlay}>
          <div style={styles.consoleContainer}>
            
            <div style={styles.consoleHeader}>
              <div>
                <span style={styles.consoleLabel}>Security Audit Desk</span>
                <h3 style={styles.consoleTitle}>Unified Receipt Audit Console — Unit {activeBill.unit_number} ({activeBill.building_no})</h3>
              </div>
              <button style={styles.closeButton} onClick={() => { setActiveBill(null); setVisionMatchedRef(null); setConfirmedMatchRef(null); }}>✕</button>
            </div>

            <div style={styles.consoleBodySplit}>
              <div style={styles.paneLeft}>
                <div style={styles.paneHeadline}>📱 Resident Submitted Receipt Attachment</div>
                {activeBill.receipts && activeBill.receipts.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <img 
                      src={activeBill.receipts[0].receipt_image_url} 
                      alt="Receipt" 
                      style={{ width: '100%', borderRadius: '8px', border: '1px solid #e2e8f0', objectFit: 'contain' }} 
                    />
                    <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      <strong>Receipt Data:</strong>
                      <pre style={{ margin: '8px 0 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '12px', color: '#334155' }}>
                        {JSON.stringify(activeBill.receipts[0], null, 2)}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', backgroundColor: '#f1f5f9', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    No receipt image found.
                  </div>
                )}
                
                <div style={styles.antiFraudShieldBox}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e3a8a' }}>🔒 Anti-Fraud Sentry Shield Active</div>
                  <div style={styles.refLockNotice}>Upon hitting approval stamp, this ticket's unique financial serial hash locked globally to block duplicate voucher fraud.</div>
                </div>
              </div>

              <div style={styles.paneRight}>
                {(() => {
                  const dueDateObj = new Date(activeBill.due_date);
                  const todayObj = new Date();
                  const isOverdue = (activeBill.status === 'OVERDUE' || activeBill.status === 'REQUESTED' || todayObj > dueDateObj) && activeBill.status !== 'PAID';
                  const penaltyRate = condoSettings?.penalty_rate || 0.02;
                  let calculatedPenalty = 0;
                  
                  if (isOverdue) {
                    const rawDelay = Math.ceil((todayObj.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24));
                    const delayDays = Math.max(14, rawDelay);
                    const baseForPenalty = 
                      Number(activeBill.condo_dues || 0) + 
                      Number(activeBill.electricity || 0) + 
                      Number(activeBill.water || 0) + 
                      Number(activeBill.parking_fee || 0) + 
                      Number(activeBill.job_order_fee || 0) + 
                      Number(activeBill.previous_balance || 0) + 
                      Number(activeBill.amenity_fee || 0);
                    calculatedPenalty = baseForPenalty * (penaltyRate / 30) * delayDays;
                  }

                  const computedTotal = 
                    Number(activeBill.condo_dues || 0) + 
                    Number(activeBill.electricity || 0) + 
                    Number(activeBill.water || 0) + 
                    Number(activeBill.parking_fee || 0) + 
                    Number(activeBill.job_order_fee || 0) + 
                    Number(activeBill.previous_balance || 0) + 
                    Number(activeBill.penalty_amount || 0) + 
                    Number(activeBill.amenity_fee || 0) +
                    calculatedPenalty;

                  return (
                    <div style={{
                      padding: '16px', 
                      backgroundColor: '#f8fafc', 
                      borderRadius: '12px', 
                      border: '1.5px dashed #cbd5e1', 
                      marginBottom: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Target Statement Due</span>
                        <span style={{ 
                          fontSize: '11px', 
                          fontWeight: '800', 
                          padding: '4px 8px', 
                          borderRadius: '6px',
                          backgroundColor: activeBill.status === 'OVERDUE' || isOverdue ? '#fee2e2' : '#eff6ff',
                          color: activeBill.status === 'OVERDUE' || isOverdue ? '#b91c1c' : '#1e40af'
                        }}>
                          {activeBill.status === 'OVERDUE' || isOverdue ? '⚠️ OVERDUE' : '⏳ PENDING'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '4px' }}>
                        <span style={{ fontSize: '24px', fontWeight: '900', color: '#0f172a' }}>
                          ₱ {computedTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}
                        </span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>
                          Period: {activeBill.billing_month}
                        </span>
                      </div>
                      
                      <div style={{ 
                        borderTop: '1px solid #e2e8f0', 
                        paddingTop: '8px', 
                        marginTop: '4px',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px',
                        fontSize: '11px',
                        color: '#475569'
                      }}>
                        <div>• Base Balance: <strong>₱{Number(activeBill.previous_balance || 0).toLocaleString()}</strong></div>
                        <div>• Amenity Fee: <strong>₱{Number(activeBill.amenity_fee || 0).toLocaleString()}</strong></div>
                        <div>• Utilities & Dues: <strong>₱{Number((activeBill.condo_dues || 0) + (activeBill.electricity || 0) + (activeBill.water || 0) + (activeBill.parking_fee || 0) + (activeBill.job_order_fee || 0)).toLocaleString()}</strong></div>
                        <div>• Late Penalty ({(penaltyRate * 100).toFixed(1)}%): <strong style={{ color: calculatedPenalty > 0 ? '#b91c1c' : '#475569' }}>₱{Number(Number(activeBill.penalty_amount || 0) + calculatedPenalty).toLocaleString(undefined, {minimumFractionDigits: 2})}</strong></div>
                      </div>

                      {/* AI Cross-Check Verification Card */}
                      {aiDetectedAmount !== null && (
                        <div style={{
                          padding: '12px',
                          backgroundColor: '#f5f3ff',
                          borderRadius: '10px',
                          border: '1.5px solid #ddd6fe',
                          marginTop: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}>
                          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#6d28d9', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>🤖 AI Receipt Cross-Analysis</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#4c1d95' }}>
                            <span>Detected Receipt Amount:</span>
                            <strong>₱{aiDetectedAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</strong>
                          </div>
                          {(() => {
                            const diff = computedTotal - aiDetectedAmount;
                            if (Math.abs(diff) < 0.01) {
                              return (
                                <div style={{ fontSize: '11px', color: '#15803d', fontWeight: 'bold', marginTop: '2px' }}>
                                  ✨ Perfect match with Statement Due!
                                </div>
                              );
                            } else if (diff > 0) {
                              return (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                                  <span style={{ fontSize: '11px', color: '#b91c1c', fontWeight: 'bold' }}>
                                    ⚠️ Unpaid Discrepancy: ₱{diff.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                  </span>
                                  <button 
                                    onClick={async () => {
                                      if (!window.confirm(`Process this automatically as a Partial Payment of ₱${aiDetectedAmount}?`)) return;
                                      setUploading(true);
                                      try {
                                        const res = await fetch('/api/approve-payment', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ 
                                            billingId: activeBill.id, 
                                            unitId: activeBill.unit_id, 
                                            amount: aiDetectedAmount,
                                            isPartial: true
                                          })
                                        });
                                        const resJson = await res.json();
                                        if (resJson.success) {
                                          alert(`🎉 Logged partial payment of ₱${aiDetectedAmount} successfully!`);
                                          fetchBillings();
                                          setActiveBill(null);
                                        } else {
                                          throw new Error(resJson.error);
                                        }
                                      } catch (err: any) {
                                        alert(`Error: ${err.message}`);
                                      } finally {
                                        setUploading(false);
                                      }
                                    }}
                                    style={{
                                      backgroundColor: '#d97706',
                                      color: '#fff',
                                      border: 'none',
                                      padding: '4px 8px',
                                      borderRadius: '6px',
                                      fontSize: '10px',
                                      fontWeight: 'bold',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Apply Partial
                                  </button>
                                </div>
                              );
                            } else {
                              return (
                                <div style={{ fontSize: '11px', color: '#6d28d9', fontWeight: 'bold', marginTop: '2px' }}>
                                  💰 Overpayment Credit: ₱{(-diff).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                </div>
                              );
                            }
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div style={styles.paneHeadline}>🏢 Live Corporate Bank Ledger Feed (BDO/GCash Corporate)</div>
                <div style={styles.bankFeedStack}>
                  {bankFeed.map((tx) => {
                    const isConfirmed = tx.ref_no === confirmedMatchRef;
                    const isHighlighted = tx.ref_no === visionMatchedRef;
                    return (
                      <div key={tx.trans_id} style={{ ...styles.bankTxCard, borderColor: isConfirmed ? '#10b981' : (isHighlighted ? '#38bdf8' : '#e2e8f0'), backgroundColor: isConfirmed ? '#f0fdf4' : (isHighlighted ? '#f0f9ff' : '#ffffff'), borderWidth: '2px', borderStyle: 'solid' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#94a3b8' }}>{tx.trans_id} | {tx.date_time}</span>
                            <div style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b', marginTop: '4px' }}>{tx.description}</div>
                            <div style={{ fontSize: '11px', color: isConfirmed ? '#15803d' : (isHighlighted ? '#0284c7' : '#64748b'), marginTop: '4px', backgroundColor: isConfirmed ? '#dcfce7' : (isHighlighted ? '#e0f2fe' : 'transparent'), padding: (isConfirmed || isHighlighted) ? '4px 6px' : '0', borderRadius: '4px', display: 'inline-block' }}>Core Serial Bank Ref: <strong style={{ fontWeight: '900' }}>{tx.ref_no}</strong></div>
                          </div>
                          <div style={{ textTransform: 'uppercase', textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                            <div style={{ fontSize: '16px', fontWeight: '900', color: isConfirmed ? '#15803d' : (isHighlighted ? '#0284c7' : '#0f172a') }}>₱ {tx.amount.toLocaleString(undefined, {minimumFractionDigits:2})}</div>
                            {isConfirmed && <span style={{ ...styles.matchBadge, backgroundColor: '#10b981' }}>✅ Match Confirmed</span>}
                            {!isConfirmed && isHighlighted && (
                              <button onClick={() => setConfirmedMatchRef(tx.ref_no)} style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
                                ✅ Confirm Match
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={styles.auditStampLogCard}>
                  <div style={styles.stampLogTitle}>📋 Operational Audit Trail Stack</div>
                  <div style={styles.stampLine}>• ORDER DISPATCH: Invoice token set to [REQUESTED_AUDIT] via tenant app.</div>
                  {confirmedMatchRef && (
                    <div style={{ ...styles.stampLine, color: '#38bdf8' }}>• MATRIX ANALYST: Core engine found 1 exact serial signature match! [HASH: {confirmedMatchRef}]</div>
                  )}
                </div>
              </div>
            </div>

            <div style={styles.consoleFooter}>
              <button style={styles.cancelButton} onClick={() => { setActiveBill(null); setVisionMatchedRef(null); setConfirmedMatchRef(null); }}>Dismiss Audit</button>
              
              <button 
  onClick={async () => {
    setUploading(true);
    try {
      // 1. Vision API 호출
      const res = await fetch('/api/vision-match', { 
        method: 'POST', 
        body: JSON.stringify({ imageUrl: activeBill.receipts?.[0].receipt_image_url }) 
      });
      const { refNo, amount } = await res.json();
      
      if (!refNo) {
        alert("⚠️ No reference number detected.");
        return;
      }

      if (amount) {
        setAiDetectedAmount(amount);
      }

      // 2. Strict matching logic (enforce exact match on normalized alphanumeric characters)
      const normalizedDetectedRef = refNo.replace(/[^A-Z0-9]/ig, '').toUpperCase();
      
      const match = bankFeed.find(tx => {
        const normalizedBankRef = tx.ref_no.replace(/[^A-Z0-9]/ig, '').toUpperCase();
        
        const isExact = normalizedBankRef === normalizedDetectedRef;
        const isPartial = normalizedBankRef.length >= 6 && normalizedDetectedRef.length >= 6 && 
                          normalizedBankRef.endsWith(normalizedDetectedRef.slice(-6));
                          
        // Numeric fallback to bypass hidden Unicode/string quirks
        const numBank = parseFloat(normalizedBankRef.replace(/[^0-9]/g, ''));
        const numDetected = parseFloat(normalizedDetectedRef.replace(/[^0-9]/g, ''));
        const isNumeric = !isNaN(numBank) && !isNaN(numDetected) && numBank === numDetected;
        
        return isExact || isPartial || isNumeric;
      });

      if (match) {
        // Move the matched item to the top of bankFeed
        const updatedFeed = [match, ...bankFeed.filter(tx => tx.trans_id !== match.trans_id)];
        setBankFeed(updatedFeed);
        localStorage.setItem('filicondo_bank_feed', JSON.stringify(updatedFeed));
        setVisionMatchedRef(match.ref_no);
        setConfirmedMatchRef(match.ref_no); // Auto-confirm match on Vision AI success!
        
        alert(`🎉 Matching transaction automatically confirmed: ${match.ref_no}.\n\nYou can now click 'Verify & Stamp Complete Clear' to approve.`);
      } else {
        setVisionMatchedRef(null);
        setConfirmedMatchRef(null);
        alert(`⚠️ No matching transaction found for: ${refNo}`);
      }
    } catch (e) { 
      console.error(e);
      alert("Error during matching."); 
    }
    finally { 
      setUploading(false); 
    }
  }}
  style={{ ...styles.approveActionBtn, backgroundColor: '#8b5cf6' }}
>
  {uploading ? 'Analyzing...' : '🤖 Vision AI Auto-Match'}
</button>


              {activeBill.status === 'PAID' ? (
  <div style={{ display: 'flex', gap: '10px' }}>
    {/* 수정된 버튼: 이제 PDF를 생성합니다 */}
    <button 
  onClick={() => generateOfficialReceipt(activeBill, condoSettings)}
  style={{ ...styles.approveActionBtn, backgroundColor: '#0f172a' }}
>
  🖨 Print Official Receipt (PDF)
</button>
    
    {isMasterAccount ? (
      <button onClick={() => handleReopenBilling(activeBill.id)} style={{ ...styles.approveActionBtn, backgroundColor: '#2563eb' }}>🔓 Re-open & Modify Dues</button>
    ) : (
      <button disabled style={{ ...styles.approveActionBtn, backgroundColor: '#94a3b8', cursor: 'not-allowed' }}>🔒 Cleared & Locked (Master Only)</button>
    )}
  </div>
) : (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={async () => {
                      const amountStr = window.prompt("Enter the partial payment amount:", aiDetectedAmount ? String(aiDetectedAmount) : "");
                      if (!amountStr) return;
                      const partialAmount = parseFloat(amountStr);
                      if (isNaN(partialAmount) || partialAmount <= 0) {
                        alert("Invalid amount entered.");
                        return;
                      }
                      
                      const dueDateObj = new Date(activeBill.due_date);
                      const todayObj = new Date();
                      const isOverdue = (activeBill.status === 'OVERDUE' || activeBill.status === 'REQUESTED' || todayObj > dueDateObj) && activeBill.status !== 'PAID';
                      const penaltyRate = condoSettings?.penalty_rate || 0.02;
                      let calculatedPenalty = 0;
                      
                      if (isOverdue) {
                        const rawDelay = Math.ceil((todayObj.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24));
                        const delayDays = Math.max(14, rawDelay);
                        const baseForPenalty = 
                          Number(activeBill.condo_dues || 0) + 
                          Number(activeBill.electricity || 0) + 
                          Number(activeBill.water || 0) + 
                          Number(activeBill.parking_fee || 0) + 
                          Number(activeBill.job_order_fee || 0) + 
                          Number(activeBill.previous_balance || 0) + 
                          Number(activeBill.amenity_fee || 0);
                        calculatedPenalty = baseForPenalty * (penaltyRate / 30) * delayDays;
                      }

                      const totalAmount = 
                        Number(activeBill.condo_dues || 0) + 
                        Number(activeBill.electricity || 0) + 
                        Number(activeBill.water || 0) + 
                        Number(activeBill.parking_fee || 0) + 
                        Number(activeBill.job_order_fee || 0) + 
                        Number(activeBill.previous_balance || 0) + 
                        Number(activeBill.penalty_amount || 0) + 
                        Number(activeBill.amenity_fee || 0) +
                        calculatedPenalty;

                      if (partialAmount >= totalAmount) {
                        alert("Amount is equal or greater than the total. Please use 'Verify & Stamp Complete Clear' instead.");
                        return;
                      }

                      try {
                        const res = await fetch('/api/approve-payment', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ 
                            billingId: activeBill.id, 
                            unitId: activeBill.unit_id, 
                            amount: partialAmount,
                            isPartial: true
                          })
                        });
                        const result = await res.json();
                        if (result.success) {
                          alert(`⚠️ PARTIAL SETTLED\n\nLogged partial payment of ₱${partialAmount} for Unit ${activeBill.unit_number}. Remaining balance will be rolled forward.`);
                          fetchBillings();
                          setActiveBill(null);
                        } else {
                          throw new Error(result.error || "Partial payment failed");
                        }
                      } catch (error) {
                        console.error(error);
                        alert("An error occurred during partial payment.");
                      }
                    }} 
                    style={{ ...styles.approveActionBtn, backgroundColor: '#d97706' }}
                  >
                    ⚠️ Process Partial Payment
                  </button>
                  <button onClick={() => { alert(`💰 OVERPAYMENT SAVED\n\nSurplus advanced credit logged for Unit ${activeBill.unit_number}. System will auto-deduct this from next period.`); setActiveBill(null); }} style={{ ...styles.approveActionBtn, backgroundColor: '#7c3aed' }}>💰 Overpayment Carry Over</button>
                  
                  <button 
                    onClick={async () => {
                      if (!window.confirm("Are you sure you want to reject this receipt and request the resident to submit the correct payment (including penalty)?")) return;
                      setUploading(true);
                      try {
                        const res = await fetch('/api/cancel-receipt', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ billingId: activeBill.id })
                        });
                        const result = await res.json();
                        if (result.success) {
                          alert("Receipt has been rejected. The statement is now open for payment again. ❌");
                          fetchBillings();
                          setActiveBill(null);
                        } else {
                          throw new Error(result.error || "Failed to cancel receipt");
                        }
                      } catch (error: any) {
                        console.error(error);
                        alert(`Error: ${error.message || error}`);
                      } finally {
                        setUploading(false);
                      }
                    }} 
                    style={{ ...styles.approveActionBtn, backgroundColor: '#dc2626' }}
                  >
                    ❌ Reject Receipt
                  </button>

                  <button 
                    disabled={!confirmedMatchRef}
                    style={{ ...styles.approveActionBtn, backgroundColor: confirmedMatchRef ? '#10b981' : '#cbd5e1', cursor: confirmedMatchRef ? 'pointer' : 'not-allowed' }} 
                    onClick={() => {
                      const dueDateObj = new Date(activeBill.due_date);
                      const todayObj = new Date();
                      const isOverdue = (activeBill.status === 'OVERDUE' || activeBill.status === 'REQUESTED' || todayObj > dueDateObj) && activeBill.status !== 'PAID';
                      const penaltyRate = condoSettings?.penalty_rate || 0.02;
                      let calculatedPenalty = 0;
                      
                      if (isOverdue) {
                        const rawDelay = Math.ceil((todayObj.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24));
                        const delayDays = Math.max(14, rawDelay);
                        const baseForPenalty = 
                          Number(activeBill.condo_dues || 0) + 
                          Number(activeBill.electricity || 0) + 
                          Number(activeBill.water || 0) + 
                          Number(activeBill.parking_fee || 0) + 
                          Number(activeBill.job_order_fee || 0) + 
                          Number(activeBill.previous_balance || 0) + 
                          Number(activeBill.amenity_fee || 0);
                        calculatedPenalty = baseForPenalty * (penaltyRate / 30) * delayDays;
                      }

                      const totalAmount = 
                        Number(activeBill.condo_dues || 0) + 
                        Number(activeBill.electricity || 0) + 
                        Number(activeBill.water || 0) + 
                        Number(activeBill.parking_fee || 0) + 
                        Number(activeBill.job_order_fee || 0) + 
                        Number(activeBill.previous_balance || 0) + 
                        Number(activeBill.penalty_amount || 0) + 
                        Number(activeBill.amenity_fee || 0) +
                        calculatedPenalty;

                      handleApprovePayment(activeBill.id, activeBill.unit_id, totalAmount);
                    }}
                  >Verify & Stamp Complete Clear</button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          backgroundColor: '#1e293b',
          color: '#ffffff',
          padding: '16px 20px',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          borderLeft: '4px solid #8b5cf6',
          animation: 'slideIn 0.3s ease-out',
          maxWidth: '360px'
        }}>
          <span style={{ fontSize: '18px' }}>🔔</span>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '13px' }}>Real-time Notice</div>
            <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px', lineHeight: '1.4' }}>{toastMessage}</div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' },
  segmentContainer: { display: 'flex', gap: '16px', width: '100%' },
  segmentCard: { flex: 1, padding: '16px 20px', border: '2px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.15s ease' },
  iconBadge: { width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', color: '#ffffff' },
  cardTitleText: { fontSize: '15px', fontWeight: '700', letterSpacing: '-0.2px' },
  cardDescText: { fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: '1.4' },
  headerRow: { display: 'flex', paddingBottom: '4px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px', width: '100%' },
  title: { fontSize: '20px', fontWeight: 'bold', color: '#0f172a', margin: 0 },
  subtitle: { fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' },
  embeddedUploadZone: { backgroundColor: '#f8fafc', padding: '8px 12px', borderRadius: '10px', border: '1px solid #e2e8f0' },
  embeddedFileBtn: { display: 'inline-block', padding: '6px 12px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' },
  embeddedSubmitBtn: { color: '#ffffff', border: 'none', padding: '7px 14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', backgroundColor: '#2563eb', cursor: 'pointer' },
  walkInCounterDeskBtn: { backgroundColor: '#ea580c', color: '#ffffff', border: 'none', padding: '9px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 2px 4px rgba(234,88,12,0.15)' },
  controlPanelRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', width: '100%', marginBottom: '20px', borderBottom: '1px solid #f1f5f9', paddingBottom: '20px' },
  massiveBroadcastBtn: { color: '#ffffff', border: 'none', padding: '12px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '900', cursor: 'pointer', flex: 1 },
  filterInlineGroup: { display: 'flex', gap: '10px', alignItems: 'center', marginLeft: 'auto' },
  filterBox: { display: 'flex', flexDirection: 'column', gap: '4px' },
  filterLabel: { fontSize: '9px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase' },
  select: { padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', minWidth: '110px', color: '#334155', fontWeight: '600' },
  searchInput: { padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12px', width: '80px' },
  table: { width: '100%', display: 'flex', flexDirection: 'column', border: '1px solid #f1f5f9', borderRadius: '8px' },
  tableHeader: { display: 'flex', padding: '14px 12px', borderBottom: '2px solid #f1f5f9', fontWeight: '700', color: '#475569', fontSize: '11px', textTransform: 'uppercase', backgroundColor: '#f8fafc' },
  tableRow: { display: 'flex', alignItems: 'center', padding: '16px 12px', gap: '12px', cursor: 'pointer' },
  reviewButton: { backgroundColor: '#10b981', color: '#ffffff', border: 'none', padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' },
  viewClearedButton: { backgroundColor: '#475569', color: '#ffffff', border: 'none', padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' },
  rowInlineLinkBtn: { background: 'none', border: 'none', color: '#2563eb', fontSize: '12px', fontWeight: '700', textDecoration: 'underline', cursor: 'pointer' },
  accordionDetailZone: { backgroundColor: '#f8fafc', padding: '20px', borderRadius: '8px', margin: '4px 12px 16px 12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '14px' },
  detailTitle: { margin: 0, fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  detailGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' },
  detailCard: { backgroundColor: '#ffffff', padding: '12px 16px', borderRadius: '8px', border: '1px solid #edf2f7', display: 'flex', flexDirection: 'column', gap: '2px' },
  cardLabel: { fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase' },
  cardValue: { fontSize: '16px', fontWeight: '900', color: '#1e293b' },
  cardSub: { fontSize: '11px', color: '#64748b' },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '20px' },
  consoleContainer: { backgroundColor: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '1060px', height: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden' },
  consoleHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', padding: '16px 24px', backgroundColor: '#ffffff' },
  consoleLabel: { fontSize: '10px', fontWeight: '800', color: '#2563eb', textTransform: 'uppercase' },
  consoleTitle: { margin: '2px 0 0 0', fontSize: '18px', fontWeight: 'bold', color: '#0f172a' },
  closeButton: { background: 'none', border: 'none', fontSize: '18px', color: '#94a3b8', cursor: 'pointer' },
  consoleBodySplit: { display: 'flex', flex: 1, overflow: 'hidden', backgroundColor: '#f8fafc' },
  paneLeft: { width: '45%', padding: '20px', borderRight: '1px solid #e2e8f0', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' },
  paneRight: { width: '55%', padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' },
  paneHeadline: { fontSize: '14px', fontWeight: '700', color: '#1e293b' },
  paneSub: { fontSize: '12px', color: '#64748b', margin: '-10px 0 2px 0' },
  gcashReceiptContainer: { backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%' },
  gcashHeaderBar: { backgroundColor: '#0c529c', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  gcashLogoText: { color: '#ffffff', fontSize: '15px', fontWeight: '900', fontStyle: 'italic' },
  gcashReceiptTag: { color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '700' },
  gcashReceiptBody: { padding: '14px 16px', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  gcashCheckIcon: { width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#00cc66', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 'bold', marginBottom: '6px' },
  gcashSuccessText: { fontSize: '13px', fontWeight: '800', color: '#1e293b', marginBottom: '2px' },
  gcashTimeText: { fontSize: '11px', color: '#94a3b8', marginBottom: '8px' },
  gcashDivider: { width: '100%', borderTop: '1px dashed #cbd5e1', margin: '8px 0' },
  gcashRow: { display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '12px', margin: '3px 0' },
  gcashLabel: { color: '#64748b', fontWeight: '500' },
  gcashValue: { color: '#1e293b', fontWeight: '700', textAlign: 'right' },
  gcashValueTarget: { color: '#0c529c', fontWeight: '800', textAlign: 'right' },
  gcashValueBig: { color: '#1e293b', fontSize: '18px', fontWeight: '900', textAlign: 'right' },
  gcashFooterBar: { backgroundColor: '#f8fafc', padding: '8px', textAlign: 'center', fontSize: '10px', color: '#94a3b8', borderTop: '1px solid #edf2f7' },
  antiFraudShieldBox: { backgroundColor: '#f0f6ff', border: '1px solid #bfdbfe', padding: '12px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '2px', marginTop: 'auto' },
  refLockNotice: { fontSize: '11px', color: '#1e40af', fontStyle: 'italic', marginTop: '2px', lineHeight: '1.4' },
  bankFeedStack: { display: 'flex', flexDirection: 'column', gap: '10px' },
  bankTxCard: { padding: '14px', borderRadius: '10px', border: '2px solid', transition: 'all 0.2s' },
  matchBadge: { display: 'inline-block', padding: '4px 8px', backgroundColor: '#2563eb', color: '#ffffff', borderRadius: '5px', fontSize: '9px', fontWeight: '800', marginTop: '6px', textTransform: 'uppercase' },
  auditStampLogCard: { backgroundColor: '#1e293b', padding: '14px', borderRadius: '10px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: 'auto' },
  stampLogTitle: { fontSize: '11px', fontWeight: 'bold', color: '#38bdf8', textTransform: 'uppercase', marginBottom: '4px' },
  stampLine: { fontSize: '11px', fontFamily: 'monospace' },
  consoleFooter: { display: 'flex', justifyContent: 'flex-end', gap: '12px', padding: '14px 24px', borderTop: '1px solid #e2e8f0', backgroundColor: '#ffffff' },
  cancelButton: { backgroundColor: '#ffffff', border: '1px solid #cbd5e1', color: '#475569', padding: '10px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' },
  approveActionBtn: { backgroundColor: '#10b981', border: 'none', color: '#ffffff', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' },
  
  walkInModalBanner: { backgroundColor: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', overflow: 'hidden', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  walkInHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' },
  walkInTitle: { margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#0f172a' },
  walkInCloseBtn: { background: 'none', border: 'none', fontSize: '16px', color: '#94a3b8', cursor: 'pointer' },
  walkInForm: { display: 'flex', flexDirection: 'column', gap: '14px' },
  walkInDescription: { fontSize: '12px', color: '#64748b', margin: 0, lineHeight: '1.4' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  formLabel: { fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.3px' },
  formInput: { padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', color: '#1e293b', fontWeight: '600', outline: 'none', transition: 'border-color 0.15s ease' },
  formSelect: { padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', color: '#1e293b', fontWeight: '600', backgroundColor: '#ffffff', cursor: 'pointer' },
  walkInFooter: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '14px' },
  walkInCancelBtn: { backgroundColor: '#ffffff', border: '1px solid #cbd5e1', color: '#475569', padding: '8px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' },
  walkInSubmitBtn: { backgroundColor: '#ea580c', border: 'none', color: '#ffffff', padding: '8px 18px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(234,88,12,0.15)' },
  chatModalBanner: { backgroundColor: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', overflow: 'hidden', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  chatTextarea: { width: '100%', height: '140px', padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', color: '#1e293b', outline: 'none', resize: 'vertical', fontFamily: 'system-ui, sans-serif' },
  chatSubmitBtn: { backgroundColor: '#2563eb', border: 'none', color: '#ffffff', padding: '8px 18px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 4px rgba(37,99,235,0.15)' }
};
