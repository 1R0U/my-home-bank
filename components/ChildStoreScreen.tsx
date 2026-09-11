import { router, Stack } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStoreItems } from "../lib/useStoreItems";
import { createStaleGuard } from "../lib/staleGuard";
import { fetchUserBalance } from "../lib/userService";
import { MOCK_CURRENT_USER } from "../constants/mockData";
import { useCurrentUser } from "../store";
import StorePurchaseModal from "./store/StorePurchaseModal";
import StoreShelf from "./store/StoreShelf";
import { splitIntoShelves } from "./store/splitIntoShelves";
import { storeStyles as styles } from "./store/storeStyles";

export default function ChildStoreScreen() {
  const { items, isLive, reload, error, loading } = useStoreItems();
  // ライブ接続中は実際にログイン中のユーザーを使う。プレビュー中/未ログイン時のみモックにフォールバックする
  // （フォールバック時は isLive が false になるため、実データへの書き込みには使われない）。
  const loggedInUser = useCurrentUser();
  const currentUser = loggedInUser ?? MOCK_CURRENT_USER;

  const [selectedItemId, setSelectedItemId] = useState<string>();
  // ライブ接続中の所持ポイント。購入直後に反映するため、購入完了時に再取得する。
  const [liveBalance, setLiveBalance] = useState<number | null>(null);
  // 残高取得に失敗し、フォールバック値（ログイン時点のスナップショット）を表示中かどうか。
  // この場合クライアント側の残高は最新でない可能性があるため、購入ボタンの
  // 残高不足による無効化はせず警告表示に留める（最終判定はサーバー側に委ねる）。
  const [isBalanceStale, setIsBalanceStale] = useState(false);
  // 初回表示・currentUser.id変更時・購入完了時など連続して再取得した場合に、
  // 先に開始したリクエストが後から完了して新しい状態を古い値で上書きしないよう、
  // staleGuard で最新のリクエストのみ反映する。
  const balanceGuardRef = useRef(createStaleGuard());

  const reloadBalance = useCallback(() => {
    const requestId = balanceGuardRef.current.start();

    if (!isLive) {
      if (balanceGuardRef.current.isCurrent(requestId)) {
        setLiveBalance(null);
        setIsBalanceStale(false);
      }
      return;
    }
    fetchUserBalance(currentUser.id)
      .then((balance) => {
        if (balanceGuardRef.current.isCurrent(requestId)) {
          setLiveBalance(balance);
          setIsBalanceStale(false);
        }
      })
      .catch(() => {
        // 残高取得に失敗しても購入自体は行えるため、表示だけモック値にフォールバックする
        if (balanceGuardRef.current.isCurrent(requestId)) {
          setLiveBalance(null);
          setIsBalanceStale(true);
        }
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

          {error ? (
            <View style={styles.errorState}>
              <Text style={styles.errorStateText}>{error}</Text>
              <Pressable
                accessibilityLabel="アイテムの取得を再試行"
                accessibilityRole="button"
                onPress={reload}
                style={({ pressed }) => [styles.errorRetryButton, pressed && styles.footerButtonPressed]}
              >
                <Text style={styles.errorRetryButtonText}>再試行</Text>
              </Pressable>
            </View>
          ) : loading && items.length === 0 ? null : (
            shelves.map((shelfItems, index) => (
              <StoreShelf items={shelfItems} key={`shelf-${index}`} onSelectItem={setSelectedItemId} />
            ))
          )}

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

        <Pressable
          accessibilityLabel="新しい商品の追加を申請"
          accessibilityRole="button"
          onPress={() => router.push("/store-item-request")}
          style={({ pressed }) => [styles.requestButton, pressed && styles.footerButtonPressed]}
        >
          <Text style={styles.requestButtonText}>申請</Text>
        </Pressable>
      </View>

      <StorePurchaseModal
        balance={displayBalance}
        isBalanceStale={isLive && isBalanceStale}
        isLive={isLive}
        item={selectedItem}
        onClose={() => setSelectedItemId(undefined)}
        onPurchased={handlePurchased}
        userId={currentUser.id}
      />
    </SafeAreaView>
  );
}
