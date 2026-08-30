import { router, Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fetchUserBalance } from "../lib/storeService";
import { useStoreItems } from "../lib/useStoreItems";
import { MOCK_CURRENT_USER } from "../constants/mockData";
import { useCurrentUser } from "../store";
import StorePurchaseModal from "./store/StorePurchaseModal";
import StoreShelf from "./store/StoreShelf";
import { splitIntoShelves } from "./store/splitIntoShelves";
import { storeStyles as styles } from "./store/storeStyles";

export default function ChildStoreScreen() {
  const { items, isLive, reload } = useStoreItems();
  // ライブ接続中は実際にログイン中のユーザーを使う。プレビュー中/未ログイン時のみモックにフォールバックする
  // （フォールバック時は isLive が false になるため、実データへの書き込みには使われない）。
  const loggedInUser = useCurrentUser();
  const currentUser = loggedInUser ?? MOCK_CURRENT_USER;

  const [selectedItemId, setSelectedItemId] = useState<string>();
  // ライブ接続中の所持ポイント。購入直後に反映するため、購入完了時に再取得する。
  const [liveBalance, setLiveBalance] = useState<number | null>(null);

  const reloadBalance = useCallback(() => {
    if (!isLive) {
      setLiveBalance(null);
      return;
    }
    fetchUserBalance(currentUser.id)
      .then(setLiveBalance)
      .catch(() => {
        // 残高取得に失敗しても購入自体は行えるため、表示だけモック値にフォールバックする
        setLiveBalance(null);
      });
  }, [isLive, currentUser.id]);

  useEffect(() => {
    reloadBalance();
  }, [reloadBalance]);

  const shelves = splitIntoShelves(items);
  const selectedItem = items.find((item) => item.id === selectedItemId);
  const displayBalance = isLive && liveBalance !== null ? liveBalance : currentUser.balance;

  const handlePurchased = () => {
    setSelectedItemId(undefined);
    reload();
    reloadBalance();
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>MY HOME BANK</Text>
          <Text style={styles.screenTitle}>アイテムショップ</Text>
        </View>
        <View accessibilityLabel={`所持ポイント ${displayBalance}`} style={styles.balanceBadge}>
          <Text style={styles.balanceLabel}>所持ポイント</Text>
          <View style={styles.balanceRow}>
            <View style={styles.coin}>
              <Text style={styles.coinText}>P</Text>
            </View>
            <Text style={styles.balanceValue}>{displayBalance.toLocaleString("ja-JP")}</Text>
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

          {shelves.map((shelfItems, index) => (
            <StoreShelf items={shelfItems} key={`shelf-${index}`} onSelectItem={setSelectedItemId} />
          ))}

          <Text style={styles.guideText}>棚の商品をタップして購入しよう</Text>
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

      <StorePurchaseModal
        balance={displayBalance}
        isLive={isLive}
        item={selectedItem}
        onClose={() => setSelectedItemId(undefined)}
        onPurchased={handlePurchased}
        userId={currentUser.id}
      />
    </SafeAreaView>
  );
}
