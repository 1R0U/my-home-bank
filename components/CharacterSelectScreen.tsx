import { Stack } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenHeader from "./ScreenHeader";
import { PREVIEW_DISABLED_NOTICE } from "../constants/ui";
import { CHARACTER_TYPES, CHARACTER_TYPE_LABELS, type CharacterType } from "../lib/rpg-hub/characterTypes";
import { PALETTE_COLOR_OPTIONS, PALETTE_SLOT_LABELS } from "../lib/rpg-hub/palette";
import { useCharacterAppearance } from "../lib/useCharacterAppearance";
import { useCharacterPalette } from "../lib/useCharacterPalette";
import { useAppearanceStore } from "../store/appearanceStore";
import { useDataAccess } from "../store";
import type { PaletteSlot } from "../types/map";

/**
 * 色を選ばせる枠（Issue #253）。
 *
 * カエル（既定のキャラクター）は `skin`（体）と `accent`（手足・口）しか
 * 使っておらず `hair` は使わないため、いまはこの2枠だけを出す
 * （`lib/rpg-hub/buildingParts.ts` の PLAYER_PARTS 参照）。ねこ・ハムスターは
 * `hair` も使うが、このIssueでは「かえるのみ」を対象にしているため触らない。
 * 対象を広げるときは、この配列にも `hair` を足す。
 */
const EDITABLE_PALETTE_SLOTS: readonly PaletteSlot[] = ["skin", "accent"];

/**
 * キャラクター選択画面（Issue #287 / #253）。
 *
 * 種類（形）・色のどちらも選ぶとその場でDBへ保存する。見た目への反映はRPGハブ側
 * （`useCharacterAppearance` / `useCharacterPalette` の結果）を見て行うため、
 * この画面は保存だけを受け持つ（`WardrobeScreen` と同じ形）。
 *
 * **種類の反映は次に我が家タウンを開いたとき。** キャラクターの形はシーンの
 * 立ち上げ時に一度だけ組み立てるため、この画面にいる間・開いたままのタウンには
 * すぐには反映されない。**色は postMessage で送るだけなので、開いたままのタウンにも
 * すぐ反映される**（種類と違いシーンの作り直しを伴わない）。
 */
export default function CharacterSelectScreen() {
  const { canUseRealData } = useDataAccess();
  const { isReady: isCharacterTypeReady, select: selectCharacterType } = useCharacterAppearance();
  const { isReady: isPaletteReady, select: selectPaletteColor } = useCharacterPalette();
  const characterType = useAppearanceStore((state) => state.characterType);
  const palette = useAppearanceStore((state) => state.palette);
  // 種類・色のどちらも読み込みが終わるまでは、色の表示・保存をしない
  // （PR #296レビュー対応）。片方でも未読み込みだと、既定値や前の利用者の
  // 残り値を使って誤った選択状態・同色判定をしてしまうため。
  const isAppearanceReady = isCharacterTypeReady && isPaletteReady;

  // 保存中は連打で二重に書き込まないようにする
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectType = async (nextType: CharacterType) => {
    if (!canUseRealData || saving || nextType === characterType) return;
    setSaving(true);
    setError(null);
    try {
      await selectCharacterType(nextType);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setSaving(false);
    }
  };

  // 色はいまのところ「かえるのみ」対象（EDITABLE_PALETTE_SLOTSのコメント参照）。
  // 猫・ハムスターを選んでいるあいだは色を保存させない（PR #296レビュー対応）。
  const canEditPalette = isAppearanceReady && characterType === "frog";

  const handleSelectColor = async (slot: PaletteSlot, hex: string) => {
    if (!canUseRealData || !canEditPalette || saving || palette[slot] === hex) return;
    setSaving(true);
    setError(null);
    try {
      await selectPaletteColor(slot, hex);
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
                onPress={() => handleSelectType(type)}
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

        {!isAppearanceReady ? (
          <Text className="mb-3 mt-8 text-xs text-slate-500">読み込み中…</Text>
        ) : canEditPalette ? (
          <>
            <Text className="mb-3 mt-8 text-xs text-slate-500">
              色はすぐに反映されます。
            </Text>

            {EDITABLE_PALETTE_SLOTS.map((slot) => (
              <View className="mb-5" key={slot}>
                <Text className="mb-2 text-sm font-bold text-slate-800">
                  {PALETTE_SLOT_LABELS[slot]}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {PALETTE_COLOR_OPTIONS.map((option) => {
                    const isSelected = palette[slot] === option.hex;

                    return (
                      <Pressable
                        accessibilityLabel={`${PALETTE_SLOT_LABELS[slot]}を${option.label}にする`}
                        accessibilityRole="button"
                        accessibilityState={{
                          disabled: !canUseRealData || saving,
                          selected: isSelected,
                        }}
                        className={`h-12 w-12 items-center justify-center rounded-full border-2 ${
                          isSelected ? "border-emerald-600" : "border-transparent"
                        } ${canUseRealData ? "active:opacity-80" : "opacity-50"}`}
                        disabled={!canUseRealData || saving}
                        key={option.hex}
                        onPress={() => handleSelectColor(slot, option.hex)}
                        style={{ backgroundColor: option.hex }}
                      />
                    );
                  })}
                </View>
              </View>
            ))}
          </>
        ) : (
          <Text className="mb-3 mt-8 text-xs text-slate-500">
            色を選べるのは、いまは「かえる」のときだけです。
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
