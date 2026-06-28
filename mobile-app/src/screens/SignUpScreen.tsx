import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, SafeAreaView, Platform, KeyboardAvoidingView } from 'react-native';
import { supabase } from '../lib/supabase';
import { API_BASE_URL } from '../api/apiClient';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';

export default function SignUpScreen({ navigation }: any) {
  const [activeTab, setActiveTab] = useState<'INVITE' | 'DOCUMENT'>('INVITE');
  const [loading, setLoading] = useState(false);

  // Common Form Fields
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Option 2: Invite Code
  const [inviteCode, setInviteCode] = useState('');

  // Option 1: Document Upload
  const [condos, setCondos] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [selectedCondoId, setSelectedCondoId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [role, setRole] = useState<'owner' | 'tenant'>('tenant');
  const [documentImage, setDocumentImage] = useState<string | null>(null);
  const [documentBase64, setDocumentBase64] = useState<string>('');
  
  const [loadingCondos, setLoadingCondos] = useState(false);
  const [loadingUnits, setLoadingUnits] = useState(false);

  // Fetch Condos on mount
  useEffect(() => {
    fetchCondos();
  }, []);

  // Fetch Units when Condo changes
  useEffect(() => {
    if (selectedCondoId) {
      fetchUnits(selectedCondoId);
    } else {
      setUnits([]);
      setSelectedUnitId('');
    }
  }, [selectedCondoId]);

  const fetchCondos = async () => {
    setLoadingCondos(true);
    try {
      const { data, error } = await supabase
        .from('condos')
        .select('id, name')
        .order('name');
      if (error) throw error;
      setCondos(data || []);
    } catch (e: any) {
      console.error("Error fetching condos:", e);
      // Fallback static list in case of RLS constraints during signup
      setCondos([
        { id: 'c1111111-1111-1111-1111-111111111111', name: 'Solea Residences' }
      ]);
    } finally {
      setLoadingCondos(false);
    }
  };

  const fetchUnits = async (condoId: string) => {
    setLoadingUnits(true);
    try {
      const { data, error } = await supabase
        .from('units')
        .select('id, unit_number, building_no')
        .eq('condo_id', condoId)
        .order('unit_number');
      if (error) throw error;
      setUnits(data || []);
    } catch (e: any) {
      console.error("Error fetching units:", e);
      // Fallback static list in case of RLS constraints
      setUnits([
        { id: 'u1111111-1111-1111-1111-111111111111', unit_number: '101', building_no: 'Tower A' },
        { id: 'u2222222-2222-2222-2222-222222222222', unit_number: '102', building_no: 'Tower A' }
      ]);
    } finally {
      setLoadingUnits(false);
    }
  };

  const handlePickDocument = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Denied', 'We need camera roll permissions to upload proof documents.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets[0]) {
      setDocumentImage(result.assets[0].uri);
      setDocumentBase64(result.assets[0].base64 || '');
    }
  };

  const handleInviteSignUp = async () => {
    if (!email.trim() || !fullName.trim() || !password || !inviteCode.trim()) {
      Alert.alert('Notice', 'Please fill in all required fields.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Invalid Password', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/register-by-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          inviteCode: inviteCode.trim().toUpperCase(),
          fullName: fullName.trim(),
          phone: phone.trim() || null
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Registration failed.');
      }

      Alert.alert('Registration Successful! 🎉', 'Your account has been verified. Logging in now...');
      
      // Auto-login after successful registration
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password
      });

      if (loginError) {
        navigation.reset({ index: 0, routes: [{ name: 'AuthScreen' }] });
      }
    } catch (e: any) {
      Alert.alert('Sign Up Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentSignUp = async () => {
    if (!email.trim() || !fullName.trim() || !password || !selectedCondoId || !selectedUnitId) {
      Alert.alert('Notice', 'Please fill in all required fields.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Invalid Password', 'Password must be at least 6 characters.');
      return;
    }
    if (!documentBase64) {
      Alert.alert('Document Required', 'Please upload a lease agreement or proof of ownership document.');
      return;
    }

    setLoading(true);
    try {
      // 1. Upload proof document to Supabase storage receipts bucket
      const cleanBase64 = documentBase64.includes('base64,') ? documentBase64.split('base64,')[1] : documentBase64;
      const fileName = `contracts/signup_${email.trim()}_${Date.now()}.jpg`;

      const { error: storageError } = await supabase.storage
        .from('receipts')
        .upload(fileName, decode(cleanBase64), { contentType: 'image/jpeg', upsert: true });

      if (storageError) throw storageError;

      const publicUrl = supabase.storage.from('receipts').getPublicUrl(fileName).data.publicUrl;

      // 2. Submit payload to registration API
      const response = await fetch(`${API_BASE_URL}/api/register-by-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          phone: phone.trim() || null,
          condoId: selectedCondoId,
          unitId: selectedUnitId,
          role,
          documentName: `signup_${fullName.trim()}_document.jpg`,
          documentUrl: publicUrl
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Registration failed.');
      }

      Alert.alert(
        'Submission Successful ⏳', 
        'Your registration is under review. Please log in to check your status.',
        [
          { 
            text: 'OK', 
            onPress: async () => {
              // Sign in the user so they can view the "Pending Verification" screen in AppGuardInterceptor
              await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password
              });
            }
          }
        ]
      );
    } catch (e: any) {
      Alert.alert('Sign Up Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>❮ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>FiliCondo Sign Up</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.tabsContainer}>
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'INVITE' && styles.activeTabButton]} 
            onPress={() => setActiveTab('INVITE')}
          >
            <Text style={[styles.tabText, activeTab === 'INVITE' && styles.activeTabText]}>Invite Code</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'DOCUMENT' && styles.activeTabButton]} 
            onPress={() => setActiveTab('DOCUMENT')}
          >
            <Text style={[styles.tabText, activeTab === 'DOCUMENT' && styles.activeTabText]}>Upload Document</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.inputLabel}>Full Name *</Text>
          <TextInput style={styles.input} onChangeText={setFullName} value={fullName} placeholder="Juan Dela Cruz" autoCapitalize="words" />

          <Text style={styles.inputLabel}>Email Address *</Text>
          <TextInput style={styles.input} onChangeText={setEmail} value={email} placeholder="juan@email.com" autoCapitalize="none" keyboardType="email-address" />

          <Text style={styles.inputLabel}>Phone Number</Text>
          <TextInput style={styles.input} onChangeText={setPhone} value={phone} placeholder="+63 917 123 4567" keyboardType="phone-pad" />

          <Text style={styles.inputLabel}>Password *</Text>
          <TextInput style={styles.input} onChangeText={setPassword} value={password} secureTextEntry={true} placeholder="••••••" autoCapitalize="none" />

          <Text style={styles.inputLabel}>Confirm Password *</Text>
          <TextInput style={styles.input} onChangeText={setConfirmPassword} value={confirmPassword} secureTextEntry={true} placeholder="••••••" autoCapitalize="none" />

          {activeTab === 'INVITE' ? (
            <View style={styles.conditionalBlock}>
              <Text style={styles.inputLabel}>Invitation Code *</Text>
              <TextInput 
                style={[styles.input, styles.inviteInput]} 
                onChangeText={setInviteCode} 
                value={inviteCode} 
                placeholder="6-DIGIT CODE" 
                autoCapitalize="characters" 
                maxLength={6}
              />
              <Text style={styles.helpText}>Enter the 6-digit code received via email from your PMO.</Text>

              <TouchableOpacity style={styles.submitBtn} disabled={loading} onPress={handleInviteSignUp}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Verify & Sign Up</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.conditionalBlock}>
              <Text style={styles.inputLabel}>Select Condo *</Text>
              {loadingCondos ? (
                <ActivityIndicator size="small" color="#0038a8" style={{ marginVertical: 12 }} />
              ) : (
                <View style={styles.pickerWrapper}>
                  <ScrollView style={styles.selectScroll} nestedScrollEnabled={true}>
                    {condos.map(c => (
                      <TouchableOpacity 
                        key={c.id} 
                        style={[styles.selectOption, selectedCondoId === c.id && styles.selectOptionActive]}
                        onPress={() => setSelectedCondoId(c.id)}
                      >
                        <Text style={[styles.selectOptionText, selectedCondoId === c.id && styles.selectOptionTextActive]}>{c.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {selectedCondoId !== '' && (
                <>
                  <Text style={styles.inputLabel}>Select Unit *</Text>
                  {loadingUnits ? (
                    <ActivityIndicator size="small" color="#0038a8" style={{ marginVertical: 12 }} />
                  ) : (
                    <View style={styles.pickerWrapper}>
                      <ScrollView style={styles.selectScroll} nestedScrollEnabled={true}>
                        {units.map(u => (
                          <TouchableOpacity 
                            key={u.id} 
                            style={[styles.selectOption, selectedUnitId === u.id && styles.selectOptionActive]}
                            onPress={() => setSelectedUnitId(u.id)}
                          >
                            <Text style={[styles.selectOptionText, selectedUnitId === u.id && styles.selectOptionTextActive]}>
                              {u.building_no ? `${u.building_no} - ` : ''}Unit {u.unit_number}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </>
              )}

              <Text style={styles.inputLabel}>Your Role *</Text>
              <View style={styles.roleContainer}>
                <TouchableOpacity style={[styles.roleBtn, role === 'tenant' && styles.roleBtnActive]} onPress={() => setRole('tenant')}>
                  <Text style={[styles.roleBtnText, role === 'tenant' && styles.roleBtnTextActive]}>Renter / Tenant</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.roleBtn, role === 'owner' && styles.roleBtnActive]} onPress={() => setRole('owner')}>
                  <Text style={[styles.roleBtnText, role === 'owner' && styles.roleBtnTextActive]}>Unit Owner</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Proof of Residency Document *</Text>
              <TouchableOpacity style={styles.documentPickerBtn} onPress={handlePickDocument}>
                <Text style={styles.documentPickerBtnText}>
                  {documentImage ? "✓ Document Attached" : "📁 Choose Image (Lease Agreement / Deed)"}
                </Text>
              </TouchableOpacity>
              {documentImage && (
                <Text style={styles.docAttachedSub}>Image ready for upload.</Text>
              )}

              <TouchableOpacity style={styles.submitBtn} disabled={loading} onPress={handleDocumentSignUp}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit Sign Up Request</Text>}
              </TouchableOpacity>
            </View>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'android' ? 30 : 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  backBtn: { width: 60 },
  backText: { color: '#64748b', fontSize: 14, fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  tabsContainer: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  tabButton: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTabButton: { borderBottomColor: '#0038a8' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  activeTabText: { color: '#0038a8' },
  scrollContent: { padding: 20 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  input: { height: 46, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 15, fontSize: 14, backgroundColor: '#f8fafc', color: '#0f172a' },
  inviteInput: { fontSize: 16, fontWeight: 'bold', letterSpacing: 1.5, textAlign: 'center', color: '#0038a8' },
  helpText: { fontSize: 11, color: '#94a3b8', marginTop: 4, fontStyle: 'italic' },
  conditionalBlock: { marginTop: 10 },
  pickerWrapper: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, backgroundColor: '#f8fafc', maxHeight: 150, overflow: 'hidden' },
  selectScroll: { padding: 4 },
  selectOption: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 6 },
  selectOptionActive: { backgroundColor: '#f0f9ff' },
  selectOptionText: { fontSize: 13, color: '#334155' },
  selectOptionTextActive: { color: '#0038a8', fontWeight: '700' },
  roleContainer: { flexDirection: 'row', gap: 10, marginVertical: 4 },
  roleBtn: { flex: 1, paddingVertical: 10, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, alignItems: 'center', backgroundColor: '#f8fafc' },
  roleBtnActive: { backgroundColor: '#0038a8', borderColor: '#0038a8' },
  roleBtnText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  roleBtnTextActive: { color: '#fff' },
  documentPickerBtn: { paddingVertical: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: '#0038a8', borderRadius: 10, alignItems: 'center', backgroundColor: '#f8fafc', marginTop: 4 },
  documentPickerBtnText: { fontSize: 13, fontWeight: '700', color: '#0038a8' },
  docAttachedSub: { fontSize: 11, color: '#16a34a', marginTop: 4, fontWeight: '600' },
  submitBtn: { backgroundColor: '#0038a8', height: 48, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' }
});
