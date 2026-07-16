import React, { useState, useEffect } from 'react';
import { supabaseAdmin } from '../../lib/Adminsupabase';
import { Html5QrcodeScanner } from 'html5-qrcode'; // Ensure 'html5-qrcode' is npm installed in admin-web

export default function GuardConsole() {
  // States for Scanner
  const [scanResult, setScanResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);
  
  // States for Intercom Keypad
  const [inputUnit, setInputUnit] = useState('');
  const [intercomStatus, setIntercomStatus] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<any>(null);

  useEffect(() => {
    // Initialize html5-qrcode scanner inside the dedicated container
    const scanner = new Html5QrcodeScanner(
      "reader", 
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );

    scanner.render(onScanSuccess, onScanError);

    return () => {
      scanner.clear().catch((err: any) => console.error("Failed to clear scanner", err));
    };
  }, []);

  // 1. Core QR Verification Logic
  const onScanSuccess = async (decodedText: string) => {
    try {
      // Decoded structure format: [pass_code]_OTP_[timestamp_block]
      const parts = decodedText.split('_OTP_');
      const passCode = parts[0];
      const otpBlock = parts[1];

      // Validate base signature against current timestamp security index
      const expectedBlock = Math.floor(Date.now() / 30000);
      if (Math.abs(Number(otpBlock) - expectedBlock) > 1) {
        setScanResult({ success: false, message: "SECURITY ALERT: Expired or Captured QR Code Blueprint." });
        return;
      }

      // Query database for active credentials
      const { data, error } = await supabaseAdmin
        .from('guest_passes')
        .select('*, units(unit_number)')
        .eq('pass_code', passCode)
        .eq('status', 'ACTIVE')
        .single();

      if (error || !data || new Date(data.valid_until) < new Date()) {
        setScanResult({ success: false, message: "ACCESS DENIED: Pass recorded as Expired or Invalid." });
        return;
      }

      setScanResult({ 
        success: true, 
        message: `ACCESS GRANTED • Unit #${data.units?.unit_number}`, 
        data: data 
      });

    } catch (err) {
      setScanResult({ success: false, message: "SYSTEM ERROR: Verification pipeline failed." });
    }
  };

  const onScanError = (err: any) => {
    // Silent drop for continuous camera polling frames
  };

  // 2. Core Live Realtime Intercom Channel Broadcast
  const handleCallUnit = async () => {
    if (!inputUnit.trim()) return;

    try {
      setIntercomStatus(`Calling Unit #${inputUnit}...`);

      // Locate corresponding unit database pointer
      const { data: unitData, error: unitErr } = await supabaseAdmin
        .from('units')
        .select('id')
        .eq('unit_number', inputUnit.trim())
        .single();

      if (unitErr || !unitData) {
        setIntercomStatus("ERROR: Unit destination not found.");
        return;
      }

      // Establish real-time websocket pipeline channel specific to target unit payload
      const channelId = `intercom_unit_${unitData.id}`;
      const channel = supabaseAdmin.channel(channelId);

      channel.subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          // Broadcast out a push event listener payload for mobile-app interceptor
          await channel.send({
            type: 'broadcast',
            event: 'incoming_call',
            payload: { message: 'Visitor at Gate House', timestamp: new Date().toISOString() }
          });
        }
      });

      setActiveChannel(channel);

      // Listen for resident response stream on the same channel pipe
      channel.on('broadcast', { event: 'resident_response' }, (payload: any) => {
        if (payload.payload.approved) {
          setIntercomStatus("🔔 RESIDENT APPROVED: You may let them enter.");
        } else {
          setIntercomStatus("❌ RESIDENT REJECTED: Access denied by resident.");
        }
        // Cleanup connection pipeline
        channel.unsubscribe();
      });

    } catch (err) {
      setIntercomStatus("Intercom infrastructure timeout.");
    }
  };

  const handlePressKey = (num: string) => {
    setInputUnit(prev => prev + num);
  };

  const handleClearKey = () => {
    setInputUnit('');
    setIntercomStatus(null);
    if (activeChannel) activeChannel.unsubscribe();
  };

  return (
    <div style={styles.dashboardContainer}>
      {/* Top Console Status Bar */}
      <div style={styles.statusBar}>
        <h2 style={styles.title}>🛡️ FiliHomes Guard Gatehouse Terminal</h2>
        <span style={styles.onlineIndicator}>● SYSTEM ACTIVE (REALTIME)</span>
      </div>

      <div style={styles.mainLayout}>
        {/* LEFT COLUMN: Ultra Fast QR Scanner */}
        <div style={styles.leftColumn}>
          <h3 style={styles.panelTitle}>📸 Digital QR Scanner Passway</h3>
          <div id="reader" style={styles.scannerViewport}></div>

          {scanResult && (
            <div style={{
              ...styles.resultBillboard, 
              backgroundColor: scanResult.success ? '#064e3b' : '#7f1d1d',
              borderColor: scanResult.success ? '#10b981' : '#ef4444'
            }}>
              <h2 style={styles.billboardMainText}>{scanResult.message}</h2>
              {scanResult.success && (
                <div style={styles.billboardDetails}>
                  <p><strong>Guest Name:</strong> {scanResult.data?.guest_name}</p>
                  <p><strong>Classification:</strong> {scanResult.data?.guest_type}</p>
                </div>
              )}
              <button style={styles.resetScanBtn} onClick={() => setScanResult(null)}>Clear & Next Scan</button>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Heavy Duty Keypad Intercom */}
        <div style={styles.rightColumn}>
          <h3 style={styles.panelTitle}>💬 Unregistered Visitor Intercom</h3>
          
          <div style={styles.displayMonitor}>
            <div style={styles.monitorUnitLabel}>Target Destination Unit</div>
            <div style={styles.monitorValue}>{inputUnit || '----'}</div>
            {intercomStatus && <div style={styles.monitorStatusAlert}>{intercomStatus}</div>}
          </div>

          {/* Industrial Size Keypad Matrix Grid */}
          <div style={styles.keypadMatrix}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(num => (
              <button key={num} style={styles.keyBtn} onClick={() => handlePressKey(num)}>{num}</button>
            ))}
            <button style={{...styles.keyBtn, backgroundColor: '#dc2626'}} onClick={handleClearKey}>CLR</button>
            <button style={styles.keyBtn} onClick={() => handlePressKey('0')}>0</button>
            <button style={{...styles.keyBtn, backgroundColor: '#16a34a'}} onClick={handleCallUnit}>CALL</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Heavy Duty Dark-Mode Optimal Styling Blueprint
const styles: Record<string, React.CSSProperties> = {
  dashboardContainer: { padding: '30px', backgroundColor: '#0f172a', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#f8fafc' },
  statusBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #1e293b', paddingBottom: '20px', marginBottom: '30px' },
  title: { margin: 0, fontSize: '22px', fontWeight: 'bold' },
  onlineIndicator: { backgroundColor: '#064e3b', color: '#34d399', padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.5px' },
  mainLayout: { display: 'flex', gap: '30px', width: '100%' },
  leftColumn: { flex: 1, backgroundColor: '#1e293b', borderRadius: '20px', padding: '24px', border: '1px solid #334155' },
  rightColumn: { flex: 1, backgroundColor: '#1e293b', borderRadius: '20px', padding: '24px', border: '1px solid #334155', display: 'flex', flexDirection: 'column' },
  panelTitle: { margin: '0 0 20px 0', fontSize: '16px', fontWeight: 'bold', color: '#94a3b8', borderLeft: '4px solid #3b82f6', paddingLeft: '10px' },
  scannerViewport: { width: '100%', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#0f172a', border: '1px solid #475569' },
  
  resultBillboard: { marginTop: '20px', padding: '20px', borderRadius: '12px', borderWidth: '1px', borderStyle: 'solid', textAlign: 'center' },
  billboardMainText: { margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#fff' },
  billboardDetails: { marginTop: '12px', fontSize: '14px', color: '#cbd5e1', textAlign: 'left', backgroundColor: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px' },
  resetScanBtn: { marginTop: '15px', backgroundColor: '#fff', color: '#0f172a', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' },

  displayMonitor: { backgroundColor: '#0f172a', padding: '20px', borderRadius: '12px', textAlign: 'center', marginBottom: '20px', border: '1px solid #475569' },
  monitorUnitLabel: { fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' },
  monitorValue: { fontSize: '36px', fontWeight: 'bold', color: '#fff', marginTop: '8px', marginBottom: '8px', fontFamily: 'monospace' },
  monitorStatusAlert: { fontSize: '13px', color: '#38bdf8', marginTop: '10px', fontWeight: '500' },

  keypadMatrix: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', flex: 1 },
  keyBtn: { height: '70px', backgroundColor: '#334155', border: 'none', borderRadius: '12px', color: '#fff', fontSize: '20px', fontWeight: 'bold', cursor: 'pointer', transition: 'background-color 0.2s' }
};