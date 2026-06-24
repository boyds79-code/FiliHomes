"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '../src/lib/supabaseClient';

interface AttendanceLog {
  id: string;
  staff_id: string;
  staff_name: string;
  work_date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  total_minutes: number | null;
}

interface PayrollCalculated {
  staff_id: string;
  staff_name: string;
  regular_hours: number;
  ot_hours: number;
  base_pay: number;
  ot_pay: number;
  net_pay: number;
  status: 'PENDING' | 'APPROVED' | 'PAID';
}

export default function StaffPayrollManager({ condoId }: { condoId: string }) {
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [payrollList, setPayrollList] = useState<PayrollCalculated[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);

  useEffect(() => {
    fetchActiveAttendanceLogs();
  }, [condoId]);

  const fetchActiveAttendanceLogs = async () => {
    const mockLogs: AttendanceLog[] = [
      { id: 'att_1', staff_id: 'guard_juan_uuid', staff_name: 'Guard Juan', work_date: '2026-05-30', clock_in_at: '02:48 AM', clock_out_at: 'On Duty', total_minutes: 630 },
      { id: 'att_2', staff_id: 'guard_juan_uuid', staff_name: 'Guard Juan', work_date: '2026-05-29', clock_in_at: '07:00 AM', clock_out_at: '07:00 PM', total_minutes: 720 },
      { id: 'att_3', staff_id: 'guard_mariano_uuid', staff_name: 'Guard Mariano (Guard B)', work_date: '2026-05-30', clock_in_at: '07:00 AM', clock_out_at: '07:00 PM', total_minutes: 720 }
    ];
    setAttendanceLogs(mockLogs);
    calculatePayrollMetrics(mockLogs);
  };

  const calculatePayrollMetrics = (logs: AttendanceLog[]) => {
    const HOURLY_RATE = 80; 
    const OT_RATE = HOURLY_RATE * 1.25;
    const summaryMap: { [key: string]: PayrollCalculated } = {};

    logs.forEach(log => {
      const minutes = log.total_minutes || 0;
      const hours = minutes / 60;
      
      const regularHours = hours > 8 ? 8 : hours;
      const otHours = hours > 8 ? hours - 8 : 0;

      const basePay = regularHours * HOURLY_RATE;
      const otPay = otHours * OT_RATE;

      if (!summaryMap[log.staff_id]) {
        summaryMap[log.staff_id] = {
          staff_id: log.staff_id,
          staff_name: log.staff_name,
          regular_hours: 0,
          ot_hours: 0,
          base_pay: 0,
          ot_pay: 0,
          net_pay: 0,
          status: 'PENDING'
        };
      }

      summaryMap[log.staff_id].regular_hours += regularHours;
      summaryMap[log.staff_id].ot_hours += otHours;
      summaryMap[log.staff_id].base_pay += basePay;
      summaryMap[log.staff_id].ot_pay += otPay;
      summaryMap[log.staff_id].net_pay += (basePay + otPay);
    });

    setPayrollList(Object.values(summaryMap));
  };

  const handleApproveAndPayoutAll = async () => {
    setIsCalculating(true);
    try {
      for (const item of payrollList) {
        const response = await fetch('/api/staff-payroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            staff_name: item.staff_name,
            base_salary_piso: item.base_pay,
            overtime_hours: item.ot_hours,
            net_pay_piso: item.net_pay,
            payout_status: 'APPROVED',
            pay_period_start: '2026-05-16',
            pay_period_end: '2026-05-30'
          })
        });
        
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to insert payroll');
        }
      }
      alert(`💸 Payroll Sheet Locked!\nPayslip tokens dispatched to staff mobile cockpits.`);
      setPayrollList(prev => prev.map(p => ({ ...p, status: 'APPROVED' })));
    } catch (error) {
      console.error(error);
      alert("Error processing payroll distribution.");
    } finally {
      setIsCalculating(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>💰 Staff Attendance & Payroll Console</h2>
      <p style={styles.subtitle}>Real-time punch logs from Guard Cockpits are aggregated under Philippine Labor standard metrics to automate payroll bookkeeping.</p>

      <h3 style={styles.sectionHeader}>🚨 Live Guard Attendance Feeds</h3>
      <div style={styles.tableCard}>
        <div style={styles.tableHeaderRow}>
          <span style={{ width: '25%' }}>Staff Name</span>
          <span style={{ width: '25%' }}>Work Date</span>
          <span style={{ width: '25%' }}>Punch In</span>
          <span style={{ width: '25%', textAlign: 'right' }}>Punch Out</span>
        </div>
        <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
          {attendanceLogs.map((log) => (
            <div key={log.id} style={styles.tableRow}>
              <span style={{ width: '25%', fontWeight: 'bold', color: '#fff' }}>{log.staff_name}</span>
              <span style={{ width: '25%', color: '#94a3b8' }}>{log.work_date}</span>
              <span style={{ width: '25%', color: '#22c55e' }}>{log.clock_in_at}</span>
              <span style={{ width: '25%', textAlign: 'right', color: log.clock_out_at === 'On Duty' ? '#f59e0b' : '#94a3b8' }}>{log.clock_out_at}</span>
            </div>
          ))}
        </div>
      </div>

      <h3 style={styles.sectionHeader}>📋 Automated Gross-to-Net Pay Sheet</h3>
      <div style={styles.tableCard}>
        <div style={styles.tableHeaderRow}>
          <span style={{ width: '25%' }}>Staff Target</span>
          <span style={{ width: '25%' }}>Regular / Overtime</span>
          <span style={{ width: '25%' }}>Gross Base / OT Pay</span>
          <span style={{ width: '25%', textAlign: 'right' }}>Total Net Salary</span>
        </div>
        <div>
          {payrollList.map((p) => (
            <div key={p.staff_id} style={styles.tableRow}>
              <span style={{ width: '25%', fontWeight: 'bold', color: '#fff' }}>{p.staff_name}</span>
              <span style={{ width: '25%', color: '#e2e8f0' }}>{p.regular_hours.toFixed(1)} hrs / <span style={{ color: '#38bdf8' }}>{p.ot_hours.toFixed(1)} OT</span></span>
              <span style={{ width: '25%', color: '#94a3b8', fontSize: '12px' }}>₱{p.base_pay.toLocaleString()} / ₱{p.ot_pay.toLocaleString()}</span>
              <span style={{ width: '25%', textAlign: 'right', color: '#4ade80', fontWeight: 'bold', fontSize: '15px' }}>₱{p.net_pay.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      <button style={styles.syncButton} disabled={isCalculating || payrollList.length === 0} onClick={handleApproveAndPayoutAll}>
        {isCalculating ? '🧮 Generating Statements...' : '⚡ Release Payslips & Sync Ledger to Staff Apps'}
      </button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { backgroundColor: '#1e293b', padding: '24px', borderRadius: '16px', border: '1px solid #334155', fontFamily: 'system-ui', marginTop: '20px' },
  title: { fontSize: '18px', fontWeight: 'bold', color: '#fff', margin: 0 },
  subtitle: { fontSize: '13px', color: '#94a3b8', marginTop: '6px', marginBottom: '20px' },
  sectionHeader: { fontSize: '12px', fontWeight: '800', color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '20px', marginBottom: '10px' },
  tableCard: { backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' },
  tableHeaderRow: { display: 'flex', backgroundColor: '#111827', padding: '10px 14px', color: '#64748b', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' },
  tableRow: { display: 'flex', padding: '12px 14px', borderBottom: '1px solid #1e293b', color: '#fff', alignItems: 'center', fontSize: '13px' },
  syncButton: { width: '100%', backgroundColor: '#0284c7', color: '#fff', border: 'none', padding: '14px', borderRadius: '10px', fontWeight: 'bold', fontSize: '14px', marginTop: '20px', cursor: 'pointer' }
};