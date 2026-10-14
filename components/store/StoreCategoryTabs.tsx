import { Pressable, StyleSheet, View } from "react-native";
import { CHILD_THEME } from "../childTheme";
import type { StoreAssetKind } from "../../lib/storeAssets";
import { stripFurigana } from "../../lib/furigana";
import Furigana from "../Furigana";

export type StoreCategory = "normal" | StoreAssetKind;
// label は `{漢字|よみ}` のふりがな付き（components/Furigana.tsx、Issue #347）
const TABS: { id: StoreCategory; label: string }[] = [
  { id: "normal", label: "{商品|しょうひん}" }, { id: "wearable", label: "きせかえ" }, { id: "decoration", label: "かざり" },
];

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
