import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { purchaseStoreItem } from "../../lib/storeService";
import { canPurchaseItem, hasInsufficientBalance, isOutOfStock } from "../../lib/storeUtils";
import type { StoreItem } from "../../types";
import { storeStyles as styles } from "./storeStyles";

type StorePurchaseModalProps = {
  item: StoreItem | undefined;
  balance: number;
  userId: string;
  isLive: boolean;
  onClose: () => void;
  onPurchased: () => void;
};

export default function StorePurchaseModal({
  item,
  balance,
  userId,
  isLive,
  onClose,
  onPurchased,
}: StorePurchaseModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!item) return null;

  const outOfStock = isOutOfStock(item);
  const insufficientBalance = hasInsufficientBalance(item, balance);
  const canPurchase = canPurchaseItem(item, balance, isLive) && !isSubmitting;

  const handlePurchase = async () => {
    if (!canPurchase) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await purchaseStoreItem(item.id, userId);
      onPurchased();
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "購入に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{item.title}</Text>
          <Text style={styles.modalDescription}>{item.description}</Text>

          <View style={styles.modalRow}>
            <Text style={styles.modalRowLabel}>ねだん</Text>
            <Text style={styles.modalRowValue}>{item.price.toLocaleString("ja-JP")} PT</Text>
          </View>
          <View style={styles.modalRow}>
            <Text style={styles.modalRowLabel}>のこり在庫</Text>
            <Text style={styles.modalRowValue}>{item.stock.toLocaleString("ja-JP")}</Text>
          </View>
          <View style={styles.modalRow}>
            <Text style={styles.modalRowLabel}>所持ポイント</Text>
            <Text style={styles.modalRowValue}>{balance.toLocaleString("ja-JP")} PT</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canPurchase }}
            disabled={!canPurchase}
            onPress={handlePurchase}
            style={[styles.modalButton, canPurchase ? styles.modalButtonEnabled : styles.modalButtonDisabled]}
          >
            <Text
              style={[
                styles.modalButtonText,
                canPurchase ? styles.modalButtonTextEnabled : styles.modalButtonTextDisabled,
              ]}
            >
              {outOfStock ? "在庫切れ" : insufficientBalance ? "ポイント不足" : "購入する"}
            </Text>
          </Pressable>

          {errorMessage ? <Text style={styles.modalErrorText}>{errorMessage}</Text> : null}
          {!isLive ? (
            <Text style={styles.modalErrorText}>※ プレビュー中は購入できません</Text>
          ) : null}

          <Pressable accessibilityRole="button" onPress={onClose} style={styles.modalCancelButton}>
            <Text style={styles.modalCancelButtonText}>閉じる</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
