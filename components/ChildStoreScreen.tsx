import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GOL_COIN_MARK, GOL_UNIT, formatAmount, formatGolForSpeech } from "../lib/amount";
import { AUDIO_SOURCES, playSoundEffect, useLoopingAudio } from "../lib/audio";
import { useLiveBalance } from "../lib/useLiveBalance";
import { useStoreItems } from "../lib/useStoreItems";
import { useTravelArrival } from "../lib/useTravelArrival";
import { describeChildPriceIndex } from "../lib/storePricing";
import { stripFurigana } from "../lib/furigana";
import { useDataAccess, useDisplayUser } from "../store";
import type { StoreItem } from "../types";
import { splitIntoShelves } from "./store/splitIntoShelves";
import StorePurchaseModal from "./store/StorePurchaseModal";
import { StoreShelfScene } from "./store/StoreShelfScene";
import { CHILD_THEME } from "./childTheme";
import Furigana from "./Furigana";
import { storeStyles as styles } from "./store/storeStyles";
import StoreCategoryTabs, { type StoreCategory } from "./store/StoreCategoryTabs";
import { getStoreAssetKind } from "../lib/storeAssets";
import { getStoreItemPhoto } from "../lib/storeItemPhoto";
import TutorialPressable from "./tutorial/TutorialPressable";

