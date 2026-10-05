import { Ionicons } from "@expo/vector-icons";
import { Stack, useNavigation } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ScreenHeader from "./ScreenHeader";
import { WardrobePreview } from "./rpg-hub-web/WardrobePreview";
import { ACTIVE_ICON_COLOR, MUTED_ICON_COLOR, PREVIEW_DISABLED_NOTICE } from "../constants/ui";
import { getAssetLabel, getWearableSlot } from "../lib/rpg-hub/catalog";
import type { EquipmentMap } from "../lib/rpg-hub/equipment";
import { getPortraitKey, type PortraitLook } from "../lib/rpg-hub/portraitBridge";
import { getEquipmentChanges, withSlotEquipped } from "../lib/rpg-hub/wardrobe";
import { useCharacterAppearance } from "../lib/useCharacterAppearance";
import { useCharacterPalette } from "../lib/useCharacterPalette";
import { useWardrobe } from "../lib/useWardrobe";
import { useDataAccess } from "../store";
import { useAppearanceStore } from "../store/appearanceStore";
import { useMapStore } from "../store/mapStore";
import { useWardrobeStore } from "../store/wardrobeStore";
import {
  EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_LABELS,
  type AssetId,
  type EquipmentSlot,
} from "../types/map";

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

/** プレビューの高さ（画面の高さに対する割合）。選択肢の一覧が隠れすぎない程度にする */
const PREVIEW_HEIGHT_RATIO = 0.38;
/** プレビューの高さの下限。小さい端末でも指で回せる大きさを残す */
const MIN_PREVIEW_HEIGHT = 220;
/** プレビューの高さの上限。大きい端末で選択肢の一覧を押し出しすぎない */
const MAX_PREVIEW_HEIGHT = 380;

/**
 * 着せ替え画面（Issue #222 / #235 / #344）。
 *
 * 上にキャラクターのプレビュー、下に枠（カテゴリ）の一覧を並べる。枠はアイコン付きで、
 * タップした枠だけ選択肢（なし＋持っているもの）を展開する。
 *
 * **選んだだけでは保存しない（Issue #344）。** 選んだものはプレビューのキャラクターに
 * 着せて見せるだけで、「けってい」を押したときに変わった枠をまとめて保存する。
 * いろいろ試してから決められるようにするため。
 *   - 何も変えていない（変えてから元に戻した場合も含む）ときは「けってい」を押せない
 *   - 確定せずに画面を離れようとしたら、変更を捨ててよいかを確かめる
 * 保存した装備のRPGハブへの反映は、RPGハブ側が `useWardrobe` の結果を見て行う。
 *
 * **どうぶつ（キャラクターの姿そのもの）はここでは扱わない。** 別の仕組み
 * （`character_appearances` / `CharacterSelectScreen.tsx`）で選ぶため、着せ替え品とは別軸。
 * プレビューには今の種類と色で出す。
 */
