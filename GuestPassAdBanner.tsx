import React from 'react';

interface GuestPassAdBannerProps {
  condoName?: string; // undefined 값이 넘어와도 에러가 나지 않도록 옵셔널(?) 처리
  unitNumber?: string;
}

export function GuestPassAdBanner({ condoName, unitNumber }: GuestPassAdBannerProps) {
  // API 데이터 지연 또는 누락 시 크래시를 방지하는 방어적 코드 추가
  const condoParam = encodeURIComponent(condoName || 'Unknown');
  const unitParam = encodeURIComponent(unitNumber || 'Unknown');

  // 게스트 맞춤형 웰컴 프로모션 예약 링크 주입
  const heydriverUrl = `https://heydriver.com/book?promo=WELCOME_CEBU&condo=${condoParam}&unit=${unitParam}`;
  const philispaUrl = `https://philispa.com/reserve?promo=WELCOME_CEBU&condo=${condoParam}&unit=${unitParam}`;

  return (
    <div style={{ marginTop: '30px', borderTop: '2px dashed #e9ecef', paddingTop: '20px' }}>
      <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#495057', textAlign: 'left', marginBottom: '12px' }}>
        ✨ Tourist Specials for Your Stay
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* HeyDriver 공항 픽업/렌트 제어 배너 */}
        <a 
          href={heydriverUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', padding: '12px', backgroundColor: '#e8f5e9', borderRadius: '10px', textDecoration: 'none', border: '1px solid #c8e6c9' }}
        >
          <span style={{ fontSize: '24px', marginRight: '12px' }}>🛬</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 'bold', color: '#2e7d32', fontSize: '14px' }}>Need Airport Transfer or Car Rental?</div>
            <div style={{ fontSize: '11px', color: '#4caf50', marginTop: '2px' }}>Book with HeyDriver — Special Cebu tourist rate applied</div>
          </div>
        </a>

        {/* PhiliSpa 인룸 테라피 제어 배너 */}
        <a 
          href={philispaUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', padding: '12px', backgroundColor: '#f3e5f5', borderRadius: '10px', textDecoration: 'none', border: '1px solid #e1bee7' }}
        >
          <span style={{ fontSize: '24px', marginRight: '12px' }}>🌿</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 'bold', color: '#4a148c', fontSize: '14px' }}>Fatigued from your flight?</div>
            <div style={{ fontSize: '11px', color: '#8e24aa', marginTop: '2px' }}>Call PhiliSpa directly to your unit. 24/7 available.</div>
          </div>
        </a>
      </div>
    </div>
  );
}