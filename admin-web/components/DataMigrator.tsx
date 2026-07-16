"use client";

import React, { useState } from 'react';
import { supabase } from '../src/lib/supabaseClient';

interface PreviewData {
  unit_no: string;
  resident_name: string;
  email: string;
  phone: string;
  outstanding_balance: number;
  billing_period: string;
  isValid: boolean;
  errorReason?: string;
}

export default function DataMigrator({ condoId, onSyncComplete }: { condoId: string; onSyncComplete: () => void }) {
  const [previewList, setPreviewList] = useState<PreviewData[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [logSummary, setLogSummary] = useState({ total: 0, valid: 0, invalid: 0 });

  // Mapping wizard states
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [showMapping, setShowMapping] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  
  // Mapping assignments: maps system field name -> CSV column index (0-based)
  const [mapping, setMapping] = useState<{ [key: string]: number }>({
    unit_no: -1,
    resident_name: -1,
    email: -1,
    phone: -1,
    outstanding_balance: -1,
    billing_period: -1,
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      if (lines.length === 0) {
        alert("The uploaded file is empty.");
        return;
      }

      // Parse headers from the first line
      // Simple CSV split (ignores quoted commas for now for simplicity, but splits reliably)
      const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
      
      // Store all data rows (split by commas)
      const parsedRawRows = lines.slice(1).map(line => {
        // Simple comma split
        return line.split(',').map(col => col.trim().replace(/^["']|["']$/g, ''));
      });

      // Intelligently guess mapping indices
      const autoMap: { [key: string]: number } = {
        unit_no: -1,
        resident_name: -1,
        email: -1,
        phone: -1,
        outstanding_balance: -1,
        billing_period: -1,
      };

      headers.forEach((header, index) => {
        const h = header.toLowerCase();
        if (h.includes('unit') || h.includes('room') || h.includes('호실') || h.includes('호수') || h.includes('no')) {
          if (autoMap.unit_no === -1) autoMap.unit_no = index;
        } else if (h.includes('name') || h.includes('resident') || h.includes('occupant') || h.includes('이름') || h.includes('소유') || h.includes('임대')) {
          if (autoMap.resident_name === -1) autoMap.resident_name = index;
        } else if (h.includes('email') || h.includes('이메일') || h.includes('mail')) {
          if (autoMap.email === -1) autoMap.email = index;
        } else if (h.includes('phone') || h.includes('contact') || h.includes('mobile') || h.includes('전화') || h.includes('연락처')) {
          if (autoMap.phone === -1) autoMap.phone = index;
        } else if (h.includes('balance') || h.includes('amount') || h.includes('fee') || h.includes('outstanding') || h.includes('bill') || h.includes('잔액') || h.includes('금액') || h.includes('관리비')) {
          if (autoMap.outstanding_balance === -1) autoMap.outstanding_balance = index;
        } else if (h.includes('period') || h.includes('month') || h.includes('date') || h.includes('기간') || h.includes('월')) {
          if (autoMap.billing_period === -1) autoMap.billing_period = index;
        }
      });

      // Fallbacks if autoMap misses
      if (autoMap.unit_no === -1 && headers.length > 0) autoMap.unit_no = 0;
      if (autoMap.outstanding_balance === -1 && headers.length > 4) autoMap.outstanding_balance = 4;

      setMapping(autoMap);
      setCsvHeaders(headers);
      setRawRows(parsedRawRows);
      setShowMapping(true);
      setPreviewList([]); // Clear previous preview
    };
    reader.readAsText(file);
  };

  const executeParsingWithMapping = () => {
    if (mapping.unit_no === -1 || mapping.outstanding_balance === -1) {
      alert("Please map the required fields: House/Lot Number and Outstanding Balance.");
      return;
    }

    const parsedRows: PreviewData[] = [];
    let validCount = 0;
    let invalidCount = 0;

    rawRows.forEach((columns) => {
      if (columns.length === 0 || columns.every(col => !col)) return;

      const unit_no = mapping.unit_no !== -1 ? columns[mapping.unit_no]?.trim() || '' : '';
      const resident_name = mapping.resident_name !== -1 ? columns[mapping.resident_name]?.trim() || '' : '';
      const email = mapping.email !== -1 ? columns[mapping.email]?.trim() || '' : '';
      const phone = mapping.phone !== -1 ? columns[mapping.phone]?.trim() || '' : '';
      const rawBalance = mapping.outstanding_balance !== -1 ? columns[mapping.outstanding_balance]?.trim() || '0' : '0';
      const billing_period = mapping.billing_period !== -1 ? columns[mapping.billing_period]?.trim() || 'June 2026' : 'June 2026';

      let isValid = true;
      let errorReason = '';

      if (!unit_no) {
        isValid = false;
        errorReason = 'Missing House/Lot Number';
      } else if (email && !email.includes('@')) {
        isValid = false;
        errorReason = 'Invalid Email Format';
      }
      
      const outstanding_balance = parseFloat(rawBalance.replace(/[^0-9.-]+/g, ''));
      if (isNaN(outstanding_balance)) {
        isValid = false;
        errorReason = 'Balance is not a number';
      }

      if (isValid) validCount++; else invalidCount++;

      parsedRows.push({
        unit_no,
        resident_name: resident_name || 'Occupant',
        email,
        phone,
        outstanding_balance: isNaN(outstanding_balance) ? 0 : outstanding_balance,
        billing_period,
        isValid,
        errorReason
      });
    });

    setPreviewList(parsedRows);
    setLogSummary({ total: parsedRows.length, valid: validCount, invalid: invalidCount });
    setShowMapping(false); // Hide mapping card once applied
  };

  const handleDeployCleanDataToApp = async () => {
    const validItems = previewList.filter(item => item.isValid);
    if (validItems.length === 0) return;

    setIsSyncing(true);
    try {
      const response = await fetch('/api/upload-billings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          condoId: condoId, 
          billings: validItems.map(item => ({
            unit_no: item.unit_no,
            amount: item.outstanding_balance,
            billing_period: item.billing_period
          }))
        })
      });

      const result = await response.json();
      if (result.success) {
        alert(`🎉 Migration Successful! Synchronized ${result.insertedCount} rows.`);
        setPreviewList([]);
        setLogSummary({ total: 0, valid: 0, invalid: 0 });
        onSyncComplete();
      } else {
        throw new Error(result.error || "Sync failed");
      }
    } catch (error: any) {
      console.error(error);
      alert(`Database sync failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleMapChange = (systemField: string, csvIndex: number) => {
    setMapping(prev => ({
      ...prev,
      [systemField]: csvIndex
    }));
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>📊 Legacy Data Ingestion Pipeline Hub</h2>
      <p style={styles.subtitle}>Upload existing village/subdivision Excel/CSV rosters to instantly sync with Resident, Guard, and Intercom mobile interfaces.</p>

      {/* Step 1: Upload File */}
      <div style={styles.dropzone}>
        <span style={{ fontSize: '28px' }}>📂</span>
        <label style={styles.uploadLabel}>
          {uploadedFileName ? `Re-upload: ${uploadedFileName}` : 'Click to upload Condo Ledger CSV'}
          <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileUpload} />
        </label>
        <p style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px' }}>
          Upload your raw excel-exported CSV. We'll help you map its headers dynamically!
        </p>
      </div>

      {/* Step 2: Columns Mapping Wizard */}
      {showMapping && csvHeaders.length > 0 && (
        <div style={styles.mappingCard}>
          <h3 style={styles.mappingCardTitle}>🔧 CSV Column Mapping Wizard</h3>
          <p style={styles.mappingCardDesc}>
            Map your CSV file's headers to FiliHomes's system parameters.
          </p>

          <div style={styles.mappingGrid}>
            {/* House/Lot Number Map (Required) */}
            <div style={styles.mappingFieldRow}>
              <div style={styles.mappingLabelContainer}>
                <span style={styles.systemFieldLabel}>House/Lot Number *</span>
                <span style={styles.fieldRequiredBadge}>Required</span>
              </div>
              <select 
                value={mapping.unit_no} 
                onChange={(e) => handleMapChange('unit_no', Number(e.target.value))} 
                style={styles.mappingSelect}
              >
                <option value={-1}>-- Select CSV Column --</option>
                {csvHeaders.map((header, idx) => (
                  <option key={idx} value={idx}>{header} (Col {idx + 1})</option>
                ))}
              </select>
            </div>

            {/* Outstanding Balance Map (Required) */}
            <div style={styles.mappingFieldRow}>
              <div style={styles.mappingLabelContainer}>
                <span style={styles.systemFieldLabel}>Outstanding Balance *</span>
                <span style={styles.fieldRequiredBadge}>Required</span>
              </div>
              <select 
                value={mapping.outstanding_balance} 
                onChange={(e) => handleMapChange('outstanding_balance', Number(e.target.value))} 
                style={styles.mappingSelect}
              >
                <option value={-1}>-- Select CSV Column --</option>
                {csvHeaders.map((header, idx) => (
                  <option key={idx} value={idx}>{header} (Col {idx + 1})</option>
                ))}
              </select>
            </div>

            {/* Resident Name Map */}
            <div style={styles.mappingFieldRow}>
              <div style={styles.mappingLabelContainer}>
                <span style={styles.systemFieldLabel}>Resident Full Name</span>
                <span style={styles.fieldOptionalBadge}>Optional</span>
              </div>
              <select 
                value={mapping.resident_name} 
                onChange={(e) => handleMapChange('resident_name', Number(e.target.value))} 
                style={styles.mappingSelect}
              >
                <option value={-1}>-- Select CSV Column (Defaults to "Occupant") --</option>
                {csvHeaders.map((header, idx) => (
                  <option key={idx} value={idx}>{header} (Col {idx + 1})</option>
                ))}
              </select>
            </div>

            {/* Email Map */}
            <div style={styles.mappingFieldRow}>
              <div style={styles.mappingLabelContainer}>
                <span style={styles.systemFieldLabel}>Email Address</span>
                <span style={styles.fieldOptionalBadge}>Optional</span>
              </div>
              <select 
                value={mapping.email} 
                onChange={(e) => handleMapChange('email', Number(e.target.value))} 
                style={styles.mappingSelect}
              >
                <option value={-1}>-- Select CSV Column --</option>
                {csvHeaders.map((header, idx) => (
                  <option key={idx} value={idx}>{header} (Col {idx + 1})</option>
                ))}
              </select>
            </div>

            {/* Phone Map */}
            <div style={styles.mappingFieldRow}>
              <div style={styles.mappingLabelContainer}>
                <span style={styles.systemFieldLabel}>Phone Number</span>
                <span style={styles.fieldOptionalBadge}>Optional</span>
              </div>
              <select 
                value={mapping.phone} 
                onChange={(e) => handleMapChange('phone', Number(e.target.value))} 
                style={styles.mappingSelect}
              >
                <option value={-1}>-- Select CSV Column --</option>
                {csvHeaders.map((header, idx) => (
                  <option key={idx} value={idx}>{header} (Col {idx + 1})</option>
                ))}
              </select>
            </div>

            {/* Billing Period Map */}
            <div style={styles.mappingFieldRow}>
              <div style={styles.mappingLabelContainer}>
                <span style={styles.systemFieldLabel}>Billing Period / Month</span>
                <span style={styles.fieldOptionalBadge}>Optional</span>
              </div>
              <select 
                value={mapping.billing_period} 
                onChange={(e) => handleMapChange('billing_period', Number(e.target.value))} 
                style={styles.mappingSelect}
              >
                <option value={-1}>-- Select CSV Column (Defaults to "June 2026") --</option>
                {csvHeaders.map((header, idx) => (
                  <option key={idx} value={idx}>{header} (Col {idx + 1})</option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.wizardActionRow}>
            <button style={styles.cancelWizardBtn} onClick={() => setShowMapping(false)}>
              Cancel
            </button>
            <button style={styles.applyWizardBtn} onClick={executeParsingWithMapping}>
              ✓ Apply Mapping & Preview
            </button>
          </div>
        </div>
      )}

      {/* Summary Statistics */}
      {logSummary.total > 0 && (
        <div style={styles.summaryBox}>
          <div style={styles.summaryCard}>
            <Text style={{ color: '#94a3b8', fontSize: '11px' }}>TOTAL ROWS IMPORTED</Text>
            <Text style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>{logSummary.total}</Text>
          </div>
          <div style={{ backgroundColor: '#0f172a', border: '1px solid #16a34a', padding: '12px', borderRadius: '8px', flex: 1 }}>
            <Text style={{ color: '#4ade80', fontSize: '11px' }}>🟢 VALID & READY</Text>
            <Text style={{ fontSize: '20px', fontWeight: 'bold', color: '#4ade80' }}>{logSummary.valid}</Text>
          </div>
          <div style={{ backgroundColor: '#0f172a', border: '1px solid #ef4444', padding: '12px', borderRadius: '8px', flex: 1 }}>
            <Text style={{ color: '#f87171', fontSize: '11px' }}>🚨 ERROR CORRECTION</Text>
            <Text style={{ fontSize: '20px', fontWeight: 'bold', color: '#f87171' }}>{logSummary.invalid}</Text>
          </div>
        </div>
      )}

      {/* Parse Preview Table */}
      {previewList.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <div style={styles.tableHeaderRow}>
            <span style={{ width: '15%' }}>Unit</span>
            <span style={{ width: '25%' }}>Resident</span>
            <span style={{ width: '25%' }}>Email/Contact</span>
            <span style={{ width: '15%' }}>Balance</span>
            <span style={{ width: '20%', textAlign: 'right' }}>Status / Reason</span>
          </div>

          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {previewList.map((row, idx) => (
              <div 
                key={idx} 
                style={
                  row.isValid 
                    ? { display: 'flex', padding: '12px 14px', borderBottom: '1px solid #334155', color: '#fff', alignItems: 'center', fontSize: '13px' } 
                    : { display: 'flex', padding: '12px 14px', borderBottom: '1px solid #334155', color: '#fff', alignItems: 'center', fontSize: '13px', backgroundColor: '#2d1a1a', borderColor: '#7f1d1d' }
                }
              >
                <span style={{ width: '15%', fontWeight: 'bold', color: '#fff' }}>{row.unit_no}</span>
                <span style={{ width: '25%', color: '#e2e8f0' }}>{row.resident_name}</span>
                <span style={{ width: '25%', color: '#94a3b8', fontSize: '12px' }}>{row.email || row.phone}</span>
                <span style={{ width: '15%', color: '#38bdf8', fontWeight: '700' }}>₱{row.outstanding_balance.toLocaleString()}</span>
                <span style={{ width: '20%', textAlign: 'right', color: row.isValid ? '#22c55e' : '#ef4444', fontSize: '12px', fontWeight: 'bold' }}>
                  {row.isValid ? '✓ Ready' : `❌ ${row.errorReason}`}
                </span>
              </div>
            ))}
          </div>

          <button style={styles.syncButton} disabled={isSyncing || logSummary.valid === 0} onClick={handleDeployCleanDataToApp}>
            {isSyncing ? '🚀 Deploying Rows to Apps...' : `⚡ Synchronize ${logSummary.valid} Clean Rows to Mobile Core`}
          </button>
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { backgroundColor: '#1e293b', padding: '24px', borderRadius: '16px', border: '1px solid #334155', fontFamily: 'system-ui' },
  title: { fontSize: '18px', fontWeight: 'bold', color: '#fff', margin: 0 },
  subtitle: { fontSize: '13px', color: '#94a3b8', marginTop: '6px', marginBottom: '20px' },
  dropzone: { border: '2px dashed #475569', backgroundColor: '#0f172a', padding: '30px', borderRadius: '12px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  uploadLabel: { color: '#38bdf8', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', marginTop: '10px', textDecoration: 'underline' },
  summaryBox: { display: 'flex', justifyContent: 'space-between', marginTop: '16px', gap: '12px' },
  summaryCard: { flex: 1, backgroundColor: '#0f172a', border: '1px solid #334155', padding: '12px', borderRadius: '8px' },
  tableHeaderRow: { display: 'flex', backgroundColor: '#0f172a', padding: '10px 14px', borderRadius: '6px', color: '#64748b', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', marginTop: '16px' },
  syncButton: { width: '100%', backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '14px', borderRadius: '10px', fontWeight: 'bold', fontSize: '14px', marginTop: '16px', cursor: 'pointer' },
  
  // Mapping wizard classes
  mappingCard: { backgroundColor: '#0f172a', border: '1px solid #475569', borderRadius: '10px', padding: '20px', marginTop: '16px', color: '#fff' },
  mappingCardTitle: { fontSize: '15px', fontWeight: 'bold', margin: 0, color: '#38bdf8' },
  mappingCardDesc: { fontSize: '12px', color: '#94a3b8', marginTop: '4px', marginBottom: '16px' },
  mappingGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' },
  mappingFieldRow: { display: 'flex', flexDirection: 'column', gap: '6px' },
  mappingLabelContainer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  systemFieldLabel: { fontSize: '13px', fontWeight: 'bold', color: '#e2e8f0' },
  fieldRequiredBadge: { fontSize: '10px', backgroundColor: '#7f1d1d', color: '#fca5a5', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' },
  fieldOptionalBadge: { fontSize: '10px', backgroundColor: '#334155', color: '#cbd5e1', padding: '2px 6px', borderRadius: '4px' },
  mappingSelect: { backgroundColor: '#1e293b', border: '1px solid #475569', color: '#fff', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', outline: 'none' },
  wizardActionRow: { display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px', borderTop: '1px solid #334155', paddingTop: '16px' },
  cancelWizardBtn: { backgroundColor: '#334155', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' },
  applyWizardBtn: { backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' },
};

function Text({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={style}>{children}</div>;
}