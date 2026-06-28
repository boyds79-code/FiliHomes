"use client";

import { useState, useEffect, useRef } from 'react';
import BillingManager from '../../components/BillingManager'; 
import MaintenanceJobOrderManager from '../../components/MaintenanceJobOrderManager';
import ParcelManager from '../../components/ParcelManager';
import RealtimeIntercomMatrix from '../../components/RealtimeIntercomMatrix';
import StaffRadioMatrix from '../../components/StaffRadioMatrix';
import SecuritySanctionManager from '../../components/SecuritySanctionManager';
import CondoSettings from '../../components/CondoSettings';
import OccupantManager from '../../components/OccupantManager';
import VehicleRegistryManager from '../../components/VehicleRegistryManager';
import AdminStaffManager from '../../components/admin/StaffManager';
import { supabase } from '../lib/supabaseClient';
import NoticeManager from '../../components/NoticeManager';
import ReportIssueManager from '../../components/ReportIssueManager';
import SuperAdminManager from '../../components/SuperAdminManager';
import { getHQStaffList, HQStaff } from '../lib/platformService';
import SubscriptionBillingManager from '../../components/SubscriptionBillingManager';
import AdvertiserManager from '../../components/AdvertiserManager';
import DashboardOverview from '../../components/DashboardOverview';
import AmenityBookingManager from '../../components/AmenityBookingManager';
import VisitorLogManager from '../../components/VisitorLogManager';
import SystemLogManager from '../../components/SystemLogManager';

type MenuType =
  | 'dashboard'
  | 'billings-issuance'
  | 'billings-audit'
  | 'occupants-directory'
  | 'occupants-register'
  | 'occupants-requests'
  | 'occupants-invitations'
  | 'occupants-vehicles'
  | 'parcels-dormant'
  | 'parcels-holding'
  | 'parcels-blackbox'
  | 'jobs-new'
  | 'jobs-active'
  | 'intercom'
  | 'staff-radio-security'
  | 'staff-radio-maintenance'
  | 'staff-radio-amenity'
  | 'security'
  | 'staff-payroll'
  | 'settings-property'
  | 'settings-app'
  | 'settings-staff'
  | 'settings-report'
  | 'settings-subscription'
  | 'super-admin-panel'
  | 'notices'
  | 'amenity-bookings'
  | 'hq-analytics'
  | 'hq-contracts'
  | 'hq-subscriptions'
  | 'hq-ads'
  | 'hq-ad-payments'
  | 'hq-staff'
  | 'hq-payroll'
  | 'visitor-control'
  | 'system-logs';

const menuLabels: Record<MenuType, string> = {
  'dashboard': 'Dashboard Overview',
  'billings-issuance': 'Issuance Hub',
  'billings-audit': 'Audit Ledger',
  'occupants-directory': 'Occupants Directory',
  'occupants-register': 'Pre-Approve Residents',
  'occupants-requests': 'Homeowner Requests',
  'occupants-invitations': 'App Invitations',
  'occupants-vehicles': 'Vehicle Registry',
  'parcels-dormant': 'Unclaimed Cargo',
  'parcels-holding': 'Holdings',
  'parcels-blackbox': 'Parcel Audit Trail',
  'jobs-new': 'New Job Requests',
  'jobs-active': 'Active Job Settlements',
  'intercom': 'Live Intercom',
  'staff-radio-security': 'Security Radio',
  'staff-radio-maintenance': 'Maintenance Radio',
  'staff-radio-amenity': 'Amenity Radio',
  'security': 'Security Center',
  'staff-payroll': 'Staff Payroll',
  'settings-property': 'Property Settings',
  'settings-app': 'App Settings',
  'settings-staff': 'Staff Management',
  'settings-report': 'Report Platform Issue',
  'settings-subscription': 'Subscription Billing',
  'super-admin-panel': 'HQ Operations Console',
  'notices': 'Community Bulletins',
  'amenity-bookings': 'Amenity Bookings',
  'hq-analytics': 'Usage Analytics',
  'hq-contracts': 'Condo Contracts',
  'hq-subscriptions': 'Condo Subscription Billing',
  'hq-ads': 'Ad Campaigns',
  'hq-ad-payments': 'Ad Revenue Tracker',
  'hq-staff': 'HR Role',
  'hq-payroll': 'HQ Staff Payroll',
  'visitor-control': 'Visitor Control',
  'system-logs': 'System & Activity Logs',
};

const getBreadcrumbPath = (menu: MenuType): string[] => {
  switch (menu) {
    case 'dashboard':
      return ["Command Center", "Dashboard Overview"];
    case 'billings-issuance':
      return ["Command Center", "Billings", "Issuance"];
    case 'billings-audit':
      return ["Command Center", "Billings", "Audit"];
    case 'occupants-directory':
      return ["Command Center", "Occupants", "Directory"];
    case 'occupants-register':
      return ["Command Center", "Occupants", "Pre-Approve Residents"];
    case 'occupants-requests':
      return ["Command Center", "Occupants", "Homeowner Requests"];
    case 'occupants-invitations':
      return ["Command Center", "Occupants", "App Invitations"];
    case 'occupants-vehicles':
      return ["Command Center", "Occupants", "Vehicle Registry"];
    case 'parcels-dormant':
      return ["Command Center", "Parcels", "Unclaimed Cargo"];
    case 'parcels-holding':
      return ["Command Center", "Parcels", "Holdings"];
    case 'parcels-blackbox':
      return ["Command Center", "Parcels", "Parcel Audit Trail"];
    case 'jobs-new':
      return ["Command Center", "Job Orders", "New Job Requests"];
    case 'jobs-active':
      return ["Command Center", "Job Orders", "Active Job Settlements"];
    case 'intercom':
      return ["Command Center", "Live Intercom"];
    case 'security':
      return ["Command Center", "Security Center"];
    case 'notices':
      return ["Command Center", "Notice Board"];
    case 'amenity-bookings':
      return ["Command Center", "Amenity Bookings"];
    case 'staff-payroll':
      return ["Command Center", "Staff Payroll"];
    case 'visitor-control':
      return ["Command Center", "Visitor Control"];
    case 'system-logs':
      return ["Command Center", "System & Activity Logs"];
    case 'settings-property':
      return ["Command Center", "Settings", "Property Settings"];
    case 'settings-app':
      return ["Command Center", "Settings", "App Settings"];
    case 'settings-staff':
      return ["Command Center", "Settings", "Staff Management"];
    case 'settings-report':
      return ["Command Center", "Settings", "Report Issue"];
    case 'settings-subscription':
      return ["Command Center", "Settings", "Subscription Billing"];
    case 'hq-analytics':
      return ["Command Center", "Console Hub", "Usage Analytics"];
    case 'hq-contracts':
      return ["Command Center", "Condo Management", "Condo Contracts"];
    case 'hq-subscriptions':
      return ["Command Center", "Condo Management", "Condo Subscription Billing"];
    case 'hq-ads':
      return ["Command Center", "Advertisement", "Ad Campaigns"];
    case 'hq-ad-payments':
      return ["Command Center", "Advertisement", "Ad Revenue Tracker"];
    case 'hq-staff':
      return ["Command Center", "HR Management", "HR Role"];
    case 'hq-payroll':
      return ["Command Center", "HR Management", "HQ Staff Payroll"];
    default:
      return ["Command Center"];
  }
};

const DashboardIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" />
  </svg>
);

// --- Unified Premium Outline SVG Icons ---
const BillingsIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

const OccupantsIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.97 5.97 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
  </svg>
);

const ParcelsIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
  </svg>
);

const JobsIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17L12 13.5H9.682l-.462 1.386a1.125 1.125 0 01-1.397.707l-2.025-.506a1.125 1.125 0 01-.767-1.46L6.5 7.5l1.62-.54a1.125 1.125 0 011.397.707L10 9h2.318l.462-1.386a1.125 1.125 0 011.397-.707l2.025.506a1.125 1.125 0 01.767 1.46L15.5 13.5l-1.62.54a1.125 1.125 0 01-1.397-.707l-.063-.19z" />
  </svg>
);

const IntercomIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 15h.008v.008H6.75V15zm0-.75h.008v.008H6.75v-.008zm0-.75h.008v.008H6.75v-.008zm0-.75h.008v.008H6.75v-.008zm0-.75h.008v.008H6.75v-.008zm0-.75h.008v.008H6.75v-.008zM12 8.25v1.5m0 2.25v.008m-3.75-2.258h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008zm7.5-2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008v-.008z" />
  </svg>
);

const SecurityIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);

const PayrollIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5h16.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H3.75a1.5 1.5 0 0 1-1.5-1.5V6a1.5 1.5 0 0 1 1.5-1.5Zm12 4.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
);

const SettingsIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.43l-1.003.828c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.99l1.005.831a1.125 1.125 0 01.26 1.43l-1.297 2.247a1.125 1.125 0 01-1.37.49l-1.216-.456a1.125 1.125 0 01-1.07.124c-.073-.044-.146-.087-.22-.128-.332-.183-.582-.495-.644-.869l-.213-1.281a1.125 1.125 0 01-1.112-.94h-2.594a1.125 1.125 0 01-1.11.94l-.213 1.281c-.062.374-.312.686-.644.87-.074.04-.147.083-.22.127-.324.196-.72.257-1.076.124l-1.217-.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.43l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.831a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.49l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const NoticesIcon = () => (
  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M17.657 6.343a8 8 0 010 11.314M11.5 6.5h-3a1.5 1.5 0 00-1.5 1.5v6A1.5 1.5 0 008.5 15.5h3l5.5 4V2.5l-5.5 4z" />
  </svg>
);

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    className={`w-3.5 h-3.5 transform transition-transform duration-200 ${expanded ? 'rotate-90' : ''} text-slate-400 hidden lg:block`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
  </svg>
);

const playPremiumNotificationSound = () => {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    // Play first tone (C5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    gain1.gain.setValueAtTime(0.08, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.3);
    
    // Play second tone (E5) with small delay
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
    gain2.gain.setValueAtTime(0, ctx.currentTime);
    gain2.gain.setValueAtTime(0.08, ctx.currentTime + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    
    osc2.start(ctx.currentTime + 0.1);
    osc2.stop(ctx.currentTime + 0.4);
  } catch (e) {
    console.warn("Audio Context playback failed or blocked by autoplay policy:", e);
  }
};

const sendDesktopNotification = (title: string, body: string) => {
  if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: 'https://api.dicebear.com/7.x/identicon/svg?seed=FiliCondo'
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(title, {
            body,
            icon: 'https://api.dicebear.com/7.x/identicon/svg?seed=FiliCondo'
          });
        }
      });
    }
  }
};

