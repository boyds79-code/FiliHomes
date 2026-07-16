import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Platform, StatusBar, TouchableOpacity, FlatList, TextInput, Modal, Alert, ActivityIndicator, Image, Dimensions, KeyboardAvoidingView, ScrollView, InputAccessoryView, Keyboard } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 52) / 2; 

interface Item {
  id: string;
  title: string;
  price: number;
  description: string;
  seller_id: string;
  seller_nickname?: string; 
  seller_score?: number;    
  image_url: string;
  status: 'AVAILABLE' | 'RESERVED' | 'SOLD';
  created_at: string;
}

export default function BazaarScreen({ navigation }: any) {
  const { themeColor } = useCondoConfig();
  const [currentUnitNumber, setCurrentUnitNumber] = useState('Unknown');

  const [isBazaarAuthenticated, setIsBazaarAuthenticated] = useState(false);
  const [userNickname, setUserNickname] = useState(''); 
  const [myMannerScore, setMyMannerScore] = useState(5.0);
  const [regInput, setRegInput] = useState(''); 
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(0);
  const [isMoreLoading, setIsMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const ITEMS_PER_PAGE = 6;

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'ALL' | 'WISHLIST'>('ALL');
  const [wishlistIds, setWishlistIds] = useState<string[]>([]); 

  const [writeModalVisible, setWriteModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isNotificationsMuted, setIsNotificationsMuted] = useState(false);

  useEffect(() => {
    checkResidentProfile();
    loadNotificationSetting();
  }, []);

  const loadNotificationSetting = async () => {
    try {
      const val = await AsyncStorage.getItem('mute_bazaar_notifications');
      setIsNotificationsMuted(val === 'true');
    } catch (e) {
      console.log("Error loading notification setting:", e);
    }
  };

  const toggleNotifications = async () => {
    try {
      const nextVal = !isNotificationsMuted;
      setIsNotificationsMuted(nextVal);
      await AsyncStorage.setItem('mute_bazaar_notifications', nextVal ? 'true' : 'false');
      Alert.alert(
        nextVal ? "Notifications Muted 🔕" : "Notifications Active 🔔",
        nextVal 
          ? "You will only see badge controls for new bazaar listings, and push alerts will be silenced."
          : "You will receive sound and banner alerts for new bazaar listings."
      );
    } catch (e) {
      console.log("Error saving notification setting:", e);
    }
  };

  const checkResidentProfile = async () => {
    try {
      setCheckingAuth(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        console.log("DEBUG - No session user found.");
        return;
      }

      const { data: profileInfo } = await supabase
        .from('profiles')
        .select('*, units(unit_number)')
        .eq('id', userId)
        .single();
      
      const realUnit = (profileInfo as any)?.units?.unit_number || 'Unknown';
      setCurrentUnitNumber(realUnit);

      const { data, error } = await supabase
        .from('bazaar_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (!error && data) {
        setUserNickname(data.nickname);
        setMyMannerScore(Number(data.manner_score));
        setIsBazaarAuthenticated(true);
        
        try {
          const storedWishlist = await AsyncStorage.getItem(`bazaar_wishlist_${userId}`);
          if (storedWishlist) {
            setWishlistIds(JSON.parse(storedWishlist));
          }
        } catch (e) {
          console.log("Error loading wishlist from storage:", e);
        }

        fetchBazaarItems(0, true); 
      } else {
        setIsBazaarAuthenticated(false);
        setLoading(false);
      }
    } catch (err) {
      console.log(err);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleRegisterMarketProfile = async () => {
    const trimmedInput = regInput.trim();
    if (!trimmedInput || trimmedInput.length < 2) {
      Alert.alert("Invalid Alias ❌", "Your nickname must be at least 2 characters.");
      return;
    }

    try {
      setCheckingAuth(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        console.log("DEBUG - No session user found.");
        return;
      }

      const { data: existing } = await supabase
        .from('bazaar_profiles')
        .select('nickname')
        .eq('nickname', trimmedInput);

      if (existing && existing.length > 0) {
        Alert.alert("Nickname Taken ⚠️", "This nickname is already registered by another resident.");
        setCheckingAuth(false);
        return;
      }

      const { error } = await supabase
        .from('bazaar_profiles')
        .insert([{ id: userId, unit_number: currentUnitNumber, nickname: trimmedInput, manner_score: 5.0 }]);

      if (!error) {
        setUserNickname(trimmedInput);
        setMyMannerScore(5.0);
        setIsBazaarAuthenticated(true);
        fetchBazaarItems(0, true);
      } else {
        Alert.alert("Error", "Failed to register profile.");
      }
    } catch (err) {
      console.log(err);
    } finally {
      setCheckingAuth(false);
    }
  };

  const fetchBazaarItems = async (pageNumber: number, resetList = false) => {
    try {
      if (pageNumber === 0 || resetList) {
        setLoading(true);
        setHasMore(true);
      } else {
        setIsMoreLoading(true);
      }

      const { data: { session } } = await supabase.auth.getSession();
      const currentUid = session?.user?.id;
      
      let blockedIds: string[] = [];
      if (currentUid) {
        const { data: blocks } = await supabase
          .from('community_blocks')
          .select('blocked_user_id')
          .eq('blocker_id', currentUid);
        if (blocks) {
          blockedIds = blocks.map(b => b.blocked_user_id);
        }
      }

      const from = resetList ? 0 : pageNumber * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      let query = supabase
        .from('bazaar_items')
        .select(`
          id, title, price, description, seller_id, image_url, status, created_at,
          bazaar_profiles (nickname, manner_score)
        `)
        .order('created_at', { ascending: false });

      if (blockedIds.length > 0) {
        query = query.not('seller_id', 'in', `(${blockedIds.join(',')})`);
      }

      query = query.range(from, to);

      if (searchQuery.trim() !== '') {
        query = query.ilike('title', `%${searchQuery}%`);
      }

      const { data, error } = await query;

      if (!error && data) {
        if (data.length < ITEMS_PER_PAGE) setHasMore(false);
        
        const parsedItems: Item[] = data.map((raw: any) => ({
          id: raw.id.toString(),
          title: raw.title,
          price: raw.price,
          description: raw.description,
          seller_id: raw.seller_id,
          seller_nickname: raw.bazaar_profiles?.nickname || 'Unknown Resident',
          seller_score: raw.bazaar_profiles?.manner_score || 5.0,
          image_url: raw.image_url,
          status: raw.status,
          created_at: raw.created_at
        }));

        if (pageNumber === 0 || resetList) {
          setItems(parsedItems);
          setPage(0);
        } else {
          setItems(prev => [...prev, ...parsedItems]);
          setPage(pageNumber);
        }
      }
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
      setIsMoreLoading(false);
    }
  };

  const handleLoadMore = () => {
    if (!isMoreLoading && hasMore && viewMode === 'ALL') {
      fetchBazaarItems(page + 1);
    }
  };

  const handleOpenDetail = (item: Item) => {
    if (navigation) {
      navigation.navigate('BazaarDetail', { item, currentNickname: userNickname });
    }
  };

  const handleToggleWishlist = async (id: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      let updatedWishlist: string[] = [];
      if (wishlistIds.includes(id)) {
        updatedWishlist = wishlistIds.filter(wId => wId !== id);
      } else {
        updatedWishlist = [...wishlistIds, id];
      }
      setWishlistIds(updatedWishlist);
      await AsyncStorage.setItem(`bazaar_wishlist_${userId}`, JSON.stringify(updatedWishlist));
    } catch (e) {
      console.log("Error updating wishlist:", e);
    }
  };

  const handlePickImage = async () => {
    Alert.alert(
      "Select Image",
      "Choose an option to attach a photo",
      [
        {
          text: "Take Photo",
          onPress: async () => {
            const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
            if (!cameraPermission.granted) {
              Alert.alert("Permission Required", "Please allow access to your camera to take a photo.");
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.6,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
              setSelectedImage(result.assets[0].uri);
            }
          }
        },
        {
          text: "Choose from Gallery",
          onPress: async () => {
            const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!libraryPermission.granted) {
              Alert.alert("Permission Required", "Please allow access to your photos.");
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.6,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
              setSelectedImage(result.assets[0].uri);
            }
          }
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
  };

  const handlePublishItem = async () => {
    if (!newTitle.trim() || !newPrice.trim() || !newDesc.trim() || !selectedImage) {
      Alert.alert('Incomplete Form', 'Please fill in all details.');
      return;
    }

    try {
      setSubmitting(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        console.log("DEBUG - No session user found.");
        return;
      }

      const fileName = `${userId}/${Date.now()}.jpg`;
      const response = await fetch(selectedImage);
      const blob = await response.blob();
      
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = reader.result?.toString().split(',')[1];
        if (!base64data) { setSubmitting(false); return; }

        const { error: storageErr } = await supabase.storage
          .from('bazaar')
          .upload(fileName, decode(base64data), { contentType: 'image/jpeg', upsert: true });

        if (storageErr) {
          Alert.alert("Upload Failed", "Storage bucket connection issue.");
          setSubmitting(false);
          return;
        }

        const { data: { publicUrl } } = supabase.storage.from('bazaar').getPublicUrl(fileName);

        const { error: dbErr } = await supabase
          .from('bazaar_items')
          .insert([{
            seller_id: userId,
            title: newTitle.trim(),
            price: parseInt(newPrice) || 0,
            description: newDesc.trim(),
            image_url: publicUrl,
            status: 'AVAILABLE'
          }]);

        if (!dbErr) {
          closeAndResetModal();
          fetchBazaarItems(0, true); 
        } else {
          Alert.alert("Database Error", "Failed to register product log.");
        }
        setSubmitting(false);
      };
    } catch (err) {
      console.log(err);
      setSubmitting(false);
    }
  };

  const closeAndResetModal = () => {
    setWriteModalVisible(false);
    setNewTitle('');
    setNewPrice('');
    setNewDesc('');
    setSelectedImage(null);
  };

  const filteredItems = items.filter(item => {
    return viewMode === 'ALL' || wishlistIds.includes(item.id);
  });

  const renderBazaarItem = ({ item }: { item: Item }) => {
    const isMyItem = item.seller_nickname === userNickname;
    const isWished = wishlistIds.includes(item.id);
    let overlayLabel = '';
    if (item.status === 'RESERVED') overlayLabel = 'RESERVED';
    if (item.status === 'SOLD') overlayLabel = 'SOLD OUT';

    return (
      <TouchableOpacity style={styles.productCard} activeOpacity={0.9} onPress={() => handleOpenDetail(item)}>
        <View style={styles.imageContainer}>
          <Image source={{ uri: item.image_url }} style={styles.productImage} />
          {overlayLabel !== '' && (
            <View style={[styles.statusOverlay, { backgroundColor: overlayLabel === 'SOLD OUT' ? 'rgba(241, 245, 249, 0.93)' : 'rgba(254, 247, 237, 0.9)' }]}>
              <Text style={[styles.overlayText, { color: overlayLabel === 'SOLD OUT' ? '#64748b' : '#ea580c' }]}>{overlayLabel}</Text>
            </View>
          )}
          {isMyItem && <View style={[styles.myTag, { backgroundColor: themeColor || '#0038a8' }]}><Text style={styles.myTagText}>MINE</Text></View>}
          <TouchableOpacity style={styles.wishHeartBadge} onPress={() => handleToggleWishlist(item.id)}>
            <Text style={{ fontSize: 13, color: isWished ? '#ef4444' : '#cbd5e1' }}>{isWished ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.infoWrapper}>
          <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
          <View style={styles.priceRowWrapper}>
            <Text style={styles.itemPrice}>₱{item.price.toLocaleString()}</Text>
            <Text style={styles.listTimeAgoText}>{formatTimeAgo(item.created_at)}</Text>
          </View>
          <View style={styles.cardFooter}>
            <Text style={styles.itemUnit} numberOfLines={1}>👤 {item.seller_nickname}</Text>
            <Text style={styles.scoreText}>⭐ {item.seller_score}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (checkingAuth) {
    return (
      <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={themeColor || '#0038a8'} /></SafeAreaView>
    );
  }

  if (!isBazaarAuthenticated) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <TouchableOpacity 
          style={{ position: 'absolute', top: Platform.OS === 'ios' ? 60 : 30, left: 20, zIndex: 10, flexDirection: 'row', alignItems: 'center' }} 
          onPress={() => navigation.goBack()}
        >
          <Text style={{ fontSize: 16, color: '#fff', fontWeight: 'bold' }}>◀ Back</Text>
        </TouchableOpacity>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.authCard}>
          <Text style={styles.authEmoji}>🛡️</Text>
          <Text style={styles.authTitle}>Bazaar Security Activation</Text>
          <Text style={styles.authDesc}>For high security and privacy in Cebu village/subdivision networks, your real house/lot number will be completely encrypted. Please create a market alias to activate your marketplace profile.</Text>
          <View style={styles.inputWrapper}>
            <TextInput style={styles.authInput} placeholder="Enter your market alias nickname..." placeholderTextColor="#94a3b8" maxLength={15} value={regInput} onChangeText={setRegInput} />
          </View>
          <TouchableOpacity style={[styles.authSubmitBtn, { backgroundColor: themeColor || '#0038a8' }]} onPress={handleRegisterMarketProfile}>
            <Text style={styles.authSubmitBtnText}>Verify and Activate Market ➔</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.header, { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', position: 'relative' }]}>
        <TouchableOpacity 
          style={{ position: 'absolute', left: 16, padding: 4 }} 
          onPress={() => navigation.goBack()}
        >
          <Text style={{ fontSize: 15, color: themeColor || '#0038a8', fontWeight: 'bold' }}>◀ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Resident Bazaar Hub</Text>
        <TouchableOpacity 
          style={{ position: 'absolute', right: 16, padding: 4 }} 
          onPress={toggleNotifications}
        >
          <Ionicons 
            name={isNotificationsMuted ? "notifications-off-outline" : "notifications-outline"} 
            size={22} 
            color={isNotificationsMuted ? '#94a3b8' : (themeColor || '#0038a8')} 
          />
        </TouchableOpacity>
      </View>
      <View style={styles.searchBarContainer}>
        <TextInput style={styles.searchBarInput} placeholder="🔎 Search items and click enter..." placeholderTextColor="#94a3b8" value={searchQuery} onChangeText={setSearchQuery} onSubmitEditing={() => fetchBazaarItems(0, true)} />
      </View>
      <View style={styles.viewToggleRow}>
        <TouchableOpacity style={[styles.toggleBtn, viewMode === 'ALL' && { borderBottomColor: themeColor || '#0038a8' }]} onPress={() => setViewMode('ALL')}>
          <Text style={[styles.toggleBtnText, viewMode === 'ALL' && { color: themeColor || '#0038a8', fontWeight: '700' }]}>All Market</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.toggleBtn, viewMode === 'WISHLIST' && { borderBottomColor: themeColor || '#0038a8' }]} onPress={() => setViewMode('WISHLIST')}>
          <Text style={[styles.toggleBtnText, viewMode === 'WISHLIST' && { color: themeColor || '#0038a8', fontWeight: '700' }]}>❤️ Wishlist ({wishlistIds.length})</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.mainContainer}>
        {loading ? (
          <ActivityIndicator size="large" color={themeColor || '#0038a8'} style={{ marginTop: 40 }} />
        ) : filteredItems.length === 0 ? (
          <View style={styles.emptyView}><Text style={{ fontSize: 40 }}>📭</Text><Text style={styles.emptyText}>No listings found on live server.</Text></View>
        ) : (
          <FlatList data={filteredItems} keyExtractor={(item) => item.id} renderItem={renderBazaarItem} numColumns={2} columnWrapperStyle={styles.gridRowWrapper} showsVerticalScrollIndicator={false} onEndReached={handleLoadMore} onEndReachedThreshold={0.3} ListFooterComponent={isMoreLoading ? <ActivityIndicator size="small" color={themeColor || '#0038a8'} /> : null} contentContainerStyle={{ paddingBottom: 100 }} />
        )}
      </View>
      <TouchableOpacity style={[styles.fabButton, { backgroundColor: themeColor || '#0038a8' }]} onPress={() => setWriteModalVisible(true)}>
        <Text style={styles.fabText}>🛒</Text>
      </TouchableOpacity>

      <Modal animationType="fade" transparent={true} visible={writeModalVisible} onRequestClose={closeAndResetModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCardWindow}>
            <Text style={styles.modalHeaderTitle}>List Product for Sale</Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={styles.photoPickerBtn} onPress={handlePickImage} activeOpacity={0.7}>
                {selectedImage ? <Image source={{ uri: selectedImage }} style={styles.uploadPreview} /> : (
                  <View style={styles.photoPlaceholder}><Text style={{ fontSize: 26 }}>📸</Text><Text style={styles.photoPlaceholderText}>Upload Product Photo *</Text></View>
                )}
              </TouchableOpacity>
              <TextInput style={styles.titleInput} placeholder="What are you selling? *" placeholderTextColor="#94a3b8" value={newTitle} onChangeText={setNewTitle} />
              <View style={styles.priceInputWrapper}>
                <Text style={styles.currencyLabel}>₱</Text>
                <TextInput 
                  style={styles.priceInput} 
                  placeholder="Price (PHP) *" 
                  placeholderTextColor="#94a3b8" 
                  keyboardType="number-pad" 
                  value={newPrice} 
                  onChangeText={setNewPrice} 
                  inputAccessoryViewID="bazaarPriceAccessory"
                />
              </View>
              {Platform.OS === 'ios' && (
                <InputAccessoryView nativeID="bazaarPriceAccessory">
                  <View style={{ 
                    backgroundColor: '#f1f5f9', 
                    paddingHorizontal: 16, 
                    paddingVertical: 8, 
                    flexDirection: 'row', 
                    justifyContent: 'flex-end', 
                    borderTopWidth: 1, 
                    borderColor: '#e2e8f0' 
                  }}>
                    <TouchableOpacity onPress={() => Keyboard.dismiss()}>
                      <Text style={{ color: '#0038a8', fontWeight: 'bold', fontSize: 15 }}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </InputAccessoryView>
              )}
              <TextInput style={styles.contentInput} placeholder="Description (condition, meetup spot...) *" placeholderTextColor="#94a3b8" multiline numberOfLines={4} textAlignVertical="top" value={newDesc} onChangeText={setNewDesc} />
            </ScrollView>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeAndResetModal}><Text style={styles.cancelBtnText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: themeColor || '#0038a8' }]} onPress={handlePublishItem} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Post Item</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function formatTimeAgo(isoString: string) {
  const postDate = new Date(isoString);
  const nowDate = new Date();
  const diffMs = nowDate.getTime() - postDate.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fafbfd' },
  emptyView: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 13, color: '#94a3b8', marginTop: 10, fontWeight: '500' },
  authContainer: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', padding: 24 },
  authCard: { width: '100%', backgroundColor: '#fff', borderRadius: 24, padding: 24, alignItems: 'center' },
  authEmoji: { fontSize: 50, marginBottom: 12 },
  authTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 10, textAlign: 'center' },
  authDesc: { fontSize: 13, color: '#475569', lineHeight: 20, textAlign: 'center', marginBottom: 24 },
  inputWrapper: { width: '100%', marginBottom: 20 },
  authInput: { width: '100%', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 14, color: '#0f172a', textAlign: 'center', fontWeight: '600' },
  authSubmitBtn: { width: '100%', paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  authSubmitBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  safeArea: { flex: 1, backgroundColor: '#fafbfd', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 10 },
  header: { paddingVertical: 14, backgroundColor: '#fff', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  searchBarContainer: { backgroundColor: '#fff', paddingHorizontal: 16, paddingBottom: 10 },
  searchBarInput: { backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#0f172a' },
  viewToggleRow: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  toggleBtn: { flex: 0.5, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  toggleBtnText: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  mainContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 15 },
  gridRowWrapper: { justifyContent: 'space-between' },
  productCard: { width: CARD_WIDTH, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 14, overflow: 'hidden' },
  imageContainer: { width: '100%', height: CARD_WIDTH, backgroundColor: '#f8fafc', position: 'relative' },
  productImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  statusOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  overlayText: { fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  myTag: { position: 'absolute', top: 8, left: 8, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  myTagText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  wishHeartBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#fff', width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  infoWrapper: { padding: 12 },
  itemTitle: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  priceRowWrapper: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  itemPrice: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  listTimeAgoText: { fontSize: 10, color: '#94a3b8', fontWeight: '500' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, borderTopWidth: 1, borderTopColor: '#f8fafc', paddingTop: 6 },
  itemUnit: { fontSize: 11, color: '#475569', fontWeight: '600', flex: 0.65 },
  scoreText: { fontSize: 11, fontWeight: '700', color: '#eab308' },
  fabButton: { position: 'absolute', bottom: Platform.OS === 'ios' ? 30 : 20, right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 4 },
  fabText: { fontSize: 24 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  modalCardWindow: { width: '100%', backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20 },
  modalHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 16, textAlign: 'center' },
  photoPickerBtn: { width: '100%', height: 130, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1', backgroundColor: '#f8fafc', marginBottom: 14, overflow: 'hidden' },
  photoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  photoPlaceholderText: { fontSize: 12, fontWeight: '600', color: '#64748b', marginTop: 6 },
  uploadPreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  titleInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#0f172a', marginBottom: 12 },
  priceInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 14, marginBottom: 12 },
  currencyLabel: { fontSize: 15, fontWeight: '700', color: '#475569', marginRight: 6 },
  priceInput: { flex: 1, paddingVertical: 10, fontSize: 14, color: '#0f172a' },
  contentInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 14, fontSize: 14, color: '#0f172a', height: 80, marginBottom: 14 },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  cancelBtn: { flex: 0.48, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#f1f5f9' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  submitBtn: { flex: 0.48, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  submitBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' }
});