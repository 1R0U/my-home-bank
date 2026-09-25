import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStoreItems } from "../lib/useStoreItems";
import { useLiveBalance } from "../lib/useLiveBalance";
import { useDataAccess, useDisplayUser } from "../store";
import type { StoreItem } from "../types";
import StorePurchaseModal from "./store/StorePurchaseModal";
import StoreShelf from "./store/StoreShelf";
import { splitIntoShelves } from "./store/splitIntoShelves";
import { storeStyles as styles } from "./store/storeStyles";
import { AMOUNT_UNITS, formatAmount, formatAmountWithUnit } from "../lib/amount";

export default function ChildStoreScreen() {
  // 一覧取得はユーザーのIDを使わないため、ログインしているかどうかだけで判定する
  // （lib/useStoreItems.ts の説明を参照）。
  const { items, isLive, reload, error, loading } = useStoreItems();
  const currentUser = useDisplayUser("child");
  // 残高取得・購入はユーザーのIDを使うため、UUID形式かどうかまで見る
  // canUseRealData で判定する（ChildTasksScreen.tsx と同じ形）。
  const { canUseRealData } = useDataAccess();

  // 所持ポイントは、購入でDB側の残高が変わっても画面に反映されるよう取り直す。
  // 古い応答での上書きと、ユーザー切替直後に前のユーザーの残高を見せてしまう問題は
  // useLiveBalance が引き受ける（Issue #147）。
  const {
    balance: liveBalance,
    hasError: isBalanceStale,
    reload: reloadBalance,
  } = useLiveBalance(currentUser.id, isLive);

  // 選択中アイテムは詳細パネル表示にも使うため string | null（未選択の初期値をnullで明示する）。
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  // 詳細パネルの購入ボタンから、実際の購入モーダルを開くかどうか。
  // 選択（詳細パネル表示）と購入モーダルを開く操作を分けることで、
  // 商品を眺めるだけの操作では確認モーダルが出ないようにする。
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);

  const shelves = splitIntoShelves(items);
  const selectedItem = items.find((item) => item.id === selectedItemId);
  const displayBalance = liveBalance ?? currentUser.balance;
  const handleSelectItem = useCallback((item: StoreItem) => setSelectedItemId(item.id), []);

  const handlePurchased = () => {
    setIsPurchaseModalOpen(false);
    setSelectedItemId(null);
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
            <Text style={styles.balanceValue}>{formatAmount(displayBalance)}</Text>
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
          ) : loading && items.length === 0 ? null : items.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>いまはならんでいる商品がありません</Text>
            </View>
          ) : (
            shelves.map((shelfItems, index) => (
              <StoreShelf
                items={shelfItems}
                key={`shelf-${index}`}
                onSelectItem={handleSelectItem}
                selectedItemId={selectedItemId}
              />
            ))
          )}

          <Text style={styles.guideText}>棚の商品をタップして詳しく見よう</Text>
        </ScrollView>
      </View>

      {selectedItem && !isPurchaseModalOpen && (
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
            accessibilityLabel={`${selectedItem.title}、${selectedItem.description}、${formatAmountWithUnit(selectedItem.price, AMOUNT_UNITS.spoken)}、在庫${selectedItem.stock}個`}
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
                  {formatAmount(selectedItem.price)} {AMOUNT_UNITS.p}
                </Text>
                <Text style={styles.detailStock}>在庫 {selectedItem.stock}</Text>
              </View>
            </View>
          </View>

          <Pressable
            accessibilityLabel="購入する"
            accessibilityRole="button"
            onPress={() => setIsPurchaseModalOpen(true)}
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

        <Pressable
          accessibilityLabel="新しい商品の追加を申請"
          accessibilityRole="button"
          onPress={() => router.push("/store-item-request")}
          style={({ pressed }) => [styles.requestButton, pressed && styles.footerButtonPressed]}
        >
          <Text style={styles.requestButtonText}>申請</Text>
        </Pressable>
      </View>

      {isPurchaseModalOpen && (
        <StorePurchaseModal
          balance={displayBalance}
          isBalanceStale={isBalanceStale}
          isLive={canUseRealData}
          item={selectedItem}
          onClose={() => setIsPurchaseModalOpen(false)}
          onPurchased={handlePurchased}
          userId={currentUser.id}
        />
      )}
    </SafeAreaView>
  );
}
