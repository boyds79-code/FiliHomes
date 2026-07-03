"use client";

import React, { useState, useEffect } from 'react';
import AdminStaffManager from './admin/StaffManager';
import { supabase } from '../src/lib/supabaseClient';

export default function CondoSettings({ 
  initialSubTab = 'property',
  currentUserRole = 'PMO_MANAGER',
  showTabs = false,
  condoId
}: { 
  initialSubTab?: 'property' | 'app' | 'staff';
  currentUserRole?: string;
  showTabs?: boolean;
  condoId?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Settings main subTab
  const [subTab, setSubTab] = useState<'property' | 'app' | 'staff'>(initialSubTab);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);
  
  // Target Condo ID
  const currentCondoId = condoId || 'c1111111-1111-1111-1111-111111111111';

  // State definitions
  const [condoName, setCondoName] = useState('');
  const [totalUnits, setTotalUnits] = useState<number | ''>(0);
  const [buildingsInput, setBuildingsInput] = useState(''); // Comma-separated towers
  const [baseParking, setBaseParking] = useState<number | ''>(0);
  const [visitorParking, setVisitorParking] = useState<number | ''>(0);
  const [maxParkingFee, setMaxParkingFee] = useState<number | ''>(300);
  const [graceMins, setGraceMins] = useState<number | ''>(15);
  const [penaltyRate, setPenaltyRate] = useState<number | string>(2.0); // Represented as percentage (e.g. 2.0%)
  const [parkingFeeTiers, setParkingFeeTiers] = useState<(number | '')[]>([1500, 2000, 3000]);
  const [condoFeatures, setCondoFeatures] = useState<any>({});

  useEffect(() => {
    setParkingFeeTiers(prev => {
      const next = [...prev];
      if (next.length === 0) {
        next.push(baseParking);
      } else {
        next[0] = baseParking;
      }
      return next;
    });
  }, [baseParking]);

  const [bizName, setBizName] = useState('');
  const [bizAddress, setBizAddress] = useState('');
  const [bizTin, setBizTin] = useState('');
  const [atpNum, setAtpNum] = useState('');
  const [atpDate, setAtpDate] = useState('');
  const [isVat, setIsVat] = useState(false);
  
  // Parking Settings
  const [parkingMode, setParkingMode] = useState<string>('MANUAL');
  const [visitorParkingBilling, setVisitorParkingBilling] = useState<boolean>(true);
  const [approvalRequired, setApprovalRequired] = useState<boolean>(true);
  
  // Feature Flags & Modular Configuration
  const [visitorScope, setVisitorScope] = useState<string>('MAIN_GATE_ONLY');
  const [parcelLockersEnabled, setParcelLockersEnabled] = useState<boolean>(false);
  const [amenityBookingRequired, setAmenityBookingRequired] = useState<boolean>(true);
  const [pmoStart, setPmoStart] = useState<string>('09:00');
  const [pmoEnd, setPmoEnd] = useState<string>('18:00');

  // Holiday & Payroll Multipliers
  const [defaultRegHolidayMultiplier, setDefaultRegHolidayMultiplier] = useState<number | ''>(2.0);
  const [defaultSpecHolidayMultiplier, setDefaultSpecHolidayMultiplier] = useState<number | ''>(1.3);
  const [defaultOtMultiplier, setDefaultOtMultiplier] = useState<number | ''>(1.25);
  
  // Philippine Holidays list
  const [holidays, setHolidays] = useState<any[]>([]);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayType, setNewHolidayType] = useState<'regular' | 'special'>('regular');
  const [visitorParkingEnabled, setVisitorParkingEnabled] = useState<boolean>(true);
  const [amenityBookingEnabled, setAmenityBookingEnabled] = useState<boolean>(true);
  const [amenityBillingEnabled, setAmenityBillingEnabled] = useState<boolean>(true);

  // a. Billings states
  const [billingTypes, setBillingTypes] = useState<string[]>(["Electricity", "Water", "Association Dues", "Parking"]);
  const [customBillingInput, setCustomBillingInput] = useState('');
  const [penaltyDueDay, setPenaltyDueDay] = useState<number>(5);

  // c. Parcels states
  const [parcelDeliveryPolicy, setParcelDeliveryPolicy] = useState<string>('GUARD_HOUSE'); // GUARD_HOUSE or DIRECT_UNIT

  // d. Amenity capacity settings
  const [amenitySettings, setAmenitySettings] = useState<{ [key: string]: { enabled: boolean; max_capacity: number | ''; charge_enabled?: boolean; fee?: number | '' } }>({
    Gym: { enabled: true, max_capacity: 10 },
    Spa: { enabled: true, max_capacity: 5 },
    Pool: { enabled: true, max_capacity: 15 }
  });

  // b. Occupant Bulk Upload state (moved from OccupantManager)
  const [units, setUnits] = useState<any[]>([]);


  const [bulkPreviewList, setBulkPreviewList] = useState<any[]>([]);
  const [bulkLogSummary, setBulkLogSummary] = useState({ total: 0, valid: 0, invalid: 0 });
  const [isBulkSyncing, setIsBulkSyncing] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');

  const [newAmenityName, setNewAmenityName] = useState('');
  const [newAmenityCapacity, setNewAmenityCapacity] = useState<number | ''>(10);

  const handleBillingExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const firstLine = text.split('\n')[0];
      if (firstLine) {
        const headers = firstLine.split(',').map(h => h.trim().replace(/^["']|["']$/g, '')).filter(h => h.length > 0);
        const updatedTypes = [...billingTypes];
        let addedCount = 0;
        headers.forEach(header => {
          const lowercase = header.toLowerCase();
          if (['unit', 'unit_no', 'unitno', 'name', 'fullname', 'email', 'phone', 'role', 'lease', 'payer'].some(term => lowercase.includes(term))) {
            return;
          }
          if (!updatedTypes.includes(header)) {
            updatedTypes.push(header);
            addedCount++;
          }
        });
        setBillingTypes(updatedTypes);
        alert(`Successfully imported ${addedCount} billing categories from CSV file headers: ${headers.join(', ')}`);
      }
    };
    reader.readAsText(file);
  };

  const handleAddCustomAmenity = () => {
    if (!newAmenityName.trim()) return;
    const cleanName = newAmenityName.trim();
    if (!amenitySettings[cleanName]) {
      setAmenitySettings({
        ...amenitySettings,
        [cleanName]: { enabled: true, max_capacity: newAmenityCapacity === '' ? 10 : Number(newAmenityCapacity), charge_enabled: false, fee: 0 }
      });
    }
    setNewAmenityName('');
    setNewAmenityCapacity(10);
  };

  const handleDeleteAmenity = (name: string) => {
    const updated = { ...amenitySettings };
    delete updated[name];
    setAmenitySettings(updated);
  };

  const fetchHolidays = async () => {
    try {
      const { data, error } = await supabase
        .from('philippine_holidays')
        .select('*')
        .order('holiday_date', { ascending: true });
      if (!error && data) setHolidays(data);
    } catch (e) {
      console.error("Error fetching holidays list:", e);
    }
  };

  useEffect(() => {
    fetchCondoSettings();
    fetchUnitsList();
    fetchHolidays();
  }, []);

  const fetchUnitsList = async () => {
    try {
      const { data, error } = await supabase
        .from('units')
        .select('id, unit_number, tower_name')
        .eq('condo_id', currentCondoId);
      if (!error && data) setUnits(data);
    } catch (e) {
      console.error("Error fetching units list for bulk mapping:", e);
    }
  };

  const fetchCondoSettings = async () => {
    setLoading(true);
    try {
      // 1) condo_settings 조회
      const { data: settingsData } = await supabase
        .from('condo_settings')
        .select('*')
        .eq('condo_id', currentCondoId)
        .maybeSingle();

      if (settingsData) {
        setParkingMode(settingsData.parking_mode || 'MANUAL');
        setVisitorParkingBilling(settingsData.visitor_parking_policy === 'BILLING_ENABLED');
        setApprovalRequired(settingsData.approval_policy === 'REQUIRED');
        setVisitorScope(settingsData.visitor_scope || 'MAIN_GATE_ONLY');
        setParcelLockersEnabled(!!settingsData.parcel_lockers_enabled);
        setAmenityBookingRequired(settingsData.amenity_booking_required !== false);
        setPmoStart(settingsData.pmo_hours_start || '09:00');
        setPmoEnd(settingsData.pmo_hours_end || '18:00');
        setVisitorParkingEnabled(settingsData.visitor_parking_enabled !== false);
        setAmenityBookingEnabled(settingsData.amenity_booking_enabled !== false);
        setAmenityBillingEnabled(settingsData.amenity_billing_enabled !== false);
        
        // Extended configurations
        setBillingTypes(settingsData.billing_types || ["Electricity", "Water", "Association Dues", "Parking", "Visitor Parking"]);
        setPenaltyDueDay(settingsData.penalty_due_day || 5);
        setParcelDeliveryPolicy(settingsData.parcel_delivery_policy || 'GUARD_HOUSE');
        setAmenitySettings(settingsData.amenity_settings || {
          Gym: { enabled: true, max_capacity: 10 },
          Spa: { enabled: true, max_capacity: 5 },
          Pool: { enabled: true, max_capacity: 15 }
        });
        
        setDefaultRegHolidayMultiplier(settingsData.default_regular_holiday_multiplier ?? 2.0);
        setDefaultSpecHolidayMultiplier(settingsData.default_special_holiday_multiplier ?? 1.3);
        setDefaultOtMultiplier(settingsData.default_ot_multiplier ?? 1.25);
      } else {
        setParkingMode('MANUAL');
        setVisitorParkingBilling(true);
        setApprovalRequired(true);
        setVisitorScope('MAIN_GATE_ONLY');
        setParcelLockersEnabled(false);
        setAmenityBookingRequired(true);
        setPmoStart('09:00');
        setPmoEnd('18:00');
        setVisitorParkingEnabled(true);
        setAmenityBookingEnabled(true);
        setAmenityBillingEnabled(true);
        setBillingTypes(["Electricity", "Water", "Association Dues", "Parking", "Visitor Parking"]);
        setPenaltyDueDay(5);
        setParcelDeliveryPolicy('GUARD_HOUSE');
        setAmenitySettings({
          Gym: { enabled: true, max_capacity: 10 },
          Spa: { enabled: true, max_capacity: 5 },
          Pool: { enabled: true, max_capacity: 15 }
        });
        setDefaultRegHolidayMultiplier(2.0);
        setDefaultSpecHolidayMultiplier(1.3);
        setDefaultOtMultiplier(1.25);

      }

      // 2) condos 조회
      const { data: condoData, error: condoError } = await supabase
        .from('condos')
        .select('*')
        .eq('id', currentCondoId)
        .maybeSingle();

      if (condoError) throw condoError;
      
      if (condoData) {
        setCondoName(condoData.name || '');
        setTotalUnits(condoData.total_units || 0);
        setBuildingsInput(condoData.buildings ? condoData.buildings.join(', ') : '');
        setBaseParking(Number(condoData.base_parking_fee || 0));
        setVisitorParking(Number(condoData.visitor_parking_fee_per_hour || 0));
        setMaxParkingFee(Number(condoData.max_visitor_parking_fee !== undefined && condoData.max_visitor_parking_fee !== null ? condoData.max_visitor_parking_fee : 300));
        setGraceMins(Number(condoData.parking_grace_period_mins !== undefined && condoData.parking_grace_period_mins !== null ? condoData.parking_grace_period_mins : 15));
        setPenaltyRate(Number(condoData.penalty_rate || 0.02) * 100); // 0.02 -> 2%
        setBizName(condoData.business_name || '');
        setBizAddress(condoData.address || '');
        setBizTin(condoData.tin || '');
        setAtpNum(condoData.atp_number || '');
        setAtpDate(condoData.atp_date || '');
        setIsVat(condoData.is_vat_registered || false);
        setCondoFeatures(condoData.features || {});
        const tiers = condoData.features?.parking_fee_tiers;
        if (Array.isArray(tiers)) {
          setParkingFeeTiers(tiers.map(Number));
        } else {
          setParkingFeeTiers([Number(condoData.base_parking_fee || 1500)]);
        }
      } else {
        setCondoName("Solea Residences");
        setTotalUnits(120);
        setBuildingsInput("Tower A, Tower B");
        setBaseParking(1500);
        setVisitorParking(50);
        setMaxParkingFee(300);
        setGraceMins(15);
        setPenaltyRate(2.0);
        setBizName("Solea Residences Corp.");
        setBizAddress("Mactan, Cebu");
        setBizTin("123-456-789-000");
        setAtpNum("ATP-123456");
        setAtpDate("2026-01-01");
        setIsVat(false);
        setCondoFeatures({});
        setParkingFeeTiers([1500, 2000, 3000]);
      }
    } catch (error) {
      console.error("Failed to load condo profiles:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const buildingsArray = buildingsInput
      .split(',')
      .map(b => b.trim())
      .filter(b => b.length > 0);

    try {
      // 1. condo_settings 테이블 업데이트
      const { error: settingsError } = await supabase
        .from('condo_settings')
        .upsert({
          condo_id: currentCondoId,
          parking_mode: parkingMode,
          visitor_parking_policy: visitorParkingBilling ? 'BILLING_ENABLED' : 'FREE',
          approval_policy: approvalRequired ? 'REQUIRED' : 'NO_APPROVAL',
          visitor_scope: visitorScope,
          parcel_lockers_enabled: parcelLockersEnabled,
          amenity_booking_required: amenityBookingRequired,
          pmo_hours_start: pmoStart,
          pmo_hours_end: pmoEnd,
          visitor_parking_enabled: visitorParkingEnabled,
          amenity_booking_enabled: amenityBookingEnabled,
          amenity_billing_enabled: amenityBillingEnabled,
          billing_types: billingTypes,
          penalty_due_day: penaltyDueDay,
          parcel_delivery_policy: parcelDeliveryPolicy,
          amenity_settings: Object.keys(amenitySettings).reduce((acc: any, key) => {
            const setting = amenitySettings[key];
            acc[key] = {
              ...setting,
              max_capacity: setting.max_capacity === '' ? 0 : Number(setting.max_capacity),
              fee: setting.fee === '' ? 0 : (setting.fee === undefined ? undefined : Number(setting.fee))
            };
            return acc;
          }, {}),
          default_regular_holiday_multiplier: defaultRegHolidayMultiplier === '' ? 2.0 : Number(defaultRegHolidayMultiplier),
          default_special_holiday_multiplier: defaultSpecHolidayMultiplier === '' ? 1.3 : Number(defaultSpecHolidayMultiplier),
          default_ot_multiplier: defaultOtMultiplier === '' ? 1.25 : Number(defaultOtMultiplier)
        });
        
      if (settingsError) throw settingsError;

      // 2. condos 테이블 업데이트
      const { error: condoError } = await supabase
        .from('condos')
        .update({
          name: condoName,
          total_units: totalUnits === '' ? 0 : Number(totalUnits),
          buildings: buildingsArray,
          base_parking_fee: baseParking === '' ? 0 : Number(baseParking),
          visitor_parking_fee_per_hour: visitorParking === '' ? 0 : Number(visitorParking),
          max_visitor_parking_fee: maxParkingFee === '' ? 0 : Number(maxParkingFee),
          parking_grace_period_mins: graceMins === '' ? 0 : Number(graceMins),
          penalty_rate: (penaltyRate === '' ? 0 : Number(penaltyRate)) / 100,
          business_name: bizName,
          address: bizAddress,
          tin: bizTin,
          atp_number: atpNum,
          atp_date: atpDate,
          is_vat_registered: isVat,
          features: {
            ...condoFeatures,
            parking_fee_tiers: parkingFeeTiers.map(t => t === '' ? 0 : Number(t))
          }
        })
        .eq('id', currentCondoId);

      if (condoError) throw condoError;

      alert("Settings successfully saved & live! 🚀");
      setIsEditing(false);
      fetchCondoSettings();
    } catch (error: any) {
      console.error("🔥 Save Error:", error);
      alert(`Failed to update settings: ${error.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
  
    try {
      setUploading(true);
      const { error } = await supabase.storage
        .from('condo-assets')
        .upload(`signatures/${currentCondoId}.png`, file, { upsert: true });
  
      if (error) throw error;
  
      const { data: publicUrlData } = supabase.storage
        .from('condo-assets')
        .getPublicUrl(`signatures/${currentCondoId}.png`);
  
      await supabase
        .from('condos')
        .update({ signature_url: publicUrlData.publicUrl })
        .eq('id', currentCondoId);
  
      alert("Signature image uploaded successfully!");
    } catch (error) {
      console.error("Upload failed:", error);
      alert("An error occurred during upload.");
    } finally {
      setUploading(false);
    }
  };

  // Billings custom type handlers
  const handleAddCustomBilling = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customBillingInput.trim()) return;
    const cleanType = customBillingInput.trim();
    if (!billingTypes.includes(cleanType)) {
      setBillingTypes([...billingTypes, cleanType]);
    }
    setCustomBillingInput('');
  };

  const handleToggleBillingType = (type: string) => {
    if (billingTypes.includes(type)) {
      setBillingTypes(billingTypes.filter(t => t !== type));
    } else {
      setBillingTypes([...billingTypes, type]);
    }
  };

  // Occupants CSV Upload Handlers (Moved from OccupantManager)
  const handleBulkFileUploadParsed = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      if (lines.length === 0) return;

      // Smart check: shift index if first column is serial number (no, id, seq, etc.)
      const firstLineHeaders = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));
      const hasSerialCol = firstLineHeaders[0] === 'no' || firstLineHeaders[0] === 'id' || firstLineHeaders[0] === 'seq' || firstLineHeaders[0] === 'num' || firstLineHeaders[0] === '번호';
      const offset = hasSerialCol ? 1 : 0;

      const parsedRows: any[] = [];
      let validCount = 0;
      let invalidCount = 0;

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        const columns = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        
        const unit_no = columns[0 + offset] || '';
        const tower = columns[1 + offset] || '';
        const full_name = columns[2 + offset] || '';
        const email = columns[3 + offset] || '';
        const phone = columns[4 + offset] || '';
        const role = columns[5 + offset]?.toLowerCase() || '';
        const lease_start = columns[6 + offset] || '';
        const lease_end = columns[7 + offset] || '';
        const rawPayer = columns[8 + offset]?.toLowerCase() || 'true';

        // Smart skip: if unit_no, full_name, and email are all empty, it's just a blank CSV row.
        if (!unit_no && !full_name && !email) {
          continue;
        }

        let isValid = true;
        let errorReason = '';
        let matchedUnitId = '';

        // Cross-match unit_number and tower_name
        const matchedUnit = units.find(u => 
          u.unit_number.toLowerCase() === unit_no.toLowerCase() &&
          (!tower || (u.tower_name || '').toLowerCase() === tower.toLowerCase())
        );

        if (!unit_no) {
          isValid = false;
          errorReason = 'Missing Unit Number';
        } else if (!matchedUnit) {
          isValid = false;
          errorReason = `Unit '${unit_no}'${tower ? ` (Tower: ${tower})` : ''} not found in database`;
        } else {
          matchedUnitId = matchedUnit.id;
        }

        if (isValid && !full_name) {
          isValid = false;
          errorReason = 'Missing Full Name';
        }
        if (isValid && !email) {
          isValid = false;
          errorReason = 'Missing Email Address';
        } else if (isValid && !email.includes('@')) {
          isValid = false;
          errorReason = 'Invalid Email Format';
        }

        const validRoles = ['owner', 'tenant', 'family_member', 'caretaker'];
        const normalizedRole = 
          role === 'family' || role === 'family member' ? 'family_member' : 
          role === 'manager' || role === 'caretaker' ? 'caretaker' : role;

        if (isValid && !validRoles.includes(normalizedRole)) {
          isValid = false;
          errorReason = `Invalid Role '${role}' (Must be Owner, Tenant, Caretaker, or Family Member)`;
        }

        const is_payer = rawPayer === 'true' || rawPayer === '1' || rawPayer === 'yes';

        if (isValid) validCount++; else invalidCount++;

        parsedRows.push({
          unit_no,
          tower,
          unitId: matchedUnitId,
          fullName: full_name,
          email,
          phone: phone || null,
          unitRole: normalizedRole,
          leaseStartDate: normalizedRole === 'tenant' && lease_start ? lease_start : null,
          leaseEndDate: normalizedRole === 'tenant' && lease_end ? lease_end : null,
          isPayer: is_payer,
          isValid,
          errorReason
        });
      }

      setBulkPreviewList(parsedRows);
      setBulkLogSummary({ total: parsedRows.length, valid: validCount, invalid: invalidCount });
    };
    reader.readAsText(file);
  };

  const handleDeployBulkOccupants = async () => {
    const validItems = bulkPreviewList.filter(item => item.isValid);
    if (validItems.length === 0) return;

    setIsBulkSyncing(true);
    try {
      const response = await fetch('/api/admin/occupants/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          condoId: currentCondoId,
          occupants: validItems
        })
      });

      const result = await response.json();
      if (response.ok && result.success) {
        alert(`🎉 Bulk Import Successful! Synchronized ${result.processedCount} occupants.`);
        setBulkPreviewList([]);
        setBulkLogSummary({ total: 0, valid: 0, invalid: 0 });
        setUploadedFileName('');
      } else {
        throw new Error(result.error || "Sync failed");
      }
    } catch (error: any) {
      console.error(error);
      alert(`Occupant bulk sync failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsBulkSyncing(false);
    }
  };

  if (loading) return <p style={{ padding: '24px', color: '#64748b' }}>Loading security profiles...</p>;

  return (
    <div style={styles.viewWrapper}>
      <div style={{ ...styles.tabHeader, justifyContent: 'space-between', alignItems: 'center' }}>
        {showTabs ? (
          <div style={{ display: 'flex', gap: '20px' }}>
            <button
              type="button"
              onClick={() => setSubTab('property')}
              style={{
                ...styles.tabButton,
                color: subTab === 'property' ? '#6b21a8' : '#64748b',
                borderBottom: subTab === 'property' ? '2px solid #6b21a8' : '2px solid transparent',
              }}
            >
              🏢 Property Settings
            </button>
            <button
              type="button"
              onClick={() => setSubTab('app')}
              style={{
                ...styles.tabButton,
                color: subTab === 'app' ? '#6b21a8' : '#64748b',
                borderBottom: subTab === 'app' ? '2px solid #6b21a8' : '2px solid transparent',
              }}
            >
              ⚙️ App Settings
            </button>
            <button
              type="button"
              onClick={() => setSubTab('staff')}
              style={{
                ...styles.tabButton,
                color: subTab === 'staff' ? '#6b21a8' : '#64748b',
                borderBottom: subTab === 'staff' ? '2px solid #6b21a8' : '2px solid transparent',
              }}
            >
              👥 Staff Management
            </button>
          </div>
        ) : (
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#0f172a', paddingBottom: '10px' }}>
            {subTab === 'property' ? '🏢 Property Settings' : subTab === 'app' ? '⚙️ App Settings' : '👥 Staff Management'}
          </h2>
        )}

        {/* Action Row on Top Right (Always visible for editable tabs) */}
        {subTab !== 'staff' && (
          <div style={{ display: 'flex', gap: '10px', paddingBottom: '10px' }}>
            {!isEditing ? (
              <button type="button" onClick={() => setIsEditing(true)} style={styles.editActionButton}>✏️ Edit Parameters</button>
            ) : (
              <>
                <button type="button" onClick={() => { setIsEditing(false); fetchCondoSettings(); }} style={styles.cancelActionButton}>Cancel</button>
                <button type="submit" form={subTab === 'property' ? 'property-form' : 'app-form'} disabled={saving} style={styles.saveActionButton}>{saving ? 'Saving...' : 'Save & Deploy'}</button>
              </>
            )}
          </div>
        )}
      </div>

      {subTab === 'property' && (
        <form id="property-form" onSubmit={handleSaveSettings} style={styles.formGrid}>
          {/* SECTION 1: Architecture Profiling */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={styles.sectionHeading}>🏢 Architectural Profile</h3>
            <div style={styles.settingsCard}>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>Property Registered Name</label>
                <input type="text" value={condoName} onChange={(e) => setCondoName(e.target.value)} required style={{ ...styles.textInput, backgroundColor: isEditing ? '#ffffff' : '#f8fafc', color: isEditing ? '#0f172a' : '#64748b' }} disabled={!isEditing} />
              </div>

              <div style={styles.inputRow}>
                <div style={{ flex: 1 }}>
                  <label style={styles.inputLabel}>Total Contracted Units</label>
                  <input type="number" value={totalUnits} onChange={(e) => { const v = e.target.value; setTotalUnits(v === '' ? '' : Number(v)); }} required style={{ ...styles.textInput, backgroundColor: isEditing ? '#ffffff' : '#f8fafc', color: isEditing ? '#0f172a' : '#64748b' }} disabled={!isEditing} />
                </div>
                <div style={{ flex: 2 }}>
                  <label style={styles.inputLabel}>Building Towers / Sectors (Split with commas)</label>
                  <input type="text" value={buildingsInput} onChange={(e) => setBuildingsInput(e.target.value)} required style={{ ...styles.textInput, backgroundColor: isEditing ? '#ffffff' : '#f8fafc', color: isEditing ? '#0f172a' : '#64748b' }} placeholder="Tower A, Tower B" disabled={!isEditing} />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: BIR Official Tax Information */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={styles.sectionHeading}>🏛/BIR Official Tax Information</h3>
            <div style={styles.settingsCard}>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>Registered Business Name</label>
                <input type="text" value={bizName} onChange={(e) => setBizName(e.target.value)} style={{ ...styles.textInput, backgroundColor: isEditing ? '#ffffff' : '#f8fafc', color: isEditing ? '#0f172a' : '#64748b' }} disabled={!isEditing} />
              </div>
              <div style={styles.inputGroup}>
                <label style={styles.inputLabel}>Registered Address</label>
                <input type="text" value={bizAddress} onChange={(e) => setBizAddress(e.target.value)} style={{ ...styles.textInput, backgroundColor: isEditing ? '#ffffff' : '#f8fafc', color: isEditing ? '#0f172a' : '#64748b' }} disabled={!isEditing} />
              </div>
              <div style={styles.inputRow}>
                <div style={{ flex: 1 }}>
                  <label style={styles.inputLabel}>TIN (Tax ID)</label>
                  <input type="text" value={bizTin} onChange={(e) => setBizTin(e.target.value)} style={{ ...styles.textInput, backgroundColor: isEditing ? '#ffffff' : '#f8fafc', color: isEditing ? '#0f172a' : '#64748b' }} disabled={!isEditing} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.inputLabel}>ATP Number</label>
                  <input type="text" value={atpNum} onChange={(e) => setAtpNum(e.target.value)} style={{ ...styles.textInput, backgroundColor: isEditing ? '#ffffff' : '#f8fafc', color: isEditing ? '#0f172a' : '#64748b' }} disabled={!isEditing} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.inputLabel}>ATP Date</label>
                  <input type="text" value={atpDate} onChange={(e) => setAtpDate(e.target.value)} placeholder="YYYY-MM-DD" style={{ ...styles.textInput, backgroundColor: isEditing ? '#ffffff' : '#f8fafc', color: isEditing ? '#0f172a' : '#64748b' }} disabled={!isEditing} />
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: Authorized Digital Signature */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={{ ...styles.sectionHeading, color: '#6b21a8' }}>✍️ Authorized Digital Signature</h3>
            <div style={{ ...styles.settingsCard, borderColor: '#c084fc' }}>
              <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 12px 0' }}>
                Upload the signature PNG payload of the authorized Building Manager to embed onto receipts.
              </p>
              <div style={styles.uploadBoxZone}>
                <input type="file" id="sig-file" style={{ display: 'none' }} onChange={handleSignatureUpload} disabled={!isEditing || uploading} />
                <label htmlFor="sig-file" style={{ ...styles.signatureFileLabel, opacity: (!isEditing || uploading) ? 0.5 : 1, cursor: (!isEditing || uploading) ? 'not-allowed' : 'pointer' }}>📁 {uploading ? 'Uploading...' : 'Select Signature PNG File'}</label>
              </div>
            </div>
          </div>

        </form>
      )}

      {subTab === 'app' && (
        <form id="app-form" onSubmit={handleSaveSettings} style={styles.formGrid}>
          {/* 1. Parking Settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={styles.sectionHeading}>🚗 Parking Management</h3>
            <div style={styles.settingsCard}>
              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <label style={styles.inputLabel}>Parking Mode</label>
                  <select value={parkingMode} onChange={(e) => setParkingMode(e.target.value)} style={styles.selectInput} disabled={!isEditing}>
                    <option value="MANUAL">Manual Decal Sticker</option>
                    <option value="AUTO_LPR">Automatic LPR Camera OCR</option>
                    <option value="AUTO_RFID">Automatic RFID Barrier</option>
                  </select>
                </div>
                <div style={styles.configRight}>
                  Define the method for vehicle ingress/egress validation. 'Manual Decal Sticker' uses stickers, 'Automatic LPR Camera OCR' uses license plate recognition, and 'Automatic RFID Barrier' uses RFID cards.
                </div>
              </div>

              {/* Resident Parking Fees Section - Always visible */}
              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <label style={styles.inputLabel}>Base Parking Fee (₱)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    {parkingFeeTiers.map((tier, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', minWidth: '60px' }}>
                          {idx + 1 === 1 ? '1st Car:' : idx + 1 === 2 ? '2nd Car:' : idx + 1 === 3 ? '3rd Car:' : `${idx + 1}th Car:`}
                        </span>
                        <div style={styles.currencyWrapper}>
                          <input
                            type="number"
                            value={tier}
                            onChange={(e) => {
                              const rawVal = e.target.value;
                              const val = rawVal === '' ? '' : Number(rawVal);
                              const next = [...parkingFeeTiers];
                              next[idx] = val;
                              setParkingFeeTiers(next);
                              if (idx === 0) {
                                setBaseParking(val);
                              }
                            }}
                            style={styles.currencyInput}
                            disabled={!isEditing}
                          />
                          <span style={styles.currencySuffix}>₱</span>
                        </div>
                        {isEditing && idx > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = parkingFeeTiers.filter((_, i) => i !== idx);
                              setParkingFeeTiers(next);
                            }}
                            style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '14px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          const lastVal = parkingFeeTiers[parkingFeeTiers.length - 1] || 1500;
                          setParkingFeeTiers([...parkingFeeTiers, lastVal + 500]);
                        }}
                        style={{ ...styles.saveActionButton, padding: '4px 8px', fontSize: '11px', marginTop: '4px', backgroundColor: '#0f172a', width: 'fit-content' }}
                      >
                        + Add Car
                      </button>
                    )}
                  </div>
                </div>
                <div style={styles.configRight}>
                  Monthly parking fee
                </div>
              </div>

              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <label style={styles.inputLabel}>Visitor Parking Billing Mode</label>
                  <select
                    value={!visitorParkingEnabled ? 'disabled' : (visitorParkingBilling ? 'enabled' : 'free')}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'disabled') {
                        setVisitorParkingEnabled(false);
                        setVisitorParkingBilling(false);
                      } else if (val === 'free') {
                        setVisitorParkingEnabled(true);
                        setVisitorParkingBilling(false);
                      } else {
                        setVisitorParkingEnabled(true);
                        setVisitorParkingBilling(true);
                      }
                    }}
                    style={styles.selectInput}
                    disabled={!isEditing}
                  >
                    <option value="enabled">Billing Enabled</option>
                    <option value="free">Free Parking</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
                <div style={styles.configRight}>
                  Configure visitor parking billing. Setting this to 'Billing Enabled' will automatically generate visitor parking billing receipts upon exit according to condo pricing policies.
                </div>
              </div>

              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <label style={styles.inputLabel}>Visitor Hourly Parking Rate (₱/hour)</label>
                  <div style={styles.currencyWrapper}>
                    <input
                      type="number"
                      value={visitorParking}
                      onChange={(e) => { const v = e.target.value; setVisitorParking(v === '' ? '' : Number(v)); }}
                      style={{ ...styles.currencyInput, backgroundColor: (!isEditing || !visitorParkingEnabled || !visitorParkingBilling) ? '#f1f5f9' : '#fff' }}
                      disabled={!isEditing || !visitorParkingEnabled || !visitorParkingBilling}
                    />
                    <span style={styles.currencySuffix}>₱ / hr</span>
                  </div>
                </div>
                <div style={styles.configRight}>
                  Hourly fee charged to visitor vehicles for each hour of parking.
                </div>
              </div>

              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <label style={styles.inputLabel}>Daily Maximum Parking Fee (₱)</label>
                  <div style={styles.currencyWrapper}>
                    <input
                      type="number"
                      value={maxParkingFee}
                      onChange={(e) => { const v = e.target.value; setMaxParkingFee(v === '' ? '' : Number(v)); }}
                      style={{ ...styles.currencyInput, backgroundColor: (!isEditing || !visitorParkingEnabled || !visitorParkingBilling) ? '#f1f5f9' : '#fff' }}
                      disabled={!isEditing || !visitorParkingEnabled || !visitorParkingBilling}
                    />
                    <span style={styles.currencySuffix}>₱ / day</span>
                  </div>
                </div>
                <div style={styles.configRight}>
                  Maximum fee charged to visitor vehicles per day (24-hour cycle).
                </div>
              </div>

              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <label style={styles.inputLabel}>Parking Grace Period (Minutes)</label>
                  <div style={styles.currencyWrapper}>
                    <input
                      type="number"
                      value={graceMins}
                      onChange={(e) => { const v = e.target.value; setGraceMins(v === '' ? '' : Number(v)); }}
                      style={{ ...styles.currencyInput, backgroundColor: (!isEditing || !visitorParkingEnabled || !visitorParkingBilling) ? '#f1f5f9' : '#fff' }}
                      disabled={!isEditing || !visitorParkingEnabled || !visitorParkingBilling}
                    />
                    <span style={styles.currencySuffix}>mins</span>
                  </div>
                </div>
                <div style={styles.configRight}>
                  Free grace period in minutes. Vehicles exiting within this duration are not charged.
                </div>
              </div>
            </div>
          </div>

          {/* 2. Billings Configuration */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={styles.sectionHeading}>💰 Billings Configurations</h3>
            <div style={styles.settingsCard}>
              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <label style={styles.inputLabel}>Active Billings Types</label>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {["Electricity", "Water", "Association Dues", "Parking", "Visitor Parking"].map(type => (
                      <label key={type} style={styles.checkboxLabel}>
                        <input type="checkbox" checked={billingTypes.includes(type)} onChange={() => handleToggleBillingType(type)} disabled={!isEditing} style={styles.checkboxInput} />
                        {type}
                      </label>
                    ))}
                    
                    {/* Custom billing types */}
                    {billingTypes.filter(t => !["Electricity", "Water", "Association Dues", "Parking", "Visitor Parking"].includes(t)).map(type => (
                      <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <label style={styles.checkboxLabel}>
                          <input type="checkbox" checked={true} onChange={() => handleToggleBillingType(type)} disabled={!isEditing} style={styles.checkboxInput} />
                          {type}
                        </label>
                        {isEditing && (
                          <button type="button" onClick={() => setBillingTypes(billingTypes.filter(t => t !== type))} style={{ color: '#ef4444', fontSize: '10px', fontWeight: 'bold', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕</button>
                        )}
                      </div>
                    ))}
                  </div>

                  {isEditing && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
                      <input type="text" placeholder="Add Custom" value={customBillingInput} onChange={(e) => setCustomBillingInput(e.target.value)} style={{ ...styles.textInput, height: '32px', padding: '4px 8px' }} />
                      <button type="button" onClick={handleAddCustomBilling} style={{ ...styles.saveActionButton, padding: '4px 10px', fontSize: '11px', height: '32px', whiteSpace: 'nowrap' }}>+ Add</button>
                    </div>
                  )}
                </div>
                <div style={styles.configRight}>
                  Select active billing types to charge occupants. Only checked types will be printed on statements and charged. You can add custom categories using the input field below.
                </div>
              </div>

              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <label style={styles.inputLabel}>Late Payment Monthly Penalty Rate (%)</label>
                  <div style={styles.currencyWrapper}>
                    <input type="number" step="0.1" value={penaltyRate} onChange={(e) => setPenaltyRate(e.target.value)} style={styles.currencyInput} disabled={!isEditing} />
                    <span style={styles.currencySuffix}>% / Month</span>
                  </div>
                </div>
                <div style={styles.configRight}>
                  Monthly penalty rate (%) applied to unpaid invoice balances after the payment due date.
                </div>
              </div>

              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <label style={styles.inputLabel}>Late Billing Penalty Due Day (Day of Month)</label>
                  <select value={penaltyDueDay} onChange={(e) => setPenaltyDueDay(Number(e.target.value))} style={styles.selectInput} disabled={!isEditing}>
                    {Array.from({ length: 28 }).map((_, i) => (
                      <option key={i + 1} value={i + 1}>Day {i + 1} of the Month</option>
                    ))}
                  </select>
                </div>
                <div style={styles.configRight}>
                  Set the payment deadline day of each month after which late penalties start accumulating.
                </div>
              </div>

              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <input type="file" id="billing-csv" style={{ display: 'none' }} onChange={handleBillingExcelUpload} disabled={!isEditing} />
                  <label htmlFor="billing-csv" style={{ ...styles.signatureFileLabel, opacity: !isEditing ? 0.5 : 1, cursor: !isEditing ? 'not-allowed' : 'pointer', backgroundColor: '#475569', padding: '6px 12px', fontSize: '11px', textAlign: 'center', display: 'block' }}>
                    📁 Upload Billing Excel File
                  </label>
                </div>
                <div style={styles.configRight}>
                  Upload an Excel/CSV file containing your condo's billing statements. The system will automatically detect the columns and add them as billing types.
                </div>
              </div>
            </div>
          </div>

          {/* 3. Occupants Upload */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={styles.sectionHeading}>📥 Occupants Upload</h3>
            <div style={styles.settingsCard}>
              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <input type="file" id="occupants-csv" style={{ display: 'none' }} onChange={handleBulkFileUploadParsed} disabled={!isEditing || isBulkSyncing} />
                  <label htmlFor="occupants-csv" style={{ ...styles.signatureFileLabel, opacity: (!isEditing || isBulkSyncing) ? 0.5 : 1, cursor: (!isEditing || isBulkSyncing) ? 'not-allowed' : 'pointer', display: 'block', textAlign: 'center', fontSize: '11px', padding: '6px 12px' }}>📁 {uploadedFileName ? `Selected: ${uploadedFileName}` : 'Select Occupants CSV File'}</label>
                  <p style={{ color: '#94a3b8', fontSize: '9px', marginTop: '4px' }}>Format: UnitNo, Name, Email, Phone, Role (owner/tenant/family_member), LeaseStart, LeaseEnd, IsPayer(true/false)</p>
                </div>
                <div style={styles.configRight}>
                  Import unified tenant and landlord rosters directly via a CSV file. Uploaded records will automatically map to existing condo units in the database.
                </div>
              </div>

              {bulkLogSummary.total > 0 && (
                <div style={styles.bulkSummaryGrid}>
                  <div style={styles.bulkSummaryBox}>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#94a3b8' }}>TOTAL ROWS</span>
                    <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{bulkLogSummary.total}</span>
                  </div>
                  <div style={{ ...styles.bulkSummaryBox, borderColor: '#22c55e' }}>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#22c55e' }}>🟢 VALID</span>
                    <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#22c55e' }}>{bulkLogSummary.valid}</span>
                  </div>
                  <div style={{ ...styles.bulkSummaryBox, borderColor: '#ef4444' }}>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#ef4444' }}>🔴 ERRORS</span>
                    <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#ef4444' }}>{bulkLogSummary.invalid}</span>
                  </div>
                </div>
              )}

              {bulkPreviewList.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <div style={styles.bulkTableScroll}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8fafc', color: '#475569', borderBottom: '1px solid #e5e7eb' }}>
                          <th style={{ padding: '6px' }}>Unit</th>
                          <th style={{ padding: '6px' }}>Name</th>
                          <th style={{ padding: '6px' }}>Email</th>
                          <th style={{ padding: '6px' }}>Role</th>
                          <th style={{ padding: '6px', textAlign: 'right' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkPreviewList.map((row, idx) => (
                          <tr style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: row.isValid ? 'transparent' : '#fef2f2' }} key={idx}>
                            <td style={{ padding: '6px', fontWeight: 'bold' }}>{row.unit_no} {row.tower ? `(${row.tower})` : ''}</td>
                            <td style={{ padding: '6px' }}>{row.fullName}</td>
                            <td style={{ padding: '6px', color: '#64748b' }}>{row.email}</td>
                            <td style={{ padding: '6px', textTransform: 'capitalize' }}>{row.unitRole}</td>
                            <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold', color: row.isValid ? '#16a34a' : '#ef4444' }}>
                              {row.isValid ? 'Ready' : row.errorReason}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" onClick={handleDeployBulkOccupants} disabled={isBulkSyncing || bulkLogSummary.valid === 0} style={{ ...styles.saveActionButton, width: '100%', marginTop: '10px' }}>
                    {isBulkSyncing ? 'Synchronizing...' : `⚡ Sync ${bulkLogSummary.valid} Valid Occupants to DB`}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 4. Parcel Management */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={styles.sectionHeading}>📦 Parcel Management</h3>
            <div style={styles.settingsCard}>
              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <label style={styles.inputLabel}>Delivery Mode</label>
                  <select value={parcelDeliveryPolicy} onChange={(e) => setParcelDeliveryPolicy(e.target.value)} style={styles.selectInput} disabled={!isEditing}>
                    <option value="GUARD_HOUSE">Guard House / Lobby Vault Storage (Recommended)</option>
                    <option value="DIRECT_UNIT">Direct Courier Unit Delivery (Requires Guard Gate Registry)</option>
                  </select>
                </div>
                <div style={styles.configRight}>
                  Define parcel delivery rules.
                  <br/><strong>Guard House / Lobby Vault Storage:</strong> keeps parcels in the guard house or lobby locker for secure release via signature QR verification.
                  <br/><strong>Direct Courier Unit Delivery:</strong> allows couriers to deliver directly to units (requires guard gate registration, courier photo, and target units registry).
                </div>
              </div>
            </div>
          </div>

          {/* 5. Amenities Bookings & Capacity Limits */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={styles.sectionHeading}>🏊 Amenities Bookings & Capacity Limits</h3>
            <div style={styles.settingsCard}>
              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <label style={styles.checkboxLabel}>
                    <input type="checkbox" checked={amenityBookingEnabled} onChange={(e) => setAmenityBookingEnabled(e.target.checked)} disabled={!isEditing} style={styles.checkboxInput} />
                    Enable Amenity Booking Feature
                  </label>
                </div>
                <div style={styles.configRight}>
                  Toggle the global amenity booking feature. Disabling this will hide amenity booking options from the resident mobile portal.
                </div>
              </div>

              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <label style={styles.checkboxLabel}>
                    <input type="checkbox" checked={amenityBillingEnabled} onChange={(e) => setAmenityBillingEnabled(e.target.checked)} disabled={!isEditing || !amenityBookingEnabled} style={styles.checkboxInput} />
                    Charge for Amenity Bookings (Billing Enabled)
                  </label>
                </div>
                <div style={styles.configRight}>
                  Enable billing for amenities. When checked, the system will charge amenity fees on the resident billing statements.
                </div>
              </div>

              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                    {Object.keys(amenitySettings).map(name => {
                      const setting = amenitySettings[name] || { enabled: true, max_capacity: 10, charge_enabled: false, fee: 0 };
                      return (
                        <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <label style={styles.checkboxLabel}>
                              <input type="checkbox" checked={setting.enabled} onChange={(e) => {
                                setAmenitySettings({
                                  ...amenitySettings,
                                  [name]: { ...setting, enabled: e.target.checked }
                                });
                              }} disabled={!isEditing || !amenityBookingEnabled} style={styles.checkboxInput} />
                              {name} Booking
                            </label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              {setting.enabled && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '11px', color: '#475569' }}>Cap:</span>
                                  <input type="number" value={setting.max_capacity ?? ''} onChange={(e) => {
                                    const v = e.target.value;
                                    setAmenitySettings({
                                      ...amenitySettings,
                                      [name]: { ...setting, max_capacity: v === '' ? '' : Number(v) }
                                    });
                                  }} style={{ ...styles.textInput, width: '60px', height: '28px', padding: '2px 6px' }} disabled={!isEditing || !amenityBookingEnabled} />
                                </div>
                              )}
                              {isEditing && (
                                <button type="button" onClick={() => handleDeleteAmenity(name)} style={{ color: '#ef4444', fontSize: '11px', fontWeight: 'bold', border: 'none', background: 'transparent', cursor: 'pointer' }}>✕ Remove</button>
                              )}
                            </div>
                          </div>
                          {setting.enabled && amenityBillingEnabled && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginLeft: '24px', backgroundColor: '#f8fafc', padding: '6px 12px', borderRadius: '6px' }}>
                              <label style={{ ...styles.checkboxLabel, fontSize: '11px', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <input type="checkbox" checked={!!setting.charge_enabled} onChange={(e) => {
                                  setAmenitySettings({
                                    ...amenitySettings,
                                    [name]: { ...setting, charge_enabled: e.target.checked }
                                  });
                                }} disabled={!isEditing || !amenityBookingEnabled} style={styles.checkboxInput} />
                                Charge Booking Fee
                              </label>

                              {setting.charge_enabled && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '11px', color: '#475569' }}>Fee:</span>
                                  <div style={{ ...styles.currencyWrapper, width: '100px' }}>
                                    <input type="number" value={setting.fee ?? ''} onChange={(e) => {
                                      const v = e.target.value;
                                      setAmenitySettings({
                                        ...amenitySettings,
                                        [name]: { ...setting, fee: v === '' ? '' : Number(v) }
                                      });
                                    }} style={{ ...styles.currencyInput, padding: '4px 20px 4px 10px', height: '26px', fontSize: '11px' }} disabled={!isEditing || !amenityBookingEnabled} />
                                    <span style={{ ...styles.currencySuffix, right: '8px', fontSize: '10px' }}>₱</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {isEditing && amenityBookingEnabled && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', width: '100%', alignItems: 'center' }}>
                      <input type="text" placeholder="New Amenity Name" value={newAmenityName} onChange={(e) => setNewAmenityName(e.target.value)} style={{ ...styles.textInput, flex: 2, height: '32px', padding: '4px 8px' }} />
                      <input type="number" placeholder="Cap" value={newAmenityCapacity} onChange={(e) => { const v = e.target.value; setNewAmenityCapacity(v === '' ? '' : Number(v)); }} style={{ ...styles.textInput, flex: 1, height: '32px', padding: '4px 8px' }} />
                      <button type="button" onClick={handleAddCustomAmenity} style={{ ...styles.saveActionButton, padding: '4px 12px', fontSize: '11px', height: '32px', backgroundColor: '#0f172a' }}>+ Add</button>
                    </div>
                  )}
                </div>
                <div style={styles.configRight}>
                  Set booking activation status and hourly maximum capacity limits for each facility. Unchecked facilities are disabled in the resident portal. Use the input below to add or remove custom facilities like tennis courts or clubhouses.
                </div>
              </div>
            </div>
          </div>

          {/* 6. Live Intercom Response Hours */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={styles.sectionHeading}>📞 Live Intercom PMO Response Hours</h3>
            <div style={styles.settingsCard}>
              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                    <div style={{ flex: 1 }}>
                      <label style={styles.inputLabel}>PMO Hours Start</label>
                      <select value={pmoStart} onChange={(e) => setPmoStart(e.target.value)} style={styles.selectInput} disabled={!isEditing}>
                        {Array.from({ length: 24 }).map((_, i) => {
                          const hour = String(i).padStart(2, '0');
                          return (
                            <React.Fragment key={hour}>
                              <option value={`${hour}:00`}>{hour}:00</option>
                              <option value={`${hour}:30`}>{hour}:30</option>
                            </React.Fragment>
                          );
                        })}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={styles.inputLabel}>PMO Hours End</label>
                      <select value={pmoEnd} onChange={(e) => setPmoEnd(e.target.value)} style={styles.selectInput} disabled={!isEditing}>
                        {Array.from({ length: 24 }).map((_, i) => {
                          const hour = String(i).padStart(2, '0');
                          return (
                            <React.Fragment key={hour}>
                              <option value={`${hour}:00`}>{hour}:00</option>
                              <option value={`${hour}:30`}>{hour}:30</option>
                            </React.Fragment>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                </div>
                <div style={styles.configRight}>
                  Set the operational hours of the Property Management Office (PMO) to accept and handle video/audio intercom calls from units or guard gate stations.
                </div>
              </div>
            </div>
          </div>

          {/* 7. Holiday & Payroll Settings */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h3 style={styles.sectionHeading}>📅 Holiday & Payroll Settings</h3>
            <div style={styles.settingsCard}>
              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <label style={styles.inputLabel}>Default Regular Holiday Multiplier</label>
                  <input
                    type="number"
                    step="0.05"
                    value={defaultRegHolidayMultiplier}
                    onChange={(e) => { const v = e.target.value; setDefaultRegHolidayMultiplier(v === '' ? '' : Number(v)); }}
                    style={styles.textInput}
                    disabled={!isEditing}
                  />
                </div>
                <div style={styles.configRight}>
                  Default salary multiplier applied for regular holidays if no individual staff override is set (default: 2.0).
                </div>
              </div>

              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <label style={styles.inputLabel}>Default Special Holiday Multiplier</label>
                  <input
                    type="number"
                    step="0.05"
                    value={defaultSpecHolidayMultiplier}
                    onChange={(e) => { const v = e.target.value; setDefaultSpecHolidayMultiplier(v === '' ? '' : Number(v)); }}
                    style={styles.textInput}
                    disabled={!isEditing}
                  />
                </div>
                <div style={styles.configRight}>
                  Default salary multiplier applied for special holidays if no individual staff override is set (default: 1.3).
                </div>
              </div>

              <div style={styles.configRow}>
                <div style={styles.configLeft}>
                  <label style={styles.inputLabel}>Default Overtime Multiplier</label>
                  <input
                    type="number"
                    step="0.05"
                    value={defaultOtMultiplier}
                    onChange={(e) => { const v = e.target.value; setDefaultOtMultiplier(v === '' ? '' : Number(v)); }}
                    style={styles.textInput}
                    disabled={!isEditing}
                  />
                </div>
                <div style={styles.configRight}>
                  Default overtime pay multiplier if no individual staff override is set (default: 1.25).
                </div>
              </div>

              {/* Philippine Holidays Manager */}
              <div style={{ ...styles.configRow, borderBottom: 'none', paddingBottom: 0 }}>
                <div style={{ ...styles.configLeft, width: '100%' }}>
                  <label style={styles.inputLabel}>Philippine Holidays Registry</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px', width: '100%' }}>
                    <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
                      {holidays.length === 0 ? (
                        <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>No holidays registered.</p>
                      ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                              <th style={{ padding: '4px' }}>Date</th>
                              <th style={{ padding: '4px' }}>Name</th>
                              <th style={{ padding: '4px' }}>Type</th>
                              {isEditing && <th style={{ padding: '4px', textAlign: 'right' }}>Actions</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {holidays.map(h => (
                              <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '4px', fontWeight: 'bold' }}>{h.holiday_date}</td>
                                <td style={{ padding: '4px' }}>{h.name}</td>
                                <td style={{ padding: '4px', textTransform: 'capitalize' }}>
                                  <span style={{ 
                                    padding: '2px 6px', 
                                    borderRadius: '4px', 
                                    fontSize: '10px', 
                                    fontWeight: 'bold',
                                    backgroundColor: h.type === 'regular' ? '#fee2e2' : '#fef3c7',
                                    color: h.type === 'regular' ? '#ef4444' : '#d97706'
                                  }}>
                                    {h.type}
                                  </span>
                                </td>
                                {isEditing && (
                                  <td style={{ padding: '4px', textAlign: 'right' }}>
                                    <button 
                                      type="button" 
                                      onClick={async () => {
                                        const { error } = await supabase.from('philippine_holidays').delete().eq('id', h.id);
                                        if (!error) {
                                          fetchHolidays();
                                        } else {
                                          alert("Failed to delete holiday: " + error.message);
                                        }
                                      }}
                                      style={{ color: '#ef4444', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '11px' }}
                                    >
                                      Delete
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    
                    {isEditing && (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '8px', padding: '10px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ flex: 1, minWidth: '120px' }}>
                          <input 
                            type="date" 
                            value={newHolidayDate} 
                            onChange={(e) => setNewHolidayDate(e.target.value)} 
                            style={{ ...styles.textInput, height: '32px', padding: '4px 8px' }} 
                          />
                        </div>
                        <div style={{ flex: 2, minWidth: '150px' }}>
                          <input 
                            type="text" 
                            placeholder="Holiday Name" 
                            value={newHolidayName} 
                            onChange={(e) => setNewHolidayName(e.target.value)} 
                            style={{ ...styles.textInput, height: '32px', padding: '4px 8px' }} 
                          />
                        </div>
                        <div>
                          <select 
                            value={newHolidayType} 
                            onChange={(e: any) => setNewHolidayType(e.target.value)} 
                            style={{ ...styles.selectInput, height: '32px', padding: '2px 8px', fontSize: '12px' }}
                          >
                            <option value="regular">Regular</option>
                            <option value="special">Special</option>
                          </select>
                        </div>
                        <button 
                          type="button" 
                          onClick={async () => {
                            if (!newHolidayDate || !newHolidayName) {
                              alert("Please fill in both Date and Name for the new holiday.");
                              return;
                            }
                            const { error } = await supabase.from('philippine_holidays').insert([{
                              holiday_date: newHolidayDate,
                              name: newHolidayName,
                              type: newHolidayType
                            }]);
                            if (!error) {
                              setNewHolidayDate('');
                              setNewHolidayName('');
                              fetchHolidays();
                            } else {
                              alert("Failed to add holiday: " + error.message);
                            }
                          }}
                          style={{ ...styles.saveActionButton, padding: '4px 12px', fontSize: '11px', height: '32px', backgroundColor: '#0f172a' }}
                        >
                          + Add Holiday
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

        </form>
      )}

      {subTab === 'staff' && (
        <AdminStaffManager condoId={currentCondoId} viewMode="roster" currentUserRole={currentUserRole} />
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  viewWrapper: { display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '800px', width: '100%' },
  tabHeader: { display: 'flex', gap: '20px', marginBottom: '20px', borderBottom: '1px solid #e5e7eb' },
  tabButton: { padding: '10px 0', fontSize: '15px', fontWeight: 'bold', border: 'none', background: 'none', cursor: 'pointer', transition: 'all 0.2s' },
  headerZone: { marginBottom: '8px' },
  mainTitle: { fontSize: '20px', fontWeight: 'bold', color: '#0f172a', margin: 0 },
  mainSubtitle: { fontSize: '13px', color: '#64748b', margin: '4px 0 0 0' },
  formGrid: { display: 'flex', flexDirection: 'column', gap: '20px' },
  settingsCard: { backgroundColor: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: '14px' },
  sectionHeading: { margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#1e293b' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' },
  inputRow: { display: 'flex', gap: '16px', width: '100%', flexWrap: 'wrap' },
  inputLabel: { fontSize: '11px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.3px' },
  textInput: { padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', color: '#334155', width: '100%' },
  selectInput: { padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', color: '#334155', width: '100%', height: '38px', backgroundColor: '#fff' },
  currencyWrapper: { position: 'relative', display: 'flex', alignItems: 'center', width: '100%' },
  currencyInput: { padding: '8px 12px 8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', color: '#334155', width: '100%' },
  currencySuffix: { position: 'absolute', right: '14px', fontSize: '12px', fontWeight: 'bold', color: '#64748b' },
  uploadBoxZone: { border: '2px dashed #e2e8f0', backgroundColor: '#f8fafc', padding: '20px', borderRadius: '10px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  signatureFileLabel: { cursor: 'pointer', backgroundColor: '#0f172a', color: '#fff', padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', display: 'inline-block' },
  actionRow: { display: 'flex', justifyContent: 'flex-end', marginTop: '4px' },
  saveActionButton: { backgroundColor: '#6b21a8', color: '#ffffff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', transition: 'opacity 0.2s' },
  editActionButton: { backgroundColor: '#0f172a', color: '#ffffff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' },
  cancelActionButton: { backgroundColor: '#ffffff', color: '#475569', border: '1px solid #cbd5e1', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', marginRight: '12px' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600', color: '#334155', cursor: 'pointer' },
  checkboxInput: { width: '16px', height: '16px', cursor: 'pointer' },
  configRow: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: '24px',
    alignItems: 'center',
    borderBottom: '1px solid #f1f5f9',
    paddingBottom: '16px',
    paddingTop: '16px'
  },
  configLeft: {
    width: '320px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  configRight: {
    flex: 1,
    minWidth: '250px',
    fontSize: '12.5px',
    color: '#64748b',
    lineHeight: '1.5'
  },
  
  // Bulk upload preview classes
  bulkSummaryGrid: { display: 'flex', gap: '12px', marginTop: '10px' },
  bulkSummaryBox: { flex: 1, border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  bulkTableScroll: { maxHeight: '200px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', marginTop: '8px' }
};