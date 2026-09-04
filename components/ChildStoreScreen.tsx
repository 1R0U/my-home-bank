import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MOCK_CURRENT_USER, MOCK_STORE_ITEMS } from "../constants/mockData";
import type { StoreItem } from "../types";
import StoreShelf from "./store/StoreShelf";
import { splitIntoShelves } from "./store/splitIntoShelves";
import { storeStyles as styles } from "./store/storeStyles";

export default function ChildStoreScreen() {
  const shelves = splitIntoShelves(MOCK_STORE_ITEMS);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const selectedItem = MOCK_STORE_ITEMS.find((item) => item.id === selectedItemId) ?? null;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>MY HOME BANK</Text>
          <Text style={styles.screenTitle}>アイテムショップ</Text>
        </View>
        <View accessibilityLabel={`所持ポイント ${MOCK_CURRENT_USER.balance}`} style={styles.balanceBadge}>
          <Text style={styles.balanceLabel}>所持ポイント</Text>
          <View style={styles.balanceRow}>
            <View style={styles.coin}>
              <Text style={styles.coinText}>P</Text>
            </View>
            <Text style={styles.balanceValue}>
              {MOCK_CURRENT_USER.balance.toLocaleString("ja-JP")}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.shopFrame}>
        <View style={styles.frameRivetLeft} />
        <View style={styles.frameRivetRight} />
        <ScrollView contentContainerStyle={styles.shopContent} showsVerticalScrollIndicator={false}>
          <View style={styles.shopSign}>
            <Text style={styles.shopSignText}>ITEMS</Text>
            <Text style={styles.shopSubtext}>ほしい商品をえらぼう</Text>
          </View>

          {shelves.map((items, index) => (
            <StoreShelf
              items={items}
              key={`shelf-${index}`}
              onSelectItem={(item: StoreItem) => setSelectedItemId(item.id)}
              selectedItemId={selectedItemId}
            />
          ))}

          <Text style={styles.guideText}>棚の商品をチェックしよう</Text>
        </ScrollView>
      </View>

      {selectedItem && (
        <View style={styles.detailPanel} testID="store-item-detail">
          <Pressable
            accessibilityLabel="詳細を閉じる"
            accessibilityRole="button"
            onPress={() => setSelectedItemId(null)}
            style={styles.detailCloseButton}
          >
            <Ionicons color="#fff8de" name="close" size={16} />
          </Pressable>

          <View
            accessibilityLabel={`${selectedItem.title}、${selectedItem.description}、${selectedItem.price.toLocaleString("ja-JP")}ポイント、在庫${selectedItem.stock}個`}
            accessible
            style={styles.detailContent}
          >
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="cover"
              source={{ uri: selectedItem.image_url }}
              style={styles.detailImage}
            />
            <View style={styles.detailInfo}>
              <Text style={styles.detailTitle}>{selectedItem.title}</Text>
              <Text numberOfLines={4} style={styles.detailDescription}>
                {selectedItem.description}
              </Text>
              <View style={styles.detailMetaRow}>
                <Text style={styles.detailPrice}>
                  {selectedItem.price.toLocaleString("ja-JP")} P
                </Text>
                <Text style={styles.detailStock}>在庫 {selectedItem.stock}</Text>
              </View>
            </View>
          </View>

          {/* TODO: 購入機能の実装時に、ポイント減算・在庫確認を含む購入処理を接続する。 */}
          <Pressable
            accessibilityHint="購入機能の実装後に利用できます"
            accessibilityLabel="購入する"
            accessibilityRole="button"
            disabled
            style={styles.detailPurchaseButton}
          >
            <Text style={styles.detailPurchaseButtonText}>購入する</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.footer}>
        <Pressable
          accessibilityLabel="前の画面に戻る"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && styles.footerButtonPressed]}
        >
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backButtonText}>戻る</Text>
        </Pressable>

        {/* TODO: 商品追加申請画面の実装時に、申請画面への遷移を接続する。 */}
        <Pressable
          accessibilityHint="商品追加申請機能の実装後に利用できます"
          accessibilityLabel="新しい商品の追加を申請"
          accessibilityRole="button"
          disabled
          style={styles.requestButton}
        >
          <Text style={styles.requestButtonText}>申請</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
