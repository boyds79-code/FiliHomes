"use client";

import React, { useState, useEffect } from 'react';
import BillingManager from '../../../components/BillingManager';
import VillageSettings from '../../../components/VillageSettings';
import ParcelManager from '../../../components/ParcelManager';
import MaintenanceJobOrderManager from '../../../components/MaintenanceJobOrderManager';
// 1. 임포트 추가
import VisitorLogManager from '../../../components/VisitorLogManager';
import VehicleRegistryManager from '../../../components/VehicleRegistryManager';
import NoticeManager from '../../../components/NoticeManager';

type MenuTab = 'BILLINGS' | 'PARCELS' | 'JOB_ORDERS' | 'SETTINGS' | 'VISITOR_LOG' | 'VEHICLES' | 'NOTICES';

const getTabName = (tab: MenuTab) => {
  switch(tab) {
    case 'BILLINGS': return 'BILLINGS LEDGER';
    case 'PARCELS': return 'PARCELS CONTROL';
    case 'JOB_ORDERS': return 'MAINTENANCE JOB ORDERS';
    case 'VISITOR_LOG': return 'VISITOR CONTROL';
    case 'VEHICLES': return 'VEHICLE REGISTRY';
    case 'NOTICES': return 'COMMUNITY BULLETINS';
    default: return 'PROPERTY SETTINGS';
  }
};

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<MenuTab>('BILLINGS');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const DEMO_CONDO_ID = "c1111111-1111-1111-1111-111111111111"; // 🎯 정확한 DB UUID (수정 완료)

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) {
        setIsSidebarOpen(true); // 데스크탑에서는 항상 보이게
      } else {
        setIsSidebarOpen(false); // 모바일로 전환 시 숨김
      }
    };
    
    handleResize(); // 초기 실행
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      
      {/* 🧭 Sidebar */}
      {(isSidebarOpen || !isMobile) && (
        <>
          {/* Mobile Overlay */}
          {isMobile && isSidebarOpen && (
            <div 
              style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40 }}
              onClick={() => setIsSidebarOpen(false)}
            />
          )}

          <div style={{ 
            width: '260px', flexShrink: 0, backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0', padding: '24px',
            ...(isMobile ? { position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50, overflowY: 'auto' } : {}) 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e3a8a', margin: 0 }}>🏢 FiliHomes</h1>
              {isMobile && (
                <button onClick={() => setIsSidebarOpen(false)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>✕</button>
              )}
            </div>
            
            <div style={{ marginBottom: '24px' }}>
              <div style={styles.menuLabel}>Quick Access</div>
              <button onClick={() => { setActiveTab('BILLINGS'); if(isMobile) setIsSidebarOpen(false); }} style={getMenuBtnStyle(activeTab === 'BILLINGS')}>💰 Billings Ledger</button>
              <button onClick={() => { setActiveTab('PARCELS'); if(isMobile) setIsSidebarOpen(false); }} style={getMenuBtnStyle(activeTab === 'PARCELS')}>📦 Parcels Control</button>
            </div>
            <div style={{ marginBottom: '24px' }}>
              <div style={styles.menuLabel}>Lifestyle</div>
              <button onClick={() => { setActiveTab('JOB_ORDERS'); if(isMobile) setIsSidebarOpen(false); }} style={getMenuBtnStyle(activeTab === 'JOB_ORDERS')}>🛠️ Job Orders</button>
            </div>
            <div style={{ marginBottom: '24px' }}>
              <div style={styles.menuLabel}>Security & Access</div>
              <button 
                onClick={() => { 
                  setActiveTab('VISITOR_LOG'); 
                  if(isMobile) setIsSidebarOpen(false); 
                }} 
                style={getMenuBtnStyle(activeTab === 'VISITOR_LOG')}>
                🛡️ Visitor Control
              </button>
              <button 
                onClick={() => { setActiveTab('VEHICLES'); if(isMobile) setIsSidebarOpen(false); }} 
                style={getMenuBtnStyle(activeTab === 'VEHICLES')}>
                🚗 Vehicle Registry
              </button>
            </div>
            <div style={{ marginBottom: '24px' }}>
              <div style={styles.menuLabel}>Communications</div>
              <button onClick={() => { setActiveTab('NOTICES'); if(isMobile) setIsSidebarOpen(false); }} style={getMenuBtnStyle(activeTab === 'NOTICES')}>📢 Notice Board</button>
            </div>
            <div style={{ marginBottom: '24px' }}>
              <div style={styles.menuLabel}>Management Core</div>
              <button onClick={() => { setActiveTab('SETTINGS'); if(isMobile) setIsSidebarOpen(false); }} style={getMenuBtnStyle(activeTab === 'SETTINGS')}>⚙️ Village Settings</button>
            </div>
          </div>
        </>
      )}

      {/* ️ Main Viewport */}
      <div style={{ flex: 1, minWidth: 0, padding: isMobile ? '20px' : '40px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isMobile && (
              <button onClick={() => setIsSidebarOpen(true)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', padding: 0 }}>☰</button>
            )}
            <div style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>Command Center &gt; <span style={{ color: '#0f172a', fontWeight: 'bold' }}>{getTabName(activeTab)}</span></div>
          </div>
          <button style={{ backgroundColor: '#0f172a', color: '#ffffff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>Logout</button>
        </div>

        {/* Dynamic Workspace Mount */}
        <div style={{ minHeight: '600px' }}>
          {activeTab === 'BILLINGS' && <BillingManager />}
          {activeTab === 'PARCELS' && <ParcelManager condoId={DEMO_CONDO_ID} />}
          {activeTab === 'JOB_ORDERS' && <MaintenanceJobOrderManager condoId={DEMO_CONDO_ID} />}
          {activeTab === 'SETTINGS' && <VillageSettings showTabs={true} />}
          {activeTab === 'VISITOR_LOG' && <VisitorLogManager condoId={DEMO_CONDO_ID} />}
          {activeTab === 'VEHICLES' && <VehicleRegistryManager condoId={DEMO_CONDO_ID} />}
          {activeTab === 'NOTICES' && <NoticeManager condoId={DEMO_CONDO_ID} />}
        </div>
      </div>
    </div>
  );
}

// 🎯 Clean style reuse logic
const getMenuBtnStyle = (isActive: boolean): React.CSSProperties => ({
  width: '100%', border: 'none', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', textAlign: 'left', cursor: 'pointer', marginBottom: '4px',
  backgroundColor: isActive ? '#f1f5f9' : 'transparent', color: isActive ? '#2563eb' : '#475569', fontWeight: isActive ? 'bold' : '500', transition: 'all 0.15s ease'
});

const styles = {
  menuLabel: { fontSize: '10px', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', paddingLeft: '8px' }
};