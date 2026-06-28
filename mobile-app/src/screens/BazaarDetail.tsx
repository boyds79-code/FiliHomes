import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Platform, StatusBar, TouchableOpacity, ScrollView, Image, Dimensions, Alert, Linking, ActivityIndicator, FlatList } from 'react-native';
import { supabase } from '../lib/supabase';
import { useCondoConfig } from '../hooks/CondoConfigContext';

const { width } = Dimensions.get('window');

interface RelatedItem {
  id: string;
  title: string;
  price: number;
  image_url: string;
}

export default function BazaarDetail({ route, navigation }: any) {
  const { themeColor } = useCondoConfig();
  const { item, currentNickname } = route.params || {};
  const [connecting, setConnecting] = useState(false);
  
  // State management for related items
  const [relatedItems, setRelatedItems] = useState<RelatedItem[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  // 🎯 [Core Logic 1] Check for 'flower' keyword matching in current item title or description
  const itemText = `${item?.title || ''} ${item?.description || ''}`.toLowerCase();
  const isFlowerTarget = itemText.includes('flower') || itemText.includes('flowrer');

  // Ad configuration for targeted Shopee PH affiliate partnership based on keyword
  const adConfig = isFlowerTarget ? {
    title: "🌸 Shopee PH Flower & Gardening Center",
    sub: "Fresh flowers, pots, and indoor plant fertilizers. Order now to get vouchers for Solea residents!",
    image: "https://images.unsplash.com/photo-1526047932273-341f2a7631f9?q=80&w=400", // Flower image banner
    url: "https://shopee.ph/search?keyword=flower%20pot%20and%20plants" // Shopee search link for flowers
  } : {
    title: "✨ FiliSpa Luxury Massage Delivery",
    sub: "20% Off for Solea Residents! Pure relaxation at your unit.",
    image: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?q=80&w=400",
    url: "https://shopee.ph/search?keyword=massage%20oil" 
  };

  useEffect(() => {
    fetchRelatedItems();
  }, [item?.id]);

  // 🎯 [Core Logic 2] DB Integration: Real-time query for related listings with matching keywords
  const fetchRelatedItems = async () => {
    if (!item) return;
    try {
      setLoadingRelated(true);
      
      let query = supabase
        .from('bazaar_items')
        .select('id, title, price, image_url')
        .neq('id', item.id) // Exclude the current item
        .neq('status', 'SOLD'); // Exclude sold items

      // 🌸 Perform case-insensitive search for flower related keywords in DB when matching flower target
      if (isFlowerTarget) {
        query = query.or(`title.ilike.%flower%,description.ilike.%flower%,title.ilike.%flowrer%,description.ilike.%flowrer%`);
      }

      // Limit to maximum 4 items
      const { data, error } = await query.range(0, 3);

      if (!error && data && data.length > 0) {
        setRelatedItems(data.map((r: any) => ({
          id: r.id.toString(),
          title: r.title,
          price: r.price,
          image_url: r.image_url
        })));
      } else {
        // Setup premium fallback mock data if no items matched
        useDefaultRecommendationFallback();
      }
    } catch (e) {
      console.log(e);
      useDefaultRecommendationFallback();
    } finally {
      setLoadingRelated(false);
    }
  };

  const useDefaultRecommendationFallback = () => {
    if (isFlowerTarget) {
      setRelatedItems([
        { id: 'f_rec1', title: '🌿 Minimalist Clay Flower Pot', price: 250, image_url: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?q=80&w=200' },
        { id: 'f_rec2', title: '🌻 Artificial Sunflower Bunch (3pcs)', price: 180, image_url: 'https://images.unsplash.com/photo-1597848212624-a19eb35e2651?q=80&w=200' }
      ]);
    } else {
      setRelatedItems([
        { id: 'm1', title: '💻 MacBook Pro 16" Intel i9', price: 38000, image_url: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?q=80&w=200' },
        { id: 'm2', title: '🏡 Condominium Short Lease', price: 25000, image_url: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?q=80&w=200' }
      ]);
    }
  };

  const handleBottomAction = async () => {
    try {
      setConnecting(true);
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        console.log("DEBUG - No session user found.");
        return;
      }

      const { data: existingChat } = await supabase
        .from('bazaar_chats')
        .select('id')
        .eq('item_id', item.id)
        .eq('buyer_id', userId)
        .eq('seller_id', item.seller_id)
        .maybeSingle();

      if (existingChat) {
        navigation.navigate('BazaarChat', { item, chatId: existingChat.id });
        return;
      }

      const { data: newChat, error: insertErr } = await supabase
        .from('bazaar_chats')
        .insert([{ item_id: item.id, buyer_id: userId, seller_id: item.seller_id }])
        .select('id')
        .single();

      if (!insertErr && newChat) {
        navigation.navigate('BazaarChat', { item, chatId: newChat.id });
      } else {
        navigation.navigate('BazaarChat', { item, chatId: 'demo-room' });
      }
    } catch (e) {
      navigation.navigate('BazaarChat', { item, chatId: 'demo-room' });
    } finally {
      setConnecting(false);
    }
  };

  const handleOpenAdLink = () => {
    Alert.alert(
      "Redirecting to Sponsor 🛍️",
      "Moving out to secure browser window verified link. Complete your checkout to unlock resident points!",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Open Link ➔", onPress: () => Linking.openURL(adConfig.url).catch(() => Linking.openURL('https://shopee.ph')) }
      ]
    );
  };

  const handleSafety = () => {
    Alert.alert("Safety Guard", "Report this item?", [
      { text: "Cancel", style: "cancel" },
      { 
        text: "⚠️ Report Post", 
        style: "destructive", 
        onPress: async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const userId = session?.user?.id;
            const activeReporterId = userId || '4078096f-b34a-4119-8075-63874fdd99d1';
            let reportedUserId = item.seller_id || null;
            const isDemo = !reportedUserId || (typeof reportedUserId === 'string' && reportedUserId.startsWith('demo')) || (item.id && typeof item.id === 'string' && item.id.startsWith('demo'));
            if (isDemo) {
              reportedUserId = activeReporterId;
            }
            const { error } = await supabase
              .from('user_reports')
              .insert([{
                reporter_id: activeReporterId,
                reported_id: reportedUserId,
                reason_category: 'Inappropriate',
                description: `${isDemo ? '[Demo Bazaar Item] Target Unit: 1204 - ' : ''}Reported Bazaar Item: "${item.title || ''}" - Description: "${item.description || ''}"`,
                status: 'PENDING'
              }]);
            if (error) throw error;
            Alert.alert("Success", "Report submitted. Thank you.");
          } catch (e: any) {
            Alert.alert("Error", e.message || "Failed to submit report.");
          }
        }
      }
    ]);
  };

  // Render method for related items
  const handleSwitchToAnotherDetail = (clickedItem: any) => {
    // If it is a real database item, navigate to details
    if (clickedItem.id.startsWith('f_') || clickedItem.id.startsWith('m')) {
      Alert.alert("Recommendation Info", `Title: ${clickedItem.title}\nPrice: ₱${clickedItem.price}`);
    } else {
      Alert.alert("Loading Item", "Navigating to related resident item page...");
    }
  };

  if (!item) {
    return (
      <SafeAreaView style={styles.centered}><Text>Item data not found.</Text></SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Navigation Bar */}
      <View style={styles.navHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={[styles.backIcon, { color: themeColor || '#0038a8' }]}>❮</Text>
          <Text style={styles.backText}>Bazaar</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleSafety} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: '#475569' }}>⋮</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Image source={{ uri: item.image_url }} style={styles.mainProductImage} />

        <View style={styles.mainContentPadding}>
          {/* Seller Info */}
          <View style={styles.sellerProfileRow}>
            <View style={styles.profileLeft}>
              <Text style={styles.profileAvatar}>👤</Text>
              <View>
                <Text style={styles.profileName}>{item.seller_nickname || 'Resident'}</Text>
                <Text style={styles.verifiedTag}>Verified Resident</Text>
              </View>
            </View>
            <View style={styles.profileRight}>
              <Text style={styles.scoreText}>⭐ {item.seller_score || '5.0'}</Text>
              <Text style={styles.scoreSub}>Platform Trust</Text>
            </View>
          </View>

          {/* Main Product Details */}
          <View style={styles.titleRow}>
            <Text style={styles.itemTitle}>{item.title}</Text>
          </View>
          <Text style={styles.itemPrice}>₱{item.price.toLocaleString()}</Text>
          <Text style={styles.itemDesc}>{item.description}</Text>

          {/* 🎯 [Dynamic Banner 1] Targeted Affiliate Shopee Ad Banner Section */}
          <View style={styles.adBannerContainer}>
            <Text style={styles.adBadgeText}>ADVERTISEMENT / TARGETED OFFERS</Text>
            <TouchableOpacity style={styles.adCardWrapper} onPress={handleOpenAdLink}>
              <Image source={{ uri: adConfig.image }} style={styles.adImage} />
              <View style={styles.adInfo}>
                <Text style={styles.adTitle}>{adConfig.title}</Text>
                <Text style={styles.adSub}>{adConfig.sub}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* 🎯 [Dynamic Banner 2] Related Items Grid Feed */}
          <Text style={styles.sectionHeading}>
            {isFlowerTarget ? "🌸 Related Floral & Garden Items" : "More Items From This Condo"}
          </Text>
          
          {loadingRelated ? (
            <ActivityIndicator size="small" color={themeColor || '#0038a8'} style={{ marginVertical: 20 }} />
          ) : (
            <View style={styles.recommendGridRow}>
              {relatedItems.map((rec) => (
                <TouchableOpacity key={rec.id} style={styles.recCard} onPress={() => handleSwitchToAnotherDetail(rec)}>
                  <Image source={{ uri: rec.image_url }} style={styles.recImage} />
                  <Text style={styles.recTitle} numberOfLines={1}>{rec.title}</Text>
                  <Text style={styles.recPrice}>₱{rec.price.toLocaleString()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Fixed Bottom Action Sticky Bar */}
      <View style={styles.fixedBottomActionStickyBar}>
        <View style={styles.stickyLeftPriceArea}>
          <Text style={styles.stickyPriceText}>₱{item.price.toLocaleString()}</Text>
          <Text style={styles.stickyNegotiableText}>Price Fixed</Text>
        </View>
        <TouchableOpacity 
          style={[styles.stickyChatBtn, { backgroundColor: themeColor || '#0038a8' }]} 
          onPress={handleBottomAction}
          disabled={connecting}
        >
          {connecting ? <ActivityIndicator color="#fff" /> : <Text style={styles.stickyChatBtnText}>Start Chatting</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  safeArea: { flex: 1, backgroundColor: '#fff', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  navHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  backIcon: { fontSize: 16, fontWeight: 'bold' },
  backText: { fontSize: 14, color: '#475569', marginLeft: 6, fontWeight: '500' },
  scrollView: { flex: 1 },
  mainProductImage: { width: width, height: width * 0.85, resizeMode: 'cover' },
  mainContentPadding: { padding: 20 },
  sellerProfileRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 16, marginBottom: 16 },
  profileLeft: { flexDirection: 'row', alignItems: 'center' },
  profileAvatar: { fontSize: 28, marginRight: 12, backgroundColor: '#f1f5f9', padding: 6, borderRadius: 20, overflow: 'hidden', textAlign: 'center' },
  profileName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  verifiedTag: { fontSize: 11, color: '#16a34a', fontWeight: '600', marginTop: 2 },
  profileRight: { alignItems: 'flex-end' },
  scoreText: { fontSize: 16, fontWeight: '800', color: '#ea580c' },
  scoreSub: { fontSize: 10, color: '#94a3b8', marginTop: 2, fontWeight: '500' },
  titleRow: { flexDirection: 'column', alignItems: 'flex-start', marginTop: 4 },
  itemTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a', lineHeight: 24 },
  itemPrice: { fontSize: 20, fontWeight: '900', color: '#0f172a', marginTop: 6 },
  itemDesc: { fontSize: 14, color: '#334155', lineHeight: 22, marginTop: 14, marginBottom: 30 },
  adBannerContainer: { marginVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#f1f5f9', paddingVertical: 20 },
  adBadgeText: { fontSize: 9, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.5, marginBottom: 8 },
  adCardWrapper: { flexDirection: 'row', backgroundColor: '#f8fafc', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  adImage: { width: 80, height: 80, resizeMode: 'cover' },
  adInfo: { flex: 1, padding: 10, justifyContent: 'center' },
  adTitle: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  adSub: { fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 15 },
  sectionHeading: { fontSize: 13, fontWeight: '800', color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 15, marginBottom: 14 },
  recommendGridRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
  recCard: { width: (width - 54) / 2, backgroundColor: '#fff', borderRadius: 10, overflow: 'hidden', marginBottom: 12 },
  recImage: { width: '100%', height: 110, borderRadius: 8, backgroundColor: '#f8fafc', resizeMode: 'cover' },
  recTitle: { fontSize: 12, fontWeight: '600', color: '#334155', marginTop: 6 },
  recPrice: { fontSize: 12, fontWeight: '700', color: '#0f172a', marginTop: 2 },
  fixedBottomActionStickyBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 74, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 14 : 0 },
  stickyLeftPriceArea: { justifyContent: 'center' },
  stickyPriceText: { fontSize: 17, fontWeight: '900', color: '#0f172a' },
  stickyNegotiableText: { fontSize: 11, color: '#94a3b8', fontWeight: '500', marginTop: 2 },
  stickyChatBtn: { paddingHorizontal: 22, paddingVertical: 12, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  stickyChatBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' }
});