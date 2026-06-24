import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, Platform, StatusBar, TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext';
import { useUnit } from '../contexts/UnitContext';

export default function MyRepairHistory({ navigation }: any) {
  const [history, setHistory] = useState<any[]>([]);
  const { themeColor, unitId } = useCondoConfig();
  const { currentUnit } = useUnit();
  const activeUnitId = currentUnit?.unit_id || unitId;

  useEffect(() => {
    fetchMyJobs();
  }, [activeUnitId]);

  const fetchMyJobs = async () => {
    if (!activeUnitId) {
      setHistory([]);
      return;
    }

    // Fetch jobs connected to the active unit that are finished, closed, or canceled
    const { data } = await supabase
      .from('job_orders')
      .select('*')
      .eq('unit_id', activeUnitId)
      .in('status', ['RESOLVED', 'COMPLETED', 'CLOSED', 'CANCELED', 'CANCELLED'])
      .order('created_at', { ascending: false });
    
    setHistory(data || []);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
      case 'REQUESTED':
        return '#F59E0B'; // Amber
      case 'IN_PROGRESS':
      case 'ASSIGNED':
      case 'ACKNOWLEDGED':
      case 'CHECKED_BY_TECH':
      case 'VISIT_PROPOSED':
      case 'VISIT_CONFIRMED':
      case 'TIME_NEGOTIATING':
      case 'VISITING':
      case 'ESTIMATE_SUBMITTED':
        return '#3B82F6'; // Blue
      case 'RESOLVED':
      case 'COMPLETED':
      case 'CLOSED':
        return '#10B981'; // Green
      case 'CANCELLED':
      case 'CANCELED':
        return '#EF4444'; // Red
      default:
        return '#6B7280'; // Gray
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={[styles.backIcon, { color: themeColor || '#0038a8' }]}>❮ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Repair History</Text>
        <View style={{ width: 60 }} />
      </View>

      <FlatList 
        contentContainerStyle={styles.listContainer}
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.jobTitle}>{item.title}</Text>
            {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
            <View style={styles.statusRow}>
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                <Text style={styles.statusText}>{item.status}</Text>
              </View>
              {(item.status === 'RESOLVED' || item.status === 'COMPLETED' || item.status === 'CLOSED') && item.estimated_cost ? (
                <Text style={styles.cost}>Total Cost: ₱{item.estimated_cost}</Text>
              ) : null}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No repair history found.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafbfd',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    height: 56,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  backButton: {
    padding: 8,
  },
  backIcon: {
    fontSize: 16,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  listContainer: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  jobTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  description: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  cost: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
  },
});
