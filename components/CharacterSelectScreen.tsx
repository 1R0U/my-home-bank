import { Stack } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenHeader from "./ScreenHeader";
import { PREVIEW_DISABLED_NOTICE } from "../constants/ui";
import { CHARACTER_TYPES, CHARACTER_TYPE_LABELS, type CharacterType } from "../lib/rpg-hub/characterTypes";
import { useCharacterAppearance } from "../lib/useCharacterAppearance";
import { useAppearanceStore } from "../store/appearanceStore";
import { useDataAccess } from "../store";

/**
 * キャラクター選択画面（Issue #287）。
 *
 * 選ぶとその場でDBへ保存する。見た目への反映はRPGハブ側（`useCharacterAppearance` の
 * 結果）を見て行うため、この画面は保存だけを受け持つ（`WardrobeScreen` と同じ形）。
 *
 * **反映されるのは次に我が家タウンを開いたとき。** キャラクターの形はシーンの
 * 立ち上げ時に一度だけ組み立てるため、この画面にいる間・開いたままのタウンには
 * すぐには反映されない。
 */
export default function CharacterSelectScreen() {
  const { canUseRealData } = useDataAccess();
  const { select } = useCharacterAppearance();
  const characterType = useAppearanceStore((state) => state.characterType);

  // 保存中は連打で二重に書き込まないようにする
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (nextType: CharacterType) => {
    if (!canUseRealData || saving || nextType === characterType) return;
    setSaving(true);
    setError(null);
    try {
      await select(nextType);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenHeader title="キャラクターをえらぶ" />

      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-8">
        {!canUseRealData && (
          <Text className="mb-4 text-xs text-slate-500">{PREVIEW_DISABLED_NOTICE}</Text>
        )}
        {error && (
          <View className="mb-4 rounded-2xl bg-red-50 px-4 py-3">
            <Text className="font-bold text-red-700">保存できませんでした</Text>
            <Text className="mt-1 text-xs text-red-600">{error}</Text>
          </View>
        )}

        <Text className="mb-3 text-xs text-slate-500">
          選んだキャラクターは、次に我が家タウンを開いたときから反映されます。
        </Text>

        <View className="flex-row flex-wrap gap-2">
          {CHARACTER_TYPES.map((type) => {
            const isSelected = characterType === type;
            const label = CHARACTER_TYPE_LABELS[type];

            return (
              <Pressable
                accessibilityLabel={`キャラクターを${label}にする`}
                accessibilityRole="button"
                accessibilityState={{
                  // disabled と同じ条件にする。ずれていると、支援技術が
                  // 「押せる」と読み上げるのに押しても何も起きない
                  disabled: !canUseRealData || saving,
                  selected: isSelected,
                }}
                className={`rounded-2xl border-2 px-5 py-3 ${
                  isSelected ? "border-emerald-600 bg-emerald-50" : "border-slate-200 bg-white"
                } ${canUseRealData ? "active:bg-slate-100" : "opacity-50"}`}
                disabled={!canUseRealData || saving}
                key={type}
                onPress={() => handleSelect(type)}
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
      </ScrollView>
    </SafeAreaView>
  );
}
