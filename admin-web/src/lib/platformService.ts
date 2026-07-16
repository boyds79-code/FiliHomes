import { supabase } from './supabaseClient';

export interface PlatformIssue {
  id: string;
  condo_id: string;
  condo_name?: string;
  title: string;
  description: string;
  reported_by: string;
  reported_by_name?: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  created_at: string;
}

export interface AdCampaign {
  id: string;
  title: string;
  image_url: string;
  link_url: string;
  target_type: 'GLOBAL' | 'CONDO';
  condo_id: string | null;
  condo_name?: string;
  status: 'ACTIVE' | 'PAUSED' | 'EXPIRED';
  created_at: string;
}

export interface CondoUsageStat {
  condo_id: string;
  condo_name: string;
  visitor_count: number;
  job_order_count: number;
  parcel_count: number;
  notice_count: number;
  total_score: number;
  daily_traffic: number[]; // Last 7 days traffic
  issues_count: number;
}

// Default static lists in case DB fails to provide them
const MOCK_CONDOS = [
  { id: 'c1111111-1111-1111-1111-111111111111', name: 'Solea Residences' },
  { id: 'c2222222-2222-2222-2222-222222222222', name: 'Phili Tower' },
  { id: 'c3333333-3333-3333-3333-333333333333', name: 'Manila Bay Resort' },
];

const getLocalStorage = <T>(key: string, defaultValue: T): T => {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.error(`Error reading localStorage key "${key}":`, e);
    return defaultValue;
  }
};

