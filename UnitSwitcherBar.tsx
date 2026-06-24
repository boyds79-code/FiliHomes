import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { useUnit } from '../hooks/UnitContext';
import { useCondoConfig } from '../hooks/CondoConfigContext'; // Unit 04 연동

export function UnitSwitcherBar() {
  const { myUnits, currentUnit, switchUnit } = useUnit();
  const { themeColor } = useCondoConfig(); // 테마 색상에 맞춘 동적 UI 컬러 매칭
  const [modalVisible, setModalVisible] = useState(false);

  if (!currentUnit) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={[styles.barButton, { backgroundColor: themeColor }]} 
        onPress={() => myUnits.length > 1 && setModalVisible(true)}
        disabled={myUnits.length <= 1} // 소유 유닛이 1개면 버튼 비활성화
      >
        <View>
          <Text style={styles.condoText}>{currentUnit.condo_name}</Text>
          <Text style={styles.unitText}>Unit {currentUnit.unit_number} ({currentUnit.role.toUpperCase()})</Text>
        </View>
        {myUnits.length > 1 && (
          <Text style={styles.arrowIcon}>▼</Text>
        )}
      </TouchableOpacity>

      {/* 멀티 유닛 선택 모달 팝업 */}
      <Modal visible={modalVisible} transparent={true} animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Asset / Unit</Text>
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
                  <Text style={styles.itemCondo}>{item.condo_name}</Text>
                  <Text style={styles.itemUnit}>Unit {item.unit_number} - {item.role}</Text>
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
  modalContent: { width: '85%', backgroundColor: '#fff', borderRadius: 16, padding: 20, maxHeight: '60%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, color: '#333' },
  unitItem: { padding: 15, backgroundColor: '#f8f9fa', borderRadius: 10, marginBottom: 10 },
  itemCondo: { fontSize: 14, fontWeight: '600', color: '#555' },
  itemUnit: { fontSize: 12, color: '#888', marginTop: 4 }
});