import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, Image, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';

// 1. lib/supabase.ts는 src/lib/에 있음
import { supabase } from '../lib/supabase'; 

// 2. UnitContext.tsx는 src/contexts/에 있음
import { useUnit } from '../contexts/UnitContext'; 

// 3. CondoConfigContext.tsx는 src/hooks/에 있음
import { useCondoConfig } from '../hooks/CondoConfigContext';

export function JobOrderRequest({ onSubmissionSuccess }: { onSubmissionSuccess: () => void }) {
  const { currentUnit } = useUnit();
  const { themeColor } = useCondoConfig();
  
  const [category, setCategory] = useState('PLUMBING');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const capturePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission Denied", "Camera access is required.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
      setBase64Image(result.assets[0].base64 || null);
    }
  };

  const handleSubmitOrder = async () => {
    if (!currentUnit || !title.trim()) {
      Alert.alert("Error", "Please fill in the required fields.");
      return;
    }

    try {
      setSubmitting(true);
      let uploadedPhotoUrl: string | null = null;

      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        console.log("DEBUG - 세션 유저 없음, 여기서 에러 방지 완료.");
        throw new Error("Authentication error.");
      }

      if (base64Image && imageUri) {
        const fileExt = imageUri.split('.').pop() || 'jpg';
        const filePath = `jo_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('repairs')
          .upload(filePath, decode(base64Image), { contentType: `image/${fileExt}` });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('repairs').getPublicUrl(filePath);
        uploadedPhotoUrl = publicUrl;
      }

      const { error } = await supabase
        .from('job_orders')
        .insert([{
          condo_id: currentUnit.condo_id,
          unit_id: currentUnit.unit_id.replace(/['"]/g, ''),
          user_id: userId,
          category,
          title: title.trim(),
          description: description.trim(),
          image_url: uploadedPhotoUrl,
          status: 'REQUESTED'
        }]);

      if (error) throw error;

      Alert.alert("Success", "Ticket logged successfully.");
      setTitle('');
      setDescription('');
      setImageUri(null);
      setBase64Image(null);
      onSubmissionSuccess();
    } catch (err: any) {
      Alert.alert("Submission Failed", err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={{ padding: 20, backgroundColor: '#fff', flex: 1 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 15 }}>Request Maintenance Repair</Text>
      
      <TextInput 
        style={{ borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8, marginBottom: 15 }} 
        placeholder="Issue Title" 
        value={title} 
        onChangeText={setTitle} 
      />
      
      <TextInput 
        style={{ borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8, height: 100, marginBottom: 15 }} 
        placeholder="Description..." 
        multiline 
        value={description} 
        onChangeText={setDescription} 
      />
      
      {imageUri && (
        <Image source={{ uri: imageUri }} style={{ width: '100%', height: 200, borderRadius: 8, marginBottom: 15 }} />
      )}
      
      <TouchableOpacity 
        style={{ borderWidth: 1, borderColor: themeColor || '#0038a8', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 15 }} 
        onPress={capturePhoto}
      >
        <Text style={{ color: themeColor || '#0038a8', fontWeight: 'bold' }}>📸 Take a Photo</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={{ backgroundColor: themeColor || '#0038a8', padding: 15, borderRadius: 8, alignItems: 'center' }} 
        onPress={handleSubmitOrder} 
        disabled={submitting}
      >
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{submitting ? 'Submitting...' : 'Submit Ticket'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}