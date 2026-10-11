import { Pressable, ScrollView, Text, View } from "react-native";
import { STORE_ASSETS } from "../../lib/storeAssets";

/** 親が販売する着せ替え品・装飾品を、既存のカタログから選ぶ。 */
export default function StoreAssetPicker({ value, onChange }: {
  value: string | null;
  onChange: (value: string | null, label?: string) => void;
}) {
  return (
    <View>
      <Text className="text-xs font-semibold text-slate-500">商品の種類</Text>
      <ScrollView horizontal contentContainerClassName="gap-2 py-2" showsHorizontalScrollIndicator={false}>
        <Pressable accessibilityRole="button" accessibilityLabel="通常の商品" accessibilityState={{ selected: value === null }}
          className={`rounded-xl border px-3 py-2 ${value === null ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}
          onPress={() => onChange(null)}>
          <Text>通常の商品</Text>
        </Pressable>
        {STORE_ASSETS.map((asset) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`${asset.kind === "wearable" ? "着せ替え" : "装飾"}：${asset.label}`}
            accessibilityState={{ selected: value === asset.id }} key={asset.id}
            className={`rounded-xl border px-3 py-2 ${value === asset.id ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}
            onPress={() => onChange(asset.id, asset.label)}>
            <Text>{asset.kind === "wearable" ? "着せ替え" : "装飾"}：{asset.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
