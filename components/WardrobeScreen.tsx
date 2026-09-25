import { Stack } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenHeader from "./ScreenHeader";
import { PREVIEW_DISABLED_NOTICE } from "../constants/ui";
import { RPG_HUB_ASSETS } from "../lib/rpg-hub/assets";
import { getAssetLabel, getWearableSlot } from "../lib/rpg-hub/catalog";
import { useWardrobe } from "../lib/useWardrobe";
import { useDataAccess } from "../store";
import { useWardrobeStore } from "../store/wardrobeStore";
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS, type EquipmentSlot } from "../types/map";

/**
 * 着せ替え画面（Issue #222）。
 *
 * 枠ごとに「なし」＋持っているものを並べ、押すとその場でDBへ保存する。
 * 見た目への反映はRPGハブ側が `useWardrobe` の結果を見て行うので、この画面は
 * 保存だけを受け持つ。
 */
export default function WardrobeScreen() {
  const { canUseRealData } = useDataAccess();
  const { equip } = useWardrobe();
  const equipment = useWardrobeStore((state) => state.equipment);
  const ownedAssetIds = useWardrobeStore((state) => state.ownedAssetIds);

  // 保存中の枠。連打で同じ枠に何度も書き込まないようにする
  const [savingSlot, setSavingSlot] = useState<EquipmentSlot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (slot: EquipmentSlot, assetId: string | null) => {
    if (!canUseRealData || savingSlot !== null) return;
    setSavingSlot(slot);
    setError(null);
    try {
      await equip(slot, assetId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setSavingSlot(null);
    }
  };

  // 持っているものがある枠だけを出す。空の枠を並べても選べるものが無い
  const slots = EQUIPMENT_SLOTS.filter((slot) =>
    ownedAssetIds.some((assetId) => getWearableSlot(assetId) === slot),
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="きがえ" />

      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-8">
        {!canUseRealData && (
          <Text className="mb-4 text-xs text-slate-500">{PREVIEW_DISABLED_NOTICE}</Text>
        )}
        {error && (
          <View className="mb-4 rounded-2xl bg-red-50 px-4 py-3">
            <Text className="font-bold text-red-700">きがえを保存できませんでした</Text>
            <Text className="mt-1 text-xs text-red-600">{error}</Text>
          </View>
        )}

        {slots.length === 0 ? (
          <View className="rounded-2xl bg-white px-4 py-6">
            <Text className="text-base text-slate-700">まだ着られるものがありません。</Text>
          </View>
        ) : (
          slots.map((slot) => {
            const choices = ownedAssetIds.filter((assetId) => getWearableSlot(assetId) === slot);
            // 「どうぶつ」は「なし」に相当する状態が無い（土台は必ず何かの姿になる）ので、
            // 選択肢から外し、選ばれていなければ既定のカエルを選んでいる扱いにする
            const isBodySlot = slot === "body";
            const options = isBodySlot ? choices : [null, ...choices];
            const selected = isBodySlot
              ? (equipment.body ?? RPG_HUB_ASSETS.player)
              : (equipment[slot] ?? null);

            return (
              <View className="mb-6" key={slot}>
                <Text className="mb-2 text-lg font-bold text-slate-900">
                  {EQUIPMENT_SLOT_LABELS[slot]}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {options.map((assetId) => {
                    const isSelected = selected === assetId;
                    const label = assetId === null ? "なし" : (getAssetLabel(assetId) ?? assetId);

                    return (
                      <Pressable
                        accessibilityLabel={`${EQUIPMENT_SLOT_LABELS[slot]}を${label}にする`}
                        accessibilityRole="button"
                        accessibilityState={{
                          // disabled と同じ条件にする。ずれていると、支援技術が
                          // 「押せる」と読み上げるのに押しても何も起きない
                          disabled: !canUseRealData || savingSlot !== null,
                          selected: isSelected,
                        }}
                        className={`rounded-2xl border-2 px-5 py-3 ${
                          isSelected
                            ? "border-emerald-600 bg-emerald-50"
                            : "border-slate-200 bg-white"
                        } ${canUseRealData ? "active:bg-slate-100" : "opacity-50"}`}
                        disabled={!canUseRealData || savingSlot !== null}
                        key={assetId ?? "none"}
                        onPress={() => handleSelect(slot, assetId)}
                      >
                        <Text
                          className={`text-base font-bold ${
                            isSelected ? "text-emerald-700" : "text-slate-700"
                          }`}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
