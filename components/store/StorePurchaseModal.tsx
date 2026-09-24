import { useEffect, useRef, useState } from "react";
import { Image, Modal, Pressable, Text, View } from "react-native";
import { purchaseStoreItem } from "../../lib/storeService";
import {
  canPurchaseItem,
  hasInsufficientBalance,
  isOutOfStock,
  resolvePurchaseErrorMessage,
  UNLIMITED_STOCK,
} from "../../lib/storeUtils";
import type { StoreItem } from "../../types";
import { storeStyles as styles } from "./storeStyles";
import { AMOUNT_UNITS, formatAmount, formatAmountWithUnit } from "../../lib/amount";

type StorePurchaseModalProps = {
  item: StoreItem | undefined;
  balance: number;
  // 残高取得に失敗し、balance がフォールバック値（最新でない可能性がある値）の場合 true。
  // true の間はクライアント側の残高不足判定でボタンを無効化しない（サーバー側に最終判定を委ねる）。
  isBalanceStale: boolean;
  userId: string;
  isLive: boolean;
  onClose: () => void;
  onPurchased: () => void;
};

export default function StorePurchaseModal({
  item,
  balance,
  isBalanceStale,
  userId,
  isLive,
  onClose,
  onPurchased,
}: StorePurchaseModalProps) {
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

  const outOfStock = isOutOfStock(item);
  const insufficientBalance = hasInsufficientBalance(item, balance);
  const canPurchase =
    canPurchaseItem(item, balance, isLive, { ignoreInsufficientBalance: isBalanceStale }) &&
    !isSubmitting;

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
      await purchaseStoreItem(item.id, userId, idempotencyKeyRef.current);
      setPurchaseSucceeded(true);
    } catch (e) {
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
          {item.image_url ? (
            <Image
              accessibilityIgnoresInvertColors
              resizeMode="cover"
              source={{ uri: item.image_url }}
              style={styles.modalImage}
            />
          ) : null}
          <Text style={styles.modalTitle}>{item.title}</Text>
          <Text style={styles.modalDescription}>{item.description}</Text>

          {purchaseSucceeded ? null : (
            <>
              <View style={styles.modalRow}>
                <Text style={styles.modalRowLabel}>ねだん</Text>
                <Text style={styles.modalRowValue}>{formatAmountWithUnit(item.price, AMOUNT_UNITS.p)}</Text>
              </View>
              <View style={styles.modalRow}>
                <Text style={styles.modalRowLabel}>のこり在庫</Text>
                <Text style={styles.modalRowValue}>
                  {item.stock >= UNLIMITED_STOCK ? "無制限" : formatAmount(item.stock)}
                </Text>
              </View>
              <View style={styles.modalRow}>
                <Text style={styles.modalRowLabel}>所持ポイント</Text>
                <Text style={styles.modalRowValue}>{formatAmountWithUnit(balance, AMOUNT_UNITS.p)}</Text>
              </View>
            </>
          )}

          {purchaseSucceeded ? (
            <Text style={styles.modalSuccessText}>{item.title}を こうにゅうしました！</Text>
          ) : (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canPurchase }}
                disabled={!canPurchase}
                onPress={handlePurchase}
                style={[
                  styles.modalButton,
                  canPurchase ? styles.modalButtonEnabled : styles.modalButtonDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.modalButtonText,
                    canPurchase ? styles.modalButtonTextEnabled : styles.modalButtonTextDisabled,
                  ]}
                >
                  {outOfStock
                    ? "在庫切れ"
                    : insufficientBalance && !isBalanceStale
                      ? "ポイント不足"
                      : "購入する"}
                </Text>
              </Pressable>

              {errorMessage ? <Text style={styles.modalErrorText}>{errorMessage}</Text> : null}
              {!isLive ? (
                <Text style={styles.modalErrorText}>※ プレビュー中は購入できません</Text>
              ) : null}
              {isBalanceStale ? (
                <Text style={styles.modalErrorText}>※ 残高が最新でない可能性があります</Text>
              ) : null}
            </>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: isSubmitting }}
            disabled={isSubmitting}
            onPress={handleClose}
            style={styles.modalCancelButton}
          >
            <Text style={styles.modalCancelButtonText}>閉じる</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
