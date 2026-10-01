import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenHeader from "./ScreenHeader";
import { ACTIVE_ICON_COLOR, MUTED_ICON_COLOR, PREVIEW_DISABLED_NOTICE } from "../constants/ui";
import { getAssetLabel, getWearableSlot } from "../lib/rpg-hub/catalog";
import { useWardrobe } from "../lib/useWardrobe";
import { useDataAccess } from "../store";
import { useWardrobeStore } from "../store/wardrobeStore";
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_LABELS, type EquipmentSlot } from "../types/map";

/**
 * 枠ごとのアイコン（Issue #235）。
 * 参考にした着せ替えアプリの「カテゴリをアイコン付きの一覧で見せる」レイアウトに
 * 合わせるためのもので、意味の対応は目安（例: せなかに今あるものはまだ無い）。
 */
const EQUIPMENT_SLOT_ICONS: Record<EquipmentSlot, string> = {
  back: "shirt-outline",
  face: "glasses-outline",
  head: "school-outline",
};

/**
 * 着せ替え画面（Issue #222 / #235）。
 *
 * 枠（カテゴリ）をアイコン付きの一覧で並べ、タップした枠だけ選択肢（なし＋持っているもの）を
 * 展開する。選ぶとその場でDBへ保存する。見た目への反映はRPGハブ側が `useWardrobe` の結果を
 * 見て行うので、この画面は保存だけを受け持つ。
 *
 * 参考にした着せ替えアプリはキャラクターの2Dイラストを大きく表示するが、このアプリの
 * キャラクターはBabylon.jsのプリミティブで組んだ3Dモデルで、この画面（RPGハブの外）には
 * 3D描画のWebViewを持っていない。そのため見た目のプレビューはこの画面では出さず、
 * 「カテゴリを選ぶ→そのカテゴリの選択肢を見る」という段階的なUIの部分だけを取り入れている。
 *
 * **どうぶつ（キャラクターの姿そのもの）はここでは扱わない。** 別の仕組み
 * （`character_appearances` / `CharacterSelectScreen.tsx`）で選ぶため、着せ替え品とは別軸。
 */
export default function WardrobeScreen() {
  const { canUseRealData } = useDataAccess();
  const { equip } = useWardrobe();
  const equipment = useWardrobeStore((state) => state.equipment);
  const ownedAssetIds = useWardrobeStore((state) => state.ownedAssetIds);

  // 保存中の枠。連打で同じ枠に何度も書き込まないようにする
  const [savingSlot, setSavingSlot] = useState<EquipmentSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 選択肢を開いている枠。一度に1つだけ開く（以前は全部の枠を常に展開していて、
  // 枠が増えるほど縦に長くなっていた）。
  const [openSlot, setOpenSlot] = useState<EquipmentSlot | null>(null);

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
          <View className="overflow-hidden rounded-2xl bg-white">
            {slots.map((slot, index) => {
              const choices = ownedAssetIds.filter((assetId) => getWearableSlot(assetId) === slot);
              const options = [null, ...choices];
              const selected = equipment[slot] ?? null;
              const selectedLabel = selected === null ? "なし" : (getAssetLabel(selected) ?? selected);
              const isOpen = openSlot === slot;

              return (
                <View key={slot}>
                  <Pressable
                    accessibilityLabel={`${EQUIPMENT_SLOT_LABELS[slot]}（いま: ${selectedLabel}）`}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                    className={`flex-row items-center gap-3 px-4 py-4 ${
                      index !== slots.length - 1 ? "border-b border-slate-100" : ""
                    } ${isOpen ? "bg-emerald-50" : "active:bg-slate-50"}`}
                    onPress={() => setOpenSlot(isOpen ? null : slot)}
                  >
                    <View
                      className={`h-10 w-10 items-center justify-center rounded-full ${
                        isOpen ? "bg-emerald-100" : "bg-slate-100"
                      }`}
                    >
                      <Ionicons
                        color={isOpen ? ACTIVE_ICON_COLOR : MUTED_ICON_COLOR}
                        name={EQUIPMENT_SLOT_ICONS[slot] as keyof typeof Ionicons.glyphMap}
                        size={20}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-base font-bold text-slate-900">
                        {EQUIPMENT_SLOT_LABELS[slot]}
                      </Text>
                      <Text className="mt-0.5 text-xs text-slate-500">{selectedLabel}</Text>
                    </View>
                    <Ionicons
                      color={MUTED_ICON_COLOR}
                      name={isOpen ? "chevron-up" : "chevron-down"}
                      size={18}
                    />
                  </Pressable>

                  {isOpen && (
                    <View className="flex-row flex-wrap gap-2 border-b border-slate-100 bg-slate-50 px-4 py-4">
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
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