export default function ChildStoreScreen() {
  // 一覧取得はユーザーのIDを使わないため、ログインしているかどうかだけで判定する
  // （lib/useStoreItems.ts の説明を参照）。
  const { items, priceIndex, isLive, reload, error, loading } = useStoreItems({ indexed: true });
  // 我が家タウンから入ってきたときは、読み込み中の間「いどうちゅう」の画面を出しておく（Issue #261）
  useTravelArrival(!(loading && items.length === 0));
  const currentUser = useDisplayUser("child");
  // 残高取得・購入はユーザーのIDを使うため、UUID形式かどうかまで見る
  // canUseRealData で判定する（ChildTasksScreen.tsx と同じ形）。
  const { canUseRealData } = useDataAccess();

  // ストア画面のBGM（Issue #393）。画面を開いている間だけ流す。
  const { start: startBgm, stop: stopBgm } = useLoopingAudio(AUDIO_SOURCES.storeBgm);
  useFocusEffect(
    useCallback(() => {
      void startBgm();
      return stopBgm;
    }, [startBgm, stopBgm]),
  );

  // 所持ゴルは、購入でDB側の残高が変わっても画面に反映されるよう取り直す。
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

  const [category, setCategory] = useState<StoreCategory>("normal");
  const visibleItems = items.filter((item) => (getStoreAssetKind(item.asset_id) ?? "normal") === category);
  const shelves = splitIntoShelves(visibleItems);
  const selectedItem = items.find((item) => item.id === selectedItemId);
  const selectedItemPhoto = getStoreItemPhoto(selectedItem);
  const displayBalance = liveBalance ?? currentUser.balance;
  const handleSelectItem = useCallback((item: StoreItem) => {
    playSoundEffect("confirm");
    setSelectedItemId(item.id);
  }, []);

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
        <View accessible accessibilityLabel={`所持額 ${formatGolForSpeech(displayBalance)}`} style={styles.balanceBadge}>
          <Furigana noWrap style={styles.balanceLabel}>{"{所持|しょじ}ゴル"}</Furigana>
          <View style={styles.balanceRow}>
            <View style={styles.coin}>
              <Text style={styles.coinText}>{GOL_COIN_MARK}</Text>
            </View>
            <Text style={styles.balanceValue}>{formatAmount(displayBalance)}</Text>
          </View>
        </View>
      </View>

      <StoreCategoryTabs value={category} onChange={(value) => {
        setCategory(value);
        setSelectedItemId(null);
        setIsPurchaseModalOpen(false);
      }} />

      <View style={styles.shopFrame}>
        <View style={styles.frameRivetLeft} />
        <View style={styles.frameRivetRight} />
        {/*
          詳細パネル表示中は、Androidで背後の棚（アクセシブルボタンを含む）を
          TalkBackのフォーカス対象から除外する。iOS側は下の detailPanel に付けた
          accessibilityViewIsModal で、VoiceOverが自動的にこのsibling要素を無視する
          （accessibilityViewIsModal はiOSのみ有効なため、Androidはこちらで明示する）。
        */}
        <View
          importantForAccessibility={selectedItem ? "no-hide-descendants" : "auto"}
          style={styles.shopContent}
        >
          <View style={styles.shopSign}>
            <Text style={styles.shopSignText}>ITEMS</Text>
            <Furigana style={styles.shopSubtext}>{"ほしい{商品|しょうひん}をえらぼう"}</Furigana>
          </View>

          {!error && (!loading || items.length > 0) ? (
            <View accessible accessibilityLabel={`いまの物価指数 ${priceIndex}、${stripFurigana(describeChildPriceIndex(priceIndex))}`} style={styles.priceIndexBadge}>
              <Text style={styles.priceIndexLabel}>いまの ものか</Text>
              <Furigana style={styles.priceIndexValue}>
                {`${describeChildPriceIndex(priceIndex)}・{指数|しすう} ${priceIndex}`}
              </Furigana>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorState}>
              {/* 大人用のストアと同じ取得処理の文言ではなく、ふりがな付きの文言を出す（Issue #347） */}
              <Furigana style={styles.errorStateText}>{"アイテムの{取得|しゅとく}に{失敗|しっぱい}しました"}</Furigana>
              <Pressable
                accessibilityLabel="アイテムの取得を再試行"
                accessibilityRole="button"
                onPress={reload}
                style={({ pressed }) => [styles.errorRetryButton, pressed && styles.footerButtonPressed]}
              >
                <Furigana noWrap style={styles.errorRetryButtonText}>{"{再試行|さいしこう}"}</Furigana>
              </Pressable>
            </View>
          ) : loading && items.length === 0 ? null : visibleItems.length === 0 ? (
            <View style={styles.emptyState}>
              <Furigana style={styles.emptyStateText}>{"いまはならんでいる{商品|しょうひん}がありません"}</Furigana>
            </View>
          ) : (
            <View style={styles.shopScene}>
              <StoreShelfScene
                onSelectItem={handleSelectItem}
                selectedItemId={selectedItemId}
                shelves={shelves}
              />
            </View>
          )}

          <Furigana style={styles.guideText}>{"{棚|たな}の{商品|しょうひん}をタップして{詳|くわ}しく{見|み}よう"}</Furigana>
        </View>

        {selectedItem && !isPurchaseModalOpen && (
          // accessibilityViewIsModal（iOS）で、詳細パネル表示中はVoiceOverが
          // 背後の棚（StoreShelfScene側のアクセシブルボタン）を無視するようにする
          // （Android側は上の shopContent が importantForAccessibility で自身を除外する）。
          <View accessibilityViewIsModal style={styles.detailPanel} testID="store-item-detail">
            <Pressable
              accessibilityLabel="詳細を閉じる"
              accessibilityRole="button"
              onPress={() => {
                playSoundEffect("cancel");
                setSelectedItemId(null);
              }}
              style={styles.detailCloseButton}
            >
              <Ionicons color={CHILD_THEME.parchment} name="close" size={16} />
            </Pressable>

            <View
              accessibilityLabel={`${selectedItem.title}、${selectedItem.description}、${formatGolForSpeech(selectedItem.sale_price)}、在庫${selectedItem.stock}個`}
              accessible
              style={styles.detailContent}
            >
              {selectedItemPhoto && (
                <Image
                  accessibilityIgnoresInvertColors
                  accessibilityLabel={`${selectedItem.title}の商品写真`}
                  resizeMode="cover"
                  source={selectedItemPhoto}
                  style={styles.detailImage}
                />
              )}
              <View style={styles.detailInfo}>
                <Text style={styles.detailTitle}>{selectedItem.title}</Text>
                <Text numberOfLines={4} style={styles.detailDescription}>
                  {selectedItem.description}
                </Text>
                <View style={styles.detailMetaRow}>
                  <Text style={styles.detailPrice}>
                    {formatAmount(selectedItem.sale_price)} {GOL_UNIT}
                  </Text>
                  <Furigana noWrap style={styles.detailStock}>{`{在庫|ざいこ} ${selectedItem.stock}`}</Furigana>
                </View>
                {selectedItem.sale_price < selectedItem.base_price ? (
                  <Furigana style={styles.detailBasePrice}>
                    {`いつもの{価格|かかく} ${formatAmount(selectedItem.base_price)} ${GOL_UNIT}`}
                  </Furigana>
                ) : selectedItem.sale_price > selectedItem.base_price ? (
                  <Text style={styles.detailPriceIncrease}>
                    いつもより +{formatAmount(selectedItem.sale_price - selectedItem.base_price)} {GOL_UNIT}
                  </Text>
                ) : null}
              </View>
            </View>

            <Pressable
              accessibilityLabel="購入する"
              accessibilityRole="button"
              onPress={() => {
                playSoundEffect("confirm");
                setIsPurchaseModalOpen(true);
              }}
              style={styles.detailPurchaseButton}
            >
              <Furigana noWrap style={styles.detailPurchaseButtonText}>{"{購入|こうにゅう}する"}</Furigana>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <TutorialPressable tutorialId="child-store-back"
          accessibilityLabel="前の画面に戻る"
          accessibilityRole="button"
          onPress={() => {
            playSoundEffect("cancel");
            router.back();
          }}
          style={({ pressed }) => [styles.backButton, pressed && styles.footerButtonPressed]}
        >
          <Text style={styles.backArrow}>‹</Text>
          <Furigana noWrap style={styles.backButtonText}>{"{戻|もど}る"}</Furigana>
        </TutorialPressable>

        <Pressable
          accessibilityLabel="新しい商品の追加を申請"
          accessibilityRole="button"
          onPress={() => {
            playSoundEffect("confirm");
            router.push("/store-item-request");
          }}
          style={({ pressed }) => [styles.requestFooterButton, pressed && styles.footerButtonPressed]}
        >
          <Ionicons color={CHILD_THEME.gold} name="add-circle" size={20} />
          <Furigana noWrap style={styles.requestFooterButtonText}>{"{商品|しょうひん}{追加|ついか}を{申請|しんせい}"}</Furigana>
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
          onPriceChanged={reload}
          userId={currentUser.id}
        />
      )}
    </SafeAreaView>
  );
}
