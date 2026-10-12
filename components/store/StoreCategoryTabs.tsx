import { Pressable, StyleSheet, Text, View } from "react-native";
import { CHILD_THEME } from "../childTheme";
import type { StoreAssetKind } from "../../lib/storeAssets";

export type StoreCategory = "normal" | StoreAssetKind;
const TABS: { id: StoreCategory; label: string }[] = [
  { id: "normal", label: "商品" }, { id: "wearable", label: "きせかえ" }, { id: "decoration", label: "かざり" },
];

export default function StoreCategoryTabs({ value, onChange }: {
  value: StoreCategory; onChange: (category: StoreCategory) => void;
}) {
  return <View style={styles.row}>{TABS.map((tab) => (
    <Pressable key={tab.id} accessibilityRole="tab" accessibilityLabel={`${tab.label}の棚`}
      accessibilityState={{ selected: value === tab.id }} onPress={() => onChange(tab.id)}
      style={[styles.tab, value === tab.id && styles.selected]}>
      <Text style={styles.label}>{tab.label}</Text>
    </Pressable>
  ))}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, marginVertical: 8 },
  tab: { flex: 1, borderWidth: 1, borderColor: CHILD_THEME.fadedBeige, backgroundColor: CHILD_THEME.parchment, paddingVertical: 10, alignItems: "center", borderRadius: 8 },
  selected: { backgroundColor: CHILD_THEME.brightYellow, borderColor: CHILD_THEME.gold },
  label: { color: CHILD_THEME.darkWood, fontWeight: "bold" },
});
