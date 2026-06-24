import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';

const generateSampleAttendance = (year: number, month: number, userId: string) => {
  const list = [];
  const daysInSelectedMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInSelectedMonth; day++) {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay(); // 0 = Sun, 6 = Sat
    
    // Work Monday to Friday
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      // Mon, Tue, Wed: 8 hours (480 mins)
      // Thu, Fri: 12 hours (720 mins, includes 4h overtime)
      const totalMinutes = (dayOfWeek <= 3) ? 480 : 720;
      const workDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      list.push({
        id: `sample-${workDate}`,
        staff_id: userId,
        work_date: workDate,
        clock_in_at: `${workDate}T07:00:00.000Z`,
        clock_out_at: totalMinutes === 480 ? `${workDate}T15:00:00.000Z` : `${workDate}T19:00:00.000Z`,
        total_minutes: totalMinutes,
        status: 'NORMAL',
        penalty_triggered: false
      });
    }
  }
  return list;
};

export default function ShiftModule({ 
  themeMode = 'LIGHT', 
  attendanceData = [], 
  currentYear, 
  currentMonth 
}: { 
  themeMode?: 'LIGHT' | 'DARK';
  attendanceData?: any[];
  currentYear?: number;
  currentMonth?: number;
}) {
  const [attendancePeriod, setAttendancePeriod] = useState<'WEEKLY' | 'MONTHLY'>('WEEKLY');
  
  const finalYear = currentYear ?? new Date().getFullYear();
  const finalMonth = currentMonth ?? new Date().getMonth();
  
  // Use passed attendance data or generate sample data
  const finalAttendanceData = attendanceData && attendanceData.length > 0
    ? attendanceData
    : generateSampleAttendance(finalYear, finalMonth, 'default-staff');

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Calculate weeklyDays based on current date or 15th of the month
  const today = new Date();
  const baseDate = (today.getFullYear() === finalYear && today.getMonth() === finalMonth)
    ? today
    : new Date(finalYear, finalMonth, 15);
  
  const startOfWeek = new Date(baseDate);
  startOfWeek.setDate(baseDate.getDate() - baseDate.getDay()); // Go to Sunday
  
  const weeklyDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d.getDate();
  });

  const workedDaysList = finalAttendanceData
    .filter(a => (a.total_minutes || 0) > 0)
    .map(a => new Date(a.work_date).getDate());

  const daysInMonth = new Date(finalYear, finalMonth + 1, 0).getDate();
  const monthlyFullDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const firstDayIndex = new Date(finalYear, finalMonth, 1).getDay();

  // Generate dynamic logs list based on finalAttendanceData
  const mockDbAttendanceLogs = finalAttendanceData.map((att, idx) => {
    const hours = (att.total_minutes || 0) / 60;
    const dateObj = new Date(att.work_date);
    const isWeekly = weeklyDays.includes(dateObj.getDate()) && dateObj.getMonth() === finalMonth && dateObj.getFullYear() === finalYear;
    
    return {
      id: att.id || `l-${idx}`,
      work_date: att.work_date,
      clock_in: att.clock_in_at ? new Date(att.clock_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '07:00 AM',
      clock_out: att.clock_out_at ? new Date(att.clock_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (hours > 0 ? '03:00 PM' : 'Off'),
      duration: att.total_minutes > 0 ? `${hours.toFixed(1)} hrs` : 'Off',
      isWeekly
    };
  }).filter(log => log.duration !== 'Off');

  const sortedLogs = [...mockDbAttendanceLogs].sort((a, b) => b.work_date.localeCompare(a.work_date));

  // Dynamic hours calculation
  const totalWorkedMinutesMonthly = finalAttendanceData.reduce((sum, a) => sum + (a.total_minutes || 0), 0);
  const totalWorkedHoursMonthly = totalWorkedMinutesMonthly / 60;
  
  const totalWorkedMinutesWeekly = finalAttendanceData
    .filter(a => {
      const d = new Date(a.work_date).getDate();
      return weeklyDays.includes(d);
    })
    .reduce((sum, a) => sum + (a.total_minutes || 0), 0);
  const totalWorkedHoursWeekly = totalWorkedMinutesWeekly / 60;

  const isDark = themeMode === 'DARK';
  const themeColors = {
    background: isDark ? '#0f172a' : '#f8fafc',
    cardBg: isDark ? '#1e293b' : '#ffffff',
    cardBorder: isDark ? '#334155' : '#cbd5e1',
    text: isDark ? '#ffffff' : '#0f172a',
    subtext: isDark ? '#cbd5e1' : '#334155',
    mutedText: isDark ? '#94a3b8' : '#64748b',
    dayBoxBg: isDark ? '#0f172a' : '#f1f5f9',
    dayBoxBorder: isDark ? '#334155' : '#cbd5e1',
    activeDayBoxBg: isDark ? '#1e3a8a' : '#e0f2fe',
    activeDayBoxBorder: isDark ? '#38bdf8' : '#0038a8',
    dayBoxOffBg: isDark ? '#0f172a' : '#ffffff',
    dayBoxOffBorder: isDark ? '#1e293b' : '#e2e8f0',
    dayTextOff: isDark ? '#475569' : '#94a3b8',
    punchLogBg: isDark ? '#1e293b' : '#ffffff',
    punchLogBorder: isDark ? '#334155' : '#e2e8f0',
    punchDateText: isDark ? '#ffffff' : '#0f172a',
    divider: isDark ? '#233146' : '#e2e8f0',
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>📆 SHIFT ATTENDANCE SMART CALENDAR</Text>
      <View style={[styles.periodRow, { marginBottom: 16, marginTop: 4 }]}>
        <TouchableOpacity 
          style={[styles.periodChip, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }, attendancePeriod === 'WEEKLY' && styles.activePeriodChip]} 
          onPress={() => setAttendancePeriod('WEEKLY')}
        >
          <Text style={[styles.periodText, { color: attendancePeriod === 'WEEKLY' ? '#fff' : themeColors.mutedText }]}>Weekly Filter</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.periodChip, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }, attendancePeriod === 'MONTHLY' && styles.activePeriodChip]} 
          onPress={() => setAttendancePeriod('MONTHLY')}
        >
          <Text style={[styles.periodText, { color: attendancePeriod === 'MONTHLY' ? '#fff' : themeColors.mutedText }]}>Monthly Filter</Text>
        </TouchableOpacity>
      </View>
      
      <View style={[styles.calendarCard, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
        <View style={[styles.calendarNavHeader, { borderBottomColor: themeColors.divider }]}>
          <TouchableOpacity onPress={() => Alert.alert("Navigation", "Previous Scope Launched")}><Text style={styles.navArrowText}>◀</Text></TouchableOpacity>
          <Text style={[styles.monthHeader, { color: themeColors.text }]}>
            {attendancePeriod === 'WEEKLY' 
              ? `${monthNames[finalMonth]} ${finalYear} (Current Week)` 
              : `${monthNames[finalMonth]} ${finalYear} (Full Grid)`}
          </Text>
          <TouchableOpacity onPress={() => Alert.alert("Navigation", "Next Scope Launched")}><Text style={styles.navArrowText}>▶</Text></TouchableOpacity>
        </View>
        {attendancePeriod === 'WEEKLY' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {weeklyDays.map((day) => {
              const dateStr = `${finalYear}-${String(finalMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const att = finalAttendanceData.find(a => a.work_date === dateStr);
              const hoursWorked = att?.total_minutes ? (att.total_minutes / 60) : 0;
              const hasWorked = hoursWorked > 0;
              
              const isToday = day === today.getDate() && finalMonth === today.getMonth() && finalYear === today.getFullYear();
              
              return (
                <View 
                  key={day} 
                  style={[
                    styles.calDayBox, 
                    { backgroundColor: themeColors.dayBoxBg, borderColor: themeColors.dayBoxBorder },
                    isToday && { backgroundColor: themeColors.activeDayBoxBg, borderColor: themeColors.activeDayBoxBorder }
                  ]}
                >
                  <Text style={[styles.calDayText, { color: themeColors.text }, isToday && { color: '#0038a8' }]}>{day}</Text>
                  <Text style={[styles.calDutyLabel, { color: hasWorked ? '#16a34a' : themeColors.mutedText }]}>
                    {hasWorked ? `${hoursWorked.toFixed(0)}h Duty` : 'Off'}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <View style={{ marginTop: 8 }}>
            <View style={styles.gridWeekHeaderRow}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, idx) => <Text key={idx} style={[styles.gridWeekHeaderText, { color: themeColors.mutedText }]}>{w}</Text>)}
            </View>
            <View style={styles.gridCalendarContainer}>
              {Array.from({ length: firstDayIndex }).map((_, p) => <View key={`blank-${p}`} style={styles.gridDayBoxBlank} />)}
              {monthlyFullDays.map((day) => {
                const dateStr = `${finalYear}-${String(finalMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const att = finalAttendanceData.find(a => a.work_date === dateStr);
                const hoursWorked = att?.total_minutes ? (att.total_minutes / 60) : 0;
                const hasWorked = hoursWorked > 0;
                
                const isToday = day === today.getDate() && finalMonth === today.getMonth() && finalYear === today.getFullYear();
                
                return (
                  <View 
                    key={day} 
                    style={[
                      styles.gridDayBox, 
                      hasWorked 
                        ? { backgroundColor: '#052e16', borderColor: '#15803d' } 
                        : { backgroundColor: themeColors.dayBoxOffBg, borderColor: themeColors.dayBoxOffBorder },
                      isToday && { borderColor: '#0038a8', borderWidth: 2 }
                    ]}
                  >
                    <Text style={[styles.gridDayText, hasWorked ? styles.gridDayTextWorked : { color: themeColors.dayTextOff }]}>{day}</Text>
                    <Text style={[styles.gridDayStatusSub, { color: hasWorked ? '#4ade80' : themeColors.dayTextOff }]}>
                      {hasWorked ? `${hoursWorked.toFixed(0)}h` : 'Off'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: themeColors.cardBg, borderColor: themeColors.cardBorder }]}>
        <Text style={{ color: themeColors.text, fontSize: 16, fontWeight: '800' }}>
          {attendancePeriod === 'WEEKLY' 
            ? `${totalWorkedHoursWeekly.toFixed(1)} Hours Approved` 
            : `${totalWorkedHoursMonthly.toFixed(1)} Hours Approved`}
        </Text>
      </View>

      <Text style={[styles.sectionTitle, { color: themeColors.mutedText }]}>📋 DETAILED ATTENDANCE CARDS HISTORY</Text>
      {sortedLogs
        .filter(log => attendancePeriod === 'MONTHLY' ? true : log.isWeekly)
        .map((log) => (
          <View key={log.id} style={[styles.punchLogItem, { backgroundColor: themeColors.punchLogBg, borderColor: themeColors.punchLogBorder }]}>
            <View style={styles.punchHeaderRow}>
              <Text style={[styles.punchDateText, { color: themeColors.punchDateText }]}>📅 {log.work_date}</Text>
              <Text style={styles.punchDurationBadge}>⏱️ {log.duration}</Text>
            </View>
            <Text style={[styles.punchTimeDetail, { color: themeColors.subtext }]}>In: {log.clock_in} ➔ Out: {log.clock_out}</Text>
          </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionTitle: { fontSize: 11, fontWeight: '800', marginTop: 20, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  periodRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  periodChip: { flex: 0.48, padding: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  activePeriodChip: { backgroundColor: '#0038a8', borderColor: '#0038a8' },
  periodText: { fontSize: 11, fontWeight: '700' },
  activePeriodText: { color: '#fff' },
  calendarCard: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 15 },
  calendarNavHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, paddingBottom: 8 },
  navArrowText: { color: '#38bdf8', fontSize: 15, paddingHorizontal: 12, fontWeight: '900' },
  monthHeader: { fontSize: 13, fontWeight: '800' },
  calDayBox: { width: 55, height: 65, borderRadius: 12, marginRight: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  calDayText: { fontSize: 12, fontWeight: '700' },
  calDutyLabel: { fontSize: 9, marginTop: 4, fontWeight: '600' },
  gridWeekHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  gridWeekHeaderText: { fontSize: 11, fontWeight: '900', width: '13%', textAlign: 'center' },
  gridCalendarContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  gridDayBox: { width: '13%', height: 50, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginHorizontal: '0.6%', marginVertical: 4, borderWidth: 1 },
  gridDayBoxBlank: { width: '13%', height: 50, marginHorizontal: '0.6%', marginVertical: 4 }, 
  gridDayBoxWorked: { backgroundColor: '#052e16', borderColor: '#15803d' }, 
  gridDayBoxOff: { backgroundColor: '#0f172a', borderColor: '#1e293b' }, 
  gridDayText: { fontSize: 12, fontWeight: '700' },
  gridDayTextWorked: { color: '#4ade80' },
  gridDayTextOff: { color: '#475569' },
  gridDayStatusSub: { fontSize: 8, marginTop: 2, fontWeight: '600' },
  card: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 15 },
  punchLogItem: { padding: 14, borderRadius: 14, marginBottom: 10, borderWidth: 1 },
  punchHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  punchDateText: { fontSize: 13, fontWeight: '700' },
  punchDurationBadge: { color: '#93c5fd', fontSize: 11, fontWeight: '700', backgroundColor: '#1e3a8a', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  punchTimeDetail: { fontSize: 12, marginTop: 6, fontWeight: '500' }
});