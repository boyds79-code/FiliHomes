"use client";

import React, { useState, useEffect, CSSProperties } from 'react';
import { supabase } from '../../src/lib/supabaseClient';

interface StaffProfile {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
  avatar_url: string | null;
  assigned_building: string;
  payroll_settings?: {
    base_rate_type: 'hourly' | 'daily' | 'monthly';
    base_rate: number;
    ot_multiplier?: number;
    regular_holiday_multiplier?: number;
    special_holiday_multiplier?: number;
    additions: { label: string; amount: number; frequency: 'hourly' | 'daily' | 'monthly' }[];
    is_billing_manager?: boolean;
    permissions?: {
      create: boolean;
      read: boolean;
      update: boolean;
      delete: boolean;
    };
  };
  profiles?: {
    email: string;
  };
}

interface Holiday {
  date: string; // MM-DD
  name: string;
  type: 'regular' | 'special';
}

const PHILIPPINE_HOLIDAYS: Holiday[] = [
  { date: '01-01', name: "New Year's Day", type: 'regular' },
  { date: '02-25', name: "EDSA People Power Anniversary", type: 'special' },
  { date: '04-09', name: "Araw ng Kagitingan", type: 'regular' },
  { date: '05-01', name: "Labor Day", type: 'regular' },
  { date: '06-12', name: "Independence Day", type: 'regular' },
  { date: '08-21', name: "Ninoy Aquino Day", type: 'special' },
  { date: '08-31', name: "National Heroes Day", type: 'regular' },
  { date: '11-01', name: "All Saints' Day", type: 'special' },
  { date: '11-02', name: "All Souls' Day", type: 'special' },
  { date: '11-30', name: "Bonifacio Day", type: 'regular' },
  { date: '12-08', name: "Immaculate Conception", type: 'special' },
  { date: '12-25', name: "Christmas Day", type: 'regular' },
  { date: '12-30', name: "Rizal Day", type: 'regular' },
  { date: '12-31', name: "Last Day of Year", type: 'special' },
];



interface AttendanceRecord {
  id: number;
  work_date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  total_minutes: number | null;
}

