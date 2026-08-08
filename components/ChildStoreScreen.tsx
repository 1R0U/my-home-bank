import { router, Stack } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MOCK_CURRENT_USER, MOCK_STORE_ITEMS } from "../constants/mockData";
import StoreShelf from "./store/StoreShelf";
import { splitIntoShelves } from "./store/splitIntoShelves";
import { storeStyles as styles } from "./store/storeStyles";

export default function ChildStoreScreen() {
  const shelves = splitIntoShelves(MOCK_STORE_ITEMS);

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
            <StoreShelf items={items} key={`shelf-${index}`} />
          ))}

          <Text style={styles.guideText}>棚の商品をチェックしよう</Text>
        </ScrollView>
      </View>

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
