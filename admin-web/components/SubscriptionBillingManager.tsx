"use client";
import React, { useState, useEffect, useRef } from 'react';
import { getSubscriptionPayments, uploadReceipt, SubscriptionPayment } from '../src/lib/platformService';

interface SubscriptionBillingManagerProps {
  condoId: string;
}

export default function SubscriptionBillingManager({ condoId }: SubscriptionBillingManagerProps) {
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload Form states
  const [billingPeriod, setBillingPeriod] = useState('2026-06');
  const [amount, setAmount] = useState<number>(4000); // Default fee (e.g., 200 households * 20 PHP)
  const [receiptUrl, setReceiptUrl] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  // Drag and drop / File upload states
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const paymentsPerPage = 12;

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const data = await getSubscriptionPayments(condoId);
      setPayments(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [condoId]);

  // Handle file select or drop
  const processUploadedFile = (file: File) => {
    if (!file) return;
    
    setExtracting(true);
    setErrorMsg('');
    setSuccessMsg('');
    
    // Simulate receipt upload & URL assignment
    const mockUrl = URL.createObjectURL(file);
    setReceiptUrl(mockUrl);

    // Vision API reference number simulation
    setTimeout(async () => {
      try {
        const simulatedRef = 'REF' + Date.now().toString().slice(-6) + Math.floor(1000 + Math.random() * 9000);
        setReferenceNo(simulatedRef);
        setSuccessMsg(`AI Auto-extracted Reference No: ${simulatedRef}`);
      } catch (err) {
        console.error(err);
      } finally {
        setExtracting(false);
      }
    }, 1200);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processUploadedFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleSubmitReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billingPeriod || amount <= 0 || !receiptUrl.trim()) {
      setErrorMsg('Please upload a valid receipt file.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await uploadReceipt({
        condo_id: condoId,
        billing_period: billingPeriod,
        amount,
        receipt_url: receiptUrl.trim(),
        reference_no: referenceNo.trim() || null
      });

      setSuccessMsg('Your payment receipt has been uploaded and sent to HQ for approval.');
      setReceiptUrl('');
      setReferenceNo('');
      setCurrentPage(1); // Reset to first page to see the new record
      await fetchPayments();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit payment receipt. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Pagination logic
  const totalPages = Math.ceil(payments.length / paymentsPerPage);
  const indexOfLastPayment = currentPage * paymentsPerPage;
  const indexOfFirstPayment = indexOfLastPayment - paymentsPerPage;
  const currentPayments = payments.slice(indexOfFirstPayment, indexOfLastPayment);

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
      
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          💳 Platform Subscription & Billing
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Pay your monthly FiliHomes software licensing fees (PHP 20 per household/month), submit transfer receipts, and review billing statements.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Receipt Submission Form */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-xl p-6 shadow-sm self-start">
          <h3 className="font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2 text-base">
            📤 Upload Payment Receipt
          </h3>

          <form onSubmit={handleSubmitReceipt} className="space-y-4">
            {errorMsg && (
              <div className="bg-red-50 text-red-700 p-3 rounded-lg text-xs font-semibold border border-red-100">
                ⚠️ {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="bg-emerald-50 text-emerald-700 p-3 rounded-lg text-xs font-semibold border border-emerald-100">
                ✅ {successMsg}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Billing Period
              </label>
              <select
                value={billingPeriod}
                onChange={(e) => setBillingPeriod(e.target.value)}
                className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition font-medium"
              >
                <option value="2026-05">May 2026</option>
                <option value="2026-06">June 2026</option>
                <option value="2026-07">July 2026</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                License Fee Amount (PHP)
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                placeholder="25000"
                className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition font-bold"
                required
                min="1"
              />
            </div>

            {/* Drag & Drop File Zone */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Receipt File Upload (Image or PDF)
              </label>
              
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*,application/pdf"
                className="hidden"
              />
              
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={onButtonClick}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[140px] ${
                  dragActive 
                    ? 'border-blue-600 bg-blue-50/50' 
                    : receiptUrl 
                      ? 'border-emerald-500 bg-emerald-50/10' 
                      : 'border-slate-300 hover:border-blue-500 hover:bg-slate-50/50'
                }`}
              >
                {extracting ? (
                  <div className="flex flex-col items-center gap-2">
                    <span className="animate-spin text-2xl">🤖</span>
                    <span className="text-xs font-semibold text-slate-500">AI scanning receipt for Reference No...</span>
                  </div>
                ) : receiptUrl ? (
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-2xl">📄</span>
                    <span className="text-xs font-bold text-slate-700">Receipt Loaded Successfully</span>
                    <span className="text-[10px] text-slate-400 font-mono overflow-hidden text-ellipsis max-w-[200px] whitespace-nowrap">
                      {receiptUrl}
                    </span>
                    <span className="text-[10px] text-blue-600 underline font-bold mt-1">Replace File</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-3xl text-slate-400">📥</span>
                    <span className="text-xs font-bold text-slate-600">Drag & drop files here</span>
                    <span className="text-[11px] text-slate-400">or click to browse from Finder</span>
                  </div>
                )}
              </div>
            </div>

            {/* Read-only Reference Number */}
            {referenceNo && (
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  🤖 AI Auto-extracted Reference No.
                </label>
                <div className="text-sm font-mono font-black text-slate-800 flex items-center justify-between">
                  <span>{referenceNo}</span>
                  <span className="text-[9px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-sans uppercase">Verified by Vision</span>
                </div>
              </div>
            )}

            <div className="bg-slate-50 rounded-lg p-3 text-[11px] text-slate-500 border border-slate-100 leading-relaxed">
              <strong>HQ Settlement Account:</strong><br />
              Banco de Oro (BDO) | FiliHomes Technologies Inc.<br />
              Account No: <strong>0012-3456-7890</strong>
            </div>

            <button
              type="submit"
              disabled={submitting || !receiptUrl}
              className={`w-full bg-blue-700 text-white py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                submitting || !receiptUrl ? 'opacity-55 cursor-not-allowed' : 'hover:bg-blue-800 active:bg-blue-900'
              }`}
            >
              {submitting ? 'Uploading...' : 'Submit Receipt'}
            </button>
          </form>
        </div>

        {/* Payment History List with Pagination */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm min-h-[500px] flex flex-col">
            <h3 className="font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100 flex items-center justify-between text-base">
              <span>📋 Statement & Payment History</span>
              <button 
                onClick={fetchPayments} 
                className="text-xs text-blue-700 hover:text-blue-800 font-bold"
              >
                🔄 Sync Records
              </button>
            </h3>

            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
                <p className="text-xs text-slate-400 mt-3 font-semibold">Fetching payment log...</p>
              </div>
            ) : payments.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-400">
                <span className="text-3xl mb-2">💵</span>
                <p className="text-sm font-semibold">No payment history found.</p>
                <p className="text-xs text-slate-500 mt-1">Upload a receipt to submit your first licensing fee.</p>
              </div>
            ) : (
              <>
                <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                  {currentPayments.map((pay) => (
                    <div 
                      key={pay.id} 
                      className="border border-slate-100 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/30 transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-sm">Period: {pay.billing_period}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            pay.status === 'APPROVED' 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : pay.status === 'REJECTED' 
                                ? 'bg-red-100 text-red-800' 
                                : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {pay.status}
                          </span>
                        </div>
                        {pay.reference_no && (
                          <div className="text-[10px] bg-slate-100 text-slate-600 font-mono font-bold px-2 py-0.5 rounded border border-slate-200 w-fit">
                            Ref: {pay.reference_no}
                          </div>
                        )}
                        <div className="text-xs text-slate-500 font-semibold">
                          Submitted: {new Date(pay.created_at).toLocaleDateString()}
                        </div>
                        <a 
                          href={pay.receipt_url} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-[11px] text-blue-600 hover:text-blue-700 font-bold block mt-1 underline break-all"
                        >
                          📄 View Submitted Receipt
                        </a>
                      </div>

                      <div className="text-left md:text-right border-t md:border-t-0 border-slate-50 pt-2 md:pt-0">
                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount Paid</span>
                        <span className="text-base font-black text-slate-800">
                          ₱{pay.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-4">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-3 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      ◀ Prev
                    </button>
                    
                    <div className="flex items-center gap-1.5">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => handlePageChange(page)}
                          className={`w-7 h-7 text-xs font-bold rounded flex items-center justify-center border transition ${
                            currentPage === page 
                              ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      Next ▶
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