export default function DashboardPage() {
  const [currentMenu, setCurrentMenu] = useState<MenuType>('dashboard');
  const [occupantsTab, setOccupantsTab] = useState<'DIRECTORY' | 'REGISTER' | 'REQUESTS'>('DIRECTORY');
  
  const [expandedBillings, setExpandedBillings] = useState(false);
  const [expandedOccupants, setExpandedOccupants] = useState(false);
  const [expandedParcels, setExpandedParcels] = useState(false);
  const [expandedJobs, setExpandedJobs] = useState(false);
  const [expandedSettings, setExpandedSettings] = useState(false);
  const [expandedStaffRadio, setExpandedStaffRadio] = useState(false);
  
  const [expandedHqCondo, setExpandedHqCondo] = useState(true);
  const [expandedHqAd, setExpandedHqAd] = useState(true);
  const [expandedHqHr, setExpandedHqHr] = useState(true);

  // Live real-time badges states
  const [overdueParcelCount, setOverdueParcelCount] = useState<number>(0);
  const [newJobsCount, setNewJobsCount] = useState<number>(0);
  const [occupantRequestsCount, setOccupantRequestsCount] = useState<number>(0);
  const [newIntercomsCount, setNewIntercomsCount] = useState<number>(0);
  const [newBookingsCount, setNewBookingsCount] = useState<number>(0);
  const [newReportedIssuesCount, setNewReportedIssuesCount] = useState<number>(0);
  const [pendingBillingsCount, setPendingBillingsCount] = useState<number>(0);

  // Refs to store previous badge counts for triggering audio and push alerts
  const prevCountsRef = useRef({
    occupantRequests: 0,
    overdueParcels: 0,
    newJobs: 0,
    newIntercoms: 0,
    newBookings: 0,
    newReportedIssues: 0,
    pendingBillings: 0
  });

  useEffect(() => {
    const checkRequests = async () => {
      // 1. Get mock requests from localStorage
      const stored = window.localStorage.getItem('filicondo_occupant_requests');
      let localRequestsCount = 0;
      let mockEmails: string[] = [];
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const mocks = parsed.filter((r: any) => r.id.startsWith('req-'));
          localRequestsCount = mocks.length;
          mockEmails = mocks.map((r: any) => r.email.toLowerCase());
        } catch (e) {
          console.error(e);
        }
      }

      // 2. Fetch all mappings from DB
      let dbRequestsCount = 0;
      try {
        const res = await fetch('/api/admin/occupants?condoId=c1111111-1111-1111-1111-111111111111');
        if (res.ok) {
          const data = await res.json();
          // Filter mappings that are pending and check for duplicate emails against mock emails to prevent overlap
          const dbPendings = (data || []).filter((occ: any) => occ.status === 'pending');
          const uniqueDbPendings = dbPendings.filter((db: any) => !mockEmails.includes(db.profiles?.email?.toLowerCase()));
          dbRequestsCount = uniqueDbPendings.length;
        }
      } catch (err) {
        console.error("Failed to fetch occupant requests for badge count:", err);
      }

      setOccupantRequestsCount(localRequestsCount + dbRequestsCount);
    };
    checkRequests();
    window.addEventListener('occupantRequestsUpdated', checkRequests);
    return () => {
      window.removeEventListener('occupantRequestsUpdated', checkRequests);
    };
  }, []);

  // Browser notification permission request on component mount
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  // Fetch active intercom count in real time
  useEffect(() => {
    const fetchIntercomCount = async () => {
      try {
        const { count, error } = await supabase
          .from('intercom_sessions')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'ACTIVE');
        if (!error && count !== null) {
          setNewIntercomsCount(count);
        }
      } catch (e) {
        console.error("Failed to fetch intercom count:", e);
      }
    };
    fetchIntercomCount();

    const channel = supabase
      .channel('realtime-intercom-count-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intercom_sessions' }, () => {
        fetchIntercomCount();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Fetch pending amenity bookings in real time
  useEffect(() => {
    const fetchBookingsCount = async () => {
      try {
        const { data: pendingBookings, error: pendingError } = await supabase
          .from('amenity_bookings')
          .select('id, unit_id')
          .eq('status', 'PENDING');
        
        if (pendingError) throw pendingError;

        if (pendingBookings && pendingBookings.length > 0) {
          const unitIds = Array.from(new Set(pendingBookings.map(b => b.unit_id).filter(Boolean)));
          if (unitIds.length > 0) {
            const { data: unitsData, error: unitsError } = await supabase
              .from('units')
              .select('id, condo_id')
              .in('id', unitIds)
              .eq('condo_id', 'c1111111-1111-1111-1111-111111111111');
            
            if (unitsError) throw unitsError;
            
            const matchedUnitIds = new Set(unitsData.map(u => u.id));
            const count = pendingBookings.filter(b => b.unit_id && matchedUnitIds.has(b.unit_id)).length;
            setNewBookingsCount(count);
          } else {
            setNewBookingsCount(0);
          }
        } else {
          setNewBookingsCount(0);
        }
      } catch (e) {
        console.error("Failed to fetch bookings count:", e);
      }
    };
    fetchBookingsCount();

    const channel = supabase
      .channel('realtime-bookings-count-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'amenity_bookings' }, () => {
        fetchBookingsCount();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Fetch open platform issues / reported issues in real time
  useEffect(() => {
    const fetchIssuesCount = async () => {
      let localCount = 0;
      if (typeof window !== 'undefined') {
        const stored = window.localStorage.getItem('filicondo_platform_issues');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            localCount = parsed.filter((issue: any) => issue.status === 'OPEN').length;
          } catch (e) {
            console.error(e);
          }
        }
      }

      let dbCount = 0;
      try {
        const { count, error } = await supabase
          .from('platform_issues')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'OPEN');
        if (!error && count !== null) {
          dbCount = count;
        }
      } catch (e) {
        console.error("Failed to fetch platform issues count:", e);
      }

      setNewReportedIssuesCount(localCount + dbCount);
    };
    fetchIssuesCount();

    const channel = supabase
      .channel('realtime-issues-count-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_issues' }, () => {
        fetchIssuesCount();
      })
      .subscribe();

    window.addEventListener('platformIssuesUpdated', fetchIssuesCount);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('platformIssuesUpdated', fetchIssuesCount);
    };
  }, []);

  // Fetch pending billing receipts (requested audits) in real time
  useEffect(() => {
    const fetchPendingBillingsCount = async () => {
      try {
        const { count, error } = await supabase
          .from('billings')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'REQUESTED');
        if (!error && count !== null) {
          setPendingBillingsCount(count);
        }
      } catch (e) {
        console.error("Failed to fetch pending billings count:", e);
      }
    };
    fetchPendingBillingsCount();

    // ⚡ Add 4-second polling fallback in case Supabase Realtime publication is disabled for billings
    const interval = setInterval(fetchPendingBillingsCount, 4000);

    const channel = supabase
      .channel('realtime-billings-count-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'billings' }, () => {
        fetchPendingBillingsCount();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  // Monitor counts and trigger push/sound notifications on increments
  useEffect(() => {
    const prev = prevCountsRef.current;
    let incremented = false;
    let notifyTitle = '';
    let notifyBody = '';

    // Check if any count incremented (ignore initial mount where prev counts are 0)
    const isInitial = prev.occupantRequests === 0 && prev.overdueParcels === 0 && prev.newJobs === 0 && 
                      prev.newIntercoms === 0 && prev.newBookings === 0 && prev.newReportedIssues === 0 && 
                      prev.pendingBillings === 0;

    if (!isInitial) {
      if (occupantRequestsCount > prev.occupantRequests) {
        incremented = true;
        notifyTitle = '🏢 New Homeowner Request!';
        notifyBody = `A resident is waiting for verification. (Total pending: ${occupantRequestsCount})`;
      } else if (overdueParcelCount > prev.overdueParcels) {
        incremented = true;
        notifyTitle = '📦 Unclaimed Cargo Alert!';
        notifyBody = `New dormant parcel reported at lobby. (Total: ${overdueParcelCount})`;
      } else if (newJobsCount > prev.newJobs) {
        incremented = true;
        notifyTitle = '🛠️ New Maintenance Request!';
        notifyBody = `A new maintenance work order has been filed. (Total requested: ${newJobsCount})`;
      } else if (newIntercomsCount > prev.newIntercoms) {
        incremented = true;
        notifyTitle = '💬 Live Intercom Session!';
        notifyBody = `An active intercom session is waiting for review. (Total: ${newIntercomsCount})`;
      } else if (newBookingsCount > prev.newBookings) {
        incremented = true;
        notifyTitle = '🏊 New Amenity Booking!';
        notifyBody = `A resident has submitted a new reservation. (Total pending: ${newBookingsCount})`;
      } else if (newReportedIssuesCount > prev.newReportedIssues) {
        incremented = true;
        notifyTitle = '⚠️ New Platform Issue Reported!';
        notifyBody = `A new system or PMO issue has been filed. (Total open: ${newReportedIssuesCount})`;
      } else if (pendingBillingsCount > prev.pendingBillings) {
        incremented = true;
        notifyTitle = '💰 New Resident Payment Receipt!';
        notifyBody = `A resident has submitted a new proof of payment. (Total pending: ${pendingBillingsCount})`;
      }

      if (incremented) {
        playPremiumNotificationSound();
        sendDesktopNotification(notifyTitle, notifyBody);
      }
    }

    // Update refs to current values
    prevCountsRef.current = {
      occupantRequests: occupantRequestsCount,
      overdueParcels: overdueParcelCount,
      newJobs: newJobsCount,
      newIntercoms: newIntercomsCount,
      newBookings: newBookingsCount,
      newReportedIssues: newReportedIssuesCount,
      pendingBillings: pendingBillingsCount
    };
  }, [
    occupantRequestsCount,
    overdueParcelCount,
    newJobsCount,
    newIntercomsCount,
    newBookingsCount,
    newReportedIssuesCount,
    pendingBillingsCount
  ]);

  const handleDashboardNavigate = (menu: MenuType, options?: any) => {
    if (menu === 'occupants-directory') {
      if (options?.tab === 'REQUESTS') {
        setCurrentMenu('occupants-requests');
      } else if (options?.tab === 'REGISTER') {
        setCurrentMenu('occupants-register');
      } else {
        setOccupantsTab(options?.tab || 'DIRECTORY');
        setCurrentMenu('occupants-directory');
      }
      setExpandedOccupants(true);
    } else if (menu.startsWith('billings-')) {
      setExpandedBillings(true);
      setCurrentMenu(menu);
    } else if (menu.startsWith('parcels-')) {
      setExpandedParcels(true);
      setCurrentMenu(menu);
    } else if (menu.startsWith('jobs-')) {
      setExpandedJobs(true);
      setCurrentMenu(menu);
    } else if (menu.startsWith('settings-')) {
      setExpandedSettings(true);
      setCurrentMenu(menu);
    } else {
      setCurrentMenu(menu);
    }
  };

  // Condo setting features states
  const [visitorParkingEnabled, setVisitorParkingEnabled] = useState(true);
  const [amenityBookingEnabled, setAmenityBookingEnabled] = useState(true);

  // Authorization and role simulation states
  const [staffList, setStaffList] = useState<any[]>([]);
  const [hqStaffList, setHqStaffList] = useState<HQStaff[]>([]);
  const [currentUser, setCurrentUser] = useState<string>('master-admin');
  const [isBillingManager, setIsBillingManager] = useState<boolean>(true);
  const [userPermissions, setUserPermissions] = useState<{
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
  }>({ create: true, read: true, update: true, delete: true });
  const [currentUserRole, setCurrentUserRole] = useState<string>('PMO_MANAGER');

  const fetchStaffForDropdown = async () => {
    try {
      const response = await fetch('/api/admin/staff', { cache: 'no-store' });
      const rawData = await response.json();
      if (Array.isArray(rawData)) {
        setStaffList(rawData);
      }
    } catch (err) {
      console.error("Error fetching staff for role checking:", err);
    }
  };

  const fetchHQStaffList = async () => {
    try {
      const data = await getHQStaffList();
      setHqStaffList(data);
    } catch (e) {
      console.error("Error fetching HQ Staff in page.tsx:", e);
    }
  };

  useEffect(() => {
    fetchStaffForDropdown();
    fetchHQStaffList();
  }, []);

  // Real-time synchronization of staff permissions
  useEffect(() => {
    const channel = supabase
      .channel('realtime-staff-permissions-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_profiles' }, () => {
        fetchStaffForDropdown();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Periodically refresh HQ staff designation to keep in sync
  useEffect(() => {
    if (currentMenu.startsWith('hq-') || currentMenu === 'system-logs') {
      fetchHQStaffList();
    }
  }, [currentMenu]);

  // Calculate current authorization status when user or list changes
  useEffect(() => {
    if (currentUser === 'master-admin') {
      setIsBillingManager(true);
      setUserPermissions({ create: true, read: true, update: true, delete: true });
      setCurrentUserRole('PMO_MANAGER');
    } else if (currentUser === 'super-admin') {
      setIsBillingManager(true);
      setUserPermissions({ create: true, read: true, update: true, delete: true });
      setCurrentUserRole('SUPER_ADMIN');
    } else {
      // Check if it's an HQ staff member
      const hqFound = hqStaffList.find(s => s.id === currentUser);
      if (hqFound) {
        const perms = hqFound.permissions || { create_payroll: false, view_payroll: false, edit_payroll: false, delete_payroll: false };
        setIsBillingManager(!!perms.view_payroll);
        setUserPermissions({
          create: !!perms.create_payroll,
          read: !!perms.view_payroll,
          update: !!perms.edit_payroll,
          delete: !!perms.delete_payroll
        });
        setCurrentUserRole(hqFound.role || 'HQ_STAFF');
      } else {
        const found = staffList.find(s => s.id === currentUser);
        if (found) {
          setIsBillingManager(!!found.payroll_settings?.is_billing_manager);
          const perms = found.payroll_settings?.permissions || { create: false, read: false, update: false, delete: false };
          setUserPermissions({
            create: !!perms.create,
            read: !!perms.read,
            update: !!perms.update,
            delete: !!perms.delete
          });
          setCurrentUserRole(found.role || 'TECHNICIAN');
        } else {
          setIsBillingManager(false);
          setUserPermissions({ create: false, read: false, update: false, delete: false });
          setCurrentUserRole('UNKNOWN');
        }
      }
    }
  }, [currentUser, staffList, hqStaffList]);

  // Tab routing security fallback
  useEffect(() => {
    if (currentUser === 'super-admin') {
      if (!currentMenu.startsWith('hq-')) {
        setCurrentMenu('hq-analytics');
      }
    } else {
      if (currentMenu.startsWith('hq-') || currentMenu === 'super-admin-panel') {
        setCurrentMenu('intercom'); // fallback to safe menu
      }
      if (currentMenu === 'staff-payroll' && !isBillingManager) {
        setCurrentMenu('intercom'); // fallback to safe menu
      }
    }
  }, [currentMenu, currentUser, isBillingManager]);

  // 0. Fetch condo settings and listen for changes in real time
  useEffect(() => {
    const condoId = 'c1111111-1111-1111-1111-111111111111';
    const fetchSettings = async () => {
      try {
        const { data } = await supabase
          .from('condo_settings')
          .select('visitor_parking_enabled, amenity_booking_enabled')
          .eq('condo_id', condoId)
          .maybeSingle();
        if (data) {
          setVisitorParkingEnabled(data.visitor_parking_enabled !== false);
          setAmenityBookingEnabled(data.amenity_booking_enabled !== false);
        }
      } catch (e) {
        console.error("Error fetching condo settings:", e);
      }
    };
    fetchSettings();

    const channel = supabase
      .channel('realtime-condo-settings-dashboard')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'condo_settings', 
        filter: `condo_id=eq.${condoId}` 
      }, (payload: any) => {
        if (payload.new) {
          setVisitorParkingEnabled(payload.new.visitor_parking_enabled !== false);
          setAmenityBookingEnabled(payload.new.amenity_booking_enabled !== false);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 1. Fetch overdue parcel count in real time
  useEffect(() => {
    const fetchOverdueCount = async () => {
      try {
        const { count, error } = await supabase
          .from('parcels')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'ARRIVED')
          .eq('is_overdue', true);
        if (!error && count !== null) {
          setOverdueParcelCount(count);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchOverdueCount();

    const channel = supabase
      .channel('realtime-parcel-count-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parcels' }, () => {
        fetchOverdueCount();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 2. Fetch pending/new job requests count in real time
  useEffect(() => {
    const fetchJobsCount = async () => {
      try {
        const actualCondoId = 'c1111111-1111-1111-1111-111111111111';
        const { count, error } = await supabase
          .from('job_orders')
          .select('*', { count: 'exact', head: true })
          .eq('condo_id', actualCondoId)
          .eq('status', 'REQUESTED');
        if (!error && count !== null) {
          setNewJobsCount(count);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchJobsCount();

    const channel = supabase
      .channel('realtime-jobs-count-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_orders' }, () => {
        fetchJobsCount();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const toggleBillings = () => {
    setExpandedBillings(true);
    setExpandedOccupants(false);
    setExpandedParcels(false);
    setExpandedJobs(false);
    setExpandedSettings(false);
    setExpandedStaffRadio(false);
    if (currentMenu !== 'billings-issuance' && currentMenu !== 'billings-audit') {
      setCurrentMenu('billings-issuance');
    }
  };

  const toggleOccupants = () => {
    setExpandedOccupants(true);
    setExpandedBillings(false);
    setExpandedParcels(false);
    setExpandedJobs(false);
    setExpandedSettings(false);
    setExpandedStaffRadio(false);
    if (currentMenu !== 'occupants-directory' && currentMenu !== 'occupants-vehicles') {
      setCurrentMenu('occupants-directory');
    }
  };

  const toggleParcels = () => {
    setExpandedParcels(true);
    setExpandedBillings(false);
    setExpandedOccupants(false);
    setExpandedJobs(false);
    setExpandedSettings(false);
    setExpandedStaffRadio(false);
    if (currentMenu !== 'parcels-dormant' && currentMenu !== 'parcels-holding' && currentMenu !== 'parcels-blackbox') {
      setCurrentMenu('parcels-dormant');
    }
  };

  const toggleJobs = () => {
    setExpandedJobs(true);
    setExpandedBillings(false);
    setExpandedOccupants(false);
    setExpandedParcels(false);
    setExpandedSettings(false);
    setExpandedStaffRadio(false);
    if (currentMenu !== 'jobs-new' && currentMenu !== 'jobs-active') {
      setCurrentMenu('jobs-new');
    }
  };

  const toggleSettings = () => {
    setExpandedSettings(true);
    setExpandedBillings(false);
    setExpandedOccupants(false);
    setExpandedParcels(false);
    setExpandedJobs(false);
    setExpandedStaffRadio(false);
    if (currentMenu !== 'settings-property' && currentMenu !== 'settings-app' && currentMenu !== 'settings-staff') {
      setCurrentMenu('settings-property');
    }
  };

  const toggleStaffRadio = () => {
    setExpandedStaffRadio(true);
    setExpandedBillings(false);
    setExpandedOccupants(false);
    setExpandedParcels(false);
    setExpandedJobs(false);
    setExpandedSettings(false);
    if (currentMenu !== 'staff-radio-security' && currentMenu !== 'staff-radio-maintenance' && currentMenu !== 'staff-radio-amenity') {
      setCurrentMenu('staff-radio-security');
    }
  };

  const selectFlatMenu = (menu: MenuType) => {
    setCurrentMenu(menu);
    setExpandedBillings(false);
    setExpandedOccupants(false);
    setExpandedParcels(false);
    setExpandedJobs(false);
    setExpandedSettings(false);
    setExpandedStaffRadio(false);
  };

  if (currentUser.startsWith('advertiser-')) {
    return (
      <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
        {/* Simplified Sidebar for Advertiser */}
        <aside className="hidden md:flex flex-col h-screen sticky top-0 bg-slate-900 border-r border-slate-800 p-4 lg:p-6 transition-all duration-300 w-20 lg:w-64 shrink-0 overflow-y-auto text-slate-100">
          <div className="mb-10 text-center lg:text-left">
            <h1 className="hidden lg:block font-black text-xl text-blue-400 tracking-tight">📣 Ads Portal</h1>
            <h1 className="block lg:hidden font-black text-xl text-blue-400">📣</h1>
          </div>
          <nav className="space-y-2 flex-1">
            <div className="text-slate-400 text-xs font-bold uppercase px-4 py-2 tracking-wider hidden lg:block">Partner Dashboard</div>
            <button className="w-full text-left lg:px-4 py-2.5 rounded-lg bg-blue-600 text-white font-bold flex justify-center lg:justify-start items-center gap-2">
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9s2.015-9 4.5-9m0 0a9.003 9.003 0 0 1 8.716 6.747M12 3a9.003 9.003 0 0 0-8.716 6.747M12 9h.01M12 12h.01M12 15h.01M12 18h.01M13.5 6H12v6h1.5m-3-6H12v6h-1.5" />
              </svg>
              <span className="hidden lg:inline text-xs lg:text-sm font-semibold">Ad Campaign Hub</span>
            </button>
          </nav>
        </aside>
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 w-full overflow-hidden">
          <header className="h-16 bg-white border-b border-slate-200 flex justify-between items-center px-8 shrink-0">
            <span className="text-sm font-bold text-slate-500">
              Advertiser Console <span className="text-slate-300 mx-2">|</span> 
              <span className="text-slate-800 tracking-wide">Overview</span>
            </span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-slate-500">Act As:</span>
                <select 
                  value={currentUser} 
                  onChange={(e) => setCurrentUser(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded px-2.5 py-1 font-semibold text-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <optgroup label="👑 simulated Platform Roles">
                    <option value="master-admin">👑 Master Admin (Authorized)</option>
                    <option value="super-admin">🏢 Super Admin (HQ Platform Operator)</option>
                    <option value="advertiser-globe">📣 Globe Telecom (Advertiser)</option>
                    <option value="advertiser-pldt">📣 PLDT Home (Advertiser)</option>
                  </optgroup>
                  <optgroup label="🏢 HQ Staff & Operators">
                    {hqStaffList.map((s) => {
                      const isAuth = !!s.is_designated;
                      return (
                        <option key={s.id} value={s.id}>
                          👤 {s.name} ({s.role}) — {isAuth ? 'Designated HR Admin' : 'Access Restricted'}
                        </option>
                      );
                    })}
                  </optgroup>
                  <optgroup label="🏢 Condo Local Staff">
                    {staffList.map((s) => {
                      const isAuth = !!s.payroll_settings?.is_billing_manager;
                      return (
                        <option key={s.id} value={s.id}>
                          {s.role === 'GUARD' ? '🛡️' : s.role === 'TECHNICIAN' ? '👨‍🔧' : '👤'} {s.full_name} ({isAuth ? 'Authorized' : 'Restricted'})
                        </option>
                      );
                    })}
                  </optgroup>
                </select>
              </div>
              <button 
                onClick={() => setCurrentUser('master-admin')}
                className="bg-slate-800 text-white px-5 py-2 rounded-lg text-xs font-bold hover:bg-slate-700 transition"
              >
                Logout Partner
              </button>
            </div>
          </header>
          
          <main className="p-4 md:p-8 overflow-y-auto flex-1 bg-slate-50">
            <AdvertiserManager advertiserName={currentUser === 'advertiser-globe' ? 'Globe Telecom' : 'PLDT Home'} />
          </main>
        </div>
      </div>
    );
  }
  const activeHQUser = hqStaffList.find(s => s.id === currentUser);
  const isHQAdmin = currentUser === 'super-admin' || !!(activeHQUser && activeHQUser.is_designated);

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      
      {/* 1. Sidebar navigation with expand/collapse capabilities */}
      {isHQAdmin ? (
        <aside className="hidden md:flex flex-col h-screen sticky top-0 bg-slate-900 border-r border-slate-800 p-4 lg:p-6 transition-all duration-300 w-20 lg:w-64 shrink-0 overflow-y-auto text-slate-100">
          <div className="mb-10 text-center lg:text-left">
            <h1 className="hidden lg:block font-black text-xl text-blue-400 tracking-tight">🏢 HQ Operations</h1>
            <h1 className="block lg:hidden font-black text-xl text-blue-400">🏢</h1>
          </div>
          <nav className="space-y-4 flex-1">
            
            {/* Group 1: Console Hub */}
            <div className="space-y-1">
              <span className="hidden lg:block text-[10px] font-black uppercase text-slate-500 tracking-wider px-4">Console Hub</span>
              <button 
                onClick={() => selectFlatMenu('hq-analytics')} 
                className={`w-full text-left lg:px-4 py-2.5 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                  currentMenu === 'hq-analytics' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-800 hover:text-white font-medium'
                }`}
                title="Usage Analytics"
              >
                <span className="shrink-0">📊</span>
                <span className="hidden lg:inline text-xs lg:text-sm font-semibold">Usage Analytics</span>
              </button>
            </div>

            {/* Group 2: Condo Management Accordion */}
            <div className="space-y-1">
              <button
                onClick={() => setExpandedHqCondo(!expandedHqCondo)}
                className="w-full text-left lg:px-4 py-2.5 rounded-lg transition-colors flex items-center justify-between text-slate-400 hover:bg-slate-800 hover:text-white font-medium"
              >
                <div className="flex items-center justify-center lg:justify-start w-full lg:w-auto gap-2">
                  <span className="shrink-0">🏢</span>
                  <span className="hidden lg:inline text-xs lg:text-sm font-semibold">Condo Management</span>
                </div>
                <ChevronIcon expanded={expandedHqCondo} />
              </button>

              {expandedHqCondo && (
                <div className="mt-1 space-y-1 lg:pl-6 transition-all duration-200">
                  <button
                    onClick={() => selectFlatMenu('hq-contracts')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'hq-contracts'
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white font-medium'
                    }`}
                    title="Condo Contracts"
                  >
                    <span className="hidden lg:inline text-xs lg:text-sm font-semibold">• Condo Contracts</span>
                  </button>
                  <button
                    onClick={() => selectFlatMenu('hq-subscriptions')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'hq-subscriptions'
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white font-medium'
                    }`}
                    title="Condo Subscription"
                  >
                    <span className="hidden lg:inline text-xs lg:text-sm font-semibold">• Condo Subscription</span>
                  </button>
                </div>
              )}
            </div>

            {/* Group 3: Advertisement Accordion */}
            <div className="space-y-1">
              <button
                onClick={() => setExpandedHqAd(!expandedHqAd)}
                className="w-full text-left lg:px-4 py-2.5 rounded-lg transition-colors flex items-center justify-between text-slate-400 hover:bg-slate-800 hover:text-white font-medium"
              >
                <div className="flex items-center justify-center lg:justify-start w-full lg:w-auto gap-2">
                  <span className="shrink-0">📢</span>
                  <span className="hidden lg:inline text-xs lg:text-sm font-semibold">Advertisement</span>
                </div>
                <ChevronIcon expanded={expandedHqAd} />
              </button>

              {expandedHqAd && (
                <div className="mt-1 space-y-1 lg:pl-6 transition-all duration-200">
                  <button
                    onClick={() => selectFlatMenu('hq-ads')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'hq-ads'
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white font-medium'
                    }`}
                    title="Ad Campaigns"
                  >
                    <span className="hidden lg:inline text-xs lg:text-sm font-semibold">• Ad Campaigns</span>
                  </button>
                  <button
                    onClick={() => selectFlatMenu('hq-ad-payments')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'hq-ad-payments'
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white font-medium'
                    }`}
                    title="Ad Revenue Tracker"
                  >
                    <span className="hidden lg:inline text-xs lg:text-sm font-semibold">• Ad Revenue Tracker</span>
                  </button>
                </div>
              )}
            </div>

            {/* Group 4: HR Management Accordion */}
            <div className="space-y-1">
              <button
                onClick={() => setExpandedHqHr(!expandedHqHr)}
                className="w-full text-left lg:px-4 py-2.5 rounded-lg transition-colors flex items-center justify-between text-slate-400 hover:bg-slate-800 hover:text-white font-medium"
              >
                <div className="flex items-center justify-center lg:justify-start w-full lg:w-auto gap-2">
                  <span className="shrink-0">👥</span>
                  <span className="hidden lg:inline text-xs lg:text-sm font-semibold">HR Management</span>
                </div>
                <ChevronIcon expanded={expandedHqHr} />
              </button>

              {expandedHqHr && (
                <div className="mt-1 space-y-1 lg:pl-6 transition-all duration-200">
                  <button
                    onClick={() => selectFlatMenu('hq-staff')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'hq-staff'
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white font-medium'
                    }`}
                    title="HR Role"
                  >
                    <span className="hidden lg:inline text-xs lg:text-sm font-semibold">• HR Role</span>
                  </button>
                  <button
                    onClick={() => selectFlatMenu('hq-payroll')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'hq-payroll'
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white font-medium'
                    }`}
                    title="Payroll"
                  >
                    <span className="hidden lg:inline text-xs lg:text-sm font-semibold">• Payroll</span>
                  </button>
                </div>
              )}
            </div>

          </nav>
        </aside>
      ) : (
        <aside className="hidden md:flex flex-col h-screen sticky top-0 bg-white border-r border-slate-200 p-4 lg:p-6 transition-all duration-300 w-20 lg:w-64 shrink-0 overflow-y-auto">
          
          <div className="mb-10 text-center lg:text-left">
            <h1 className="hidden lg:block font-black text-xl text-blue-700 tracking-tight">🏢 FiliCondo Admin</h1>
            <h1 className="block lg:hidden font-black text-xl text-blue-700">🏢</h1>
          </div>
          
          <nav className="space-y-2 flex-1">
            {/* Dashboard Overview */}
            <button 
              onClick={() => {
                selectFlatMenu('dashboard');
                setOccupantsTab('DIRECTORY');
              }} 
              className={`w-full text-left lg:px-4 py-2.5 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                currentMenu === 'dashboard' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-100 font-medium'
              }`}
              title="Dashboard Overview"
            >
              <DashboardIcon />
              <span className="hidden lg:inline text-xs lg:text-sm font-semibold">Dashboard Overview</span>
            </button>

            {/* Occupants Accordion */}
            <div className="space-y-1">
              <button 
                onClick={toggleOccupants} 
                className={`w-full text-left lg:px-4 py-2.5 rounded-lg transition-colors flex items-center justify-between ${
                  currentMenu === 'occupants-directory' || currentMenu === 'occupants-register' || currentMenu === 'occupants-requests' || currentMenu === 'occupants-invitations' || currentMenu === 'occupants-vehicles'
                    ? 'bg-blue-50 text-blue-700 font-bold'
                    : 'text-slate-600 hover:bg-slate-100 font-medium'
                }`}
                title="Occupants"
              >
                <div className="flex items-center justify-center lg:justify-start w-full lg:w-auto gap-2">
                  <OccupantsIcon />
                  <span className="hidden lg:inline">Occupants</span>
                  {occupantRequestsCount > 0 && (
                    <span className="bg-red-500 text-white text-[9px] w-4.5 h-4.5 flex items-center justify-center rounded-full font-extrabold leading-none animate-pulse shrink-0">
                      {occupantRequestsCount}
                    </span>
                  )}
                </div>
                <ChevronIcon expanded={expandedOccupants} />
              </button>

              {expandedOccupants && (
                <div className="mt-1 space-y-1 lg:pl-6 transition-all duration-200">
                  <button
                    onClick={() => {
                      setCurrentMenu('occupants-directory');
                      setOccupantsTab('DIRECTORY');
                    }}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'occupants-directory'
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="Directory"
                  ><span className="w-5 flex items-center justify-center shrink-0"><span className="font-bold text-lg text-slate-400 select-none">•</span></span><span className="hidden lg:inline text-xs lg:text-sm font-semibold">Directory</span></button>

                  <button
                    onClick={() => {
                      setCurrentMenu('occupants-register');
                    }}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'occupants-register'
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="Pre-Approve Residents"
                  ><span className="w-5 flex items-center justify-center shrink-0"><span className="font-bold text-lg text-slate-400 select-none">•</span></span><span className="hidden lg:inline text-xs lg:text-sm font-semibold">Pre-Approve Residents</span></button>

                  <button
                    onClick={() => {
                      setCurrentMenu('occupants-requests');
                    }}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'occupants-requests'
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="Homeowner Requests"
                  >
                    <span className="w-5 flex items-center justify-center shrink-0">
                      {occupantRequestsCount > 0 ? (
                        <span className="bg-red-500 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full font-bold leading-none animate-pulse">
                          {occupantRequestsCount}
                        </span>
                      ) : (
                        <span className="font-bold text-lg text-slate-400 select-none">•</span>
                      )}
                    </span>
                    <span className="hidden lg:inline text-xs lg:text-sm font-semibold">Homeowner Requests</span>
                    {occupantRequestsCount > 0 && (
                      <span className="hidden lg:inline ml-auto bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                        {occupantRequestsCount}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setCurrentMenu('occupants-invitations');
                    }}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'occupants-invitations'
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="App Invitations"
                  >
                    <span className="w-5 flex items-center justify-center shrink-0">
                      <span className="font-bold text-lg text-slate-400 select-none">•</span>
                    </span>
                    <span className="hidden lg:inline text-xs lg:text-sm font-semibold">App Invitations</span>
                  </button>

                  {visitorParkingEnabled && (
                    <button
                      onClick={() => setCurrentMenu('occupants-vehicles')}
                      className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                        currentMenu === 'occupants-vehicles'
                          ? 'bg-emerald-50 text-emerald-700 font-bold'
                          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                      }`}
                      title="Vehicle Registry"
                    ><span className="w-5 flex items-center justify-center shrink-0"><span className="font-bold text-lg text-slate-400 select-none">•</span></span><span className="hidden lg:inline text-xs lg:text-sm font-semibold">Vehicle Registry</span></button>
                  )}
                </div>
              )}
            </div>

            {/* Billings Accordion */}
            <div className="space-y-1">
              <button 
                onClick={toggleBillings} 
                className={`w-full text-left lg:px-4 py-2.5 rounded-lg transition-colors flex items-center justify-between ${
                  currentMenu === 'billings-issuance' || currentMenu === 'billings-audit'
                    ? 'bg-blue-50 text-blue-700 font-bold'
                    : 'text-slate-600 hover:bg-slate-100 font-medium'
                }`}
                title="Billings"
              >
                <div className="flex items-center justify-center lg:justify-start w-full lg:w-auto gap-2">
                  <BillingsIcon />
                  <span className="hidden lg:inline">Billings</span>
                  {pendingBillingsCount > 0 && (
                    <span className="bg-red-500 text-white text-[9px] w-4.5 h-4.5 flex items-center justify-center rounded-full font-extrabold leading-none animate-pulse shrink-0">
                      {pendingBillingsCount}
                    </span>
                  )}
                </div>
                <ChevronIcon expanded={expandedBillings} />
              </button>

              {expandedBillings && (
                <div className="mt-1 space-y-1 lg:pl-6 transition-all duration-200">
                  <button
                    onClick={() => setCurrentMenu('billings-issuance')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'billings-issuance'
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="Verification"
                  ><span className="w-5 flex items-center justify-center shrink-0"><span className="font-bold text-lg text-slate-400 select-none">•</span></span><span className="hidden lg:inline text-xs lg:text-sm font-semibold">Issuance</span></button>

                  <button
                    onClick={() => setCurrentMenu('billings-audit')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-between items-center gap-2 ${
                      currentMenu === 'billings-audit'
                        ? 'bg-emerald-50 text-emerald-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="Audit"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 flex items-center justify-center shrink-0"><span className="font-bold text-lg text-slate-400 select-none">•</span></span>
                      <span className="hidden lg:inline text-xs lg:text-sm font-semibold">Audit</span>
                    </div>
                    {pendingBillingsCount > 0 && (
                      <span className="bg-red-500 text-white text-[9px] w-4.5 h-4.5 flex items-center justify-center rounded-full font-bold leading-none shrink-0 mr-2 lg:mr-0">
                        {pendingBillingsCount}
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Parcels Accordion */}
            <div className="space-y-1">
              <button 
                onClick={toggleParcels} 
                className={`w-full text-left lg:px-4 py-2.5 rounded-lg transition-colors flex items-center justify-between ${
                  currentMenu === 'parcels-dormant' || currentMenu === 'parcels-holding' || currentMenu === 'parcels-blackbox'
                    ? 'bg-blue-50 text-blue-700 font-bold'
                    : 'text-slate-600 hover:bg-slate-100 font-medium'
                }`}
                title="Parcels"
              >
                <div className="flex items-center justify-center lg:justify-start w-full lg:w-auto gap-2">
                  <ParcelsIcon />
                  <span className="hidden lg:inline">Parcels</span>
                  {overdueParcelCount > 0 && (
                    <span className="bg-red-500 text-white text-[9px] w-4.5 h-4.5 flex items-center justify-center rounded-full font-extrabold leading-none animate-pulse shrink-0">
                      {overdueParcelCount}
                    </span>
                  )}
                </div>
                <ChevronIcon expanded={expandedParcels} />
              </button>

              {expandedParcels && (
                <div className="mt-1 space-y-1 lg:pl-6 transition-all duration-200">
                  <button
                    onClick={() => setCurrentMenu('parcels-dormant')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'parcels-dormant'
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="Unclaimed Cargo"
                  ><span className="w-5 flex items-center justify-center shrink-0">{overdueParcelCount > 0 ? <span className="bg-red-500 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full font-bold leading-none">{overdueParcelCount}</span> : <span className="font-bold text-lg text-slate-400 select-none">•</span>}</span><span className="hidden lg:inline text-xs lg:text-sm font-semibold">Unclaimed Cargo</span>{overdueParcelCount > 0 && <span className="hidden lg:inline ml-auto bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full font-bold">{overdueParcelCount}</span>}</button>
 
                  <button
                    onClick={() => setCurrentMenu('parcels-holding')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'parcels-holding'
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="Holdings"
                  ><span className="w-5 flex items-center justify-center shrink-0"><span className="font-bold text-lg text-slate-400 select-none">•</span></span><span className="hidden lg:inline text-xs lg:text-sm font-semibold">Holdings</span></button>

                  <button
                    onClick={() => setCurrentMenu('parcels-blackbox')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'parcels-blackbox'
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="Audit Trail"
                  ><span className="w-5 flex items-center justify-center shrink-0"><span className="font-bold text-lg text-slate-400 select-none">•</span></span><span className="hidden lg:inline text-xs lg:text-sm font-semibold">Audit Trail</span></button>
                </div>
              )}
            </div>

            {/* Job Orders Accordion */}
            <div className="space-y-1">
              <button 
                onClick={toggleJobs} 
                className={`w-full text-left lg:px-4 py-2.5 rounded-lg transition-colors flex items-center justify-between ${
                  currentMenu === 'jobs-new' || currentMenu === 'jobs-active'
                    ? 'bg-blue-50 text-blue-700 font-bold'
                    : 'text-slate-600 hover:bg-slate-100 font-medium'
                }`}
                title="Job Orders"
              >
                <div className="flex items-center justify-center lg:justify-start w-full lg:w-auto gap-2">
                  <JobsIcon />
                  <span className="hidden lg:inline">Job Orders</span>
                  {newJobsCount > 0 && (
                    <span className="bg-red-500 text-white text-[9px] w-4.5 h-4.5 flex items-center justify-center rounded-full font-extrabold leading-none animate-pulse shrink-0">
                      {newJobsCount}
                    </span>
                  )}
                </div>
                <ChevronIcon expanded={expandedJobs} />
              </button>

              {expandedJobs && (
                <div className="mt-1 space-y-1 lg:pl-6 transition-all duration-200">
                  <button
                    onClick={() => setCurrentMenu('jobs-new')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'jobs-new'
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="New Requests"
                  ><span className="w-5 flex items-center justify-center shrink-0">{newJobsCount > 0 ? <span className="bg-blue-500 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full font-bold leading-none">{newJobsCount}</span> : <span className="font-bold text-lg text-slate-400 select-none">•</span>}</span><span className="hidden lg:inline text-xs lg:text-sm font-semibold">New Requests</span>{newJobsCount > 0 && <span className="hidden lg:inline ml-auto bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-bold">{newJobsCount}</span>}</button>

                  <button
                    onClick={() => setCurrentMenu('jobs-active')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'jobs-active'
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="Active Settlements"
                  ><span className="w-5 flex items-center justify-center shrink-0"><span className="font-bold text-lg text-slate-400 select-none">•</span></span><span className="hidden lg:inline text-xs lg:text-sm font-semibold">Active Settlements</span></button>
                </div>
              )}
            </div>

            {/* Visitor Control */}
            <button 
              onClick={() => selectFlatMenu('visitor-control')} 
              className={`w-full text-left lg:px-4 py-2.5 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                currentMenu === 'visitor-control' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-100 font-medium'
              }`}
              title="Visitor Control"
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
              </svg>
              <span className="hidden lg:inline">Visitor Control</span>
            </button>

            {/* Live Intercom */}
            <button 
              onClick={() => selectFlatMenu('intercom')} 
              className={`w-full text-left lg:px-4 py-2.5 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                currentMenu === 'intercom' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-100 font-medium'
              }`}
              title="Live Intercom"
            >
              <IntercomIcon />
              <span className="hidden lg:inline">Live Intercom</span>
              {newIntercomsCount > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[9px] w-4.5 h-4.5 flex items-center justify-center rounded-full font-extrabold leading-none animate-pulse shrink-0">
                  {newIntercomsCount}
                </span>
              )}
            </button>

            {/* Staff Radio Accordion */}
            <div className="space-y-1">
              <button 
                onClick={toggleStaffRadio} 
                className={`w-full text-left lg:px-4 py-2.5 rounded-lg transition-colors flex items-center justify-between ${
                  currentMenu === 'staff-radio-security' || currentMenu === 'staff-radio-maintenance' || currentMenu === 'staff-radio-amenity'
                    ? 'bg-blue-50 text-blue-700 font-bold'
                    : 'text-slate-600 hover:bg-slate-100 font-medium'
                }`}
                title="Staff Radio"
              >
                <div className="flex items-center justify-center lg:justify-start w-full lg:w-auto gap-2">
                  <span className="hidden lg:inline">Staff Radio</span>
                </div>
                <ChevronIcon expanded={expandedStaffRadio} />
              </button>

              {expandedStaffRadio && (
                <div className="mt-1 space-y-1 lg:pl-6 transition-all duration-200">
                  <button
                    onClick={() => setCurrentMenu('staff-radio-security')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'staff-radio-security'
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="Security Radio"
                  >
                    <span className="w-5 flex items-center justify-center shrink-0">
                      <span className="font-bold text-lg text-slate-400 select-none">•</span>
                    </span>
                    <span className="hidden lg:inline text-xs lg:text-sm font-semibold">Security Guard</span>
                  </button>

                  <button
                    onClick={() => setCurrentMenu('staff-radio-maintenance')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'staff-radio-maintenance'
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="Maintenance Radio"
                  >
                    <span className="w-5 flex items-center justify-center shrink-0">
                      <span className="font-bold text-lg text-slate-400 select-none">•</span>
                    </span>
                    <span className="hidden lg:inline text-xs lg:text-sm font-semibold">Maintenance Tech</span>
                  </button>

                  <button
                    onClick={() => setCurrentMenu('staff-radio-amenity')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'staff-radio-amenity'
                        ? 'bg-blue-50 text-blue-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="Amenity Radio"
                  >
                    <span className="w-5 flex items-center justify-center shrink-0">
                      <span className="font-bold text-lg text-slate-400 select-none">•</span>
                    </span>
                    <span className="hidden lg:inline text-xs lg:text-sm font-semibold">Amenity Staff</span>
                  </button>
                </div>
              )}
            </div>

            {/* Notice Board */}
            <button 
              onClick={() => selectFlatMenu('notices')} 
              className={`w-full text-left lg:px-4 py-2.5 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                currentMenu === 'notices' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-100 font-medium'
              }`}
              title="Notice Board"
            >
              <NoticesIcon />
              <span className="hidden lg:inline">Notice Board</span>
            </button>

            {/* Amenity Bookings */}
            {amenityBookingEnabled && (
              <button 
                onClick={() => selectFlatMenu('amenity-bookings')} 
                className={`w-full text-left lg:px-4 py-2.5 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                  currentMenu === 'amenity-bookings' ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-100 font-medium'
                }`}
                title="Amenity Bookings"
              >
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
                <span className="hidden lg:inline text-xs lg:text-sm font-semibold">Amenity Bookings</span>
                {newBookingsCount > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[9px] w-4.5 h-4.5 flex items-center justify-center rounded-full font-extrabold leading-none animate-pulse shrink-0">
                    {newBookingsCount}
                  </span>
                )}
              </button>
            )}

            {/* Security Center */}
            <button 
              onClick={() => selectFlatMenu('security')} 
              className={`w-full text-left lg:px-4 py-2.5 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                currentMenu === 'security' ? 'bg-red-50 text-red-700 font-bold' : 'text-slate-600 hover:bg-slate-100 font-medium'
              }`}
              title="Security Center"
            >
              <SecurityIcon />
              <span className="hidden lg:inline">Security Center</span>
            </button>

            {/* System Logs */}
            <button 
              onClick={() => selectFlatMenu('system-logs')} 
              className={`w-full text-left lg:px-4 py-2.5 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                currentMenu === 'system-logs' ? 'bg-slate-100 text-slate-800 font-bold border-l-2 border-slate-700' : 'text-slate-600 hover:bg-slate-100 font-medium'
              }`}
              title="System Logs"
            >
              <svg className="w-5 h-5 shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span className="hidden lg:inline">System Logs</span>
            </button>

            {/* Staff Payroll */}
            {isBillingManager && (
              <button 
                onClick={() => selectFlatMenu('staff-payroll')} 
                className={`w-full text-left lg:px-4 py-2.5 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                  currentMenu === 'staff-payroll' ? 'bg-emerald-50 text-emerald-700 font-bold' : 'text-slate-600 hover:bg-slate-100 font-medium'
                }`}
                title="Staff Payroll"
              >
                <PayrollIcon />
                <span className="hidden lg:inline">Staff Payroll</span>
              </button>
            )}

            {/* Settings Accordion */}
            <div className="space-y-1">
              <button 
                onClick={toggleSettings} 
                className={`w-full text-left lg:px-4 py-2.5 rounded-lg transition-colors flex items-center justify-between ${
                  currentMenu === 'settings-property' || currentMenu === 'settings-app' || currentMenu === 'settings-staff' || currentMenu === 'settings-report'
                    ? 'bg-purple-50 text-purple-700 font-bold'
                    : 'text-slate-600 hover:bg-slate-100 font-medium'
                }`}
                title="Settings"
              >
                <div className="flex items-center justify-center lg:justify-start w-full lg:w-auto gap-2">
                  <SettingsIcon />
                  <span className="hidden lg:inline">Settings</span>
                  {newReportedIssuesCount > 0 && (
                    <span className="bg-red-500 text-white text-[9px] w-4.5 h-4.5 flex items-center justify-center rounded-full font-extrabold leading-none animate-pulse shrink-0">
                      {newReportedIssuesCount}
                    </span>
                  )}
                </div>
                <ChevronIcon expanded={expandedSettings} />
              </button>

              {expandedSettings && (
                <div className="mt-1 space-y-1 lg:pl-6 transition-all duration-200">
                  <button
                    onClick={() => setCurrentMenu('settings-property')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'settings-property'
                        ? 'bg-purple-50 text-purple-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="Property Settings"
                  ><span className="w-5 flex items-center justify-center shrink-0"><span className="font-bold text-lg text-purple-400 select-none">•</span></span><span className="hidden lg:inline text-xs lg:text-sm font-semibold">Property Settings</span></button>

                  <button
                    onClick={() => setCurrentMenu('settings-app')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'settings-app'
                        ? 'bg-purple-50 text-purple-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="App Settings"
                  ><span className="w-5 flex items-center justify-center shrink-0"><span className="font-bold text-lg text-purple-400 select-none">•</span></span><span className="hidden lg:inline text-xs lg:text-sm font-semibold">App Settings</span></button>

                  <button
                    onClick={() => setCurrentMenu('settings-staff')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'settings-staff'
                        ? 'bg-purple-50 text-purple-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="Staff Management"
                  ><span className="w-5 flex items-center justify-center shrink-0"><span className="font-bold text-lg text-purple-400 select-none">•</span></span><span className="hidden lg:inline text-xs lg:text-sm font-semibold">Staff Management</span></button>

                  <button
                    onClick={() => setCurrentMenu('settings-report')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'settings-report'
                        ? 'bg-purple-50 text-purple-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="Report Platform Issue"
                  >
                    <span className="w-5 flex items-center justify-center shrink-0">
                      {newReportedIssuesCount > 0 ? (
                        <span className="bg-red-500 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full font-bold leading-none animate-pulse shrink-0">
                          {newReportedIssuesCount}
                        </span>
                      ) : (
                        <span className="font-bold text-lg text-purple-400 select-none">•</span>
                      )}
                    </span>
                    <span className="hidden lg:inline text-xs lg:text-sm font-semibold">Report Issue</span>
                    {newReportedIssuesCount > 0 && (
                      <span className="hidden lg:inline ml-auto bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                        {newReportedIssuesCount}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setCurrentMenu('settings-subscription')}
                    className={`w-full text-left lg:px-4 py-2 rounded-lg transition-colors flex justify-center lg:justify-start items-center gap-2 ${
                      currentMenu === 'settings-subscription'
                        ? 'bg-purple-50 text-purple-700 font-bold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 font-medium'
                    }`}
                    title="Subscription Billing"
                  ><span className="w-5 flex items-center justify-center shrink-0"><span className="font-bold text-lg text-purple-400 select-none">•</span></span><span className="hidden lg:inline text-xs lg:text-sm font-semibold">Subscription Billing</span></button>
                </div>
              )}
            </div>
          </nav>
        </aside>
      )}

      {/* 2. Main content area */}
      <div className="flex-1 flex flex-col min-w-0 w-full overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 flex justify-between items-center px-8 shrink-0">
          <span className="text-sm font-bold text-slate-500">
            {getBreadcrumbPath(currentMenu).map((segment, idx, arr) => (
              <span key={idx}>
                {idx > 0 && <span className="text-slate-300 mx-2">/</span>}
                <span className={idx === arr.length - 1 ? "text-slate-800 tracking-wide font-extrabold" : "text-slate-500 font-semibold"}>
                  {segment}
                </span>
              </span>
            ))}
          </span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-500">Act As:</span>
              <select 
                value={currentUser} 
                onChange={(e) => setCurrentUser(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded px-2.5 py-1 font-semibold text-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <optgroup label="👑 simulated Platform Roles">
                  <option value="master-admin">👑 Master Admin (Authorized)</option>
                  <option value="super-admin">🏢 Super Admin (HQ Platform Operator)</option>
                  <option value="advertiser-globe">📣 Globe Telecom (Advertiser)</option>
                  <option value="advertiser-pldt">📣 PLDT Home (Advertiser)</option>
                </optgroup>
                <optgroup label="🏢 HQ Staff & Operators">
                  {hqStaffList.map((s) => {
                    const isAuth = !!s.is_designated;
                    return (
                      <option key={s.id} value={s.id}>
                        👤 {s.name} ({s.role}) — {isAuth ? 'Designated HR Admin' : 'Access Restricted'}
                      </option>
                    );
                  })}
                </optgroup>
                <optgroup label="🏢 Condo Local Staff">
                  {staffList.map((s) => {
                    const isAuth = !!s.payroll_settings?.is_billing_manager;
                    return (
                      <option key={s.id} value={s.id}>
                        {s.role === 'GUARD' ? '🛡️' : s.role === 'TECHNICIAN' ? '👨‍🔧' : '👤'} {s.full_name} ({isAuth ? 'Authorized' : 'Restricted'})
                      </option>
                    );
                  })}
                </optgroup>
              </select>
            </div>
            <button className="bg-slate-800 text-white px-5 py-2 rounded-lg text-xs font-bold hover:bg-slate-700 transition">Logout</button>
          </div>
        </header>
        
        <main className="p-4 md:p-8 overflow-y-auto flex-1 bg-slate-50">
          {currentMenu === 'dashboard' && (
            <DashboardOverview 
              onNavigate={(menu: any, options?: any) => handleDashboardNavigate(menu, options)} 
              overdueParcelCount={overdueParcelCount} 
              newJobsCount={newJobsCount} 
            />
          )}
          {currentMenu === 'billings-issuance' && <BillingManager initialView="ISSUANCE" />}
          {currentMenu === 'billings-audit' && <BillingManager initialView="VERIFICATION" />}
          {currentMenu === 'occupants-directory' && <OccupantManager condoId="c1111111-1111-1111-1111-111111111111" initialTab={occupantsTab} />}
          {currentMenu === 'occupants-register' && <OccupantManager condoId="c1111111-1111-1111-1111-111111111111" initialTab="REGISTER" />}
          {currentMenu === 'occupants-requests' && <OccupantManager condoId="c1111111-1111-1111-1111-111111111111" initialTab="REQUESTS" />}
          {currentMenu === 'occupants-invitations' && <OccupantManager condoId="c1111111-1111-1111-1111-111111111111" initialTab="INVITATIONS" />}
          {currentMenu === 'occupants-vehicles' && <VehicleRegistryManager condoId="solea-residences" />}
          
          {currentMenu === 'parcels-dormant' && <ParcelManager condoId="solea-residences" initialView="DORMANT" />}
          {currentMenu === 'parcels-holding' && <ParcelManager condoId="solea-residences" initialView="HOLDING" />}
          {currentMenu === 'parcels-blackbox' && <ParcelManager condoId="solea-residences" initialView="BLACKBOX" />}
          
          {currentMenu === 'jobs-new' && <MaintenanceJobOrderManager condoId="solea-residences" initialView="NEW_REQUESTS" />}
          {currentMenu === 'jobs-active' && <MaintenanceJobOrderManager condoId="solea-residences" initialView="ACTIVE_JOBS" />}
          
          {currentMenu === 'intercom' && <RealtimeIntercomMatrix condoId="solea-residences" />}
          {currentMenu === 'staff-radio-security' && <StaffRadioMatrix condoId="solea-residences" department="SECURITY" />}
          {currentMenu === 'staff-radio-maintenance' && <StaffRadioMatrix condoId="solea-residences" department="MAINTENANCE" />}
          {currentMenu === 'staff-radio-amenity' && <StaffRadioMatrix condoId="solea-residences" department="AMENITY" />}
          {currentMenu === 'security' && <SecuritySanctionManager condoId="solea-residences" />}
          {currentMenu === 'staff-payroll' && (
            isBillingManager ? (
              <AdminStaffManager condoId="c1111111-1111-1111-1111-111111111111" viewMode="payroll" currentUserPermissions={userPermissions} currentUserRole={currentUserRole} />
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-md mx-auto my-12 shadow-sm">
                <span className="text-4xl">🔑</span>
                <h2 className="text-lg font-bold text-slate-800 mt-4">Access Restricted</h2>
                <p className="text-sm text-slate-500 mt-2">You do not have permission to view or edit Staff Payroll. Contact an administrator to grant access.</p>
              </div>
            )
          )}
          {currentMenu === 'settings-property' && <CondoSettings initialSubTab="property" currentUserRole={currentUserRole} />}
          {currentMenu === 'settings-app' && <CondoSettings initialSubTab="app" currentUserRole={currentUserRole} />}
          {currentMenu === 'settings-staff' && <CondoSettings initialSubTab="staff" currentUserRole={currentUserRole} />}
          {currentMenu === 'settings-report' && <ReportIssueManager condoId="c1111111-1111-1111-1111-111111111111" />}
          {currentMenu === 'settings-subscription' && <SubscriptionBillingManager condoId="c1111111-1111-1111-1111-111111111111" />}
          {currentMenu.startsWith('hq-') && (
            <SuperAdminManager 
              activeTab={
                currentMenu === 'hq-analytics' ? 'analytics' :
                currentMenu === 'hq-contracts' ? 'contracts' :
                currentMenu === 'hq-subscriptions' ? 'subscriptions' :
                currentMenu === 'hq-ads' ? 'ads' :
                currentMenu === 'hq-ad-payments' ? 'ad_payments' :
                currentMenu === 'hq-staff' ? 'staff_list' :
                currentMenu === 'hq-payroll' ? 'payroll' : 'analytics'
              }
              setActiveTab={(tab) => {
                const mappedMenu = 
                  tab === 'analytics' ? 'hq-analytics' :
                  tab === 'contracts' ? 'hq-contracts' :
                  tab === 'subscriptions' ? 'hq-subscriptions' :
                  tab === 'ads' ? 'hq-ads' :
                  tab === 'ad_payments' ? 'hq-ad-payments' :
                  tab === 'staff_list' ? 'hq-staff' :
                  tab === 'payroll' ? 'hq-payroll' : 'hq-analytics';
                setCurrentMenu(mappedMenu);
              }}
              currentUser={currentUser}
              hqStaffList={hqStaffList}
            />
          )}
          {currentMenu === 'notices' && <NoticeManager condoId="c1111111-1111-1111-1111-111111111111" />}
          {currentMenu === 'amenity-bookings' && <AmenityBookingManager condoId="c1111111-1111-1111-1111-111111111111" />}
           {currentMenu === 'visitor-control' && <VisitorLogManager condoId="c1111111-1111-1111-1111-111111111111" />}
          {currentMenu === 'system-logs' && <SystemLogManager condoId="c1111111-1111-1111-1111-111111111111" />}
        </main>
      </div>
    </div>
  );
}