import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { useUnit } from '../contexts/UnitContext';
import { useCondoConfig } from '../hooks/CondoConfigContext';

export function UnitSwitcherBar() {
  const { myUnits, currentUnit, switchUnit } = useUnit();
  const { themeColor } = useCondoConfig();
  const [modalVisible, setModalVisible] = useState(false);

  // 집주인(owner) 권한을 가진 유닛이 하나라도 있는지 확인
  const isOwner = myUnits.some((u: any) => ['owner', 'co_owner', 'property_manager'].includes(u.role));

  if (!currentUnit || !isOwner) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={[styles.barButton, { backgroundColor: themeColor }]} 
        onPress={() => myUnits.length > 1 && setModalVisible(true)}
        disabled={myUnits.length <= 1}
      >
        <View>
          <Text style={styles.condoText}>{currentUnit.condo_name}</Text>
          <Text style={styles.unitText}>
            {currentUnit.block_phase_no ? `${currentUnit.block_phase_no} - Lot ` : 'Lot '}{currentUnit.unit_number} ({currentUnit.role.toUpperCase()})
          </Text>
        </View>
        {myUnits.length > 1 && (
          <Text style={styles.arrowIcon}>▼</Text>
        )}
      </TouchableOpacity>
 
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Home / Address</Text>
            <FlatList
              data={myUnits}
              keyExtractor={(item) => item.unit_id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.unitItem,
                    item.unit_id === currentUnit.unit_id && { borderColor: themeColor, borderWidth: 1.5 }
                  ]}
                  onPress={() => {
                    switchUnit(item.unit_id);
                    setModalVisible(false);
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 20 }}>
                    <Text style={styles.itemCondo}>{item.condo_name}</Text>
                    <Text style={styles.itemUnit}>
                      {item.block_phase_no ? `${item.block_phase_no} - Lot ` : 'Lot '}{item.unit_number} - {item.role.toUpperCase()}
                    </Text>
                  </View>
                  {item.has_badge && (
                    <View style={styles.redDot} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 10 },
  barButton: { padding: 15, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  condoText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  unitText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold', marginTop: 2 },
  arrowIcon: { color: '#ffffff', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '92%', backgroundColor: '#fff', borderRadius: 16, padding: 20, maxHeight: '60%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#333' },
  unitItem: { padding: 15, backgroundColor: '#f8f9fa', borderRadius: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center', position: 'relative' },
  itemCondo: { fontSize: 14, fontWeight: '600', color: '#555' },
  itemUnit: { fontSize: 12, color: '#888', marginTop: 4 },
  redDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
    position: 'absolute',
    right: 15,
    top: '50%',
    marginTop: -5
  }
});
