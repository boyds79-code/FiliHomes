import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Platform, StatusBar, TouchableOpacity, FlatList, TextInput, Modal, Alert, ActivityIndicator, Image, ScrollView, KeyboardAvoidingView } from 'react-native';
import * as ImagePicker from 'expo-image-picker'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext';

function maskUnitNumber(unitNumber: string) {
  if (!unitNumber) return 'Resident';
  const trimmed = unitNumber.trim();
  if (trimmed.length <= 2) return `${trimmed}**`;
  return `${trimmed.slice(0, trimmed.length - 2)}**`;
}

type FilterType = 'ALL' | 'MY_POSTS' | 'REAL_ESTATE' | 'LOST_FOUND' | 'JOBS' | 'GENERAL';

interface Post {
  id: string;
  category: Exclude<FilterType, 'ALL' | 'MY_POSTS'>;
  title: string;
  content: string;
  unit_number: string;
  image_url: string | null; 
  created_at: string;
  user_id?: string;
}

export default function CommunityScreen({ navigation, route }: any) {
  const { themeColor } = useCondoConfig();
  const currentUnitNumber = '1206';

  // 🎯 대용량 데이터 관리를 위한 무한 스크롤 페이징 상태 인프라
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  
  const [page, setPage] = useState(0); // 현재 불러온 페이지 넘버 번호
  const [isMoreLoading, setIsMoreLoading] = useState(false); // 바닥 청크 패치 중인지 여부
  const [hasMore, setHasMore] = useState(true); // 더 가져올 데이터 잔여 여부
  const ITEMS_PER_PAGE = 5; // 🧪 검증을 위해 청크 단위를 5개로 슬라이싱 세팅

  // 필터 및 모달 입력 폼 상태값들
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('ALL');
  const [modalVisible, setModalVisible] = useState(false);
  const [newCategory, setNewCategory] = useState<Exclude<FilterType, 'ALL' | 'MY_POSTS'>>('GENERAL');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null); 

  // Moderation, Edit, and DM States
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [blockedUnits, setBlockedUnits] = useState<string[]>([]);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [isNotificationsMuted, setIsNotificationsMuted] = useState(false);

  const filterTabs: { key: FilterType; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'MY_POSTS', label: '📝 My Posts' },
    { key: 'REAL_ESTATE', label: '🏠 Property' },
    { key: 'LOST_FOUND', label: '🔍 Lost & Found' },
    { key: 'JOBS', label: '👩 Jobs' },
    { key: 'GENERAL', label: '💬 General' },
  ];

  useEffect(() => {
    fetchCommunityPosts(0);
    initializeSessionAndBlocks();
    loadNotificationSetting();
  }, []);

  const loadNotificationSetting = async () => {
    try {
      const val = await AsyncStorage.getItem('mute_community_notifications');
      setIsNotificationsMuted(val === 'true');
    } catch (e) {
      console.log("Error loading notification setting:", e);
    }
  };

  const toggleNotifications = async () => {
    try {
      const nextVal = !isNotificationsMuted;
      setIsNotificationsMuted(nextVal);
      await AsyncStorage.setItem('mute_community_notifications', nextVal ? 'true' : 'false');
      Alert.alert(
        nextVal ? "Notifications Muted 🔕" : "Notifications Active 🔔",
        nextVal 
          ? "You will only see badge controls for new community posts, and push alerts will be silenced."
          : "You will receive sound and banner alerts for new community posts."
      );
    } catch (e) {
      console.log("Error saving notification setting:", e);
    }
  };

  useEffect(() => {
    if (route?.params?.deletedPostId) {
      const deletedId = route.params.deletedPostId;
      setPosts(prev => prev.filter(p => p.id !== deletedId));
      navigation.setParams({ deletedPostId: undefined });
    }
    if (route?.params?.blockedUserId) {
      const blockedId = route.params.blockedUserId;
      setBlockedUsers(prev => [...prev, blockedId]);
      navigation.setParams({ blockedUserId: undefined });
    }
    if (route?.params?.blockedUserUnit) {
      const blockedUnit = route.params.blockedUserUnit;
      setBlockedUnits(prev => [...prev, blockedUnit]);
      navigation.setParams({ blockedUserUnit: undefined });
    }
    if (route?.params?.editPost) {
      const postToEdit = route.params.editPost;
      navigation.setParams({ editPost: undefined });
      handleEditPost(postToEdit);
    }
  }, [route?.params]);

  const initializeSessionAndBlocks = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (userId) {
        setCurrentUserId(userId);
        
        // Fetch blocks
        const { data: blocks } = await supabase
          .from('community_blocks')
          .select('blocked_user_id')
          .eq('blocker_id', userId);
        if (blocks) {
          setBlockedUsers(blocks.map(b => b.blocked_user_id));
        }
      }
    } catch (e) {
      console.log("Error initializing session/blocks:", e);
    }
  };

  const fetchCommunityPosts = async (pageNumber: number) => {
    // 더 이상 가져올 글이 없는데 바닥 스크롤을 또 긁으면 조기 퇴근 가드 차단
    if (!hasMore && pageNumber !== 0) return;

    try {
      if (pageNumber === 0) setLoading(true);
      else setIsMoreLoading(true);

      // 🎯 상용 레벨의 오프셋 범위 계산식 구현 (.range(from, to))
      const from = pageNumber * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error } = await supabase
        .from('community_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to); // 👈 필요한 개수만큼만 메모리에 칼치기로 가져오는 핵심 가드

      if (!error && data && data.length > 0) {
        if (data.length < ITEMS_PER_PAGE) setHasMore(false);
        
        if (pageNumber === 0) {
          setPosts(data);
        } else {
          setPosts(prev => [...prev, ...data]); // 기존 리스트 뒤에 영리하게 접착
        }
      } else {
        // 🕒 백엔드 마이그레이션 전 무한 스크롤 실시간 손맛 검증용 샌드박스 대량 데이터 발전소 기둥
        if (pageNumber === 0) {
          const mockInitial = [
            { id: '1', category: 'JOBS', title: '📌 Recommended Stay-out Maid (Ate)?', content: 'Looking for a reliable maid for Unit 1204. Mostly general cleaning and laundry twice a week.', unit_number: '1204', image_url: null, created_at: '2026-05-28T14:20:00Z' },
            { id: '2', category: 'LOST_FOUND', title: '🍕 Found Black Umbrella at Tower 2 Lobby', content: 'Left near the receptionist desk this afternoon. Passed it to the security guard on duty so you can claim it there.', unit_number: '1502', image_url: 'https://images.unsplash.com/photo-1534224039826-c7a0dea0e66a?q=80&w=600', created_at: '2026-05-28T11:05:00Z' },
            { id: '3', category: 'REAL_ESTATE', title: '🔑 Studio Unit for Re-lease (Tower 1)', content: 'Urgent contract takeover for Studio Unit on 8th floor. Fully furnished, ₱18,000/month. PM for viewing.', unit_number: '0804', image_url: null, created_at: '2026-05-27T10:15:00Z' },
            { id: '4', category: 'GENERAL', title: '💧 Water Delivery Contact Number?', content: 'Does anyone have the contact number for the crystal clear water station that delivers to our condo lobby?', unit_number: '1102', image_url: null, created_at: '2026-05-27T08:40:00Z' },
            { id: '5', category: 'GENERAL', title: '📡 PLDT Wifi Intermittent Connection Issue', content: 'Is anyone else in Tower 2 experiencing slow PLDT Fiber internet speed tonight, or is it just my unit router?', unit_number: '1204', image_url: null, created_at: '2026-05-26T21:10:00Z' }
          ] as Post[];
          setPosts(mockInitial);
        } else if (pageNumber === 1) {
          // 사용자가 스크롤을 끝까지 내렸을 때 로딩 바가 돌면서 슥 합쳐질 2번째 청크 리스트 데이터
          const mockNextPage = [
            { id: '6', category: 'JOBS', title: '👶 Part-time Babysitter Needed This Weekend', content: 'Need a trustworthy babysitter for 4 hours this upcoming Saturday afternoon. Must have prior references in Cebu.', unit_number: '1901', image_url: null, created_at: '2026-05-26T14:00:00Z' },
            { id: '7', category: 'LOST_FOUND', title: '🔑 Car Key Found at B1 Parking Area', content: 'Found a Honda car key on the floor near slot B142. Surrendered to the PMO admin desk office.', unit_number: '0421', image_url: null, created_at: '2026-05-25T11:15:00Z' },
            { id: '8', category: 'REAL_ESTATE', title: '🚗 Parking Slot for Rent (Basement 1)', content: 'Prime parking slot near the elevator core available for long term rent. ₱5,000 fixed monthly. Available starting next week.', unit_number: '1405', image_url: null, created_at: '2026-05-24T09:00:00Z' }
          ] as Post[];
          setPosts(prev => [...prev, ...mockNextPage]);
          setHasMore(false); // 가상 데이터 2페이지 호출을 끝으로 최종 마감 락 가드
        }
      }
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
      setIsMoreLoading(false);
    }
  };

  // 🎯 스크롤 바닥 감지 인터랙션 트리거 핸들러
  const handleLoadMore = () => {
    if (!isMoreLoading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchCommunityPosts(nextPage); // 바닥 충돌 시 다음 청크 리스트 소급 수급
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
              aspect: [4, 3],
              quality: 0.8,
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
              aspect: [4, 3],
              quality: 0.8,
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

  const handleCreatePost = async () => {
    if (!newTitle.trim() || !newContent.trim()) {
      Alert.alert('Required Fields', 'Please fill in both title and content.');
      return;
    }

    try {
      setSubmitting(true);
      if (editingPostId) {
        // Edit flow
        if (editingPostId.startsWith('demo') || isNaN(Number(editingPostId)) || Number(editingPostId) > 1000000000) {
          // Sandbox edit
          setPosts(prev => prev.map(p => p.id === editingPostId ? {
            ...p,
            category: newCategory,
            title: newTitle.trim(),
            content: newContent.trim(),
            image_url: selectedImage
          } : p));
          closeAndResetModal();
          Alert.alert("Success", "Post updated (Sandbox).");
          return;
        }

        const { error } = await supabase
          .from('community_posts')
          .update({
            category: newCategory,
            title: newTitle.trim(),
            content: newContent.trim(),
            image_url: selectedImage
          })
          .eq('id', parseInt(editingPostId));
        if (error) throw error;
        Alert.alert("Success", "Post updated successfully.");
      } else {
        // Create flow
        const { error } = await supabase
          .from('community_posts')
          .insert([{ 
            category: newCategory, 
            title: newTitle.trim(), 
            content: newContent.trim(), 
            unit_number: currentUnitNumber, 
            image_url: selectedImage,
            user_id: currentUserId || null
          }]);
        if (error) throw error;
        Alert.alert("Success", "Post created successfully.");
      }
      closeAndResetModal();
      setPage(0);
      setHasMore(true);
      fetchCommunityPosts(0);
    } catch (err: any) {
      // Sandbox fallback if DB error
      if (!editingPostId) {
        const sandboxPost: Post = {
          id: Date.now().toString(),
          category: newCategory,
          title: newTitle.trim(),
          content: newContent.trim(),
          unit_number: currentUnitNumber,
          image_url: selectedImage, 
          created_at: new Date().toISOString(),
          user_id: currentUserId || undefined
        };
        setPosts(prev => [sandboxPost, ...prev]);
        closeAndResetModal();
        Alert.alert("Sandbox Mode", "Database sync failed. Post added to local sandbox.");
      } else {
        Alert.alert("Error", err.message || "Failed to update post.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const closeAndResetModal = () => {
    setModalVisible(false);
    setEditingPostId(null);
    setNewCategory('GENERAL');
    setNewTitle('');
    setNewContent('');
    setSelectedImage(null); 
  };

  const handleEditPost = (post: Post) => {
    setEditingPostId(post.id);
    setNewTitle(post.title);
    setNewContent(post.content);
    setNewCategory(post.category);
    setSelectedImage(post.image_url);
    setModalVisible(true);
  };

  const handleDeletePost = async (postId: string) => {
    Alert.alert(
      "Delete Post",
      "Are you sure you want to delete this post?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (postId.startsWith('demo') || isNaN(Number(postId)) || Number(postId) > 1000000000) {
                setPosts(prev => prev.filter(p => p.id !== postId));
                Alert.alert("Success", "Post deleted (Sandbox).");
                return;
              }
              const { error } = await supabase
                .from('community_posts')
                .delete()
                .eq('id', parseInt(postId));
              if (error) throw error;
              setPosts(prev => prev.filter(p => p.id !== postId));
              Alert.alert("Success", "Post deleted successfully.");
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to delete post.");
            }
          }
        }
      ]
    );
  };

  const handleBlockUser = async (blockedUserId: string | undefined, unitNumber: string) => {
    Alert.alert(
      "Block User",
      `Are you sure you want to hide posts from Unit ${unitNumber}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              if (blockedUserId) {
                const { error } = await supabase
                  .from('community_blocks')
                  .insert([{ blocked_user_id: blockedUserId }]);
                if (error) throw error;
                setBlockedUsers(prev => [...prev, blockedUserId]);
              } else {
                setBlockedUnits(prev => [...prev, unitNumber]);
              }
              Alert.alert("Success", "User blocked. Posts will no longer be visible.");
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to block user.");
            }
          }
        }
      ]
    );
  };

  const handleReportPost = async (postId: string) => {
    Alert.alert(
      "Report Post",
      "Why are you reporting this post?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Spam", onPress: () => submitReport(postId, "Spam") },
        { text: "Harassment", onPress: () => submitReport(postId, "Harassment") },
        { text: "Inappropriate", onPress: () => submitReport(postId, "Inappropriate") }
      ]
    );
  };

  const submitReport = async (postId: string, reason: string) => {
    try {
      if (postId.startsWith('demo') || isNaN(Number(postId)) || Number(postId) > 1000000000) {
        // Fall through to DB insert with mock flag
      }
      const postItem = posts.find(p => p.id === postId);
      let reportedUserId = postItem?.user_id || null;
      const isDemo = !reportedUserId || (typeof reportedUserId === 'string' && reportedUserId.startsWith('demo'));
      const activeReporterId = currentUserId || '4078096f-b34a-4119-8075-63874fdd99d1';

      // Use activeReporterId as fallback to satisfy foreign key / not-null constraints during demo testing
      if (isDemo) {
        reportedUserId = activeReporterId;
      }

      const { error } = await supabase
        .from('user_reports')
        .insert([{
          reporter_id: activeReporterId,
          reported_id: reportedUserId,
          reason_category: reason,
          description: `${isDemo ? `[Demo Post] Target Unit: ${postItem?.unit_number || 'Unknown'} - ` : ''}Reported Post: "${postItem?.title || ''}" - Content: "${postItem?.content || ''}"`,
          status: 'PENDING'
        }]);
      if (error) throw error;
      Alert.alert("Success", "Report submitted. Thank you.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to submit report.");
    }
  };



  const filteredPosts = posts.filter(post => {
    if (post.user_id && blockedUsers.includes(post.user_id)) return false;
    if (blockedUnits.includes(post.unit_number)) return false;
    
    if (selectedFilter === 'ALL') return true;
    if (selectedFilter === 'MY_POSTS') return post.user_id === currentUserId;
    return post.category === selectedFilter;
  });

  const renderPostItem = ({ item }: { item: Post }) => {
    const currentTabLabel = filterTabs.find(t => t.key === item.category)?.label || 'General';
    return (
      <TouchableOpacity 
        style={styles.postCard} 
        onPress={() => navigation.navigate('CommunityDetail', { post: item })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.titleMetaBlock}>
            <View style={styles.metaRow}>
              <Text style={[styles.categoryTag, { color: themeColor || '#0038a8' }]}>{currentTabLabel.split(' ')[1] || currentTabLabel}</Text>
              <Text style={styles.metaDate}>
                • {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
          </View>
          <View style={styles.unitBadge}>
            <Text style={styles.unitText}>Unit {maskUnitNumber(item.unit_number)}</Text>
          </View>
        </View>
        <Text style={styles.cardContent} numberOfLines={3}>{item.content}</Text>
        {item.image_url && <Image source={{ uri: item.image_url }} style={styles.postImage} />}
      </TouchableOpacity>
    );
  };

  const SafeScrollView = ScrollView as React.ComponentType<any>;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity 
            style={styles.backBtn} 
            onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home')}
          >
            <Text style={styles.backIcon}>❮ Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Condo Community</Text>
        </View>
        <TouchableOpacity style={styles.notifBtn} onPress={toggleNotifications}>
          <Ionicons 
            name={isNotificationsMuted ? "notifications-off-outline" : "notifications-outline"} 
            size={22} 
            color={isNotificationsMuted ? '#94a3b8' : (themeColor || '#0038a8')} 
          />
        </TouchableOpacity>
      </View>

      {/* 실시간 세그먼트 스크롤 필터 바 */}
      <View style={styles.filterBarWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
          {filterTabs.map((tab) => {
            const isSelected = selectedFilter === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.filterTabBtn, isSelected && { backgroundColor: themeColor || '#0038a8', borderColor: themeColor || '#0038a8' }]}
                onPress={() => setSelectedFilter(tab.key)}
              >
                <Text style={[styles.filterTabText, isSelected && { color: '#fff', fontWeight: '700' }]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.mainWrapper}>
        {loading ? (
          <ActivityIndicator size="large" color={themeColor || '#0038a8'} style={{ marginTop: 40 }} />
        ) : filteredPosts.length === 0 ? (
          <View style={styles.emptyView}>
            <Text style={{ fontSize: 40 }}>📭</Text>
            <Text style={styles.emptyText}>No posts found under this category.</Text>
          </View>
        ) : (
          <FlatList
            data={filteredPosts}
            keyExtractor={(item) => item.id}
            renderItem={renderPostItem}
            showsVerticalScrollIndicator={false}
            
            // 🎯 [대용량 최적화 방어막 가드 핵심 옵션 트리거 주입 영역]
            onEndReached={handleLoadMore} // 바닥 치면 추가 로드 가동
            onEndReachedThreshold={0.4} // 바닥 치기 40% 전에 미끄러지듯 선제 쿼리 시작 (버벅임 차단 UX)
            initialNumToRender={5} // 최초 부팅 시 가볍게 화면 채울 5개 선 렌더링 후 점프
            windowSize={5} // 지나간 과거 메모리를 램에서 파괴하여 스마트폰 과열 방지
            ListFooterComponent={isMoreLoading ? <ActivityIndicator size="small" color={themeColor || '#0038a8'} style={{ marginVertical: 14 }} /> : null} // 바닥 미니 로더
            contentContainerStyle={{ paddingBottom: 120 }}
          />
        )}
      </View>

      {/* FAB 쓰기 글 단추 */}
      <TouchableOpacity style={[styles.fabButton, { backgroundColor: themeColor || '#0038a8' }]} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>✍️</Text>
      </TouchableOpacity>

      {/* 글쓰기 모달 창 */}
      <Modal animationType="fade" transparent={true} visible={modalVisible} onRequestClose={closeAndResetModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalCardWindow}>
            <Text style={styles.modalHeaderTitle}>{editingPostId ? 'Edit Community Post' : 'Create Community Post'}</Text>
            
            <View style={styles.privacyBanner}>
              <Text style={styles.privacyBannerText}>
                ⚠️ Privacy Guard: Your exact house/lot number is masked to others (e.g. Unit {currentUnitNumber ? maskUnitNumber(currentUnitNumber) : '12**'}). Please do NOT write your house/lot number, phone number, or private details inside the post content.
              </Text>
            </View>

            <SafeScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalSectionLabel}>Select Category</Text>
              <View style={styles.modalCategoryRow}>
                {filterTabs.filter(t => t.key !== 'ALL' && t.key !== 'MY_POSTS').map((tab) => {
                  const isSelected = newCategory === tab.key;
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      style={[styles.modalCatChip, isSelected && { borderColor: themeColor || '#0038a8', backgroundColor: '#f0f9ff' }]}
                      onPress={() => setNewCategory(tab.key as Exclude<FilterType, 'ALL' | 'MY_POSTS'>)}
                    >
                      <Text style={[styles.modalCatChipText, isSelected && { color: themeColor || '#0038a8', fontWeight: '700' }]}>{tab.label.split(' ')[1] || tab.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TextInput
                style={styles.titleInput}
                placeholder="Post Title..."
                placeholderTextColor="#94a3b8"
                value={newTitle}
                onChangeText={setNewTitle}
              />

              <TextInput
                style={styles.contentInput}
                placeholder="Share the details with your neighbors."
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                value={newContent}
                onChangeText={setNewContent}
              />

              <TouchableOpacity style={styles.photoPickerBtn} onPress={handlePickImage} activeOpacity={0.7}>
                <Text style={styles.photoPickerText}>📷 {selectedImage ? "Change Attached Photo" : "Attach Photo"}</Text>
              </TouchableOpacity>

              {selectedImage && (
                <View style={styles.previewWrapper}>
                  <Image source={{ uri: selectedImage }} style={styles.previewImage} />
                  <TouchableOpacity style={styles.removePhotoBadge} onPress={() => setSelectedImage(null)}>
                    <Text style={styles.removePhotoText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
            </SafeScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeAndResetModal}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, { backgroundColor: themeColor || '#0038a8' }]} onPress={handleCreatePost} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>{editingPostId ? 'Update' : 'Publish'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fafbfd', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 10 },
  header: { 
    height: 56, 
    backgroundColor: '#fff', 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1, 
    borderBottomColor: '#f1f5f9' 
  },
  backBtn: { padding: 8, marginRight: 8 },
  backIcon: { fontSize: 16, fontWeight: '700', color: '#0038a8' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  notifBtn: { padding: 8 },
  filterBarWrapper: { backgroundColor: '#fff', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  filterTabBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', marginRight: 8 },
  filterTabText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  mainWrapper: { flex: 1, paddingHorizontal: 20, paddingTop: 15 },
  emptyView: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 13, color: '#64748b', marginTop: 10 },
  postCard: { backgroundColor: '#fff', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12, shadowColor: '#0f172a', shadowOpacity: 0.01, shadowRadius: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  titleMetaBlock: { flex: 0.75 },
  categoryTag: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b', lineHeight: 18 },
  unitBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  unitText: { fontSize: 10, fontWeight: '700', color: '#475569' },
  cardContent: { fontSize: 13, color: '#475569', lineHeight: 19, marginBottom: 10 },
  postImage: { width: '100%', height: 160, borderRadius: 12, resizeMode: 'cover', marginVertical: 8 }, 
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  metaDate: { fontSize: 10, color: '#94a3b8', marginLeft: 6 },
  unitActionsColumn: { alignItems: 'flex-end' },
  msgBtn: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center' },
  msgBtnText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { marginLeft: 12, paddingVertical: 4, paddingHorizontal: 6 },
  actionTextEdit: { fontSize: 12, fontWeight: '600', color: '#0ea5e9' },
  actionTextDelete: { fontSize: 12, fontWeight: '600', color: '#ef4444' },
  actionTextReport: { fontSize: 12, fontWeight: '600', color: '#f59e0b' },
  actionTextBlock: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  fabButton: { position: 'absolute', bottom: Platform.OS === 'ios' ? 30 : 20, right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#0f172a', shadowOpacity: 0.15, shadowRadius: 8 },
  fabText: { fontSize: 24 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  modalCardWindow: { width: '100%', backgroundColor: '#fff', borderRadius: 24, padding: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  modalHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 12, textAlign: 'center' },
  modalSectionLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.5 },
  modalCategoryRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 14 },
  modalCatChip: { width: '48%', paddingVertical: 8, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, alignItems: 'center', marginBottom: 8, backgroundColor: '#f8fafc' },
  modalCatChipText: { fontSize: 12, color: '#64748b' },
  titleInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#0f172a', marginBottom: 12 },
  contentInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 14, fontSize: 14, color: '#0f172a', height: 90, marginBottom: 14 },
  photoPickerBtn: { width: '100%', padding: 11, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1', alignItems: 'center', marginBottom: 14, backgroundColor: '#f8fafc' },
  photoPickerText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  previewWrapper: { width: '100%', height: 130, borderRadius: 12, overflow: 'hidden', marginBottom: 14, position: 'relative' },
  previewImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  removePhotoBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(15, 23, 42, 0.6)', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  removePhotoText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  modalBtnRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  cancelBtn: { flex: 0.48, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: '#f1f5f9' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  submitBtn: { flex: 0.48, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  submitBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  privacyBanner: {
    backgroundColor: '#fffbeb',
    borderColor: '#fef3c7',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  privacyBannerText: {
    fontSize: 11,
    color: '#b45309',
    fontWeight: '500',
    lineHeight: 16,
  }
});