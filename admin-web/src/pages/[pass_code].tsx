import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabaseAdmin } from '../lib/Adminsupabase'; // Adjust based on your admin-web supabaseAdmin client path
import QRCode from 'react-qr-code'; // Ensure 'react-qr-code' is installed in admin-web

export default function GuestWebPass() {
  const router = useRouter();
  const { pass_code } = router.query;

  const [loading, setLoading] = useState(true);
  const [passData, setPassData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(30);
  const [qrValue, setQrValue] = useState('');

  useEffect(() => {
    if (pass_code) {
      fetchGuestPass();
    }
  }, [pass_code]);

  // 30-Second Security Timer Logic (Prevents pass screenshot sharing theft)
  useEffect(() => {
    if (!passData || passData.status !== 'ACTIVE') return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Re-generate dynamic OTP token layered with the pass_code
          setQrValue(`${pass_code}_OTP_${Math.floor(Date.now() / 30000)}`);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [passData, pass_code]);

  const fetchGuestPass = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabaseAdmin
        .from('guest_passes')
        .select('*, condos(name), units(unit_number)')
        .eq('pass_code', pass_code)
        .single();

      if (error || !data) {
        setErrorMsg('Invalid or expired gate pass link.');
        return;
      }

      // Check if pass is legally expired by time guard rules
      if (new Date(data.valid_until) < new Date()) {
        setErrorMsg('This digital pass has expired.');
        return;
      }

      setPassData(data);
      setQrValue(`${pass_code}_OTP_${Math.floor(Date.now() / 30000)}`);
    } catch (err) {
      setErrorMsg('System error loading access credential.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={styles.centered}>Loading Secure Gate Pass...</div>;
  if (errorMsg) return <div style={styles.errorBox}>❌ {errorMsg}</div>;

  return (
    <div style={styles.wrapper}>
      {/* Condo Header Info */}
      <div style={styles.headerBox}>
        <h2 style={styles.condoName}>{passData.condos?.name}</h2>
        <p style={styles.unitNumber}>Visitor Access: Unit #{passData.units?.unit_number}</p>
      </div>

      {/* Dynamic QR Core Content */}
      <div style={styles.qrCard}>
        <span style={styles.badge}>{passData.guest_type} PASS</span>
        <h3 style={styles.guestName}>Welcome, {passData.guest_name}</h3>
        
        <div style={styles.qrWrapper}>
          <QRCode value={qrValue} size={180} />
        </div>

        <p style={styles.timerText}>🔄 QR refreshes in <strong style={{color: '#dc2626'}}>{countdown}s</strong></p>
        <p style={styles.notice}>Present this screen to the security guard house upon arrival.</p>
      </div>

      {/* 🚀 Tourist Monetization Anchors (HeyDriver & PhiliSpa Integrated) */}
      <h4 style={styles.adHeading}>Exclusive Guest Services 🌴</h4>
      
      {/* HeyDriver Ad */}
      <a href="https://heydriver.ph/booking" target="_blank" rel="noreferrer" style={styles.adLinkCard}>
        <div style={styles.adEmoji}>🚗</div>
        <div>
          <div style={styles.adTitle}>Need Airport Pick-up / Rental Car?</div>
          <div style={styles.adDesc}>Book premium van & sedan services at special guest rates.</div>
        </div>
      </a>

      {/* PhiliSpa Ad */}
      <a href="https://philispa.com/call" target="_blank" rel="noreferrer" style={styles.adLinkCard}>
        <div style={styles.adEmoji}>💆</div>
        <div>
          <div style={styles.adTitle}>24/7 Hotel-Grade In-Room Massage</div>
          <div style={styles.adDesc}>Relieve travel fatigue with certified therapists delivered to your unit.</div>
        </div>
      </a>
    </div>
  );
}

// Pure CSS-in-JS for clean Next.js rendering without forcing styling library updates
const styles: Record<string, React.CSSProperties> = {
  wrapper: { padding: '24px', backgroundColor: '#f8fafc', minHeight: '100vh', fontFamily: '-apple-system, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  centered: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '15px', color: '#64748b' },
  errorBox: { padding: '30px', textAlign: 'center', color: '#dc2626', fontWeight: 'bold', marginTop: '40px' },
  headerBox: { textAlign: 'center', marginBottom: '20px', width: '100%', maxWidth: '400px' },
  condoName: { fontSize: '20px', fontWeight: 'bold', color: '#0f172a', margin: 0 },
  unitNumber: { fontSize: '13px', color: '#64748b', marginTop: '4px', fontWeight: 500 },
  qrCard: { backgroundColor: '#fff', width: '100%', maxWidth: '400px', borderRadius: '20px', padding: '24px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', border: '1px solid #e2e8f0', textAlign: 'center', marginBottom: '25px' },
  badge: { backgroundColor: '#f0fdf4', color: '#16a34a', fontSize: '10px', fontWeight: 'bold', padding: '4px 8px', borderRadius: '6px', letterSpacing: '0.5px' },
  guestName: { fontSize: '18px', fontWeight: 'bold', color: '#1e293b', marginTop: '12px', marginBottom: '20px' },
  qrWrapper: { padding: '15px', backgroundColor: '#fff', display: 'inline-block', borderRadius: '12px', border: '1px solid #f1f5f9' },
  timerText: { fontSize: '12px', color: '#64748b', marginTop: '15px', fontWeight: '500' },
  notice: { fontSize: '11px', color: '#94a3b8', marginTop: '8px', paddingLeft: '20px', paddingRight: '20px', lineHeight: '15px' },
  adHeading: { width: '100%', maxWidth: '400px', fontSize: '14px', fontWeight: 'bold', color: '#334155', marginBottom: '10px', textAlign: 'left' },
  adLinkCard: { width: '100%', maxWidth: '400px', backgroundColor: '#fff', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit', marginBottom: '12px' },
  adEmoji: { fontSize: '28px', marginRight: '16px' },
  adTitle: { fontSize: '13px', fontWeight: 'bold', color: '#0f172a' },
  adDesc: { fontSize: '11px', color: '#64748b', marginTop: '3px', lineHeight: '15px' }
};