export default function AdminStaffManager({ 
  condoId = 'c1111111-1111-1111-1111-111111111111',
  viewMode = 'both',
  currentUserPermissions = { create: true, read: true, update: true, delete: true },
  currentUserRole = 'PMO_MANAGER'
}: { 
  condoId?: string;
  viewMode?: 'roster' | 'payroll' | 'both';
  currentUserPermissions?: {
    create: boolean;
    read: boolean;
    update: boolean;
    delete: boolean;
  };
  currentUserRole?: string;
}) {
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Registration state
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('TECHNICIAN');
  const [assignedBldg, setAssignedBldg] = useState('');
  const [dutyTower, setDutyTower] = useState('Tower A');
  const [dutyLocation, setDutyLocation] = useState('Main Gate');

  // Payroll console state
  const [selectedStaff, setSelectedStaff] = useState<StaffProfile | null>(null);
  const [baseRate, setBaseRate] = useState<number | ''>(80);
  const [baseRateType, setBaseRateType] = useState<'hourly' | 'daily' | 'monthly'>('hourly');
  const [additionsList, setAdditionsList] = useState<{ label: string; amount: number; frequency: 'hourly' | 'daily' | 'monthly' }[]>([]);
  const [otMultiplier, setOtMultiplier] = useState<number | ''>(1.25);
  const [regHolidayMultiplier, setRegHolidayMultiplier] = useState<number | ''>(2.0);
  const [specHolidayMultiplier, setSpecHolidayMultiplier] = useState<number | ''>(1.3);
  
  // Custom addition form state
  const [additionLabel, setAdditionLabel] = useState('');
  const [additionAmount, setAdditionAmount] = useState<number | ''>('');
  const [additionFreq, setAdditionFreq] = useState<'hourly' | 'daily' | 'monthly'>('monthly');

  // Calendar states
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth()); // 0-11
  const [attendanceData, setAttendanceData] = useState<AttendanceRecord[]>([]);
  const [isSyncingPayroll, setIsSyncingPayroll] = useState(false);

  // Condo settings for default multipliers
  const [condoSettings, setCondoSettings] = useState<any>(null);
  // Philippine Holidays list loaded from DB
  const [dbHolidays, setDbHolidays] = useState<any[]>([]);

  const getHoliday = (year: number, month: number, day: number) => {
    const formattedDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const match = dbHolidays.find(h => h.holiday_date === formattedDate);
    if (match) return match;
    
    const mmDd = `${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (year === 2026) {
      if (month === 3 && day === 2) return { name: "Maundy Thursday", type: 'regular' };
      if (month === 3 && day === 3) return { name: "Good Friday", type: 'regular' };
      if (month === 3 && day === 4) return { name: "Black Saturday", type: 'special' };
    }
    return PHILIPPINE_HOLIDAYS.find(h => h.date === mmDd);
  };

  const fetchCondoSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('condo_settings')
        .select('*')
        .eq('condo_id', condoId)
        .maybeSingle();
      if (!error && data) {
        setCondoSettings(data);
      }
    } catch (e) {
      console.error("Error fetching condo settings in StaffManager:", e);
    }
  };

  const fetchHolidays = async () => {
    try {
      const { data, error } = await supabase
        .from('philippine_holidays')
        .select('*');
      if (!error && data) {
        setDbHolidays(data);
      }
    } catch (e) {
      console.error("Error fetching holidays in StaffManager:", e);
    }
  };

  useEffect(() => {
    fetchStaff();
    fetchCondoSettings();
    fetchHolidays();
  }, []);

  useEffect(() => {
    if (selectedStaff) {
      fetchAttendanceForMonth(selectedStaff.id, currentYear, currentMonth);
    }
  }, [selectedStaff, currentYear, currentMonth]);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/staff`, { cache: 'no-store' }); 
      const rawData = await response.json();
      
      // Map profiles response
      if (rawData && rawData.error) {
        console.error("API returned error:", rawData.error);
        setStaffList([]);
        return;
      }
      const dataArray = Array.isArray(rawData) ? rawData : [];
      const mapped = dataArray.map((s: any) => ({
        ...s,
        payroll_settings: s.payroll_settings || { base_rate_type: 'hourly', base_rate: 80, additions: [] }
      }));
      
      setStaffList(mapped);
    } catch (err) {
      console.error("Error fetching staff:", err);
    } finally {
      setLoading(false);
    }
  };

  const addStaff = async () => {
    if (!newName.trim() || !newEmail.trim()) {
      alert("Please enter both name and email for the new staff member.");
      return;
    }
    
    try {
      // 1. Create auth account and base profile
      const response = await fetch('/api/staff-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'INSERT', 
          data: { 
            full_name: newName.trim(), 
            email: newEmail.trim(), 
            role: 'resident', // Profile role
            condo_id: condoId,
            status: 'active'
          } 
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to add staff");

      // 2. Fetch the created profile to get the UUID (match by email)
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', newEmail.trim())
        .single();

      if (!profile) throw new Error("Created staff profile not found in DB.");

      const finalLocation = dutyLocation === 'CUSTOM' ? assignedBldg.trim() : dutyLocation;
      const combinedBldg = dutyTower === 'Common Area' 
        ? finalLocation 
        : `${dutyTower} - ${finalLocation}`;

      // 3. Create staff_profiles metadata
      const { error: staffProfileError } = await supabase
        .from('staff_profiles')
        .insert({
          id: profile.id,
          full_name: newName.trim(),
          role: newRole,
          is_active: true,
          assigned_building: combinedBldg,
          payroll_settings: { base_rate_type: 'hourly', base_rate: 80, additions: [] }
        });

      if (staffProfileError) throw staffProfileError;

      alert("Staff registered successfully!");
      setNewName(''); 
      setNewEmail(''); 
      fetchStaff();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>, staffId: string) => {
    try {
      setUploading(true);
      const file = event.target.files?.[0];
      if (!file) return;

      const fileExt = file.name.split('.').pop();
      const fileName = `avatar_${staffId}_${Date.now()}.${fileExt}`;
      const filePath = `staff_avtars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('staff-assets') // Standardized staff assets bucket
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('staff-assets').getPublicUrl(filePath);
      const publicUrl = data.publicUrl;

      // Update staff avatar_url
      const { error: dbError } = await supabase
        .from('staff_profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', staffId);

      if (dbError) throw dbError;
      
      alert("Photo uploaded and synchronized successfully!");
      fetchStaff();
    } catch (err: any) {
      alert("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteStaff = async (staffId: string) => {
    if (!window.confirm("Are you sure you want to remove this staff member? This action cannot be undone.")) {
      return;
    }

    try {
      // 1. Delete staff_profiles metadata
      await supabase.from('staff_profiles').delete().eq('id', staffId);
      
      // 2. Delete auth profile
      const response = await fetch('/api/staff-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE', id: staffId })
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Failed to delete auth profile");
      }

      alert("Staff member removed successfully!");
      fetchStaff();
      if (selectedStaff?.id === staffId) setSelectedStaff(null);
    } catch (err: any) {
      alert("Error removing staff: " + err.message);
    }
  };

  const handleUpdatePermissions = async (staff: StaffProfile, field: 'is_billing_manager' | 'create' | 'read' | 'update' | 'delete', val: boolean) => {
    try {
      const currentSettings = staff.payroll_settings || { base_rate_type: 'hourly', base_rate: 80, additions: [] };
      const currentPerms = currentSettings.permissions || { create: false, read: false, update: false, delete: false };
      
      let updatedSettings;
      if (field === 'is_billing_manager') {
        updatedSettings = {
          ...currentSettings,
          is_billing_manager: val,
          permissions: val 
            ? { create: true, read: true, update: true, delete: true }
            : { create: false, read: false, update: false, delete: false }
        };
      } else {
        const updatedPerms = {
          ...currentPerms,
          [field]: val
        };
        const hasAny = updatedPerms.create || updatedPerms.read || updatedPerms.update || updatedPerms.delete;
        
        updatedSettings = {
          ...currentSettings,
          is_billing_manager: hasAny,
          permissions: updatedPerms
        };
      }

      const { error } = await supabase
        .from('staff_profiles')
        .update({ payroll_settings: updatedSettings })
        .eq('id', staff.id);

      if (error) throw error;

      // Update local state
      setStaffList(prevList => prevList.map(s => s.id === staff.id ? { ...s, payroll_settings: updatedSettings } : s));
      if (selectedStaff?.id === staff.id) {
        setSelectedStaff(prev => prev ? { ...prev, payroll_settings: updatedSettings } : null);
      }
    } catch (err: any) {
      alert("Failed to update permission: " + err.message);
    }
  };

  const openPayrollConsole = (staff: StaffProfile) => {
    setSelectedStaff(staff);
    setBaseRate(staff.payroll_settings?.base_rate || 80);
    setBaseRateType(staff.payroll_settings?.base_rate_type || 'hourly');
    setAdditionsList(staff.payroll_settings?.additions || []);
    setOtMultiplier(staff.payroll_settings?.ot_multiplier ?? condoSettings?.default_ot_multiplier ?? 1.25);
    setRegHolidayMultiplier(staff.payroll_settings?.regular_holiday_multiplier ?? condoSettings?.default_regular_holiday_multiplier ?? 2.0);
    setSpecHolidayMultiplier(staff.payroll_settings?.special_holiday_multiplier ?? condoSettings?.default_special_holiday_multiplier ?? 1.3);
  };

  const handleAddCustomAddition = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = additionAmount === '' ? 0 : Number(additionAmount);
    if (!additionLabel.trim() || amt <= 0) return;
    
    const newAddition = {
      label: additionLabel.trim(),
      amount: amt,
      frequency: additionFreq
    };
    
    setAdditionsList([...additionsList, newAddition]);
    setAdditionLabel('');
    setAdditionAmount('');
  };

  const handleRemoveAddition = (idx: number) => {
    setAdditionsList(additionsList.filter((_, i) => i !== idx));
  };

  const savePayrollSettings = async () => {
    if (!selectedStaff) return;
    
    try {
      const updatedSettings = {
        base_rate_type: baseRateType,
        base_rate: baseRate === '' ? 80 : Number(baseRate),
        ot_multiplier: otMultiplier === '' ? (condoSettings?.default_ot_multiplier ?? 1.25) : Number(otMultiplier),
        regular_holiday_multiplier: regHolidayMultiplier === '' ? (condoSettings?.default_regular_holiday_multiplier ?? 2.0) : Number(regHolidayMultiplier),
        special_holiday_multiplier: specHolidayMultiplier === '' ? (condoSettings?.default_special_holiday_multiplier ?? 1.3) : Number(specHolidayMultiplier),
        additions: additionsList,
        is_billing_manager: selectedStaff.payroll_settings?.is_billing_manager,
        permissions: selectedStaff.payroll_settings?.permissions
      };

      const { error } = await supabase
        .from('staff_profiles')
        .update({ payroll_settings: updatedSettings })
        .eq('id', selectedStaff.id);

      if (error) throw error;

      alert("Payroll configuration successfully updated!");
      fetchStaff();
      setSelectedStaff({
        ...selectedStaff,
        payroll_settings: updatedSettings
      });
    } catch (err: any) {
      alert("Failed to save: " + err.message);
    }
  };

  const fetchAttendanceForMonth = async (staffId: string, year: number, month: number) => {
    try {
      const startOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const endOfMonth = new Date(year, month + 1, 0).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('staff_attendance')
        .select('*')
        .eq('staff_id', staffId)
        .gte('work_date', startOfMonth)
        .lte('work_date', endOfMonth);

      if (error) throw error;
      setAttendanceData(data || []);
    } catch (err) {
      console.error("Error fetching attendance:", err);
    }
  };

  const disbursePayslip = async (totals: any) => {
    if (!selectedStaff) return;
    setIsSyncingPayroll(true);
    try {
      const startOfMonth = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      const endOfMonth = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];

      const response = await fetch('/api/staff-payroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: selectedStaff.id,
          staff_name: selectedStaff.full_name,
          base_salary_piso: totals.basePay,
          overtime_hours: totals.otHours,
          deductions_piso: 0,
          net_pay_piso: totals.netPay,
          payout_status: 'APPROVED',
          pay_period_start: startOfMonth,
          pay_period_end: endOfMonth
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to disburse pay');
      }

      alert(`💸 Payslip generated and synced to ${selectedStaff.full_name}'s mobile app cockpit!`);
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setIsSyncingPayroll(false);
    }
  };

  // Calendar render helpers
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayIndex = (year: number, month: number) => new Date(year, month, 1).getDay();

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayIndex = getFirstDayIndex(currentYear, currentMonth);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // Calculate salary summary for selected month including holidays
  const calculateMonthlyPayroll = () => {
    let regularHoursSum = 0;
    let otHoursSum = 0;
    let normalBasePay = 0;
    let normalOtPay = 0;
    let holidayPaySum = 0;
    
    const otMult = otMultiplier === '' ? (condoSettings?.default_ot_multiplier ?? 1.25) : Number(otMultiplier);
    const regHolMult = regHolidayMultiplier === '' ? (condoSettings?.default_regular_holiday_multiplier ?? 2.0) : Number(regHolidayMultiplier);
    const specHolMult = specHolidayMultiplier === '' ? (condoSettings?.default_special_holiday_multiplier ?? 1.3) : Number(specHolidayMultiplier);
    const baseRateNum = baseRate === '' ? 0 : Number(baseRate);
    
    let hourlyRate = 80;
    if (baseRateType === 'monthly') {
      hourlyRate = (baseRateNum / 26) / 8;
    } else if (baseRateType === 'daily') {
      hourlyRate = baseRateNum / 8;
    } else {
      hourlyRate = baseRateNum;
    }

    attendanceData.forEach(att => {
      const minutes = att.total_minutes || 0;
      const hours = minutes / 60;
      let regHours = 0;
      let otHours = 0;
      if (hours > 8) {
        regHours = 8;
        otHours = hours - 8;
      } else {
        regHours = hours;
      }
      
      regularHoursSum += regHours;
      otHoursSum += otHours;
      
      // Check if holiday
      const dateParts = att.work_date.split('-');
      const y = Number(dateParts[0]);
      const m = Number(dateParts[1]) - 1; // 0-indexed month
      const d = Number(dateParts[2]);
      
      const holiday = getHoliday(y, m, d);
      if (holiday) {
        const holMult = holiday.type === 'regular' ? regHolMult : specHolMult;
        const holBase = regHours * hourlyRate * holMult;
        const holOt = otHours * hourlyRate * holMult * otMult;
        holidayPaySum += (holBase + holOt);
      } else {
        normalBasePay += regHours * hourlyRate;
        normalOtPay += otHours * hourlyRate * otMult;
      }
    });

    // Calculate additions
    let additionsSum = 0;
    additionsList.forEach(add => {
      if (add.frequency === 'monthly') {
        additionsSum += Number(add.amount);
      } else if (add.frequency === 'daily') {
        const daysWorked = new Set(attendanceData.map(a => a.work_date)).size;
        additionsSum += (daysWorked * Number(add.amount));
      } else if (add.frequency === 'hourly') {
        const totalHrs = regularHoursSum + otHoursSum;
        additionsSum += (totalHrs * Number(add.amount));
      }
    });

    const netPay = baseRateType === 'monthly'
      ? (baseRateNum + normalOtPay + holidayPaySum + additionsSum)
      : (normalBasePay + normalOtPay + holidayPaySum + additionsSum);
 
    return {
      regularHours: regularHoursSum,
      otHours: otHoursSum,
      basePay: baseRateType === 'monthly' ? baseRateNum : normalBasePay,
      otPay: normalOtPay,
      holidayPay: holidayPaySum,
      additionsSum,
      netPay
    };
  };

  const totals = calculateMonthlyPayroll();

  if (!currentUserPermissions.read) {
    return (
      <div style={{
        backgroundColor: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '32px',
        textAlign: 'center',
        maxWidth: '400px',
        margin: '48px auto',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
      }}>
        <span style={{ fontSize: '36px' }}>🔑</span>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1e293b', marginTop: '16px' }}>Access Restricted</h2>
        <p style={{ fontSize: '14px', color: '#64748b', marginTop: '8px' }}>
          You do not have permission to view or manage Staff Roster & Payroll.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.outerWrapper}>
      {/* Upper Grid Layout: Roster & Add Staff */}
      <div style={styles.gridContainer}>
        {/* Unified Roster Table */}
        <div style={{ flex: viewMode === 'payroll' ? 1 : 2.2, minWidth: '400px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h2 style={styles.sectionTitle}>
            {viewMode === 'payroll' ? '💰 Staff Payroll Matrix' : '📋 Staff & Technicians Roster'}
          </h2>
          <p style={styles.sectionSubtitle}>
            {viewMode === 'payroll' 
              ? 'Select a staff member below to load their monthly calendar, hours ledger, OT allowances, and disburse payslips.'
              : 'Manage all security guards, electricians, technicians, and administrators in one place.'
            }
          </p>
          
          <div style={{ ...styles.rosterCard, flex: 1, minWidth: undefined }}>
            <div style={styles.tableWrapper}>
              <div style={styles.tableHeaderRow}>
                <span style={{ width: '10%' }}>Photo</span>
                <span style={{ width: '35%' }}>Staff Details</span>
                <span style={{ width: '20%' }}>System Role</span>
                <span style={{ width: '35%', textAlign: 'right' }}>
                  {viewMode === 'payroll' ? 'Payroll Console' : 'Management Controls'}
                </span>
              </div>
              
              {loading ? (
                <p style={{ padding: '20px', color: '#64748b', textAlign: 'center' }}>Loading staff roster...</p>
              ) : staffList.length === 0 ? (
                <p style={{ padding: '20px', color: '#64748b', textAlign: 'center' }}>No staff registered in database.</p>
              ) : (
                staffList.map((staff) => (
                  <div key={staff.id} style={styles.tableBodyRow}>
                    {/* Photo upload zone */}
                    <div style={{ width: '10%' }}>
                      {staff.avatar_url ? (
                        <img src={staff.avatar_url} alt="avatar" style={styles.avatarCircle} />
                      ) : (
                        <div style={styles.avatarPlaceholder}>👤</div>
                      )}
                    </div>
                    
                    <div style={{ width: '35%', display: 'flex', flexDirection: 'column' }}>
                      <span style={styles.staffNameText}>{staff.full_name}</span>
                      <span style={styles.staffEmailText}>{staff.profiles?.email || 'No email registered'}</span>
                      <span style={styles.staffBldgText}>🏢 {staff.assigned_building || 'N/A'}</span>
                    </div>
                    
                    <div style={{ width: '20%' }}>
                      <span style={{
                        ...styles.roleBadge,
                        backgroundColor: 
                          staff.role === 'GUARD' ? '#eff6ff' : 
                          staff.role === 'TECHNICIAN' ? '#f0fdf4' : 
                          staff.role === 'AMENITY_STAFF' ? '#ecfeff' : '#faf5ff',
                        color: 
                          staff.role === 'GUARD' ? '#1d4ed8' : 
                          staff.role === 'TECHNICIAN' ? '#15803d' : 
                          staff.role === 'AMENITY_STAFF' ? '#0891b2' : '#7e22ce'
                      }}>
                        {staff.role}
                      </span>
                    </div>
                    
                    <div style={{ width: '35%', display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                      {viewMode !== 'payroll' && (
                        <>
                          <input 
                            type="file" 
                            id={`avt-file-${staff.id}`} 
                            style={{ display: 'none' }} 
                            onChange={(e) => uploadAvatar(e, staff.id)} 
                          />
                          <label htmlFor={`avt-file-${staff.id}`} style={styles.uploadBtn}>
                            📷 Photo
                          </label>
                        </>
                      )}

                      {viewMode !== 'roster' && (
                        <button 
                          onClick={() => openPayrollConsole(staff)}
                          style={styles.payrollBtn}
                        >
                          💰 Payroll
                        </button>
                      )}

                      {viewMode !== 'payroll' && (
                        <button 
                          onClick={() => deleteStaff(staff.id)}
                          disabled={!currentUserPermissions.delete}
                          style={{
                            ...styles.removeBtn,
                            opacity: currentUserPermissions.delete ? 1 : 0.5,
                            cursor: currentUserPermissions.delete ? 'pointer' : 'not-allowed'
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Add Staff Card */}
        {viewMode !== 'payroll' && (
          currentUserPermissions.create ? (
            <div style={{ flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h3 style={styles.formTitle}>➕ Register New Staff</h3>
              <p style={styles.formSubtitle}>Create authentic logins and link roles to work cockpit consoles.</p>
              
              <div style={{ ...styles.formCard, flex: 1, minWidth: undefined, height: '100%' }}>
                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Full Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g., Juan Dela Cruz" 
                    value={newName} 
                    onChange={(e) => setNewName(e.target.value)} 
                    style={styles.textInput}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Email Address</label>
                  <input 
                    type="email" 
                    placeholder="e.g., juan@filicondo.com" 
                    value={newEmail} 
                    onChange={(e) => setNewEmail(e.target.value)} 
                    style={styles.textInput}
                  />
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>System Role</label>
                  <select 
                    value={newRole} 
                    onChange={(e) => setNewRole(e.target.value)} 
                    style={styles.selectInput}
                  >
                    <option value="GUARD">Guard</option>
                    <option value="TECHNICIAN">Technician</option>
                    <option value="AMENITY_STAFF">Amenity Staff</option>
                    <option value="PMO_MANAGER">PMO Manager</option>
                    <option value="OFFICE_STAFF">Office Staff</option>
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Duty Tower</label>
                  <select 
                    value={dutyTower} 
                    onChange={(e) => setDutyTower(e.target.value)} 
                    style={styles.selectInput}
                  >
                    <option value="Tower A">Tower A</option>
                    <option value="Tower B">Tower B</option>
                    <option value="Common Area">Common Area</option>
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.formLabel}>Duty Post Location</label>
                  <select 
                    value={dutyLocation} 
                    onChange={(e) => setDutyLocation(e.target.value)} 
                    style={styles.selectInput}
                  >
                    <option value="Main Gate">Main Gate</option>
                    <option value="Tower Lobby">Tower Lobby</option>
                    <option value="Common Area">Common Area</option>
                    <option value="CUSTOM">Custom Post...</option>
                  </select>
                  {dutyLocation === 'CUSTOM' && (
                    <input 
                      type="text" 
                      placeholder="e.g., Main Lobby / Gate" 
                      value={assignedBldg} 
                      onChange={(e) => setAssignedBldg(e.target.value)} 
                      style={{ ...styles.textInput, marginTop: '8px' }}
                    />
                  )}
                </div>

                <button onClick={addStaff} style={styles.submitBtn}>
                  Deploy Staff Member
                </button>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h3 style={styles.formTitle}>➕ Register New Staff</h3>
              <div style={{ ...styles.formCard, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px', color: '#64748b', fontSize: '12px' }}>
                🔒 Permission required to register new staff.
              </div>
            </div>
          )
        )}
      </div>

      {/* Billing Manager Permissions Section */}
      {viewMode === 'roster' && currentUserRole === 'PMO_MANAGER' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '24px' }}>
          <h3 style={styles.sectionTitle}>🔑 Billing Manager Permissions</h3>
          <p style={styles.sectionSubtitle}>Select which staff members are authorized to view and modify payroll matrix details.</p>
          <div style={{ ...styles.rosterCard, minWidth: '100%' }}>
            <div style={styles.tableWrapper}>
              <div style={styles.tableHeaderRow}>
                <span style={{ width: '10%' }}>Photo</span>
                <span style={{ width: '35%' }}>Staff Details</span>
                <span style={{ width: '20%' }}>System Role</span>
                <span style={{ width: '35%', textAlign: 'right' }}>Permissions Grid</span>
              </div>
              {loading ? (
                <p style={{ padding: '20px', color: '#64748b', textAlign: 'center' }}>Loading permissions...</p>
              ) : staffList.length === 0 ? (
                <p style={{ padding: '20px', color: '#64748b', textAlign: 'center' }}>No staff available.</p>
              ) : (
                staffList.map((staff) => (
                  <div key={staff.id} style={styles.tableBodyRow}>
                    <div style={{ width: '10%' }}>
                      {staff.avatar_url ? (
                        <img src={staff.avatar_url} alt="avatar" style={styles.avatarCircle} />
                      ) : (
                        <div style={styles.avatarPlaceholder}>👤</div>
                      )}
                    </div>
                    <div style={{ width: '40%', display: 'flex', flexDirection: 'column' }}>
                      <span style={styles.staffNameText}>{staff.full_name}</span>
                      <span style={styles.staffEmailText}>{staff.profiles?.email || 'No email registered'}</span>
                    </div>
                    <div style={{ width: '25%' }}>
                      <span style={{
                        ...styles.roleBadge,
                        backgroundColor: '#f1f5f9',
                        color: '#475569'
                      }}>
                        {staff.role}
                      </span>
                    </div>
                    <div style={{ width: '35%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', cursor: currentUserPermissions.update ? 'pointer' : 'not-allowed', gap: '8px' }}>
                        <input 
                          type="checkbox"
                          checked={!!staff.payroll_settings?.is_billing_manager}
                          onChange={(e) => handleUpdatePermissions(staff, 'is_billing_manager', e.target.checked)}
                          disabled={!currentUserPermissions.update}
                          style={{ width: '15px', height: '15px', cursor: currentUserPermissions.update ? 'pointer' : 'not-allowed' }}
                        />
                        <span style={{ 
                          fontSize: '12px', 
                          fontWeight: 'bold', 
                          color: staff.payroll_settings?.is_billing_manager ? '#10b981' : '#64748b' 
                        }}>
                          Bill & Payroll
                        </span>
                      </label>
                      
                      {!!staff.payroll_settings?.is_billing_manager && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                          {['read', 'create', 'update', 'delete'].map(action => {
                            const label = action === 'read' ? 'Read' : action === 'create' ? 'Create' : action === 'update' ? 'Edit' : 'Delete';
                            const hasPerm = !!staff.payroll_settings?.permissions?.[action as 'create'|'read'|'update'|'delete'];
                            return (
                              <label key={action} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', cursor: currentUserPermissions.update ? 'pointer' : 'not-allowed', fontSize: '10px', color: '#64748b' }}>
                                <input 
                                  type="checkbox"
                                  checked={hasPerm}
                                  onChange={(e) => handleUpdatePermissions(staff, action as any, e.target.checked)}
                                  disabled={!currentUserPermissions.update}
                                  style={{ width: '11px', height: '11px', cursor: currentUserPermissions.update ? 'pointer' : 'not-allowed' }}
                                />
                                <span>{label}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lower Section: Interactive Payroll Console */}
      {viewMode !== 'roster' && selectedStaff && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ ...styles.consoleTitle, color: '#0f172a' }}>💰 Attendance & Payroll Console: {selectedStaff.full_name}</h3>
              <p style={{ ...styles.consoleSubtitle, color: '#64748b', margin: '4px 0 0 0' }}>Configure salary matrix parameters and audit work hour logs directly mapped from mobile devices.</p>
            </div>
            <button style={{ ...styles.closeConsoleBtn, backgroundColor: '#0f172a', color: '#fff' }} onClick={() => setSelectedStaff(null)}>✕ Close Console</button>
          </div>
          <div style={styles.payrollConsoleCard}>
            <div style={styles.consoleGrid}>
              {/* Rates & Additions Configuration */}
              <div style={styles.ratesBox}>
                <h4 style={styles.boxTitle}>⚙️ Base Salary Matrix</h4>
                
                <div style={styles.formRow}>
                  <div style={{ flex: 1.5 }}>
                    <label style={styles.formLabel}>Base Salary Amount</label>
                    <div style={styles.pisoInputWrapper}>
                      <span style={styles.pisoSymbol}>₱</span>
                      <input 
                        type="number" 
                        value={baseRate} 
                        onChange={(e) => { const v = e.target.value; setBaseRate(v === '' ? '' : Number(v)); }} 
                        style={styles.pisoInput} 
                      />
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={styles.formLabel}>Rate Type</label>
                    <select 
                      value={baseRateType} 
                      onChange={(e) => setBaseRateType(e.target.value as any)} 
                      style={styles.selectInput}
                    >
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily (8hrs)</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <label style={{ ...styles.formLabel, minHeight: '30px', display: 'flex', alignItems: 'flex-end', marginBottom: '4px' }}>OT Multiplier</label>
                    <input 
                      type="number" 
                      step="0.05"
                      value={otMultiplier} 
                      onChange={(e) => { const v = e.target.value; setOtMultiplier(v === '' ? '' : Number(v)); }} 
                      placeholder={condoSettings?.default_ot_multiplier?.toString() || '1.25'}
                      style={styles.textInput} 
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <label style={{ ...styles.formLabel, minHeight: '30px', display: 'flex', alignItems: 'flex-end', marginBottom: '4px' }}>Reg Holiday Multiplier</label>
                    <input 
                      type="number" 
                      step="0.05"
                      value={regHolidayMultiplier} 
                      onChange={(e) => { const v = e.target.value; setRegHolidayMultiplier(v === '' ? '' : Number(v)); }} 
                      placeholder={condoSettings?.default_regular_holiday_multiplier?.toString() || '2.0'}
                      style={styles.textInput} 
                    />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <label style={{ ...styles.formLabel, minHeight: '30px', display: 'flex', alignItems: 'flex-end', marginBottom: '4px' }}>Spec Holiday Multiplier</label>
                    <input 
                      type="number" 
                      step="0.05"
                      value={specHolidayMultiplier} 
                      onChange={(e) => { const v = e.target.value; setSpecHolidayMultiplier(v === '' ? '' : Number(v)); }} 
                      placeholder={condoSettings?.default_special_holiday_multiplier?.toString() || '1.3'}
                      style={styles.textInput} 
                    />
                  </div>
                </div>

                {/* Additions List */}
                <h4 style={{ ...styles.boxTitle, marginTop: '20px' }}>🎁 Custom Additions & Allowances</h4>
                <div style={styles.additionsTable}>
                  {additionsList.length === 0 ? (
                    <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0' }}>No allowances/additions configured.</p>
                  ) : (
                    additionsList.map((add, idx) => (
                      <div key={idx} style={styles.additionRow}>
                        <span style={{ fontWeight: 'bold' }}>{add.label}</span>
                        <span style={{ color: '#0284c7' }}>₱{add.amount} ({add.frequency})</span>
                         <button 
                          style={{
                            ...styles.deleteAddBtn,
                            opacity: currentUserPermissions.delete ? 1 : 0.5,
                            cursor: currentUserPermissions.delete ? 'pointer' : 'not-allowed'
                          }} 
                          onClick={() => {
                            if (currentUserPermissions.delete) handleRemoveAddition(idx);
                          }}
                          disabled={!currentUserPermissions.delete}
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Custom Addition Form */}
                <form onSubmit={handleAddCustomAddition} style={{ ...styles.formRow, marginTop: '12px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 2 }}>
                    <input 
                      type="text" 
                      placeholder="Addition Label" 
                      value={additionLabel} 
                      onChange={(e) => setAdditionLabel(e.target.value)} 
                      style={{ ...styles.textInput, height: '32px', padding: '4px 8px', fontSize: '12px' }} 
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <input 
                      type="number" 
                      placeholder="₱ Amount" 
                      value={additionAmount} 
                      onChange={(e) => { const v = e.target.value; setAdditionAmount(v === '' ? '' : Number(v)); }} 
                      style={{ ...styles.textInput, height: '32px', padding: '4px 8px', fontSize: '12px' }} 
                    />
                  </div>
                  <div style={{ flex: 1.2 }}>
                    <select 
                      value={additionFreq} 
                      onChange={(e) => setAdditionFreq(e.target.value as any)} 
                      style={{ ...styles.selectInput, height: '32px', padding: '4px 8px', fontSize: '12px' }}
                    >
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                   <button 
                    type="submit" 
                    disabled={!currentUserPermissions.create}
                    style={{
                      ...styles.addAdditionBtn,
                      opacity: currentUserPermissions.create ? 1 : 0.5,
                      cursor: currentUserPermissions.create ? 'pointer' : 'not-allowed'
                    }}
                  >
                    + Add
                  </button>
                </form>

                 <button 
                  onClick={savePayrollSettings} 
                  disabled={!currentUserPermissions.update}
                  style={{
                    ...styles.saveSettingsBtn,
                    opacity: currentUserPermissions.update ? 1 : 0.5,
                    cursor: currentUserPermissions.update ? 'pointer' : 'not-allowed'
                  }}
                >
                  Save Salary Configuration
                </button>
              </div>

              {/* Attendance Calendar */}
              <div style={styles.calendarBox}>
                <div style={styles.calendarHeader}>
                  <h4 style={styles.boxTitle}>📅 Attendance Ledger</h4>
                  <div style={styles.calendarNav}>
                    <button onClick={handlePrevMonth} style={styles.navBtn}>◀</button>
                    <span style={styles.navMonthLabel}>{monthNames[currentMonth]} {currentYear}</span>
                    <button onClick={handleNextMonth} style={styles.navBtn}>▶</button>
                  </div>
                </div>

                <div style={styles.calendarGridContainer}>
                  {/* Day of Week Headers */}
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                    <div key={day} style={styles.calendarDayHeader}>{day}</div>
                  ))}
                  
                  {/* Empty cells before start of month */}
                  {Array.from({ length: firstDayIndex }).map((_, idx) => (
                    <div key={`empty-${idx}`} style={styles.calendarCellEmpty}></div>
                  ))}

                  {/* Days of month */}
                  {Array.from({ length: daysInMonth }).map((_, idx) => {
                    const day = idx + 1;
                    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    
                    // Match date with attendance record
                    const att = attendanceData.find(a => a.work_date === dateStr);
                    const hoursWorked = att?.total_minutes ? (att.total_minutes / 60) : 0;
                    const holiday = getHoliday(currentYear, currentMonth, day);

                    return (
                      <div 
                        key={`day-${day}`} 
                        style={{
                          ...styles.calendarCell,
                          backgroundColor: holiday ? (holiday.type === 'regular' ? '#fef2f2' : '#fffbeb') : styles.calendarCell.backgroundColor,
                          borderColor: holiday ? (holiday.type === 'regular' ? '#fee2e2' : '#fef3c7') : styles.calendarCell.borderColor
                        }}
                        title={holiday ? `${holiday.name} (${holiday.type === 'regular' ? 'Regular' : 'Special'} Holiday)` : undefined}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingLeft: '4px', paddingRight: '4px' }}>
                          <span style={{
                            fontSize: '11px',
                            color: holiday ? (holiday.type === 'regular' ? '#ef4444' : '#d97706') : '#475569',
                            fontWeight: holiday ? 'bold' : 'normal'
                          }}>{day}</span>
                          {holiday && (
                            <span style={{ fontSize: '7px', color: holiday.type === 'regular' ? '#ef4444' : '#d97706', fontWeight: 'bold' }}>
                              {holiday.type === 'regular' ? 'REG' : 'SPEC'}
                            </span>
                          )}
                        </div>
                        {hoursWorked > 0 ? (
                          <span style={styles.calendarHoursVal}>{hoursWorked.toFixed(1)}h</span>
                        ) : (
                          <span style={{ fontSize: '9px', color: '#94a3b8' }}>Off</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Summary & Disbursal */}
              <div style={styles.summaryBox}>
                <h4 style={styles.boxTitle}>💸 Monthly Summary Details</h4>
                
                <div style={styles.summaryList}>
                  <div style={styles.summaryItem}>
                    <span>Total Regular Hours:</span>
                    <span style={{ fontWeight: 'bold' }}>{totals.regularHours.toFixed(1)} hrs</span>
                  </div>
                  <div style={styles.summaryItem}>
                    <span>Total Overtime Hours:</span>
                    <span style={{ fontWeight: 'bold', color: '#0284c7' }}>{totals.otHours.toFixed(1)} hrs</span>
                  </div>
                  <div style={styles.summaryItem}>
                    <span>Gross Base Pay:</span>
                    <span>₱{totals.basePay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={styles.summaryItem}>
                    <span>Overtime Pay ({otMultiplier}x):</span>
                    <span>₱{totals.otPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  {totals.holidayPay > 0 && (
                    <div style={styles.summaryItem}>
                      <span>Holiday Pay Premium:</span>
                      <span style={{ color: '#ea580c', fontWeight: 'bold' }}>+₱{totals.holidayPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div style={styles.summaryItem}>
                    <span>Total Additions:</span>
                    <span style={{ color: '#16a34a' }}>+₱{totals.additionsSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ ...styles.summaryItem, borderTop: '1px solid #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '15px' }}>Calculated Net Pay:</span>
                    <span style={{ fontWeight: 'bold', fontSize: '18px', color: '#16a34a' }}>
                      ₱{totals.netPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <button 
                  onClick={() => disbursePayslip(totals)}
                  disabled={isSyncingPayroll || totals.netPay <= 0 || !currentUserPermissions.update}
                  style={{
                    ...styles.disburseBtn,
                    opacity: (totals.netPay <= 0 || !currentUserPermissions.update) ? 0.5 : 1,
                    cursor: (totals.netPay <= 0 || !currentUserPermissions.update) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isSyncingPayroll ? '🧮 Disbursing Pay...' : `💸 Lock & Disburse Net ₱${totals.netPay.toLocaleString()} Payslip`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: CSSProperties } = {
  outerWrapper: { display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' },
  gridContainer: { display: 'flex', gap: '20px', flexWrap: 'wrap', width: '100%' },
  rosterCard: { flex: 2.2, minWidth: '400px', backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '8px' },
  formCard: { flex: 1, minWidth: '280px', backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', height: 'fit-content' },
  sectionTitle: { margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#0f172a' },
  sectionSubtitle: { margin: 0, fontSize: '12px', color: '#64748b' },
  tableWrapper: { border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', marginTop: '12px' },
  tableHeaderRow: { display: 'flex', backgroundColor: '#f8fafc', padding: '10px 14px', borderBottom: '1px solid #e5e7eb', fontSize: '11px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' },
  tableBodyRow: { display: 'flex', padding: '12px 14px', borderBottom: '1px solid #f1f5f9', alignItems: 'center', fontSize: '13px' },
  avatarCircle: { width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #e5e7eb' },
  avatarPlaceholder: { width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', color: '#94a3b8' },
  staffNameText: { fontWeight: 'bold', fontSize: '14px', color: '#0f172a' },
  staffEmailText: { fontSize: '11px', color: '#64748b' },
  staffBldgText: { fontSize: '10px', color: '#94a3b8', marginTop: '2px' },
  roleBadge: { padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' },
  uploadBtn: { cursor: 'pointer', backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', color: '#475569', display: 'inline-block' },
  payrollBtn: { border: 'none', backgroundColor: '#2563eb', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', color: '#fff', cursor: 'pointer' },
  removeBtn: { border: 'none', backgroundColor: 'transparent', color: '#ef4444', textDecoration: 'underline', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' },
  
  // Form styles
  formTitle: { margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#0f172a' },
  formSubtitle: { margin: '2px 0 16px 0', fontSize: '12px', color: '#64748b' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' },
  formRow: { display: 'flex', gap: '12px', marginBottom: '12px' },
  formLabel: { fontSize: '10px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.3px' },
  textInput: { padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', color: '#334155', width: '100%' },
  selectInput: { padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', color: '#334155', width: '100%', height: '36px', backgroundColor: '#fff' },
  submitBtn: { width: '100%', backgroundColor: '#0f172a', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', marginTop: '6px' },

  // Payroll console
  payrollConsoleCard: { backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', width: '100%', display: 'flex', flexDirection: 'column', gap: '16px', color: '#1e293b', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  consoleHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #cbd5e1', paddingBottom: '16px' },
  consoleTitle: { margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#2563eb' },
  consoleSubtitle: { margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' },
  closeConsoleBtn: { border: 'none', backgroundColor: '#e2e8f0', color: '#334155', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' },
  consoleGrid: { display: 'flex', gap: '20px', flexWrap: 'wrap' },
  ratesBox: { flex: 1.1, minWidth: '300px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column' },
  calendarBox: { flex: 1.3, minWidth: '320px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px' },
  summaryBox: { flex: 1, minWidth: '280px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' },
  boxTitle: { margin: '0 0 12px 0', fontSize: '12px', fontWeight: 'bold', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px' },
  pisoInputWrapper: { position: 'relative', display: 'flex', alignItems: 'center', width: '100%' },
  pisoSymbol: { position: 'absolute', left: '10px', fontSize: '14px', fontWeight: 'bold', color: '#64748b' },
  pisoInput: { padding: '8px 12px 8px 24px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', color: '#1e293b', width: '100%', backgroundColor: '#ffffff' },
  
  // Custom additions UI
  additionsTable: { border: '1px solid #cbd5e1', borderRadius: '6px', maxHeight: '110px', overflowY: 'auto', padding: '4px 8px', backgroundColor: '#ffffff', color: '#1e293b' },
  additionRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #e2e8f0', fontSize: '12px' },
  deleteAddBtn: { border: 'none', backgroundColor: 'transparent', color: '#ef4444', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' },
  addAdditionBtn: { border: 'none', backgroundColor: '#2563eb', color: '#fff', height: '32px', padding: '0 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' },
  saveSettingsBtn: { border: 'none', backgroundColor: '#16a34a', color: '#fff', padding: '10px', borderRadius: '8px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', marginTop: '16px' },

  // Calendar UI
  calendarHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  calendarNav: { display: 'flex', alignItems: 'center', gap: '8px' },
  navBtn: { border: 'none', backgroundColor: '#e2e8f0', color: '#334155', width: '24px', height: '24px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' },
  navMonthLabel: { fontSize: '13px', fontWeight: 'bold', color: '#1e293b' },
  calendarGridContainer: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' },
  calendarDayHeader: { textAlign: 'center', fontSize: '10px', fontWeight: 'bold', color: '#64748b', paddingBottom: '4px' },
  calendarCell: { backgroundColor: '#ffffff', borderWidth: '1px', borderStyle: 'solid', borderColor: '#cbd5e1', borderRadius: '4px', height: '42px', padding: '4px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' },
  calendarCellEmpty: { height: '42px' },
  calendarDayNo: { fontSize: '10px', color: '#64748b' },
  calendarHoursVal: { fontSize: '11px', color: '#16a34a', fontWeight: 'bold', textAlign: 'right' },

  // Summary UI
  summaryList: { display: 'flex', flexDirection: 'column', gap: '8px' },
  summaryItem: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#334155' },
  disburseBtn: { border: 'none', backgroundColor: '#0284c7', color: '#fff', padding: '12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '14px', marginTop: '16px', width: '100%' }
};