const setLocalStorage = <T>(key: string, value: T): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error writing localStorage key "${key}":`, e);
  }
};

/**
 * Fetch all condos helper
 */
export async function getCondos(): Promise<{ id: string; name: string }[]> {
  try {
    const { data, error } = await supabase.from('condos').select('id, name');
    if (error || !data || data.length === 0) {
      return MOCK_CONDOS;
    }
    return data;
  } catch {
    return MOCK_CONDOS;
  }
}

/**
 * PLATFORM ISSUES SERVICE
 */
export async function reportIssue(issue: Omit<PlatformIssue, 'id' | 'status' | 'created_at'>): Promise<PlatformIssue> {
  const newIssue: PlatformIssue = {
    ...issue,
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
    status: 'OPEN',
    created_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase.from('platform_issues').insert([newIssue]).select().single();
    if (!error && data) {
      return data as PlatformIssue;
    }
    // If table missing or RLS error, fallback to localStorage
    console.warn("DB write failed for platform_issues, falling back to LocalStorage:", error);
  } catch (e) {
    console.warn("DB write error for platform_issues, falling back to LocalStorage:", e);
  }

  const issues = getLocalStorage<PlatformIssue[]>('filihomes_platform_issues', []);
  issues.push(newIssue);
  setLocalStorage('filihomes_platform_issues', issues);
  return newIssue;
}

export async function getIssues(condoId?: string): Promise<PlatformIssue[]> {
  const condosList = await getCondos();

  try {
    let query = supabase.from('platform_issues').select('*');
    if (condoId) {
      query = query.eq('condo_id', condoId);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (!error && data) {
      return data.map(item => ({
        ...item,
        condo_name: condosList.find(c => c.id === item.condo_id)?.name || 'Unknown Condo'
      })) as PlatformIssue[];
    }
    console.warn("DB fetch failed for platform_issues, falling back to LocalStorage:", error);
  } catch (e) {
    console.warn("DB fetch error for platform_issues, falling back to LocalStorage:", e);
  }

  // Fallback
  let issues = getLocalStorage<PlatformIssue[]>('filihomes_platform_issues', []);
  if (condoId) {
    issues = issues.filter(i => i.condo_id === condoId);
  }
  return issues
    .map(item => ({
      ...item,
      condo_name: condosList.find(c => c.id === item.condo_id)?.name || 'Unknown Condo'
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function updateIssueStatus(issueId: string, status: PlatformIssue['status']): Promise<boolean> {
  try {
    const { error } = await supabase.from('platform_issues').update({ status }).eq('id', issueId);
    if (!error) return true;
    console.warn("DB update failed for platform_issues, falling back to LocalStorage:", error);
  } catch (e) {
    console.warn("DB update error for platform_issues, falling back to LocalStorage:", e);
  }

  const issues = getLocalStorage<PlatformIssue[]>('filihomes_platform_issues', []);
  const idx = issues.findIndex(i => i.id === issueId);
  if (idx !== -1) {
    issues[idx].status = status;
    setLocalStorage('filihomes_platform_issues', issues);
    return true;
  }
  return false;
}

/**
 * AD CAMPAIGNS SERVICE
 */
export async function getAds(condoId?: string): Promise<AdCampaign[]> {
  const condosList = await getCondos();

  try {
    const { data, error } = await supabase.from('ad_campaigns').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      let filtered = data;
      if (condoId) {
        // Ads targeted globally OR targeting the specific condo
        filtered = data.filter(ad => ad.target_type === 'GLOBAL' || ad.condo_id === condoId);
      }
      return filtered.map(item => ({
        ...item,
        condo_name: item.condo_id ? (condosList.find(c => c.id === item.condo_id)?.name || 'Specific Condo') : 'All Condos'
      })) as AdCampaign[];
    }
  } catch (e) {
    console.warn("DB fetch error for ad_campaigns, falling back to LocalStorage:", e);
  }

  // Fallback
  let ads = getLocalStorage<AdCampaign[]>('filihomes_ad_campaigns', []);
  if (condoId) {
    ads = ads.filter(ad => ad.target_type === 'GLOBAL' || ad.condo_id === condoId);
  }
  return ads
    .map(item => ({
      ...item,
      condo_name: item.condo_id ? (condosList.find(c => c.id === item.condo_id)?.name || 'Specific Condo') : 'All Condos'
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function createAd(ad: Omit<AdCampaign, 'id' | 'status' | 'created_at'>): Promise<AdCampaign> {
  const newAd: AdCampaign = {
    ...ad,
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
    status: 'ACTIVE',
    created_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase.from('ad_campaigns').insert([newAd]).select().single();
    if (!error && data) {
      return data as AdCampaign;
    }
    console.warn("DB write failed for ad_campaigns, falling back to LocalStorage:", error);
  } catch (e) {
    console.warn("DB write error for ad_campaigns, falling back to LocalStorage:", e);
  }

  const ads = getLocalStorage<AdCampaign[]>('filihomes_ad_campaigns', []);
  ads.push(newAd);
  setLocalStorage('filihomes_ad_campaigns', ads);
  return newAd;
}

export async function deleteAd(adId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('ad_campaigns').delete().eq('id', adId);
    if (!error) return true;
  } catch (e) {
    console.warn("DB delete error for ad_campaigns, falling back to LocalStorage:", e);
  }

  const ads = getLocalStorage<AdCampaign[]>('filihomes_ad_campaigns', []);
  const filtered = ads.filter(ad => ad.id !== adId);
  setLocalStorage('filihomes_ad_campaigns', filtered);
  return true;
}

/**
 * CONDO ANALYTICS & TRAFFIC SERVICE
 */
export async function getCondoUsageStats(): Promise<CondoUsageStat[]> {
  const condosList = await getCondos();
  const allIssues = await getIssues();

  const stats: CondoUsageStat[] = [];

  for (const condo of condosList) {
    let visitorCount = 0;
    let jobOrderCount = 0;
    let parcelCount = 0;
    let noticeCount = 0;

    try {
      // Get visitor pass count for condo
      const { count: vCount } = await supabase
        .from('visitor_passes')
        .select('*', { count: 'exact', head: true })
        .eq('condo_id', condo.id);
      visitorCount = vCount || 0;

      // Get job order count
      const { count: jCount } = await supabase
        .from('job_orders')
        .select('*', { count: 'exact', head: true })
        .eq('condo_id', condo.id);
      jobOrderCount = jCount || 0;

      // Get parcels count
      // Notice: parcels might use condo_id or not, let's try.
      const { count: pCount } = await supabase
        .from('parcels')
        .select('*', { count: 'exact', head: true })
        .eq('condo_id', condo.id);
      parcelCount = pCount || 0;

      // Get notices count
      const { count: nCount } = await supabase
        .from('notices')
        .select('*', { count: 'exact', head: true })
        .eq('condo_id', condo.id);
      noticeCount = nCount || 0;
    } catch {
      // In case of error (e.g. table not having condo_id, or offline), we use simulated counts
      if (condo.id === 'c1111111-1111-1111-1111-111111111111') {
        visitorCount = 145;
        jobOrderCount = 38;
        parcelCount = 89;
        noticeCount = 12;
      } else if (condo.id === 'c2222222-2222-2222-2222-222222222222') {
        visitorCount = 84;
        jobOrderCount = 19;
        parcelCount = 52;
        noticeCount = 8;
      } else {
        visitorCount = 55;
        jobOrderCount = 11;
        parcelCount = 27;
        noticeCount = 4;
      }
    }

    // Custom score logic
    const totalScore = visitorCount * 2 + jobOrderCount * 5 + parcelCount * 3 + noticeCount * 10;
    
    // Simulate daily traffic trend for last 7 days (e.g. from 100 to 500 requests/actions)
    // We base it on condo's total score + a random trend
    const seed = condo.name.charCodeAt(0) * 10;
    const daily_traffic: number[] = [];
    for (let i = 6; i >= 0; i--) {
      // generate a pseudo-random wave
      const factor = Math.sin((seed + i) * 0.5) * 40 + Math.cos((seed - i) * 0.8) * 20;
      const baseTraffic = Math.max(30, Math.floor(totalScore * 0.4 + factor + 50));
      daily_traffic.push(baseTraffic);
    }

    const condoIssues = allIssues.filter(i => i.condo_id === condo.id).length;

    stats.push({
      condo_id: condo.id,
      condo_name: condo.name,
      visitor_count: visitorCount,
      job_order_count: jobOrderCount,
      parcel_count: parcelCount,
      notice_count: noticeCount,
      total_score: totalScore,
      daily_traffic,
      issues_count: condoIssues
    });
  }

  return stats;
}

/**
 * SUBSCRIPTION PAYMENTS (CONDO PLATFORM FEES)
 */
export interface SubscriptionPayment {
  id: string;
  condo_id: string;
  condo_name?: string;
  billing_period: string;
  amount: number;
  receipt_url: string;
  reference_no: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
}

export async function uploadReceipt(payment: Omit<SubscriptionPayment, 'id' | 'status' | 'created_at'>): Promise<SubscriptionPayment> {
  const newPayment: SubscriptionPayment = {
    ...payment,
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
    status: 'PENDING',
    created_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase.from('subscription_payments').insert([newPayment]).select().single();
    if (!error && data) {
      return data as SubscriptionPayment;
    }
    console.warn("DB write failed for subscription_payments, falling back to LocalStorage:", error);
  } catch (e) {
    console.warn("DB write error for subscription_payments, falling back to LocalStorage:", e);
  }

  const payments = getLocalStorage<SubscriptionPayment[]>('filihomes_subscription_payments', []);
  payments.push(newPayment);
  setLocalStorage('filihomes_subscription_payments', payments);
  return newPayment;
}

export async function getSubscriptionPayments(condoId?: string): Promise<SubscriptionPayment[]> {
  const condosList = await getCondos();

  try {
    let query = supabase.from('subscription_payments').select('*');
    if (condoId) {
      query = query.eq('condo_id', condoId);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (!error && data) {
      return data.map(item => ({
        ...item,
        condo_name: condosList.find(c => c.id === item.condo_id)?.name || 'Unknown Condo'
      })) as SubscriptionPayment[];
    }
  } catch (e) {
    console.warn("DB fetch error for subscription_payments, falling back to LocalStorage:", e);
  }

  // Fallback
  let payments = getLocalStorage<SubscriptionPayment[]>('filihomes_subscription_payments', []);
  
  // Seed initial mock subscription bills if local storage empty
  if (payments.length === 0) {
    payments = [
      {
        id: 'sub-p1',
        condo_id: 'c1111111-1111-1111-1111-111111111111',
        billing_period: '2026-05',
        amount: 25000,
        receipt_url: 'https://example.com/receipts/solea_may.png',
        reference_no: '202605159981',
        status: 'APPROVED',
        created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'sub-p2',
        condo_id: 'c1111111-1111-1111-1111-111111111111',
        billing_period: '2026-06',
        amount: 25000,
        receipt_url: 'https://example.com/receipts/solea_june.png',
        reference_no: '202606214589',
        status: 'PENDING',
        created_at: new Date().toISOString()
      },
      {
        id: 'sub-p3',
        condo_id: 'c2222222-2222-2222-2222-222222222222',
        billing_period: '2026-06',
        amount: 35000,
        receipt_url: 'https://example.com/receipts/phili_june.png',
        reference_no: '202606201124',
        status: 'PENDING',
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];
    setLocalStorage('filihomes_subscription_payments', payments);
  }

  if (condoId) {
    payments = payments.filter(p => p.condo_id === condoId);
  }
  return payments
    .map(item => ({
      ...item,
      condo_name: condosList.find(c => c.id === item.condo_id)?.name || 'Unknown Condo'
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function verifySubscriptionPayment(paymentId: string, status: SubscriptionPayment['status']): Promise<boolean> {
  try {
    const { error } = await supabase.from('subscription_payments').update({ status }).eq('id', paymentId);
    if (!error) return true;
  } catch (e) {
    console.warn("DB update error for subscription_payments, falling back to LocalStorage:", e);
  }

  const payments = getLocalStorage<SubscriptionPayment[]>('filihomes_subscription_payments', []);
  const idx = payments.findIndex(p => p.id === paymentId);
  if (idx !== -1) {
    payments[idx].status = status;
    setLocalStorage('filihomes_subscription_payments', payments);
    return true;
  }
  return false;
}

/**
 * ADVERTISER PAYMENTS TRACKER
 */
export interface AdPayment {
  id: string;
  advertiser_name: string;
  campaign_id: string | null;
  campaign_title?: string;
  amount: number;
  payment_method: string;
  receipt_url?: string | null;
  reference_no?: string | null;
  status: 'PAID' | 'PENDING' | 'APPROVED' | 'REJECTED';
  payment_date: string;
  created_at: string;
}

export async function recordAdPayment(payment: Omit<AdPayment, 'id' | 'created_at'>): Promise<AdPayment> {
  const newPayment: AdPayment = {
    ...payment,
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
    created_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase.from('ad_payments').insert([newPayment]).select().single();
    if (!error && data) {
      return data as AdPayment;
    }
  } catch (e) {
    console.warn("DB write error for ad_payments, falling back to LocalStorage:", e);
  }

  const payments = getLocalStorage<AdPayment[]>('filihomes_ad_payments', []);
  payments.push(newPayment);
  setLocalStorage('filihomes_ad_payments', payments);
  return newPayment;
}

export async function getAdPayments(): Promise<AdPayment[]> {
  const activeAds = await getAds();

  try {
    const { data, error } = await supabase.from('ad_payments').select('*').order('payment_date', { ascending: false });
    if (!error && data) {
      return data.map(item => ({
        ...item,
        campaign_title: activeAds.find(a => a.id === item.campaign_id)?.title || 'General Ad Service'
      })) as AdPayment[];
    }
  } catch (e) {
    console.warn("DB fetch error for ad_payments, falling back to LocalStorage:", e);
  }

  // Fallback
  let payments = getLocalStorage<AdPayment[]>('filihomes_ad_payments', []);
  if (payments.length === 0) {
    payments = [
      {
        id: 'ad-pay-1',
        advertiser_name: 'Globe Telecom Inc.',
        campaign_id: activeAds[0]?.id || null,
        amount: 15000,
        payment_method: 'Bank Transfer',
        receipt_url: 'https://example.com/receipts/globe_ad.png',
        reference_no: '302606214589',
        status: 'APPROVED',
        payment_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'ad-pay-2',
        advertiser_name: 'PLDT Home Fiber',
        campaign_id: null,
        amount: 25000,
        payment_method: 'Cheque',
        receipt_url: 'https://example.com/receipts/pldt_ad.png',
        reference_no: '302606201124',
        status: 'APPROVED',
        payment_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'ad-pay-3',
        advertiser_name: 'Metrobank Cards',
        campaign_id: null,
        amount: 10000,
        payment_method: 'Credit Card',
        receipt_url: 'https://example.com/receipts/metrobank_ad.png',
        reference_no: '302606195512',
        status: 'PENDING',
        payment_date: new Date().toISOString(),
        created_at: new Date().toISOString()
      }
    ];
    setLocalStorage('filihomes_ad_payments', payments);
  }

  return payments
    .map(item => ({
      ...item,
      campaign_title: activeAds.find(a => a.id === item.campaign_id)?.title || 'General Ad Service'
    }))
    .sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());
}

export async function verifyAdPayment(paymentId: string, status: AdPayment['status']): Promise<boolean> {
  try {
    const { error } = await supabase.from('ad_payments').update({ status }).eq('id', paymentId);
    if (!error) return true;
  } catch (e) {
    console.warn("DB update error for ad_payments, falling back to LocalStorage:", e);
  }

  const payments = getLocalStorage<AdPayment[]>('filihomes_ad_payments', []);
  const idx = payments.findIndex(p => p.id === paymentId);
  if (idx !== -1) {
    payments[idx].status = status;
    setLocalStorage('filihomes_ad_payments', payments);
    return true;
  }
  return false;
}

/**
 * HQ OPERATION EXTRA SYSTEMS: CONTRACTS, STAFF, ATTENDANCE & PAYROLL
 */

export interface SubscriptionContract {
  id: string;
  condo_id: string;
  condo_name?: string;
  subscription_fee: number;
  billing_start_date: string;
  contract_duration_years: number;
  special_notes: string | null;
  status: 'ACTIVE' | 'PENDING' | 'EXPIRED';
  created_at: string;
}

export interface HQStaff {
  id: string;
  name: string;
  role: string;
  hourly_rate: number;
  hire_date: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
  email?: string;
  phone?: string;
  photo?: string;
  is_designated?: boolean;
  permissions?: {
    create_payroll?: boolean;
    view_payroll?: boolean;
    edit_payroll?: boolean;
    delete_payroll?: boolean;
  };
}

export interface HQAttendance {
  id: string;
  staff_id: string;
  staff_name?: string;
  work_date: string;
  hours_worked: number;
  notes: string | null;
  created_at: string;
}

export interface HQPayroll {
  id: string;
  staff_id: string;
  staff_name?: string;
  period_start: string;
  period_end: string;
  total_hours: number;
  gross_pay: number;
  net_pay: number;
  status: 'PAID' | 'PENDING';
  payment_date: string | null;
  created_at: string;
}

// 1. Subscription Contracts
export async function getSubscriptionContracts(): Promise<SubscriptionContract[]> {
  const condosList = await getCondos();
  try {
    const { data, error } = await supabase.from('subscription_contracts').select('*').order('created_at', { ascending: false });
    if (!error && data) {
      return data.map(item => ({
        ...item,
        condo_name: condosList.find(c => c.id === item.condo_id)?.name || 'Unknown Condo'
      })) as SubscriptionContract[];
    }
  } catch (e) {
    console.warn("DB fetch error for subscription_contracts, falling back to LocalStorage:", e);
  }

  let contracts = getLocalStorage<SubscriptionContract[]>('filihomes_subscription_contracts', []);
  if (contracts.length === 0) {
    contracts = [
      {
        id: 'contract-1',
        condo_id: 'c1111111-1111-1111-1111-111111111111',
        subscription_fee: 25000,
        billing_start_date: '2026-01-01',
        contract_duration_years: 3,
        special_notes: 'Includes premium 24/7 technical support and hosting package.',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      },
      {
        id: 'contract-2',
        condo_id: 'c2222222-2222-2222-2222-222222222222',
        subscription_fee: 35000,
        billing_start_date: '2026-03-01',
        contract_duration_years: 5,
        special_notes: 'Custom parking billing rules engine deployed.',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      }
    ];
    setLocalStorage('filihomes_subscription_contracts', contracts);
  }

  return contracts.map(item => ({
    ...item,
    condo_name: condosList.find(c => c.id === item.condo_id)?.name || 'Unknown Condo'
  })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function createSubscriptionContract(contract: Omit<SubscriptionContract, 'id' | 'created_at'>): Promise<SubscriptionContract> {
  const newContract: SubscriptionContract = {
    ...contract,
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
    created_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase.from('subscription_contracts').insert([newContract]).select().single();
    if (!error && data) {
      return data as SubscriptionContract;
    }
  } catch (e) {
    console.warn("DB write error for subscription_contracts, falling back to LocalStorage:", e);
  }

  const contracts = getLocalStorage<SubscriptionContract[]>('filihomes_subscription_contracts', []);
  contracts.push(newContract);
  setLocalStorage('filihomes_subscription_contracts', contracts);
  return newContract;
}

// 2. HQ Staff Management
export async function getHQStaffList(): Promise<HQStaff[]> {
  try {
    const { data, error } = await supabase.from('hq_staff').select('*').order('name', { ascending: true });
    if (!error && data) {
      return data as HQStaff[];
    }
  } catch (e) {
    console.warn("DB fetch error for hq_staff, falling back to LocalStorage:", e);
  }

  let staff = getLocalStorage<HQStaff[]>('filihomes_hq_staff', []);
  if (staff.length === 0) {
    staff = [
      {
        id: 'hq-s1',
        name: 'Maria Santos',
        role: 'Account Manager',
        hourly_rate: 350,
        hire_date: '2025-06-15',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      },
      {
        id: 'hq-s2',
        name: 'Juan Dela Cruz',
        role: 'Vision Systems Engineer',
        hourly_rate: 650,
        hire_date: '2025-08-01',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      },
      {
        id: 'hq-s3',
        name: 'Ana Dimaguiba',
        role: 'Operations Coordinator',
        hourly_rate: 300,
        hire_date: '2026-02-10',
        status: 'ACTIVE',
        created_at: new Date().toISOString()
      }
    ];
    setLocalStorage('filihomes_hq_staff', staff);
  }
  return staff;
}

export async function createHQStaff(staff: Omit<HQStaff, 'id' | 'created_at'>): Promise<HQStaff> {
  const newStaff: HQStaff = {
    ...staff,
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
    created_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase.from('hq_staff').insert([newStaff]).select().single();
    if (!error && data) {
      return data as HQStaff;
    }
  } catch (e) {
    console.warn("DB write error for hq_staff, falling back to LocalStorage:", e);
  }

  const staffList = getLocalStorage<HQStaff[]>('filihomes_hq_staff', []);
  staffList.push(newStaff);
  setLocalStorage('filihomes_hq_staff', staffList);
  return newStaff;
}

export async function updateHQStaff(staffId: string, updates: Partial<HQStaff>): Promise<boolean> {
  try {
    const { error } = await supabase.from('hq_staff').update(updates).eq('id', staffId);
    if (!error) return true;
  } catch (e) {
    console.warn("DB update error for hq_staff, falling back to LocalStorage:", e);
  }

  const staffList = getLocalStorage<HQStaff[]>('filihomes_hq_staff', []);
  const idx = staffList.findIndex(s => s.id === staffId);
  if (idx !== -1) {
    staffList[idx] = {
      ...staffList[idx],
      ...updates,
      permissions: {
        ...(staffList[idx].permissions || {}),
        ...(updates.permissions || {})
      }
    };
    setLocalStorage('filihomes_hq_staff', staffList);
    return true;
  }
  return false;
}

// 3. Attendance Logs
export async function getHQAttendance(staffId?: string): Promise<HQAttendance[]> {
  const staffList = await getHQStaffList();
  try {
    let query = supabase.from('hq_attendance').select('*');
    if (staffId) {
      query = query.eq('staff_id', staffId);
    }
    const { data, error } = await query.order('work_date', { ascending: false });
    if (!error && data) {
      return data.map(item => ({
        ...item,
        staff_name: staffList.find(s => s.id === item.staff_id)?.name || 'Unknown Staff'
      })) as HQAttendance[];
    }
  } catch (e) {
    console.warn("DB fetch error for hq_attendance, falling back to LocalStorage:", e);
  }

  let attendance = getLocalStorage<HQAttendance[]>('filihomes_hq_attendance', []);
  if (attendance.length === 0) {
    attendance = [
      {
        id: 'att-1',
        staff_id: 'hq-s1',
        work_date: '2026-06-15',
        hours_worked: 8,
        notes: 'Client onboarding meeting support',
        created_at: new Date().toISOString()
      },
      {
        id: 'att-2',
        staff_id: 'hq-s1',
        work_date: '2026-06-16',
        hours_worked: 8,
        notes: 'Regular task follow-ups',
        created_at: new Date().toISOString()
      },
      {
        id: 'att-3',
        staff_id: 'hq-s2',
        work_date: '2026-06-15',
        hours_worked: 9,
        notes: 'Vision Matcher setup on SuperAdmin',
        created_at: new Date().toISOString()
      },
      {
        id: 'att-4',
        staff_id: 'hq-s2',
        work_date: '2026-06-16',
        hours_worked: 8,
        notes: 'Bug fixes on ad tracker',
        created_at: new Date().toISOString()
      }
    ];
    setLocalStorage('filihomes_hq_attendance', attendance);
  }

  if (staffId) {
    attendance = attendance.filter(a => a.staff_id === staffId);
  }

  return attendance.map(item => ({
    ...item,
    staff_name: staffList.find(s => s.id === item.staff_id)?.name || 'Unknown Staff'
  })).sort((a, b) => new Date(b.work_date).getTime() - new Date(a.work_date).getTime());
}

export async function recordHQAttendance(attendance: Omit<HQAttendance, 'id' | 'created_at'>): Promise<HQAttendance> {
  const newAttendance: HQAttendance = {
    ...attendance,
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
    created_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase.from('hq_attendance').insert([newAttendance]).select().single();
    if (!error && data) {
      return data as HQAttendance;
    }
  } catch (e) {
    console.warn("DB write error for hq_attendance, falling back to LocalStorage:", e);
  }

  const attendanceLogs = getLocalStorage<HQAttendance[]>('filihomes_hq_attendance', []);
  attendanceLogs.push(newAttendance);
  setLocalStorage('filihomes_hq_attendance', attendanceLogs);
  return newAttendance;
}

// 4. HQ Payroll Ledger
export async function getHQPayroll(): Promise<HQPayroll[]> {
  const staffList = await getHQStaffList();
  try {
    const { data, error } = await supabase.from('hq_payroll').select('*').order('period_end', { ascending: false });
    if (!error && data) {
      return data.map(item => ({
        ...item,
        staff_name: staffList.find(s => s.id === item.staff_id)?.name || 'Unknown Staff'
      })) as HQPayroll[];
    }
  } catch (e) {
    console.warn("DB fetch error for hq_payroll, falling back to LocalStorage:", e);
  }

  let payroll = getLocalStorage<HQPayroll[]>('filihomes_hq_payroll', []);
  if (payroll.length === 0) {
    payroll = [
      {
        id: 'pay-1',
        staff_id: 'hq-s1',
        period_start: '2026-06-01',
        period_end: '2026-06-15',
        total_hours: 80,
        gross_pay: 28000,
        net_pay: 25200,
        status: 'PAID',
        payment_date: new Date().toISOString(),
        created_at: new Date().toISOString()
      },
      {
        id: 'pay-2',
        staff_id: 'hq-s2',
        period_start: '2026-06-01',
        period_end: '2026-06-15',
        total_hours: 85,
        gross_pay: 55250,
        net_pay: 49725,
        status: 'PAID',
        payment_date: new Date().toISOString(),
        created_at: new Date().toISOString()
      }
    ];
    setLocalStorage('filihomes_hq_payroll', payroll);
  }

  return payroll.map(item => ({
    ...item,
    staff_name: staffList.find(s => s.id === item.staff_id)?.name || 'Unknown Staff'
  })).sort((a, b) => new Date(b.period_end).getTime() - new Date(a.period_end).getTime());
}

export async function processHQPayroll(payroll: Omit<HQPayroll, 'id' | 'created_at'>): Promise<HQPayroll> {
  const newPayroll: HQPayroll = {
    ...payroll,
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
    created_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase.from('hq_payroll').insert([newPayroll]).select().single();
    if (!error && data) {
      return data as HQPayroll;
    }
  } catch (e) {
    console.warn("DB write error for hq_payroll, falling back to LocalStorage:", e);
  }

  const payrollLedger = getLocalStorage<HQPayroll[]>('filihomes_hq_payroll', []);
  payrollLedger.push(newPayroll);
  setLocalStorage('filihomes_hq_payroll', payrollLedger);
  return newPayroll;
}

