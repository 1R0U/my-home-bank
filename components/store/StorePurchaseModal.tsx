import { useEffect, useRef, useState } from "react";
import { Image, Modal, Pressable, Text, View } from "react-native";
import { purchaseStoreItem } from "../../lib/storeService";
import {
  canPurchaseItem,
  hasInsufficientBalance,
  isOutOfStock,
  isWearableAlreadyOwned,
  isStorePriceChangedError,
  resolvePurchaseErrorMessage,
  UNLIMITED_STOCK,
} from "../../lib/storeUtils";
import type { PricedStoreItem, StoreItem } from "../../types";
import { getStoreAssetKind } from "../../lib/storeAssets";
import { stripFurigana } from "../../lib/furigana";
import Furigana from "../Furigana";
import { storeStyles as styles } from "./storeStyles";
import { formatAmount, formatGol } from "../../lib/amount";
import { AUDIO_SOURCES, playSoundEffect, useSoundEffect } from "../../lib/audio";
import { getStoreItemDisplayPrice } from "../../lib/storePricing";
import { getStoreItemPhoto } from "../../lib/storeItemPhoto";

type StorePurchaseModalProps = {
  item: (StoreItem & Partial<PricedStoreItem>) | undefined;
  balance: number;
  // 残高取得に失敗し、balance がフォールバック値（最新でない可能性がある値）の場合 true。
  // true の間はクライアント側の残高不足判定でボタンを無効化しない（サーバー側に最終判定を委ねる）。
  isBalanceStale: boolean;
  userId: string;
  isLive: boolean;
  onClose: () => void;
  onPurchased: () => void;
  onPriceChanged: () => void;
};

