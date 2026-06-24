import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { createClient } from '@supabase/supabase-js';
import { GuestPassAdBanner } from './GuestPassAdBanner'; // 동일한 폴더에 있다고 가정한 경로입니다.

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function GuestPassWebView() {
  const router = useRouter();
  const { pass_code } = router.query;
  const [passData, setPassData] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. 화면에 위조 방지용 실시간 시계 바인딩 (초 단위 갱신)
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!pass_code) return;
    fetchPassSecurityDetails();
  }, [pass_code]);

  const fetchPassSecurityDetails = async () => {
    const { data, error } = await supabase
      .from('guest_passes')
      .select('guest_name, valid_from, valid_until, status, condos(name), units(unit_number)')
      .eq('pass_code', pass_code as string)
      .single();

    if (!error && data) {
      setPassData(data);
    }
    setLoading(false);
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', marginTop: '50px' }}>Loading Gate Pass...</div>;
  if (!passData || passData.status !== 'Active') return <div style={{ textAlign: 'center', marginTop: '50px', color: 'red' }}>⚠️ Invalid or Expired Gate Pass.</div>;

  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', padding: '20px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#333' }}>{passData.condos?.name}</h2>
      <p style={{ color: '#666', fontSize: '14px' }}>Visitor Gate Access Pass</p>

      {/* 실시간 보안 타이머 (가드 요원이 캡처본 배포 여부를 필터링하는 도구) */}
      <div style={{ backgroundColor: '#f1f3f5', padding: '10px', borderRadius: '8px', margin: '15px 0', fontWeight: 'bold', color: '#0056b3' }}>
        🛡️ Live Security Time: {currentTime}
      </div>

      {/* QR 데이터로 고유 pass_code 주입 (가드가 스캔 시 이 코드로 검증) */}
      <div style={{ margin: '30px 0', display: 'inline-block', padding: '15px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <QRCodeSVG value={pass_code as string} size={200} />
      </div>

      <div style={{ borderTop: '1px solid #eee', paddingTop: '15px', textAlign: 'left' }}>
        <p><strong>Guest Name:</strong> {passData.guest_name}</p>
        <p><strong>Destination:</strong> Unit {passData.units?.unit_number}</p>
        <p style={{ fontSize: '13px', color: '#555' }}><strong>Valid From:</strong> {new Date(passData.valid_from).toLocaleString('en-US')}</p>
        <p style={{ fontSize: '13px', color: 'red' }}><strong>Valid Until:</strong> {new Date(passData.valid_until).toLocaleString('en-US')}</p>
      </div>

      {/* 하단 제휴 광고 위젯 마운트 */}
      <GuestPassAdBanner condoName={passData.condos?.name} unitNumber={passData.units?.unit_number} />
    </div>
  );
}