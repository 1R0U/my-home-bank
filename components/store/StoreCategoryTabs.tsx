import { Pressable, StyleSheet, View } from "react-native";
import { CHILD_THEME } from "../childTheme";
import type { StoreAssetKind } from "../../lib/storeAssets";
import { stripFurigana } from "../../lib/furigana";
import Furigana from "../Furigana";

/** 棚の種類。壁紙・床板は1つの棚（かべ・ゆか）にまとめる（Issue #480） */
export type StoreCategory = "normal" | "wearable" | "decoration" | "interior";
// label は `{漢字|よみ}` のふりがな付き（components/Furigana.tsx、Issue #347）
const TABS: { id: StoreCategory; label: string }[] = [
  { id: "normal", label: "{商品|しょうひん}" }, { id: "wearable", label: "きせかえ" }, { id: "decoration", label: "かざり" },
  { id: "interior", label: "かべ・ゆか" },
];

/**
 * 商品を並べる棚。
 * @param kind - 販売するアセットの種類。通常商品は null
 * @returns 棚の種類
 */
export function getStoreCategory(kind: StoreAssetKind | null): StoreCategory {
  if (kind === "wallpaper" || kind === "flooring") return "interior";
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
