import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Platform, StatusBar, TouchableOpacity, ScrollView, TextInput, KeyboardAvoidingView, Image, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext';

interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  unit_number: string;
  content: string;
  created_at: string;
}

function maskUnitNumber(unitNumber: string) {
  if (!unitNumber) return 'Resident';
  const trimmed = unitNumber.trim();
  if (trimmed.length <= 2) return `${trimmed}**`;
  return `${trimmed.slice(0, trimmed.length - 2)}**`;
}

export default function CommunityDetailScreen({ route, navigation }: any) {
  const { themeColor } = useCondoConfig();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const { post: initialPost } = route.params || {};
  
  const [post, setPost] = useState<any>(initialPost);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [currentUnitNumber, setCurrentUnitNumber] = useState<string>('1206');
  const [loading, setLoading] = useState(true);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [disclaimerShown, setDisclaimerShown] = useState(false);

  useEffect(() => {
    initializeSessionAndComments();
  }, [post?.id]);

  const initializeSessionAndComments = async () => {
    if (!post?.id) return;
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (userId) {
        setCurrentUserId(userId);
      }
      
      // Fetch latest post info to sync edit updates
      fetchPostDetails();
      
      // Fetch comments
      await fetchComments();

      // Subscribe to comment changes
      const channel = supabase
        .channel(`post-comments-${post.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'community_comments',
          filter: `post_id=eq.${post.id}`
        }, () => {
          fetchComments();
        })
        .subscribe();

      setLoading(false);
      return () => {
        supabase.removeChannel(channel);
      };
    } catch (e) {
      console.log(e);
      setLoading(false);
    }
  };

  const fetchPostDetails = async () => {
    if (isNaN(Number(post.id)) || Number(post.id) > 1000000000) return; // Mock data bypass
    try {
      const { data, error } = await supabase
        .from('community_posts')
        .select('*')
        .eq('id', parseInt(post.id))
        .single();
      if (!error && data) {
        setPost(data);
      }
    } catch (e) {
      console.log("Error fetching post details:", e);
    }
  };

  const fetchComments = async () => {
    if (post.id.startsWith && post.id.startsWith('demo') || isNaN(Number(post.id)) || Number(post.id) > 1000000000) {
      // Sandbox initial mock comments
      setComments([
        { id: 'c1', post_id: post.id, user_id: 'user_a', unit_number: '1402', content: "I am interested in this too! Let me know if you find a good cleaner.", created_at: new Date(Date.now() - 3600000).toISOString() },
        { id: 'c2', post_id: post.id, user_id: 'user_b', unit_number: '0809', content: "Unit 1204 has a really good cleaner. Highly recommended.", created_at: new Date(Date.now() - 1800000).toISOString() }
      ]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('community_comments')
        .select('*')
        .eq('post_id', parseInt(post.id))
        .order('created_at', { ascending: true });

      if (!error && data) {
        setComments(data.map((c: any) => ({
          ...c,
          id: c.id.toString(),
          post_id: c.post_id.toString()
        })));
      }
    } catch (e) {
      console.log("Error fetching comments:", e);
    }
  };

  const handleCommentInputFocus = () => {
    if (!disclaimerShown) {
      Alert.alert(
        "Legal Notice",
        "Comments are the sole responsibility of the author. Postings violating Philippine Cybercrime (RA 10175) or Data Privacy (RA 10173) laws are subject to legal liability. The platform and PMO bear no responsibility.",
        [{ text: "I Agree", onPress: () => setDisclaimerShown(true) }]
      );
    }
  };

  const handleAddComment = async () => {
    if (!newCommentText.trim()) return;
    const commentContent = newCommentText.trim();
    setNewCommentText('');

    if (post.id.startsWith && post.id.startsWith('demo') || isNaN(Number(post.id)) || Number(post.id) > 1000000000) {
      const newMockComment: Comment = {
        id: Date.now().toString(),
        post_id: post.id,
        user_id: currentUserId,
        unit_number: currentUnitNumber,
        content: commentContent,
        created_at: new Date().toISOString()
      };
      setComments(prev => [...prev, newMockComment]);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
      return;
    }

    try {
      setSubmittingComment(true);
      const { error } = await supabase
        .from('community_comments')
        .insert([{
          post_id: parseInt(post.id),
          user_id: currentUserId,
          unit_number: currentUnitNumber,
          content: commentContent
        }]);

      if (error) throw error;
      await fetchComments();
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to add comment.");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    Alert.alert(
      "Delete Comment",
      "Are you sure you want to delete this comment?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (post.id.startsWith && post.id.startsWith('demo') || isNaN(Number(post.id)) || Number(post.id) > 1000000000) {
              setComments(prev => prev.filter(c => c.id !== commentId));
              return;
            }
            try {
              const { error } = await supabase
                .from('community_comments')
                .delete()
                .eq('id', parseInt(commentId));
              if (error) throw error;
              await fetchComments();
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to delete comment.");
            }
          }
        }
      ]
    );
  };

  const handleEditPost = () => {
    navigation.navigate('Community', { editPost: post });
  };

  const handleDeletePost = async () => {
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
              if (post.id.startsWith && post.id.startsWith('demo') || isNaN(Number(post.id)) || Number(post.id) > 1000000000) {
                navigation.navigate('Community', { deletedPostId: post.id });
                return;
              }
              const { error } = await supabase
                .from('community_posts')
                .delete()
                .eq('id', parseInt(post.id));
              if (error) throw error;
              navigation.navigate('Community', { deletedPostId: post.id });
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to delete post.");
            }
          }
        }
      ]
    );
  };

  const handleBlockUser = async () => {
    Alert.alert(
      "Block User",
      `Are you sure you want to hide posts from Unit ${maskUnitNumber(post.unit_number)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              if (post.user_id) {
                const { error } = await supabase
                  .from('community_blocks')
                  .insert([{ blocked_user_id: post.user_id }]);
                if (error) throw error;
              }
              navigation.navigate('Community', { blockedUserUnit: post.unit_number, blockedUserId: post.user_id });
              Alert.alert("Success", "User blocked successfully.");
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to block user.");
            }
          }
        }
      ]
    );
  };

  const handleReportPost = async () => {
    Alert.alert(
      "Report Post",
      "Why are you reporting this post?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Spam", onPress: () => submitReport("Spam") },
        { text: "Harassment", onPress: () => submitReport("Harassment") },
        { text: "Inappropriate", onPress: () => submitReport("Inappropriate") }
      ]
    );
  };

  const submitReport = async (reason: string) => {
    try {
      let reportedUserId = post.user_id || null;
      const isDemo = !reportedUserId || (typeof reportedUserId === 'string' && reportedUserId.startsWith('demo')) || (post.id && typeof post.id === 'string' && post.id.startsWith('demo'));
      const activeReporterId = currentUserId || '4078096f-b34a-4119-8075-63874fdd99d1';

      if (isDemo) {
        reportedUserId = activeReporterId;
      }

      const { error } = await supabase
        .from('user_reports')
        .insert([{
          reporter_id: activeReporterId,
          reported_id: reportedUserId,
          reason_category: reason,
          description: `${isDemo ? `[Demo Post] Target Unit: ${post.unit_number || 'Unknown'} - ` : ''}Reported Community Post: "${post.title || ''}" - Content: "${post.content || ''}"`,
          status: 'PENDING'
        }]);
      if (error) throw error;
      Alert.alert("Success", "Report submitted. Thank you.");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to submit report.");
    }
  };

  const handleStartDM = async () => {
    if (!currentUserId) {
      Alert.alert("Authentication Required", "Please log in to chat.");
      return;
    }
    if (post.user_id === currentUserId) {
      Alert.alert("Cannot Chat", "This is your own unit.");
      return;
    }

    try {
      // Sandbox fallback if user_id does not exist or matches demo formatting
      if (!post.user_id || post.user_id.startsWith('demo')) {
        navigation.navigate('DirectChat', { 
          chatId: 'demo-dm-' + post.unit_number, 
          targetUnitNumber: post.unit_number,
          postId: post.id,
          postTitle: post.title
        });
        return;
      }

      const u1 = currentUserId < post.user_id ? currentUserId : post.user_id;
      const u2 = currentUserId < post.user_id ? post.user_id : currentUserId;

      const { data: existingChat, error: checkError } = await supabase
        .from('direct_chats')
        .select('id')
        .eq('user1_id', u1)
        .eq('user2_id', u2)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingChat) {
        navigation.navigate('DirectChat', { 
          chatId: existingChat.id, 
          targetUnitNumber: post.unit_number,
          postId: post.id,
          postTitle: post.title
        });
        return;
      }

      const { data: newChat, error: createError } = await supabase
        .from('direct_chats')
        .insert([{ user1_id: u1, user2_id: u2 }])
        .select('id')
        .single();

      if (createError) throw createError;

      if (newChat) {
        navigation.navigate('DirectChat', { 
          chatId: newChat.id, 
          targetUnitNumber: post.unit_number,
          postId: post.id,
          postTitle: post.title
        });
      }
    } catch (e) {
      navigation.navigate('DirectChat', { 
        chatId: 'demo-dm-' + post.unit_number, 
        targetUnitNumber: post.unit_number,
        postId: post.id,
        postTitle: post.title
      });
    }
  };

  const isMyPost = post.user_id === currentUserId;
  const postDate = new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>❮ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post Details</Text>
        <View style={styles.headerRightActions}>
          {isMyPost ? (
            <>
              <TouchableOpacity onPress={handleEditPost} style={styles.headerActionBtn} activeOpacity={0.6}>
                <Text style={styles.headerActionIcon}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDeletePost} style={styles.headerActionBtn} activeOpacity={0.6}>
                <Text style={styles.headerActionIcon}>🗑️</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={handleReportPost} style={styles.headerActionBtn} activeOpacity={0.6}>
                <Text style={styles.headerActionIcon}>⚠️</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleBlockUser} style={styles.headerActionBtn} activeOpacity={0.6}>
                <Text style={styles.headerActionIcon}>🚫</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollContainer}
          contentContainerStyle={{ paddingBottom: 30 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Post Card */}
          <View style={styles.postCard}>
            <View style={styles.cardHeader}>
              <View style={styles.categoryBlock}>
                <View style={styles.metaRow}>
                  <Text style={[styles.categoryTag, { color: themeColor || '#0038a8' }]}>{post.category}</Text>
                  <Text style={styles.metaDate}>• {postDate}</Text>
                </View>
                <Text style={styles.cardTitle}>{post.title}</Text>
              </View>
              <View style={styles.unitRow}>
                <View style={styles.unitBadge}>
                  <Text style={styles.unitText}>Unit {maskUnitNumber(post.unit_number)}</Text>
                </View>
                {!isMyPost && (
                  <TouchableOpacity 
                    style={styles.envelopeBtn} 
                    onPress={handleStartDM}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.envelopeIcon}>✉️</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <Text style={styles.cardContent}>{post.content}</Text>
            {post.image_url && <Image source={{ uri: post.image_url }} style={styles.postImage} />}
          </View>

          {/* Comments Section Header */}
          <View style={styles.commentsHeaderWrap}>
            <Text style={styles.commentsHeaderTitle}>Comments ({comments.length})</Text>
          </View>

          {/* Comments List */}
          {loading ? (
            <ActivityIndicator size="small" color={themeColor || '#0038a8'} style={{ marginVertical: 20 }} />
          ) : comments.length === 0 ? (
            <View style={styles.emptyCommentsWrap}>
              <Text style={styles.emptyCommentsText}>No comments yet. Start the conversation!</Text>
            </View>
          ) : (
            <View style={styles.commentsList}>
              {comments.map((comment) => {
                const isCommentMine = comment.user_id === currentUserId;
                return (
                  <View key={comment.id} style={styles.commentRow}>
                    <View style={styles.commentHeader}>
                      <View style={styles.commentorMeta}>
                        <Text style={styles.commentUnit}>Unit {maskUnitNumber(comment.unit_number)}</Text>
                        {isCommentMine && <Text style={styles.myCommentBadge}>You</Text>}
                      </View>
                      <View style={styles.commentRightHeader}>
                        <Text style={styles.commentDate}>
                          {new Date(comment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </Text>
                        {isCommentMine && (
                          <TouchableOpacity onPress={() => handleDeleteComment(comment.id)} style={styles.deleteCommentBtn} activeOpacity={0.6}>
                            <Text style={styles.deleteCommentText}>✕</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    <Text style={styles.commentContent}>{comment.content}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* Comment Input */}
        <View style={styles.inputArea}>
          <TextInput
            placeholder="Write a comment..."
            placeholderTextColor="#94a3b8"
            style={styles.textInput}
            value={newCommentText}
            onChangeText={setNewCommentText}
            onFocus={handleCommentInputFocus}
            multiline
          />
          <TouchableOpacity 
            onPress={handleAddComment}
            style={[styles.sendBtn, { backgroundColor: themeColor || '#0038a8' }]}
            activeOpacity={0.8}
            disabled={submittingComment}
          >
            <Text style={styles.sendText}>Post</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    height: 56,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
      android: { elevation: 2 }
    })
  },
  backBtn: { width: 60, paddingVertical: 8 },
  backText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  keyboardView: { flex: 1 },
  scrollContainer: { flex: 1 },
  postCard: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  categoryBlock: { flex: 0.75 },
  categoryTag: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', marginBottom: 2, letterSpacing: 0.5 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', lineHeight: 22 },
  unitBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  unitText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  cardContent: { fontSize: 14, color: '#334155', lineHeight: 22, marginVertical: 8 },
  postImage: { width: '100%', height: 220, borderRadius: 12, resizeMode: 'cover', marginVertical: 12 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12, marginTop: 12 },
  cardDate: { fontSize: 11, color: '#94a3b8' },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { marginLeft: 16, paddingVertical: 4 },
  actionTextEdit: { fontSize: 12, fontWeight: '600', color: '#0ea5e9' },
  actionTextDelete: { fontSize: 12, fontWeight: '600', color: '#ef4444' },
  actionTextReport: { fontSize: 12, fontWeight: '600', color: '#f59e0b' },
  actionTextBlock: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  
  commentsHeaderWrap: { paddingHorizontal: 16, paddingVertical: 12 },
  commentsHeaderTitle: { fontSize: 14, fontWeight: '700', color: '#475569' },
  
  emptyCommentsWrap: { padding: 32, alignItems: 'center' },
  emptyCommentsText: { fontSize: 13, color: '#94a3b8', textAlign: 'center' },
  
  commentsList: { paddingHorizontal: 16 },
  commentRow: { backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 10 },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  commentorMeta: { flexDirection: 'row', alignItems: 'center' },
  commentUnit: { fontSize: 12, fontWeight: '700', color: '#1e293b' },
  myCommentBadge: { fontSize: 9, fontWeight: '700', color: '#fff', backgroundColor: '#64748b', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, marginLeft: 6, textTransform: 'uppercase' },
  commentRightHeader: { flexDirection: 'row', alignItems: 'center' },
  commentDate: { fontSize: 10, color: '#94a3b8', marginRight: 8 },
  deleteCommentBtn: { padding: 4 },
  deleteCommentText: { fontSize: 11, color: '#94a3b8', fontWeight: 'bold' },
  commentContent: { fontSize: 13, color: '#334155', lineHeight: 18 },
  
  inputArea: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center'
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1e293b',
    maxHeight: 100,
    marginRight: 10
  },
  sendBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  sendText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  disclaimerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fffbeb',
    borderTopWidth: 1,
    borderTopColor: '#fef3c7',
    borderBottomWidth: 1,
    borderBottomColor: '#fef3c7'
  },
  disclaimerText: {
    fontSize: 10,
    color: '#d97706',
    lineHeight: 14,
    textAlign: 'center'
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  metaDate: { fontSize: 10, color: '#94a3b8', marginLeft: 6 },
  unitRow: { flexDirection: 'row', alignItems: 'center' },
  envelopeBtn: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#f1f5f9', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' },
  envelopeIcon: { fontSize: 13 },
  headerRightActions: { flexDirection: 'row', alignItems: 'center' },
  headerActionBtn: { marginLeft: 16, padding: 4 },
  headerActionIcon: { fontSize: 18 }
});
