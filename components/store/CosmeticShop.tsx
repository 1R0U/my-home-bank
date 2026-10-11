import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { formatGol, formatGolForSpeech } from "../../lib/amount";
import { useDataAccess } from "../../store";
import { useShopCatalog } from "../../lib/useShopCatalog";
import { useWardrobe } from "../../lib/useWardrobe";
import type { ShopItemKind } from "../../types";
import { CHILD_THEME } from "../childTheme";
import CosmeticPurchaseModal from "./CosmeticPurchaseModal";
import { cosmeticStyles } from "./cosmeticStyles";
import { storeStyles as styles } from "./storeStyles";

type CosmeticShopProps = {
  balance: number;
  isBalanceStale: boolean;
  /** 買えたあとに所持ゴルを取り直す */
  onPurchased: () => void;
};

const SECTIONS: { kind: ShopItemKind; title: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { icon: "shirt", kind: "wearable", title: "きせかえ" },
  { icon: "leaf", kind: "decoration", title: "かざり" },
];

/**
 * 子供用ストアの「きせかえ・かざり」の棚（Issue #225）。
 *
 * 買う品だけを並べる（最初から持っている品は出さない）。もう持っている品は
 * 「もっている」と出して、押せないようにする。装飾は1度買えば何個でも置ける。
 */
export default function CosmeticShop({ balance, isBalanceStale, onPurchased }: CosmeticShopProps) {
  const { items, error, loading, reload } = useShopCatalog();
  const { canUseRealData } = useDataAccess();
  // 買った品を、町（かざる）と更衣室の持ちものへすぐ反映するため、持ちものを取り直す
  const { reload: reloadWardrobe } = useWardrobe();
  // 選んだ品はIDで持ち、表示は取り直した品書きから引く。価格が変わって断られたとき、
  // 開いたままの確認に新しい価格を出すため（StorePurchaseModal と同じ考え方）
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  const handlePurchased = () => {
    setSelectedId(null);
    void reload();
    void reloadWardrobe();
    onPurchased();
  };

  if (error) {
    return (
      <View style={styles.errorState}>
        <Text style={styles.errorStateText}>{error}</Text>
        <Pressable
          accessibilityLabel="きせかえ・かざりの取得を再試行"
          accessibilityRole="button"
          onPress={reload}
          style={({ pressed }) => [styles.errorRetryButton, pressed && styles.footerButtonPressed]}
        >
          <Text style={styles.errorRetryButtonText}>再試行</Text>
        </Pressable>
      </View>
    );
  }

  if (loading && items.length === 0) return null;

  if (items.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>いまはならんでいる品がありません</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={cosmeticStyles.scrollContent} style={cosmeticStyles.scroll}>
        {SECTIONS.map((section) => {
          const sectionItems = items.filter((item) => item.kind === section.kind);
          if (sectionItems.length === 0) return null;
          return (
            <View key={section.kind}>
              <Text accessibilityRole="header" style={cosmeticStyles.sectionTitle}>
                {section.title}
              </Text>
              <View style={cosmeticStyles.grid}>
                {sectionItems.map((item) => (
                  <Pressable
                    accessibilityLabel={
                      item.owned
                        ? `${item.title}、もっています`
                        : `${item.title}、${formatGolForSpeech(item.sale_price)}`
                    }
                    accessibilityRole="button"
                    accessibilityState={{ disabled: item.owned }}
                    disabled={item.owned}
                    key={item.id}
                    onPress={() => setSelectedId(item.id)}
                    style={({ pressed }) => [
                      cosmeticStyles.card,
                      item.owned && cosmeticStyles.cardOwned,
                      pressed && cosmeticStyles.cardPressed,
                    ]}
                    testID={`cosmetic-item-${item.asset_id}`}
                  >
                    <Ionicons color={CHILD_THEME.gold} name={section.icon} size={28} />
                    <Text numberOfLines={2} style={cosmeticStyles.cardTitle}>
                      {item.title}
                    </Text>
                    {item.owned ? (
                      <Text style={cosmeticStyles.ownedBadge}>もっている</Text>
                    ) : (
                      <Text style={cosmeticStyles.cardPrice}>{formatGol(item.sale_price)}</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
        <Text style={cosmeticStyles.note}>かざりは 1回かえば なんこでも おけるよ</Text>
      </ScrollView>

      {selected ? (
        <CosmeticPurchaseModal
          balance={balance}
          isBalanceStale={isBalanceStale}
          isLive={canUseRealData}
          item={selected}
          onClose={() => setSelectedId(null)}
          onPriceChanged={() => void reload()}
          onPurchased={handlePurchased}
        />
      ) : null}
    </>
  );
}