export default function StorePurchaseModal({
  item,
  balance,
  isBalanceStale,
  userId,
  isLive,
  onClose,
  onPurchased,
  onPriceChanged,
}: StorePurchaseModalProps) {
  const playPurchaseSuccess = useSoundEffect(AUDIO_SOURCES.purchaseSuccess);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // 購入が成功したかどうか。成功直後にモーダルを閉じてしまうと「買えたのか」が
  // 子供に伝わらないため、いったん成功表示に留めて、閉じる操作をした時点で
  // onPurchased（再取得・残高更新・モーダルクローズ）を実行する。
  const [purchaseSucceeded, setPurchaseSucceeded] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  // 表示対象のアイテムが変わったら、前のアイテムのエラー表示・成功表示を引き継がない。
  // （送信中はモーダルを閉じられないため、アイテムが変わるのは送信中でないときだけ）
  useEffect(() => {
    setErrorMessage(null);
    setPurchaseSucceeded(false);
    idempotencyKeyRef.current = null;
  }, [item?.id]);

  if (!item) return null;

  const salePrice = getStoreItemDisplayPrice(item);
  const photo = getStoreItemPhoto(item);
  const outOfStock = isOutOfStock(item);
  const alreadyOwned = isWearableAlreadyOwned(item);
  const insufficientBalance = hasInsufficientBalance(item, balance);
  const canPurchase =
    canPurchaseItem(item, balance, isLive, { ignoreInsufficientBalance: isBalanceStale }) &&
    !isSubmitting;
  const purchaseButtonLabel = alreadyOwned
    ? "{持|も}っています"
    : outOfStock
      ? "{在庫切|ざいこぎ}れ"
      : insufficientBalance && !isBalanceStale
        ? "ゴル{不足|ぶそく}"
        : "{購入|こうにゅう}する";

  // 送信中はモーダルを閉じさせない
  // （閉じた後に別アイテムを選び直せてしまうと、先に開始した購入処理の完了時に
  // 意図せず新しいアイテムのモーダルまで閉じてしまうため）。
  // 購入成功後は、閉じる操作（戻る操作含む）をそのまま
  // onPurchased（再取得・残高更新）のトリガーとして扱う。
  const handleClose = () => {
    if (isSubmitting) return;
    if (purchaseSucceeded) {
      onPurchased();
      return;
    }
    playSoundEffect("cancel");
    onClose();
  };

  const handlePurchase = async () => {
    if (!canPurchase) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = [
          "store-purchase",
          userId,
          item.id,
          Date.now().toString(36),
          Math.random().toString(36).slice(2),
        ].join(":");
      }
      await purchaseStoreItem(item.id, userId, idempotencyKeyRef.current, salePrice);
      setPurchaseSucceeded(true);
      void playPurchaseSuccess();
    } catch (e) {
      if (isStorePriceChangedError(e)) {
        onPriceChanged();
      }
      // 残高がフォールバック値の間は、クライアント側の残高不足判定を信用せず、
      // サーバー側のエラーメッセージだけで判定する。
      setErrorMessage(
        resolvePurchaseErrorMessage(e, {
          outOfStock,
          insufficientBalance: isBalanceStale ? false : insufficientBalance,
        }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal animationType="fade" onRequestClose={handleClose} transparent visible>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          {photo ? (
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="cover"
              source={photo}
              style={styles.modalImage}
            />
          ) : null}
          <Text style={styles.modalTitle}>{item.title}</Text>
          <Text style={styles.modalDescription}>{item.description}</Text>

          {purchaseSucceeded ? null : (
            <>
              <View style={styles.modalRow}>
                <Text style={styles.modalRowLabel}>ねだん</Text>
                <Text style={styles.modalRowValue}>{formatGol(salePrice)}</Text>
              </View>
              <View style={styles.modalRow}>
                <Furigana noWrap style={styles.modalRowLabel}>{"のこり{在庫|ざいこ}"}</Furigana>
                <Furigana noWrap style={styles.modalRowValue}>
                  {item.stock >= UNLIMITED_STOCK ? "{無制限|むせいげん}" : formatAmount(item.stock)}
                </Furigana>
              </View>
              <View style={styles.modalRow}>
                <Furigana noWrap style={styles.modalRowLabel}>{"{所持|しょじ}ゴル"}</Furigana>
                <Text style={styles.modalRowValue}>{formatGol(balance)}</Text>
              </View>
            </>
          )}

          {purchaseSucceeded ? (
            <Furigana style={styles.modalSuccessText}>
              {`${item.title}を こうにゅうしました！${
                getStoreAssetKind(item.asset_id) === "wearable"
                  ? " きがえで{使|つか}えるよ"
                  : getStoreAssetKind(item.asset_id) === "decoration"
                    ? " かざるで{使|つか}えるよ"
                    : ""
              }`}
            </Furigana>
          ) : (
            <>
              <Pressable
                // 名前を中の文字から組み立てると、ふりがなまで読まれるため明示する（Issue #347）
                accessibilityLabel={stripFurigana(purchaseButtonLabel)}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canPurchase }}
                disabled={!canPurchase}
                onPress={handlePurchase}
                style={[
                  styles.modalButton,
                  canPurchase ? styles.modalButtonEnabled : styles.modalButtonDisabled,
                ]}
              >
                <Furigana noWrap
                  style={[
                    styles.modalButtonText,
                    canPurchase ? styles.modalButtonTextEnabled : styles.modalButtonTextDisabled,
                  ]}
                >
                  {purchaseButtonLabel}
                </Furigana>
              </Pressable>

              {errorMessage ? <Furigana style={styles.modalErrorText}>{errorMessage}</Furigana> : null}
              {!isLive ? (
                <Furigana style={styles.modalErrorText}>{"※ プレビュー{中|ちゅう}は{購入|こうにゅう}できません"}</Furigana>
              ) : null}
              {isBalanceStale ? (
                <Furigana style={styles.modalErrorText}>
                  {"※ {残高|ざんだか}が{最新|さいしん}でない{可能性|かのうせい}があります"}
                </Furigana>
              ) : null}
            </>
          )}

          <Pressable
            accessibilityLabel="閉じる"
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting }}
            disabled={isSubmitting}
            onPress={handleClose}
            style={styles.modalCancelButton}
          >
            <Furigana noWrap style={styles.modalCancelButtonText}>{"{閉|と}じる"}</Furigana>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