export default function WardrobeScreen() {
  const { canUseRealData } = useDataAccess();
  const navigation = useNavigation();
  const { height: windowHeight } = useWindowDimensions();
  const { isReady: isWardrobeReady, saveEquipment } = useWardrobe();
  const { isReady: isTypeReady } = useCharacterAppearance();
  const { isReady: isPaletteReady } = useCharacterPalette();
  const savedEquipment = useWardrobeStore((state) => state.equipment);
  const ownedAssetIds = useWardrobeStore((state) => state.ownedAssetIds);
  const characterType = useAppearanceStore((state) => state.characterType);
  const palette = useAppearanceStore((state) => state.palette);
  const season = useMapStore((state) => state.currentSeason);

  // 選んでいるが、まだ保存していない装備。null の間は保存済みの装備をそのまま見せる
  const [draft, setDraft] = useState<EquipmentMap | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 確定できたことを知らせる。次に選び直したら消す
  const [didSave, setDidSave] = useState(false);
  // 選択肢を開いている枠。一度に1つだけ開く（以前は全部の枠を常に展開していて、
  // 枠が増えるほど縦に長くなっていた）。
  const [openSlot, setOpenSlot] = useState<EquipmentSlot | null>(null);

  const shownEquipment = draft ?? savedEquipment;
  const changes = getEquipmentChanges(savedEquipment, shownEquipment);
  const isDirty = changes.length > 0;
  const canConfirm = canUseRealData && isDirty && !isSaving;

  // 種類・色・装備の読み込みが終わるまではプレビューを出さない。途中の値（既定のカエルや
  // 何も着ていない姿）を映してから切り替わると、ちらついて見えるため（CharacterAvatar と同じ）
  const isLookReady = isWardrobeReady && isTypeReady && isPaletteReady;
  // 見た目が同じ間は同じオブジェクトを使う。変わるたびに作り直すと、WebView へ同じ姿を
  // 送り直してキャラクターを作り直してしまう
  const lookKey = getPortraitKey({ characterType, equipment: shownEquipment, palette, season });
  const look = useMemo<PortraitLook>(
    () => ({ characterType, equipment: shownEquipment, palette, season }),
    // lookKey が同じなら中身も同じ（getPortraitKey の約束）
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lookKey],
  );

  const previewHeight = Math.min(
    MAX_PREVIEW_HEIGHT,
    Math.max(MIN_PREVIEW_HEIGHT, Math.round(windowHeight * PREVIEW_HEIGHT_RATIO)),
  );

  // 確定せずに離れようとしたら確かめる。戻るボタン・Android の戻る操作のどちらで
  // 離れても、画面が消える直前にここを通る
  useEffect(() => {
    if (!isDirty) return undefined;
    return navigation.addListener("beforeRemove", (event: any) => {
      event.preventDefault();
      Alert.alert("きがえを やめますか？", "えらんだものは ほぞんされません。", [
        { style: "cancel", text: "つづける" },
        {
          onPress: () => navigation.dispatch(event.data.action),
          style: "destructive",
          text: "やめる",
        },
      ]);
    });
  }, [isDirty, navigation]);

  const handleSelect = (slot: EquipmentSlot, assetId: AssetId | null) => {
    if (isSaving) return;
    setDraft(withSlotEquipped(shownEquipment, slot, assetId));
    setDidSave(false);
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setIsSaving(true);
    setError(null);
    try {
      await saveEquipment(changes);
      // 保存したものは読み直した保存済みの装備として出るので、下書きは捨てる
      setDraft(null);
      setDidSave(true);
    } catch (e: unknown) {
      // 下書きは残す。保存できた枠は読み直した装備に入り、残りは変更のまま押し直せる
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setIsSaving(false);
    }
  };

  // 持っているものがある枠だけを出す。空の枠を並べても選べるものが無い
  const slots = EQUIPMENT_SLOTS.filter((slot) =>
    ownedAssetIds.some((assetId) => getWearableSlot(assetId) === slot),
  );

  return (
    <SafeAreaView className="flex-1 bg-slate-50" edges={["top", "bottom"]}>
      {/* 変えている間は iOS のスワイプで戻れないようにする。スワイプで消えかけた画面は
          確認を出しても元に戻らないことがあるため、戻るボタンから確かめる */}
      <Stack.Screen options={{ gestureEnabled: !isDirty, headerShown: false }} />
      <ScreenHeader title="きがえ" />

      <View className="px-4 pb-3">
        {isLookReady ? (
          <WardrobePreview height={previewHeight} look={look} />
        ) : (
          <View
            className="items-center justify-center rounded-2xl bg-sky-100"
            style={{ height: previewHeight }}
          >
            <ActivityIndicator />
          </View>
        )}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-4">
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
              const selected = shownEquipment[slot] ?? null;
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
                              disabled: isSaving,
                              selected: isSelected,
                            }}
                            className={`rounded-2xl border-2 px-5 py-3 ${
                              isSelected
                                ? "border-emerald-600 bg-emerald-50"
                                : "border-slate-200 bg-white"
                            } ${isSaving ? "opacity-50" : "active:bg-slate-100"}`}
                            disabled={isSaving}
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

      <View className="border-t border-slate-200 bg-white px-4 pt-3">
        {didSave && !isDirty ? (
          <Text className="mb-2 text-center text-sm font-bold text-emerald-700">きがえたよ！</Text>
        ) : null}
        <Pressable
          accessibilityLabel="けってい"
          accessibilityRole="button"
          // disabled と同じ条件にする（選択肢のボタンと同じ理由）
          accessibilityState={{ busy: isSaving, disabled: !canConfirm }}
          className={`items-center rounded-2xl py-4 ${
            canConfirm ? "bg-emerald-600 active:bg-emerald-700" : "bg-slate-300"
          }`}
          disabled={!canConfirm}
          onPress={handleConfirm}
          testID="wardrobe-confirm"
        >
          {isSaving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className={`text-lg font-bold ${canConfirm ? "text-white" : "text-slate-500"}`}>
              けってい
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
