import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer'; 
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext';
import { API_BASE_URL } from '../api/apiClient';

interface ReceiptUploaderProps {
  billingId: number;
  onUploadSuccess: () => void;
}

export function ReceiptUploader({ billingId, onUploadSuccess }: ReceiptUploaderProps) {
  const { themeColor } = useCondoConfig();
  const [uploading, setUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert("Permission Required", "Photo library access is required to upload your receipt.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
      uploadReceipt(result.assets[0].base64 || '', result.assets[0].uri);
    }
  };

  const uploadReceipt = async (base64Data: string, uri: string) => {
    setUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) throw new Error("Authentication required. Please log in.");

      const cleanBase64 = base64Data.includes('base64,') ? base64Data.split('base64,')[1] : base64Data;
      const fileName = `${billingId}_${Date.now()}.jpg`;

      // 1. 스토리지 업로드
      const { error: storageError } = await supabase.storage
        .from('receipts')
        .upload(fileName, decode(cleanBase64), { contentType: 'image/jpeg', upsert: true });
      if (storageError) throw storageError;

      const publicUrl = supabase.storage.from('receipts').getPublicUrl(fileName).data.publicUrl;

      // 2. API 호출
      const response = await fetch(`${API_BASE_URL}/api/upload-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billingId: billingId,
          receiptUrl: publicUrl
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sync receipt');
      }

      Alert.alert("Success", "Receipt has been uploaded successfully.");
      onUploadSuccess();
    } catch (error: any) {
      console.error("업로드 에러:", error);
      Alert.alert("Error", error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={{ padding: 15, backgroundColor: '#f8f9fa', borderRadius: 12, marginTop: 15 }}>
      <Text style={{ fontWeight: '600', marginBottom: 10 }}>Upload Proof of Payment</Text>
      {selectedImage && <Image source={{ uri: selectedImage }} style={{ width: '100%', height: 200, borderRadius: 8, marginBottom: 15 }} />}
      <TouchableOpacity 
        style={{ backgroundColor: themeColor, padding: 12, borderRadius: 8, alignItems: 'center' }}
        onPress={pickImage}
        disabled={uploading}
      >
        {uploading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: 'bold' }}>Upload</Text>}
      </TouchableOpacity>
    </View>
  );
}