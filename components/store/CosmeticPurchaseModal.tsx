import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { formatGol } from "../../lib/amount";
import { AUDIO_SOURCES, useSoundEffect } from "../../lib/audio";
import {
  isShopPriceChangedError,
  purchaseShopItem,
  resolveShopPurchaseErrorMessage,
} from "../../lib/shopService";
import type { ShopCatalogItem } from "../../types";
import { storeStyles as styles } from "./storeStyles";

type CosmeticPurchaseModalProps = {
  item: ShopCatalogItem;
  balance: number;
  /** 残高が最新でないかもしれないとき true。残高不足でボタンを止めず、サーバーに任せる */
  isBalanceStale: boolean;
  isLive: boolean;
  onClose: () => void;
  /** 買えたあと、閉じたときに呼ぶ（品書き・残高・持ちものの取り直し） */
  onPurchased: () => void;
  onPriceChanged: () => void;
};

/**
 * 着せ替え品・装飾品を買う確認（Issue #225）。
 *
 * 作りはストアの商品の購入（`StorePurchaseModal`）と同じ。在庫はなく、
 * 1つの品は1回だけ買える（買ったら持ちものに入る）。
 */
export default function CosmeticPurchaseModal({
  item,
  balance,
  isBalanceStale,
  isLive,
  onClose,
  onPurchased,
  onPriceChanged,
}: CosmeticPurchaseModalProps) {
  const playPurchaseSuccess = useSoundEffect(AUDIO_SOURCES.purchaseSuccess);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [purchaseSucceeded, setPurchaseSucceeded] = useState(false);
  // 応答が届かずにもう一度押したときも同じキーで送り、二重に払わないようにする
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setErrorMessage(null);
    setPurchaseSucceeded(false);
    idempotencyKeyRef.current = null;
  }, [item.id]);

  const insufficientBalance = !isBalanceStale && balance < item.sale_price;
  const canPurchase = isLive && !item.owned && !insufficientBalance && !isSubmitting;

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
          "shop-purchase",
          item.id,
          Date.now().toString(36),
          Math.random().toString(36).slice(2),
        ].join(":");
      }
      await purchaseShopItem(item.id, idempotencyKeyRef.current, item.sale_price);
      setPurchaseSucceeded(true);
      void playPurchaseSuccess();
    } catch (e) {
      if (isShopPriceChangedError(e)) onPriceChanged();
      setErrorMessage(resolveShopPurchaseErrorMessage(e));
    } finally {
      setIsSubmitting(false);
    }
  };

  const where = item.kind === "wearable" ? "きがえで つけられるよ" : "まちに なんこでも かざれるよ";

  return (
    <Modal animationType="fade" onRequestClose={handleClose} transparent visible>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{item.title}</Text>
          <Text style={styles.modalDescription}>{where}</Text>

          {purchaseSucceeded ? (
            <Text style={styles.modalSuccessText}>{item.title}を てにいれた！</Text>
          ) : (
            <>
              <View style={styles.modalRow}>
                <Text style={styles.modalRowLabel}>ねだん</Text>
                <Text style={styles.modalRowValue}>{formatGol(item.sale_price)}</Text>
              </View>
              <View style={styles.modalRow}>
                <Text style={styles.modalRowLabel}>所持ゴル</Text>
                <Text style={styles.modalRowValue}>{formatGol(balance)}</Text>
              </View>

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
                  {item.owned ? "もっています" : insufficientBalance ? "ゴル不足" : "購入する"}
                </Text>
              </Pressable>

              {errorMessage ? <Text style={styles.modalErrorText}>{errorMessage}</Text> : null}
              {!isLive ? <Text style={styles.modalErrorText}>※ プレビュー中は購入できません</Text> : null}
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
