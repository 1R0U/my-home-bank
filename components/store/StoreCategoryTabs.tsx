import { Pressable, StyleSheet, View } from "react-native";
import { CHILD_THEME } from "../childTheme";
import { getStoreAssetKind, isFurnitureAsset } from "../../lib/storeAssets";
import { stripFurigana } from "../../lib/furigana";
import Furigana from "../Furigana";

/** 棚の種類。家の中の家具・壁紙・床板は1つの棚（かぐ）にまとめる（Issue #480） */
export type StoreCategory = "normal" | "wearable" | "decoration" | "furniture";
// label は `{漢字|よみ}` のふりがな付き（components/Furigana.tsx、Issue #347）
const TABS: { id: StoreCategory; label: string }[] = [
  { id: "normal", label: "ごほうび" }, { id: "wearable", label: "きがえ" }, { id: "decoration", label: "かざり" },
  { id: "furniture", label: "かぐ" },
];

/**
 * 商品を並べる棚。
 * @param assetId - 販売するアセットのID。通常商品は null
 * @returns 棚の種類
 */
export function getStoreCategory(assetId: string | null): StoreCategory {
  const kind = getStoreAssetKind(assetId);
  if (kind === "wallpaper" || kind === "flooring" || isFurnitureAsset(assetId)) return "furniture";
  return kind ?? "normal";
}

export default function StoreCategoryTabs({ value, onChange }: {
  value: StoreCategory; onChange: (category: StoreCategory) => void;
}) {
  return <View style={styles.row}>{TABS.map((tab) => (
    <Pressable key={tab.id} accessibilityRole="tab" accessibilityLabel={`${stripFurigana(tab.label)}の棚`}
      accessibilityState={{ selected: value === tab.id }} onPress={() => onChange(tab.id)}
      style={[styles.tab, value === tab.id && styles.selected]}>
      <Furigana noWrap style={styles.label}>{tab.label}</Furigana>
    </Pressable>
  ))}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, marginVertical: 8 },
  tab: { flex: 1, borderWidth: 1, borderColor: CHILD_THEME.fadedBeige, backgroundColor: CHILD_THEME.parchment, paddingVertical: 10, alignItems: "center", borderRadius: 8 },
  selected: { backgroundColor: CHILD_THEME.brightYellow, borderColor: CHILD_THEME.gold },
  label: { color: CHILD_THEME.darkWood, fontWeight: "bold" },
});
